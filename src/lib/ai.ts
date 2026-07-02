import {
  GoogleGenerativeAI,
  type GenerateContentResult,
  type Part,
} from '@google/generative-ai'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { Persona, Question, SurveyAnswer, Settings, DeliberationParticipant, ArtifactData, DeliberationSummary, MaterialItem } from '../types'
import { getProvider, getApiKeyForModel } from '../types'
import { sleep } from './utils'
import { getPrompt } from './prompts'
import { buildFacilitatorSystemPrompt, FACILITATOR_ID } from './presetRoles'

const MAX_RETRIES = 3
const MIN_WAIT = 5000
const MAX_WAIT = 120000

function parseRetrySeconds(errStr: string): number {
  const m = errStr.match(/retry[_ ]?(?:after|in)[: ]*(\d+(?:\.\d+)?)\s*s/i)
    || errStr.match(/"retryDelay":\s*"(\d+)s"/)
  return m ? Math.ceil(parseFloat(m[1])) : 0
}

function isRateLimit(err: unknown): boolean {
  const s = String(err)
  return (
    s.includes('429') ||
    s.includes('RESOURCE_EXHAUSTED') ||
    s.includes('rate_limit') ||
    s.includes('quota') ||
    s.includes('Too Many Requests')
  )
}

function isFreeTierExhausted(err: unknown): boolean {
  const s = String(err)
  return s.includes('free_tier') || s.includes('FreeTier') || (s.includes('limit: 0') && s.includes('quota'))
}

/** APIエラーをユーザー向けの日本語メッセージに変換する */
export function parseUserFriendlyError(err: unknown): string {
  const s = String(err)

  // ── APIキー関連 ──
  if (
    s.includes('API_KEY_INVALID') ||
    s.includes('API key not valid') ||
    s.includes('INVALID_ARGUMENT') && s.includes('key') ||
    s.includes('401')
  ) {
    return 'APIキーが正しくありません。設定画面でキーを確認・再入力してください。'
  }
  if (s.includes('403') || s.includes('PERMISSION_DENIED')) {
    return 'このAPIキーには必要な権限がありません。Google AI Studioでキーの権限を確認してください。'
  }

  // ── クォータ・レート制限 ──
  if (isFreeTierExhausted(err)) {
    return '無料プランの本日分の上限に達しました。明日リセットされます。すぐ使いたい場合は Google AI Studio で課金を有効にしてください。'
  }
  if (isRateLimit(err)) {
    const secs = parseRetrySeconds(s)
    if (secs > 0) return `リクエストが集中しています。${secs}秒後に自動で再試行します。`
    return 'リクエストが多すぎます。少し待ってから再試行してください（無料枠は1分15回まで）。'
  }

  // ── モデル・入力の問題 ──
  if (s.includes('NOT_FOUND') || s.includes('404') || s.includes('models/')) {
    return '選択されたモデルが見つかりません。設定画面で別のモデルを選んでください。'
  }
  if (s.includes('DEADLINE_EXCEEDED') || s.includes('timeout') || s.includes('timed out')) {
    return 'AIの応答がタイムアウトしました。もう一度試してください。'
  }
  if (
    s.includes('context_length') || s.includes('TOO_LONG') ||
    s.includes('token') && s.includes('exceed') || s.includes('maximum context')
  ) {
    return '入力が長すぎてAIが処理できませんでした。会話履歴や入力テキストを短くしてください。'
  }
  if (s.includes('SAFETY') || s.includes('safety') || s.includes('blocked')) {
    return 'AIの安全フィルターによりこの内容は生成できませんでした。テーマや言い回しを変えて試してください。'
  }

  // ── サーバー・ネットワーク ──
  if (s.includes('500') || s.includes('INTERNAL') || s.includes('Internal Server Error')) {
    return 'AIサーバーで予期しないエラーが発生しました。しばらく待ってから再試行してください。'
  }
  if (s.includes('503') || s.includes('UNAVAILABLE') || s.includes('Service Unavailable')) {
    return 'AIサービスが一時的にダウンしています。数分後にもう一度お試しください。'
  }
  if (s.includes('Failed to fetch') || s.includes('NetworkError') || s.includes('network') || s.includes('ERR_')) {
    return 'ネットワークに接続できませんでした。インターネット接続を確認してください。'
  }

  // ── フォールバック（技術的な詳細を隠す） ──
  const firstLine = s.split('\n')[0].replace(/\[GoogleGenerativeAI Error\]:\s*/i, '').slice(0, 100)
  return `問題が発生しました。しばらく待ってから再試行してください。（${firstLine}）`
}

