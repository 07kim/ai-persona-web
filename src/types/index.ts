export interface Persona {
  id: string
  name: string
  age: number
  gender?: 'male' | 'female' | 'other'
  country?: string
  city?: string
  occupation: string
  background: string
  values: string[]
  pain_points: string[]
  goals: string[]
  tags: string[]
  group?: string             // プロジェクト・グループ名
  created_at: string
  updated_at: string
  // 具体的な生活・人物像フィールド
  family?: string               // 家族構成 e.g. "既婚、子供2人（8歳・5歳）"
  hobbies?: string[]            // 趣味・日課
  favorite_content?: string[]   // 好きな映画・音楽・本・YouTubeなど
  apps_used?: string[]          // よく使うアプリ・サービス
  screen_time?: string          // スマホ利用時間・タイミング
  personal_episode?: string     // その人らしい具体的エピソード（100〜200字）
  daily_routine?: string        // 典型的な1日のスケジュール
  content_influence?: string    // 好きなコンテンツから受けた影響・価値観・ライフスタイルへの反映
  materials?: MaterialItem[]    // 参考資料（画像・PDF・URL・動画など）
  generation_context?: {
    source_type?: string
    custom_instruction?: string
    source_filename?: string
  }
}

export type QuestionType = 'multiple_choice' | 'free_text' | 'scale_rating'

export interface Question {
  id: string
  text: string
  question_type: QuestionType
  options: string[]
  scale_min: number
  scale_max: number
  scale_min_label?: string
  scale_max_label?: string
  allow_multiple: boolean
  max_selections: number
}

export interface TemplateImage {
  id: string
  name: string
  data: string
  mime_type: string
  original_filename: string
}

export interface SurveyTemplate {
  id: string
  name: string
  questions: Question[]
  images: TemplateImage[]
  created_at: string
  updated_at: string
}

export interface SurveyAnswer {
  question_id: string
  answer: string
}

export interface PersonaSurveyResult {
  persona_id: string
  persona_name: string
  answers: SurveyAnswer[]
  error?: string
}

export interface SurveyRun {
  id: string
  template_id: string
  template_name: string
  persona_ids: string[]
  results: PersonaSurveyResult[]
  created_at: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  materials?: MaterialItem[]
}

export interface Message {
  id: string
  role: 'user' | 'persona' | 'facilitator'
  persona_id?: string
  persona_name?: string
  content: string
  timestamp: string
  round?: number
}

export interface DiscussionSession {
  id: string
  topic: string
  mode: 'interview' | 'group'
  persona_ids: string[]
  messages: Message[]
  created_at: string
  updated_at: string
  status: 'active' | 'ended'
  current_round: number
  total_rounds: number
  materials?: MaterialItem[]
}

export interface Settings {
  apiKey: string        // Gemini APIキー（後方互換のため残す）
  openaiApiKey: string  // OpenAI APIキー
  anthropicApiKey: string // Anthropic APIキー
  model: string
  quotaSafeMode: boolean
  quotaRpm: number
}

export type AiProvider = 'gemini' | 'openai' | 'anthropic'

export function getProvider(model: string): AiProvider {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai'
  if (model.startsWith('claude-')) return 'anthropic'
  return 'gemini'
}

/** APIキーの形式からプロバイダーを自動判定する */
export function detectProviderFromKey(apiKey: string): AiProvider | null {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  if (apiKey.startsWith('sk-')) return 'openai'   // sk- / sk-proj-
  if (apiKey.startsWith('AIza')) return 'gemini'
  return null
}

/** プロバイダーのデフォルトモデル */
export const DEFAULT_MODEL_FOR_PROVIDER: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
}

export function getApiKeyForModel(settings: Settings, model: string): string {
  const provider = getProvider(model)
  if (provider === 'openai') return settings.openaiApiKey || ''
  if (provider === 'anthropic') return settings.anthropicApiKey || ''
  return settings.apiKey || ''
}

// ── 対話機能 ──

export interface DeliberationParticipant {
  id: string
  name: string
  role: string
  type: 'preset' | 'persona' | 'custom' | 'facilitator'
  personaId?: string
  isFacilitator?: boolean
}

export interface DeliberationMessage {
  id: string
  participantId: string
  participantName: string
  role: string
  content: string
  timestamp: string
  isUser?: boolean
  isStreaming?: boolean
}

export interface ArtifactData {
  agreements: string[]
  concerns: string[]
  openQuestions: string[]
  specNotes: string[]
  risks: Array<{ item: string; level: 'high' | 'mid' | 'low' }>
  updatedAt: string
}

export interface DeliberationSummary {
  conclusion: string
  agreements: string[]
  disagreements: string[]
  nextActions: string[]
}

export interface DeliberationParticipantConfig {
  presetIds: string[]
  personaIds: string[]
  customList: Array<{ id: string; name: string; role: string }>
  facilitatorEnabled: boolean
  facilitatorName: string
  facilitatorInterval: number
  maxTurns: number
  autoEnd: boolean
}

export interface DeliberationSessionRecord {
  id: string
  topic: string
  participantNames: string[]
  messages: DeliberationMessage[]
  artifact: ArtifactData | null
  summary: DeliberationSummary | null
  created_at: string
  updated_at: string
  status: 'active' | 'completed'
  turn: number
  participantConfig?: DeliberationParticipantConfig
  materials?: MaterialItem[]
}

// ── 参加者テンプレート ──

export interface ParticipantTemplate {
  id: string
  name: string
  presetIds: string[]
  personaIds: string[]
  customList: Array<{ id: string; name: string; role: string }>
  created_at: string
}

// ── 添付資料 ──

export type MaterialType = 'image' | 'document' | 'url' | 'code' | 'video' | 'pdf'

export interface MaterialItem {
  id: string
  name: string
  type: MaterialType
  content: string       // テキスト内容、またはimageはdata URL (base64)
  mime_type?: string
  url?: string
  added_at: string
}

// ── データソース ──

export type DataSourceType = 'interview' | 'market_report' | 'review' | 'purchase' | 'other'

export const DATA_SOURCE_LABELS: Record<DataSourceType, string> = {
  interview: 'インタビュー・ヒアリング',
  market_report: '市場調査レポート',
  review: '商品レビュー・口コミ',
  purchase: '購買データ',
  other: 'その他',
}