async function withRetry<T>(
  fn: () => Promise<T>,
  onWait?: (remainingSecs: number, attempt: number) => void,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRateLimit(err)) throw err
      // 無料枠の日次上限は待っても解決しないので即座にthrow
      if (isFreeTierExhausted(err)) throw err
      const suggested = parseRetrySeconds(String(err)) * 1000
      const wait = Math.min(Math.max(suggested || MIN_WAIT * (i + 1), MIN_WAIT), MAX_WAIT)
      const waitSecs = Math.ceil(wait / 1000)
      console.warn(`Rate limit hit, waiting ${waitSecs}s... (attempt ${i + 1}/${MAX_RETRIES})`)
      onWait?.(waitSecs, i + 1)
      await sleep(wait)
    }
  }
  throw lastErr
}

function getModelName(settings: Settings): string {
  if (settings.model && settings.model !== 'default') return settings.model
  return 'gemini-2.5-flash'
}

// ── プロバイダー共通ユーティリティ ──

type Message = { role: 'user' | 'assistant'; content: string }

/** テキストを1回生成して返す（プロバイダー自動切替） */
async function generateText(
  prompt: string,
  systemPrompt: string,
  settings: Settings,
  json = false,
): Promise<string> {
  const model = getModelName(settings)
  const provider = getProvider(model)
  const apiKey = getApiKeyForModel(settings, model)

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    const res = await withRetry(() =>
      client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      })
    )
    return res.choices[0]?.message?.content ?? ''
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const res = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      })
    )
    const block = res.content[0]
    return block.type === 'text' ? block.text : ''
  }

  // Gemini
  const client = new GoogleGenerativeAI(apiKey)
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  })
  const result: GenerateContentResult = await withRetry(() => genModel.generateContent(prompt))
  return result.response.text()
}

/** 添付資料から画像パーツを抽出する（base64 data URL → { mimeType, data } ） */
export function extractImageParts(materials: MaterialItem[]): { mimeType: string; data: string; name: string }[] {
  return materials
    .filter(m => m.type === 'image' && m.content?.startsWith('data:'))
    .map(m => {
      const match = m.content.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return null
      return { mimeType: match[1], data: match[2], name: m.name }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

/** ストリーミングでテキストを生成し、チャンクごとに onChunk を呼ぶ */
async function generateTextStream(
  messages: Message[],
  systemPrompt: string,
  settings: Settings,
  onChunk: (text: string) => void,
  onWait?: (remainingSecs: number, attempt: number) => void,
  imageParts?: { mimeType: string; data: string; name: string }[],
): Promise<string> {
  const model = getModelName(settings)
  const provider = getProvider(model)
  const apiKey = getApiKeyForModel(settings, model)
  const images = imageParts ?? []
  let full = ''

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    // 最後のユーザーメッセージに画像を追加
    const lastIdx = messages.map(m => m.role).lastIndexOf('user')
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m, i) => {
        if (i === lastIdx && images.length > 0) {
          const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: m.content },
            ...images.map(img => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ]
          return { role: m.role as 'user' | 'assistant', content }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content }
      }),
    ]
    const stream = await withRetry(
      () => client.chat.completions.create({ model, stream: true, messages: openaiMessages }),
      onWait,
    )
    for await (const chunk of stream) {
      const t = chunk.choices[0]?.delta?.content ?? ''
      full += t
      if (t) onChunk(t)
    }
    return full
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const lastIdx = messages.map(m => m.role).lastIndexOf('user')
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
      if (i === lastIdx && images.length > 0) {
        const content: Anthropic.ContentBlockParam[] = [
          ...images.map(img => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mimeType as Anthropic.Base64ImageSource['media_type'], data: img.data },
          })),
          { type: 'text' as const, text: m.content },
        ]
        return { role: m.role as 'user' | 'assistant', content }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text
        onChunk(event.delta.text)
      }
    }
    return full
  }

  // Gemini
  const client = new GoogleGenerativeAI(apiKey)
  const genModel = client.getGenerativeModel({ model, systemInstruction: systemPrompt })
  const lastUser = messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const chat = genModel.startChat({ history })
  // Gemini: 最後のメッセージに画像パーツを追加
  const geminiParts: Part[] = [
    { text: lastUser },
    ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
  ]
  const result = await withRetry(() => chat.sendMessageStream(geminiParts), onWait)
  for await (const chunk of result.stream) {
    const t = chunk.text()
    full += t
    if (t) onChunk(t)
  }
  return full
}

/** APIキーが有効かどうかを最小リクエストで検証する */
export async function validateApiKey(
  apiKey: string,
  provider: 'gemini' | 'openai' | 'anthropic' = 'gemini',
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'APIキーを入力してください' }
  try {
    if (provider === 'openai') {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
      await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
    } else if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
    } else {
      const client = new GoogleGenerativeAI(apiKey)
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })
      await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] })
    }
    return { ok: true, message: '有効なAPIキーです' }
  } catch (err) {
    return { ok: false, message: parseUserFriendlyError(err) }
  }
}

// ペルソナ生成
export async function generatePersonas(
  dataText: string,
  count: number,
  sourceType: string,
  customInstruction: string,
  settings: Settings,
  onChunk?: (text: string) => void,
): Promise<Persona[]> {
  const sourceInstructions: Record<string, string> = {
    interview: 'N1インタビュー・顧客ヒアリングのデータです。発言内容から読み取れる価値観、課題、行動パターンを分析してペルソナを生成してください。',
    market_report: '市場調査・分析レポートです。市場セグメント、顧客行動パターン、デモグラフィック情報を分析してペルソナを生成してください。',
    review: '商品レビュー・口コミデータです。ユーザーの満足点、不満点、利用シーン、期待を分析してペルソナを生成してください。',
    purchase: '購買データ・トランザクションデータです。購買パターン、嗜好、ライフスタイルを分析してペルソナを生成してください。',
    other: 'データを分析してペルソナを生成してください。',
  }

  const basePrompt = getPrompt('persona_generation_system')
  const systemPrompt = `${basePrompt}

# 役割 (データ種別)
${sourceInstructions[sourceType] || sourceInstructions.other}

${customInstruction ? `# 追加指示\n${customInstruction}` : ''}`

  const userMessage = `以下のデータを分析し、${count}個の異なるペルソナを生成してください。

# データ
${dataText}

${count}個のペルソナをJSONで返してください。形式：
{
  "personas": [
    {
      "name": "...",
      "age": 30,
      "gender": "female",
      "country": "JP",
      "city": "東京",
      "occupation": "...",
      "background": "...",
      "values": ["...", "..."],
      "pain_points": ["...", "..."],
      "goals": ["...", "..."],
      "family": "...",
      "hobbies": ["...", "..."],
      "favorite_content": ["...", "..."],
      "apps_used": ["...", "..."],
      "screen_time": "...",
      "personal_episode": "...",
      "daily_routine": "...",
      "content_influence": "..."
    }
  ]
}`

  const text = await generateText(userMessage, systemPrompt, settings, true)
  if (onChunk) onChunk(text)
  const parsed = JSON.parse(text)
  return parsed.personas
}

// ディスカッション: ペルソナの返答生成（ストリーミング）
export async function generatePersonaReply(
  persona: Persona,
  topic: string,
  conversationHistory: Array<{ role: string; content: string; name?: string }>,
  round: number,
  totalRounds: number,
  settings: Settings,
  onChunk: (text: string) => void,
  materials?: MaterialItem[],
): Promise<string> {
  const materialContext = buildMaterialContext(materials ?? [])
  const systemPrompt = buildPersonaSystemPrompt(persona) + materialContext

  let phaseInstruction = ''
  if (round === 1) {
    phaseInstruction = `このラウンドでは、まずあなた自身の体験を共有してください。「${topic}」に関連する日常の具体的な場面を挙げて、そこで感じたこと・困ったこと・考えたことを率直に話してください。`
  } else if (round === totalRounds) {
    phaseInstruction = `最終ラウンドです。これまでの議論を踏まえて、あなたが最も重要だと感じたポイントと、今後どうしたいかを率直に伝えてください。`
  } else {
    phaseInstruction = `議論が深まってきました。他の参加者の意見を踏まえて、あなたの考えに変化はありますか？あるいは、まだ言えていないことがあれば話してください。`
  }

  const historyText = conversationHistory.length > 0
    ? `\n## これまでの発言\n${conversationHistory.map(m => `${m.name || m.role}: ${m.content}`).join('\n\n')}\n`
    : ''

  const userMessage = `「${topic}」についての議論に参加してください。${historyText}\n${phaseInstruction}\n\n500文字以内で、口語体で率直に発言してください。`

  const images = extractImageParts(materials ?? [])
  return generateTextStream([{ role: 'user', content: userMessage }], systemPrompt, settings, onChunk, undefined, images)
}

// ファシリテーターの要約生成
export async function generateFacilitatorSummary(
  topic: string,
  round: number,
  totalRounds: number,
  messages: Array<{ name: string; content: string }>,
  settings: Settings,
  onChunk: (text: string) => void,
): Promise<string> {
  const isLast = round === totalRounds
  const messagesText = messages.map(m => `${m.name}: ${m.content}`).join('\n\n')
  const prompt = isLast
    ? `「${topic}」に関するラウンド${round}の議論が終わりました。\n\n${messagesText}\n\n最終ラウンドなので、議論全体の結論と実践的な示唆をまとめてください（3〜5文）。`
    : `「${topic}」に関するラウンド${round}の議論が終わりました。\n\n${messagesText}\n\n共通点・対立点を整理し、次のラウンドへの問いかけで締めてください（3〜5文）。`

  return generateTextStream([{ role: 'user', content: prompt }], getPrompt('facilitator_system'), settings, onChunk)
}

// インタビューの返答生成（ストリーミング）
export async function generateInterviewReply(
  persona: Persona,
  conversationHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>,
  userMessage: string,
  settings: Settings,
  onChunk: (text: string) => void,
  materials?: MaterialItem[],
): Promise<string> {
  const materialContext = buildMaterialContext(materials ?? [])
  const systemPrompt = buildPersonaSystemPrompt(persona) + materialContext
  // Gemini形式の履歴を共通形式に変換
  const messages: Message[] = [
    ...conversationHistory.map(m => ({
      role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.parts.map(p => ('text' in p ? p.text : '')).join(''),
    })),
    { role: 'user' as const, content: userMessage },
  ]

  const images = extractImageParts(materials ?? [])
  return generateTextStream(messages, systemPrompt, settings, onChunk, undefined, images)
}

/** 添付資料からプロンプト用テキストを構築する */
export function buildMaterialContext(materials: MaterialItem[]): string {
  if (!materials || materials.length === 0) return ''
  const parts = materials.map((m, i) => {
    const label = `資料${i + 1}`
    if (m.type === 'url') {
      return `## ${label}: 参考URL「${m.name}」\nURL: ${m.url || m.name}${m.content ? `\n内容抜粋:\n${m.content.slice(0, 800)}` : '\n（URLの内容を参考に回答してください）'}`
    }
    if (m.type === 'image') {
      return `## ${label}: 画像「${m.name}」\n（この画像が添付されています。画像の内容を視覚的に分析し、「${m.name}の画像について」と参照しながら回答してください）`
    }
    if (m.type === 'pdf') {
      return `## ${label}: PDF「${m.name}」\n${m.content ? m.content.slice(0, 2000) : '（PDFが添付されています）'}`
    }
    if (m.type === 'code') {
      return `## ${label}: コード「${m.name}」\n\`\`\`\n${m.content.slice(0, 1500)}\n\`\`\``
    }
    return `## ${label}: 資料「${m.name}」\n${m.content ? m.content.slice(0, 1500) : '（資料が添付されています）'}`
  })

  return `\n\n# 添付資料（${materials.length}件）\n\
以下の資料が添付されています。回答時は「この画像について」「このPDFによると」「このリンクの内容では」のように、\
具体的にどの資料を参照しているか明示しながら回答してください。\
ユーザーが資料について質問した場合は、必ずその資料の内容に基づいて具体的に答えてください。\n\n${parts.join('\n\n')}`
}

/** ペルソナの品質スコアをチェックし、低品質なら改善したペルソナを再生成する */
export async function checkAndImprovePersona(
  persona: Persona,
  originalData: string,
  settings: Settings,
): Promise<{ improved: boolean; persona: Persona; score: number }> {
  const systemPrompt = 'あなたはUXリサーチのペルソナ品質審査員です。'
  const prompt = `以下のペルソナを品質評価してください。

## ペルソナ
名前: ${persona.name}
年齢: ${persona.age}歳
職業: ${persona.occupation}
背景: ${persona.background}
価値観: ${persona.values.join('、')}
課題: ${persona.pain_points.join('、')}
目標: ${persona.goals.join('、')}
エピソード: ${persona.personal_episode || '（なし）'}

## 評価基準
- 具体性: 職業・生活・行動が具体的か（曖昧・汎用的でないか）
- リアリティ: 実在しそうな人物像か
- 差別化: 他の典型的なペルソナと差別化されているか
- 背景との整合性: ソースデータと矛盾がないか

JSON: {"score": 1-10, "issues": ["問題点1", "問題点2"], "needsImprovement": true|false}`

  try {
    const text = await generateText(prompt, systemPrompt, settings, true)
    const result = JSON.parse(text)
    const score = result.score ?? 7
    if (!result.needsImprovement || score >= 7) {
      return { improved: false, persona, score }
    }

    const improvePrompt = `以下のペルソナを改善してください。

## 現在のペルソナ（問題あり）
${JSON.stringify(persona, null, 2)}

## 問題点
${(result.issues as string[]).map((i: string) => `- ${i}`).join('\n')}

## 元のデータ（参考）
${originalData.slice(0, 500)}

より具体的・リアルなペルソナに改善してください。
JSON（ペルソナ1件）: {"name":"...","age":30,"gender":"female","occupation":"...","background":"...","values":[],"pain_points":[],"goals":[],"family":"...","hobbies":[],"personal_episode":"...","daily_routine":"..."}`

    const improvedText = await generateText(improvePrompt, 'UXリサーチのペルソナ作成専門家です。具体的でリアルなペルソナを作成してください。', settings, true)
    const improvedRaw = JSON.parse(improvedText)
    const improved: Persona = {
      ...persona,
      name: improvedRaw.name || persona.name,
      age: improvedRaw.age || persona.age,
      gender: improvedRaw.gender || persona.gender,
      occupation: improvedRaw.occupation || persona.occupation,
      background: improvedRaw.background || persona.background,
      values: improvedRaw.values || persona.values,
      pain_points: improvedRaw.pain_points || persona.pain_points,
      goals: improvedRaw.goals || persona.goals,
      family: improvedRaw.family || persona.family,
      hobbies: improvedRaw.hobbies || persona.hobbies,
      personal_episode: improvedRaw.personal_episode || persona.personal_episode,
      daily_routine: improvedRaw.daily_routine || persona.daily_routine,
    }
    return { improved: true, persona: improved, score }
  } catch {
    return { improved: false, persona, score: 7 }
  }
}

/** インタビュー前の質問候補を提案する */
export async function suggestInterviewQuestions(
  topic: string,
  persona: Persona,
  settings: Settings,
): Promise<string[]> {
  const prompt = `リサーチテーマ「${topic}」について、以下のペルソナにインタビューするための質問を提案してください。

## ペルソナ
名前: ${persona.name}（${persona.age}歳、${persona.occupation}）
価値観: ${persona.values.slice(0, 3).join('、')}
課題: ${persona.pain_points.slice(0, 3).join('、')}

## 条件
- このペルソナの背景・価値観・課題に合った具体的な質問
- 「はい/いいえ」で終わらないオープンクエスチョン
- 7〜8問、短く明快に

JSON: {"questions": ["質問1", "質問2", ...]}`

  const text = await generateText(prompt, 'UXリサーチのインタビュー設計専門家です。', settings, true)
  const parsed = JSON.parse(text)
  return parsed.questions ?? []
}

// アンケート回答生成（単一ペルソナ）
export async function generateSurveyResponse(
  persona: Persona,
  questions: Question[],
  settings: Settings,
  materials?: MaterialItem[],
): Promise<SurveyAnswer[]> {
  const materialContext = buildMaterialContext(materials ?? [])
  const systemPrompt = buildPersonaSystemPrompt(persona) + '\n\n' + getPrompt('survey_system') + materialContext
  const questionsText = formatQuestionsForPrompt(questions)

  const userMessage = `以下のアンケートに回答してください。

【重要】回答は質問IDと回答内容のみを出力してください。

【回答方法】
- 選択式質問（単一回答）: 選択肢の文言をそのまま1つ選択
- 選択式質問（複数回答）: 選択肢の文言をパイプ記号（|）で区切る（例: 旅行|外食|ギフト）
- 自由記述質問: あなた自身の経験や具体的なエピソードを交えて回答（200文字以内）
- スケール評価質問: 指定範囲の整数で回答

【アンケート質問】
${questionsText}

JSONで返してください: {"answers": [{"question_id": "...", "answer": "..."}]}`

  // アンケートはストリーミング不要だが、画像を含む場合はマルチモーダル送信が必要
  const images = extractImageParts(materials ?? [])
  if (images.length > 0) {
    // 画像あり: generateTextStream経由でマルチモーダル送信
    let raw = ''
    await generateTextStream(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      settings,
      chunk => { raw += chunk },
      undefined,
      images,
    )
    const parsed = JSON.parse(raw)
    return parsed.answers
  }
  const text = await generateText(userMessage, systemPrompt, settings, true)
  const parsed = JSON.parse(text)
  return parsed.answers
}

// インサイトレポート生成
export async function generateInsightReport(
  summary: Record<string, unknown>,
  settings: Settings,
  onChunk: (text: string) => void,
): Promise<string> {
  const prompt = `${getPrompt('insight_report')}

【統計要約データ】
${JSON.stringify(summary, null, 2)}`

  return generateTextStream([{ role: 'user', content: prompt }], '', settings, onChunk)
}

// ── 対話機能 ──

// 参加者の発言生成（ストリーミング）
export async function generateDeliberationReply(
  _participant: DeliberationParticipant,
  systemPrompt: string,
  topic: string,
  history: Array<{ name: string; content: string; isUser?: boolean }>,
  settings: Settings,
  onChunk: (text: string) => void,
  onWait?: (remainingSecs: number, attempt: number) => void,
  materials?: MaterialItem[],
): Promise<string> {
  const materialContext = buildMaterialContext(materials ?? [])
  const fullSystemPrompt = systemPrompt + materialContext
  const historyText = history.length > 0
    ? `\n## これまでの発言\n${history.map(m => `${m.name}: ${m.content}`).join('\n\n')}\n`
    : ''

  const lastSpeaker = history.filter(m => !m.isUser).at(-1)
  const reactionGuide = lastSpeaker
    ? `直前は「${lastSpeaker.name}」の発言です。内容を踏まえたうえで、あなた自身の専門・生活経験・価値観から独自の視点を出してください。単純な同意・繰り返しは禁止。違和感があれば反論し、知らないことは知らないと言いながら自分の切り口で話してください。`
    : `あなたの専門・生活経験から、このテーマに対する率直な第一声を出してください。`

  const userMessage = `テーマ「${topic}」の議論です。${historyText}\n${reactionGuide}\n\n300文字以内、口語体で。`

  const images = extractImageParts(materials ?? [])
  return generateTextStream([{ role: 'user', content: userMessage }], fullSystemPrompt, settings, onChunk, onWait, images)
}

// ファシリテーターの発言生成
export async function generateFacilitatorDeliberationReply(
  allParticipants: DeliberationParticipant[],
  topic: string,
  history: Array<{ name: string; content: string; isUser?: boolean }>,
  settings: Settings,
  onChunk: (text: string) => void,
  onWait?: (remainingSecs: number, attempt: number) => void,
): Promise<string> {
  const others = allParticipants.filter(p => p.id !== FACILITATOR_ID)
  const systemPrompt = buildFacilitatorSystemPrompt(others.map(p => p.name))

  const historyText = history.length > 0
    ? `\n## これまでの発言\n${history.map(m => `${m.name}: ${m.content}`).join('\n\n')}\n`
    : ''

  const userMessage = `テーマ「${topic}」について議論しています。${historyText}\nファシリテーターとして、議論の流れを整理し、特定の参加者に発言を促してください。必ず最後に「〇〇さん、〜についてはどうでしょうか？」のように次の発言者を名指ししてください。`

  return generateTextStream([{ role: 'user', content: userMessage }], systemPrompt, settings, onChunk, onWait)
}

// ルーター: 次の発言者を決定
export async function selectNextSpeaker(
  participants: DeliberationParticipant[],
  topic: string,
  history: Array<{ name: string; content: string }>,
  settings: Settings,
  onWait?: (remainingSecs: number, attempt: number) => void,
): Promise<{ nextParticipantId: string; concluded: boolean }> {
  const participantList = participants.map(p => `- id: "${p.id}", 名前: ${p.name}, 役割: ${p.role}`).join('\n')
  const historyText = history.slice(-8).map(m => `${m.name}: ${m.content}`).join('\n\n')

  const prompt = `テーマ「${topic}」の議論です。

## 参加者
${participantList}

## 直近の発言
${historyText}

次に発言すべき参加者を選んでください。同じ人が連続して発言しないようにしてください。
議論が十分に深まり結論が出た場合は concluded: true にしてください。

JSON: {"nextParticipantId": "...", "concluded": false}`

  // onWaitが必要なためGeminiは直接呼ぶ。他プロバイダーはgenerateText経由
  const model = getModelName(settings)
  const provider = getProvider(model)
  let text: string
  if (provider === 'gemini') {
    const apiKey = getApiKeyForModel(settings, model)
    const client = new GoogleGenerativeAI(apiKey)
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: 'あなたは議論のファシリテーターです。会話の流れを読み、次に発言すべき参加者を選んでください。',
      generationConfig: { responseMimeType: 'application/json' },
    })
    const result = await withRetry(() => genModel.generateContent(prompt), onWait)
    text = result.response.text()
  } else {
    text = await generateText(prompt, 'あなたは議論のファシリテーターです。会話の流れを読み、次に発言すべき参加者を選んでください。', settings, true)
  }

  const parsed = JSON.parse(text)
  return {
    nextParticipantId: parsed.nextParticipantId ?? participants[0].id,
    concluded: parsed.concluded ?? false,
  }
}

// 成果物（議事録）を更新
export async function updateDeliberationArtifact(
  topic: string,
  history: Array<{ name: string; content: string }>,
  _current: ArtifactData | null,
  settings: Settings,
): Promise<ArtifactData> {
  const historyText = history.map(m => `${m.name}: ${m.content}`).join('\n\n')
  const prompt = `テーマ「${topic}」の議論から以下を抽出してください。

## 議論内容
${historyText}

JSONで返してください:
{
  "agreements": ["合意できた点"],
  "concerns": ["懸念・問題点"],
  "openQuestions": ["未解決の論点"],
  "specNotes": ["仕様・要件として記録すべき点"],
  "risks": [{"item": "リスク内容", "level": "high" | "mid" | "low"}]
}`

  const text = await generateText(prompt, '議論の内容を構造化して整理する専門家です。議事録・仕様・リスクを正確に抽出してください。', settings, true)
  const parsed = JSON.parse(text)
  return {
    agreements: parsed.agreements ?? [],
    concerns: parsed.concerns ?? [],
    openQuestions: parsed.openQuestions ?? [],
    specNotes: parsed.specNotes ?? [],
    risks: parsed.risks ?? [],
    updatedAt: new Date().toISOString(),
  }
}

// 対話の最終サマリー生成
export async function generateDeliberationSummary(
  topic: string,
  participants: DeliberationParticipant[],
  history: Array<{ name: string; content: string }>,
  settings: Settings,
): Promise<DeliberationSummary> {
  const participantNames = participants.map(p => `${p.name}（${p.role}）`).join('、')
  const historyText = history.map(m => `${m.name}: ${m.content}`).join('\n\n')

  const prompt = `「${topic}」について、${participantNames}が議論しました。

## 議論内容
${historyText}

この議論を構造化してまとめてください。

JSON:
{
  "conclusion": "全体の結論（2〜3文）",
  "agreements": ["合意した点1", "合意した点2"],
  "disagreements": ["見解が分かれた点1"],
  "nextActions": ["次のアクション1", "次のアクション2"]
}`

  const text = await generateText(prompt, '議論の結果を構造化してまとめる専門家です。', settings, true)
  const parsed = JSON.parse(text)
  return {
    conclusion: parsed.conclusion ?? '',
    agreements: parsed.agreements ?? [],
    disagreements: parsed.disagreements ?? [],
    nextActions: parsed.nextActions ?? [],
  }
}

// インタビュー・グループ議論のまとめ生成
export async function generateDiscussionSummary(
  topic: string,
  mode: 'interview' | 'group',
  messages: Array<{ role: string; name: string; content: string }>,
  settings: Settings,
): Promise<DeliberationSummary> {
  const modeLabel = mode === 'interview' ? 'インタビュー' : 'グループ議論'
  const historyText = messages
    .filter(m => m.content.trim().length > 0)
    .map(m => `${m.name}: ${m.content}`)
    .join('\n\n')

  const prompt = `「${topic}」に関する${modeLabel}の記録です。

## ${modeLabel}内容
${historyText}

この${modeLabel}を構造化してまとめてください。

JSON:
{
  "conclusion": "全体を通じた結論・主な発見（2〜3文）",
  "agreements": ["主な意見・共通点・重要な発言（3〜6個）"],
  "disagreements": ["異なる意見・懸念・課題（0〜3個）"],
  "nextActions": ["次に取るべきアクション・検討事項（0〜3個）"]
}`

  const text = await generateText(prompt, 'インタビューや議論の内容を構造化してまとめる専門家です。', settings, true)
  const parsed = JSON.parse(text)
  return {
    conclusion: parsed.conclusion ?? '',
    agreements: parsed.agreements ?? [],
    disagreements: parsed.disagreements ?? [],
    nextActions: parsed.nextActions ?? [],
  }
}

// デザイン仕様生成（対話の成果物）
export interface DesignScreen {
  name: string
  description: string
  components: string[]
}

export interface DesignSpec {
  overview: string
  screens: DesignScreen[]
  keyFeatures: string[]
  techStack: string[]
}

export async function generateDesignSpec(
  topic: string,
  history: Array<{ name: string; content: string }>,
  agreements: string[],
  settings: Settings,
): Promise<DesignSpec> {
  const historyText = history.slice(-15).map(m => `${m.name}: ${m.content}`).join('\n\n')
  const agreementsText = agreements.length > 0 ? `\n合意点: ${agreements.join('、')}` : ''

  const prompt = `テーマ「${topic}」の議論から、プロダクトの画面設計とデザイン仕様を作成してください。${agreementsText}

## 議論内容
${historyText}

JSONで返してください:
{
  "overview": "プロダクト概要（2〜3文）",
  "screens": [
    {
      "name": "画面名",
      "description": "この画面の目的と機能",
      "components": ["UIコンポーネント1", "UIコンポーネント2"]
    }
  ],
  "keyFeatures": ["主要機能1", "主要機能2", "主要機能3"],
  "techStack": ["推奨技術1", "推奨技術2"]
}`

  const text = await generateText(prompt, 'あなたはUIデザイナー兼プロダクトマネージャーです。議論内容から具体的な画面設計とプロダクト仕様を作成してください。', settings, true)
  const parsed = JSON.parse(text)
  return {
    overview: parsed.overview ?? '',
    screens: parsed.screens ?? [],
    keyFeatures: parsed.keyFeatures ?? [],
    techStack: parsed.techStack ?? [],
  }
}

// APIキーのテスト
export async function testApiKey(apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new GoogleGenerativeAI(apiKey)
    const modelName = model && model !== 'default' ? model : 'gemini-2.0-flash'
    const genModel = client.getGenerativeModel({ model: modelName })
    const result = await genModel.generateContent({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } })
    result.response.text()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: parseUserFriendlyError(err) }
  }
}

function buildPersonaSystemPrompt(persona: Persona): string {
  const genderMap: Record<string, string> = { male: '男性', female: '女性', other: 'その他' }
  const genderLabel = genderMap[persona.gender ?? ''] ?? '不明'

  const extras: string[] = []
  if (persona.family) extras.push(`# 家族構成\n${persona.family}`)
  if (persona.hobbies?.length) extras.push(`# 趣味・日課\n${persona.hobbies.map(h => `- ${h}`).join('\n')}`)
  if (persona.favorite_content?.length) extras.push(`# 好きなコンテンツ\n${persona.favorite_content.map(c => `- ${c}`).join('\n')}`)
  if (persona.apps_used?.length) extras.push(`# よく使うアプリ\n${persona.apps_used.map(a => `- ${a}`).join('\n')}`)
  if (persona.screen_time) extras.push(`# スマホ利用\n${persona.screen_time}`)
  if (persona.daily_routine) extras.push(`# 典型的な1日\n${persona.daily_routine}`)
  if (persona.personal_episode) extras.push(`# 記憶に残るエピソード\n${persona.personal_episode}`)
  if (persona.content_influence) extras.push(`# コンテンツからの影響\n${persona.content_influence}`)

  return `あなたは${persona.name}として会話に参加します。

# あなたのプロフィール
- 名前: ${persona.name}
- 年齢: ${persona.age}歳
- 性別: ${genderLabel}
- 職業: ${persona.occupation}
${persona.city ? `- 居住地: ${persona.city}` : ''}

# 背景
${persona.background}

# 価値観
${persona.values.map(v => `- ${v}`).join('\n')}

# 抱えている課題
${persona.pain_points.map(p => `- ${p}`).join('\n')}

# 目標・願望
${persona.goals.map(g => `- ${g}`).join('\n')}
${extras.length > 0 ? '\n' + extras.join('\n\n') : ''}
${getPrompt('persona_agent_system')}`
}

function formatQuestionsForPrompt(questions: Question[]): string {
  return questions
    .map((q, i) => {
      const lines = [`質問${i + 1} (ID: ${q.id}): ${q.text}`]
      if (q.question_type === 'multiple_choice') {
        if (q.allow_multiple) {
          const maxNote = q.max_selections > 0 ? `（最大${q.max_selections}個まで）` : ''
          lines.push(`  タイプ: 選択式・複数回答${maxNote}`)
          lines.push('  【必ず以下の選択肢から選んでください】')
        } else {
          lines.push('  タイプ: 選択式・単一回答')
          lines.push('  【必ず以下の選択肢から1つ選んでください】')
        }
        q.options.forEach((opt, j) => lines.push(`  ${j + 1}. ${opt}`))
        if (q.allow_multiple && q.options.length >= 2) {
          lines.push(`  【回答例】${q.options[0]}|${q.options[1]}`)
        } else {
          lines.push(`  【回答例】${q.options[0]}`)
        }
        lines.push('  【注意】選択肢の文言をそのまま使用してください')
      } else if (q.question_type === 'free_text') {
        lines.push('  タイプ: 自由記述（200文字以内で具体的に回答してください）')
      } else if (q.question_type === 'scale_rating') {
        const minDesc = q.scale_min_label ? `（${q.scale_min}=${q.scale_min_label}）` : ''
        const maxDesc = q.scale_max_label ? `（${q.scale_max}=${q.scale_max_label}）` : ''
        lines.push(`  タイプ: スケール評価（${q.scale_min}${minDesc}〜${q.scale_max}${maxDesc}の整数で回答）`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}
