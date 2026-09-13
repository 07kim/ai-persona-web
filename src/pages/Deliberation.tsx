import { useState, useRef, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Play, Square, Send, RefreshCw, Download,
  Plus, X, ChevronRight,
  MessageSquare, FileText, AlertTriangle, Wrench, Palette, Loader,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  generateDeliberationReply,
  generateFacilitatorDeliberationReply,
  determineNextSpeakerLocally,
  updateDeliberationArtifact,
  generateDeliberationSummary,
  generateDesignSpec,
  parseUserFriendlyError,
  type DesignSpec,
} from '../lib/ai'
import { generateId, now, sleep } from '../lib/utils'
import { PRESET_ROLES, buildParticipantSystemPrompt, FACILITATOR_ID, type PresetRole } from '../lib/presetRoles'
import type { DeliberationParticipant, DeliberationMessage, ArtifactData, DeliberationSummary, DeliberationSessionRecord, DeliberationParticipantConfig, ParticipantTemplate, MaterialItem } from '../types'
import { PresetPersonaSection } from '../components/PresetPersonaSection'
import MaterialsPanel from '../components/MaterialsPanel'

type Screen = 'setup' | 'session' | 'summary'
type ArtifactTab = 'minutes' | 'spec' | 'risk' | 'design'

const CATEGORY_LABEL: Record<PresetRole['category'], string> = {
  professional: 'プロフェッショナル',
  creative: 'クリエイティブ',
  consumer: '消費者・生活者',
}
const CATEGORY_ORDER: PresetRole['category'][] = ['professional', 'consumer', 'creative']

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-lime-100 text-lime-700',
]

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function Deliberation() {
  const { personas, settings, deliberationSessions, saveDeliberationSession, deleteDeliberationSession, participantTemplates, saveParticipantTemplate, deleteParticipantTemplate } = useAppStore()
  const location = useLocation()
  const locationState = (location.state as { resumeSession?: DeliberationSessionRecord; preSelectedPersonaIds?: string[] } | null)
  const resumeSession = locationState?.resumeSession ?? null
  const preSelectedPersonaIds = locationState?.preSelectedPersonaIds ?? []

  const initConfig = resumeSession?.participantConfig
  const [screen, setScreen] = useState<Screen>(resumeSession ? 'session' : 'setup')
  const [viewingSession, setViewingSession] = useState<DeliberationSessionRecord | null>(null)
  const sessionIdRef = useRef<string | null>(resumeSession?.id ?? null)
  const sessionCreatedAt = useRef<string>(resumeSession?.created_at ?? now())
  const [topic, setTopic] = useState(resumeSession?.topic ?? '')
  const [materials, setMaterials] = useState<MaterialItem[]>(resumeSession?.materials ?? [])
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(initConfig?.presetIds ?? [])
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(initConfig?.personaIds ?? preSelectedPersonaIds)
  const [personaGroupFilter, setPersonaGroupFilter] = useState<string | null>(null)
  const [customList, setCustomList] = useState<{ id: string; name: string; role: string }[]>(initConfig?.customList ?? [])
  const [customName, setCustomName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [maxTurns, setMaxTurns] = useState(initConfig?.maxTurns ?? 20)
  const [autoEnd, setAutoEnd] = useState(initConfig?.autoEnd ?? true)
  const [facilitatorEnabled, setFacilitatorEnabled] = useState(initConfig?.facilitatorEnabled ?? false)
  const [facilitatorName, setFacilitatorName] = useState(initConfig?.facilitatorName ?? 'ファシリテーター')
  const [facilitatorInterval, setFacilitatorInterval] = useState(initConfig?.facilitatorInterval ?? 4)

  // セッション状態
  const [messages, setMessages] = useState<DeliberationMessage[]>(resumeSession?.messages ?? [])
  const [artifact, setArtifact] = useState<ArtifactData | null>(resumeSession?.artifact ?? null)
  const [designSpec, setDesignSpec] = useState<DesignSpec | null>(resumeSession?.designSpec ?? null)
  const [designGenerating, setDesignGenerating] = useState(false)
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('minutes')
  const [currentTurn, setCurrentTurn] = useState(resumeSession?.turn ?? 0)
  const [isRunning, setIsRunning] = useState(false)
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null)
  const [loadingPhase, setLoadingPhase] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [userInput, setUserInput] = useState('')
  const [artifactUpdating, setArtifactUpdating] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<DeliberationSummary | null>(resumeSession?.summary ?? null)

  const isRunningRef = useRef(false)
  const turnRef = useRef(resumeSession?.turn ?? 0)   // 総発言数
  const pausedByUserRef = useRef(false)              // ユーザーが「一時停止」したか
  const pendingUserMsg = useRef<string | null>(null)
  const messagesRef = useRef<DeliberationMessage[]>(resumeSession?.messages ?? [])
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── 参加者を構築 ──
  const facilitatorParticipant: DeliberationParticipant | null = facilitatorEnabled
    ? { id: FACILITATOR_ID, name: facilitatorName || 'ファシリテーター', role: '議論の進行役', type: 'facilitator', isFacilitator: true }
    : null

  const participants: DeliberationParticipant[] = [
    ...(facilitatorParticipant ? [facilitatorParticipant] : []),
    ...selectedPresetIds
      .map(id => {
        const role = PRESET_ROLES.find(r => r.id === id)
        if (!role) return null
        return { id, name: role.name, role: role.description, type: 'preset' as const }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    ...selectedPersonaIds
      .map(pid => {
        const p = personas.find(pe => pe.id === pid)
        if (!p) return null
        return {
          id: `persona_${pid}`,
          name: p.name,
          role: `${p.occupation}、${p.age}歳。${p.background.slice(0, 50)}`,
          type: 'persona' as const,
          personaId: pid,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    ...customList.map(c => ({ id: c.id, name: c.name, role: c.role, type: 'custom' as const })),
  ]

  const canStart = topic.trim().length > 0 && participants.length >= 2

  function addMessage(msg: DeliberationMessage) {
    setMessages(prev => {
      const next = [...prev.filter(m => m.id !== msg.id), msg]
      messagesRef.current = next
      return next
    })
  }

  function updateStreamingMessage(id: string, content: string, done = false) {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, content, isStreaming: !done } : m)
      messagesRef.current = next
      return next
    })
  }

  // ── 成果物更新 ──
  const triggerArtifactUpdate = useCallback(async (msgs: DeliberationMessage[]) => {
    if (artifactUpdating) return
    setArtifactUpdating(true)
    try {
      const history = msgs.filter(m => !m.isUser).map(m => ({ name: m.participantName, content: m.content }))
      const result = await updateDeliberationArtifact(topic, history, artifact, settings)
      setArtifact(result)
    } catch (e) {
      console.error('artifact update failed', e)
    } finally {
      setArtifactUpdating(false)
    }
  }, [topic, artifact, settings, artifactUpdating])

  // ── デザイン仕様生成 ──
  async function handleGenerateDesign() {
    if (designGenerating || messages.length === 0) return
    setDesignGenerating(true)
    setArtifactTab('design')
    try {
      const history = messagesRef.current.filter(m => !m.isUser).map(m => ({ name: m.participantName, content: m.content }))
      const spec = await generateDesignSpec(topic, history, artifact?.agreements ?? [], settings)
      setDesignSpec(spec)
    } catch (e) {
      console.error('design spec failed', e)
    } finally {
      setDesignGenerating(false)
    }
  }

  // ── メインループ（動的ルーター方式）──
  // 発言者はLLMルーターが会話の流れを読んで選出。ファシリテーターは facInterval 発言ごとに
  // 「ここまでのまとめ＋次の論点提示」を行う。結論が出る or 最大発言数到達で終了し、必ず結論を生成する
  const runLoop = useCallback(async (
    initialParticipants: DeliberationParticipant[],
    facInterval = 4,
  ): Promise<'concluded' | 'cap' | 'paused' | 'error'> => {
    isRunningRef.current = true
    pausedByUserRef.current = false
    setIsRunning(true)
    setSessionError('')
    setError('')

    const onRateWait = (secs: number) => {
      setLoadingPhase(`リクエスト制限中 — ${secs}秒後に再試行します...`)
    }

    const facilitator = initialParticipants.find(p => p.isFacilitator) ?? null
    const speakers = initialParticipants.filter(p => !p.isFacilitator)

    // 1人に発言させる内部関数。成功でtrue、致命的エラーでfalse
    const speak = async (participant: DeliberationParticipant): Promise<boolean> => {
      // 保留中のユーザー発言を先に差し込む
      const pendingMsg = pendingUserMsg.current
      if (pendingMsg) {
        pendingUserMsg.current = null
        addMessage({
          id: generateId(), participantId: 'user', participantName: 'あなた',
          role: 'オブザーバー', content: pendingMsg, timestamp: now(), isUser: true,
        })
      }

      setCurrentSpeaker(participant.name)
      setLoadingPhase(`${participant.name}が発言中...`)
      const msgId = generateId()
      addMessage({
        id: msgId, participantId: participant.id, participantName: participant.name,
        role: participant.role, content: '', timestamp: now(), isStreaming: true,
      })

      try {
        const history = messagesRef.current.filter(m => m.id !== msgId)
          .map(m => ({ name: m.participantName, content: m.content, isUser: m.isUser }))
        let accumulated = ''
        if (participant.isFacilitator) {
          await generateFacilitatorDeliberationReply(initialParticipants, topic, history, settings, chunk => {
            accumulated += chunk; updateStreamingMessage(msgId, accumulated)
          }, onRateWait)
        } else {
          const systemPrompt = buildParticipantSystemPrompt(participant.name, participant.role)
          await generateDeliberationReply(participant, systemPrompt, topic, history, settings, chunk => {
            accumulated += chunk; updateStreamingMessage(msgId, accumulated)
          }, onRateWait, materials)
        }
        updateStreamingMessage(msgId, accumulated, true)
        // 実際の発言数とターン数を厳密に同期
        const completedCount = messagesRef.current.filter(m => !m.isUser && !m.isStreaming).length
        turnRef.current = completedCount
        setCurrentTurn(completedCount)
        setSessionError('') // 発言成功時に古いエラーを自動クリア
        setCurrentSpeaker(null)
        setLoadingPhase('')
        return true
      } catch (e) {
        const friendly = parseUserFriendlyError(e)
        setMessages(prev => prev.filter(m => m.id !== msgId))
        setSessionError(friendly)
        setCurrentSpeaker(null)
        setLoadingPhase('')
        const s = String(e)
        // 致命的エラーは中断
        if (s.includes('free_tier') || s.includes('FreeTier') || s.includes('limit: 0') ||
            s.includes('API_KEY') || s.includes('401') || s.includes('403')) {
          return false
        }
        // 非致命的エラーはこの発言をスキップして継続
        return true
      }
    }

    const routerPool = speakers.length > 0 ? speakers : initialParticipants
    let endReason: 'concluded' | 'cap' | 'paused' | 'error' = 'paused'

    try {
      while (isRunningRef.current && turnRef.current < maxTurns) {
        // === 次の発言者を決定（API消費ゼロ・対立スタンス＆未発言者判定） ===
        let next: DeliberationParticipant

        // ファシリテーターは facInterval 発言ごとに「まとめ＋論点提示」を挿入
        const isFacilitatorTurn = facilitator !== null
          && turnRef.current > 0
          && turnRef.current % facInterval === 0

        if (isFacilitatorTurn) {
          next = facilitator!
        } else {
          // 各参加者の過去発言数を集計
          const speakerCounts: Record<string, number> = {}
          messagesRef.current.forEach(m => {
            if (!m.isUser && m.participantId) {
              speakerCounts[m.participantId] = (speakerCounts[m.participantId] ?? 0) + 1
            }
          })

          const history = messagesRef.current.slice(-6).map(m => ({ name: m.participantName, content: m.content, isUser: m.isUser }))
          next = determineNextSpeakerLocally(routerPool, history, speakerCounts)
        }

        if (!isRunningRef.current) break

        const ok = await speak(next)
        if (!ok) { endReason = 'error'; break }

        // ファシリテーター発言の節目でのみ議事録を自動更新（API消費を節約）
        if (isFacilitatorTurn && isRunningRef.current) {
          triggerArtifactUpdate(messagesRef.current)
        }

        await sleep(1500)
      }

      // 終了理由の確定
      if (endReason !== 'error') {
        endReason = turnRef.current >= maxTurns ? 'cap' : 'paused'
      }
      if (pausedByUserRef.current) endReason = 'paused'
    } catch (e) {
      setSessionError(parseUserFriendlyError(e))
      console.error('runLoop crashed:', e)
      endReason = 'error'
    } finally {
      isRunningRef.current = false
      setIsRunning(false)
      setCurrentSpeaker(null)
      setLoadingPhase('')
    }
    return endReason
  }, [topic, maxTurns, autoEnd, settings, materials, triggerArtifactUpdate])

  async function handleStart() {
    if (!canStart || !settings.apiKey) { if (!settings.apiKey) setError('APIキーが設定されていません'); return }
    const sessionId = generateId()
    const createdAt = now()
    sessionIdRef.current = sessionId
    sessionCreatedAt.current = createdAt
    setMessages([])
    setArtifact(null)
    setDesignSpec(null)
    setCurrentTurn(0)
    turnRef.current = 0
    messagesRef.current = []
    pendingUserMsg.current = null
    setSessionError('')
    setLoadingPhase('')

    // 開始直後に設定をすべて記録して保存（メッセージが空でも保存）
    const initialRecord: DeliberationSessionRecord = {
      id: sessionId,
      topic,
      participantNames: participants.map(p => p.name),
      messages: [],
      artifact: null,
      summary: null,
      created_at: now(),
      updated_at: now(),
      status: 'active',
      turn: 0,
      participantConfig: buildParticipantConfig(),
      materials: materials.length > 0 ? materials : undefined,
      designSpec: null,
    }
    await saveDeliberationSession(initialRecord)

    setScreen('session')
    const reason = await runLoop(participants, facilitatorInterval)
    // 結論到達・上限到達で自然終了 → 必ず結論を生成して完了。中断/エラーは途中保存
    if (reason === 'concluded' || reason === 'cap') {
      await finalizeSession()
    } else {
      await saveCurrentSession('active')
    }
  }

  function buildParticipantConfig(): DeliberationParticipantConfig {
    return {
      presetIds: selectedPresetIds,
      personaIds: selectedPersonaIds,
      customList,
      facilitatorEnabled,
      facilitatorName,
      facilitatorInterval,
      maxTurns,
      autoEnd,
    }
  }

  async function saveCurrentSession(status: 'active' | 'completed') {
    if (!sessionIdRef.current) return
    const record: DeliberationSessionRecord = {
      id: sessionIdRef.current,
      topic,
      participantNames: participants.map(p => p.name),
      messages: messagesRef.current.filter(m => !m.isStreaming),
      artifact: artifact,
      summary: summary,
      created_at: sessionCreatedAt.current,
      updated_at: now(),
      status,
      turn: turnRef.current,
      participantConfig: buildParticipantConfig(),
      materials: materials.length > 0 ? materials : undefined,
      designSpec,
    }
    await saveDeliberationSession(record)
  }

  async function handleUserSend() {
    if (!userInput.trim()) return
    pendingUserMsg.current = userInput.trim()
    setUserInput('')
    if (!isRunning) {
      const msg: DeliberationMessage = {
        id: generateId(),
        participantId: 'user',
        participantName: 'あなた',
        role: 'オブザーバー',
        content: pendingUserMsg.current!,
        timestamp: now(),
        isUser: true,
      }
      pendingUserMsg.current = null
      addMessage(msg)
      const reason = await runLoop(participants, facilitatorInterval)
      if (reason === 'concluded' || reason === 'cap') {
        await finalizeSession()
      } else {
        await saveCurrentSession('active')
      }
    }
  }

  // 議論を締めて結論を生成・保存し、まとめ画面へ遷移する
  async function finalizeSession() {
    isRunningRef.current = false
    setIsRunning(false)
    setCurrentSpeaker(null)

    const facilitator = participants.find(p => p.isFacilitator) ?? null
    let sum: DeliberationSummary | null = null

    if (settings.apiKey && messagesRef.current.filter(m => !m.isUser).length > 0) {
      // ファシリテーターがいれば最後に締めの発言を追加
      if (facilitator) {
        try {
          setLoadingPhase(`${facilitator.name}が議論を締めくくっています...`)
          const history = messagesRef.current.filter(m => m.content).slice(-12)
            .map(m => ({ name: m.participantName, content: m.content, isUser: m.isUser }))
          const closingId = generateId()
          addMessage({
            id: closingId, participantId: facilitator.id, participantName: facilitator.name,
            role: facilitator.role, content: '', timestamp: now(), isStreaming: true,
          })
          let acc = ''
          await generateFacilitatorDeliberationReply(participants, `${topic}（議論の締めくくり。ここまでの結論を簡潔にまとめてください）`, history, settings, chunk => {
            acc += chunk; updateStreamingMessage(closingId, acc)
          })
          updateStreamingMessage(closingId, acc, true)
        } catch (e) {
          console.error('closing failed', e)
        }
      }
      try {
        setLoadingPhase('結論をまとめています...')
        const history = messagesRef.current.filter(m => !m.isUser).map(m => ({ name: m.participantName, content: m.content }))
        const [s] = await Promise.all([
          generateDeliberationSummary(topic, participants, history, settings),
          triggerArtifactUpdate(messagesRef.current),
        ])
        sum = s
        setSummary(sum)
      } catch (e) {
        console.error('summary failed', e)
      }
    }
    setLoadingPhase('')

    if (sessionIdRef.current) {
      const record: DeliberationSessionRecord = {
        id: sessionIdRef.current,
        topic,
        participantNames: participants.map(p => p.name),
        messages: messagesRef.current.filter(m => !m.isStreaming),
        artifact,
        summary: sum,
        created_at: sessionCreatedAt.current,
        updated_at: now(),
        status: 'completed',
        turn: turnRef.current,
        participantConfig: buildParticipantConfig(),
        materials: materials.length > 0 ? materials : undefined,
        designSpec,
      }
      await saveDeliberationSession(record)
    }
    setScreen('summary')
  }

  // 手動終了ボタン
  async function handleEnd() {
    await finalizeSession()
  }

  async function handleReset() {
    isRunningRef.current = false
    // 会話があれば保存してから戻る
    await saveCurrentSession('active')
    setScreen('setup')
    setMessages([])
    setArtifact(null)
    setDesignSpec(null)
    setSummary(null)
    setCurrentTurn(0)
    turnRef.current = 0
    pausedByUserRef.current = false
    sessionIdRef.current = null
    setError('')
  }

  function handleDownload() {
    const lines: string[] = [`# 対話セッション: ${topic}`, '', `参加者: ${participants.map(p => p.name).join('、')}`, '']
    messages.forEach(m => lines.push(`**${m.participantName}**: ${m.content}`, ''))
    if (summary) {
      lines.push('---', '## まとめ', '', `### 結論`, summary.conclusion, '')
      lines.push('### 合意点', ...summary.agreements.map(a => `- ${a}`), '')
      lines.push('### 見解の相違', ...summary.disagreements.map(d => `- ${d}`), '')
      lines.push('### 次のアクション', ...summary.nextActions.map(n => `- ${n}`))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deliberation-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function togglePreset(id: string) {
    setSelectedPresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function togglePersona(id: string) {
    setSelectedPersonaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function removeParticipant(p: DeliberationParticipant) {
    if (p.type === 'preset') setSelectedPresetIds(prev => prev.filter(id => id !== p.id))
    else if (p.type === 'persona') setSelectedPersonaIds(prev => prev.filter(id => `persona_${id}` !== p.id))
    else setCustomList(prev => prev.filter(c => c.id !== p.id))
  }

  function addCustom() {
    if (!customName.trim() || !customRole.trim()) return
    setCustomList(prev => [...prev, { id: generateId(), name: customName.trim(), role: customRole.trim() }])
    setCustomName('')
    setCustomRole('')
  }

  // ═══════════════════════════════════════
  // セットアップ画面（2カラム）
  // ═══════════════════════════════════════
  if (screen === 'setup') {
    const grouped = CATEGORY_ORDER.map(cat => ({
      cat,
      roles: PRESET_ROLES.filter(r => r.category === cat),
    }))

    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">対話セッション</h2>
        <p className="text-sm text-gray-400 mb-6">
          複数の視点を持つ参加者がテーマについて議論し、議事録・仕様・デザイン案を自動生成します
        </p>

        {error && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-6 items-start">
          {/* ── 左カラム: テーマ + 参加者選択 ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* テーマ */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                議論のテーマ
              </label>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="例: このサブスクアプリの市場性と課題についてどう思いますか？"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none bg-white"
              />
            </div>

            {/* 添付資料 */}
            <div className="mb-4">
              <MaterialsPanel
                materials={materials}
                onChange={setMaterials}
                label="参考資料を添付する（任意）"
                description="画像・PDF・URL などを添付すると参加者がその内容を踏まえて議論します"
                collapsed
              />
            </div>

            {/* 参加者選択 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  参加者を選ぶ
                </label>
                <p className="text-xs text-gray-400">役割をクリックで追加・解除できます</p>
              </div>

              {/* プリセットロール */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">
                    プリセットロール
                    <span className="ml-1.5 text-gray-400 font-normal">役割が決まっているキャラクター</span>
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  {grouped.map(({ cat, roles }) => (
                    <div key={cat}>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">
                        {CATEGORY_LABEL[cat]}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map(role => {
                          const sel = selectedPresetIds.includes(role.id)
                          return (
                            <button
                              key={role.id}
                              onClick={() => togglePreset(role.id)}
                              title={role.description}
                              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs border transition-all ${
                                sel
                                  ? 'border-indigo-400 bg-indigo-500 text-white font-medium shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                            >
                              {role.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* プリセットペルソナ */}
              <PresetPersonaSection
                selectedIds={selectedPersonaIds}
                onSelect={setSelectedPersonaIds}
                multi={true}
              />

              {/* DBペルソナ（常に表示） */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">
                    作成済みペルソナ
                    <span className="ml-1.5 text-gray-400 font-normal">詳細な背景・価値観を持つキャラクター</span>
                  </p>
                  {/* グループフィルター */}
                  {personas.length > 0 && (() => {
                    const groups = Array.from(new Set(personas.map(p => p.group).filter(Boolean))) as string[]
                    if (groups.length === 0) return null
                    return (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          onClick={() => setPersonaGroupFilter(null)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                            personaGroupFilter === null
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          すべて
                        </button>
                        {groups.map(g => (
                          <button
                            key={g}
                            onClick={() => setPersonaGroupFilter(g === personaGroupFilter ? null : g)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                              personaGroupFilter === g
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                {personas.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-gray-400 mb-2">まだペルソナがありません</p>
                    <a
                      href="/personas/generate"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Plus size={11} /> ペルソナを生成する
                    </a>
                  </div>
                ) : (
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {personas.filter(p => !personaGroupFilter || p.group === personaGroupFilter).map(p => {
                      const sel = selectedPersonaIds.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePersona(p.id)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                            sel ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            sel ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {p.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${sel ? 'text-indigo-800' : 'text-gray-800'}`}>{p.name}</p>
                            <p className={`text-[10px] truncate ${sel ? 'text-indigo-400' : 'text-gray-400'}`}>{p.age}歳 · {p.occupation}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* カスタム参加者 */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600">
                    カスタム参加者
                    <span className="ml-1.5 text-gray-400 font-normal">このセッション限り（DBに保存されません）</span>
                  </p>
                </div>
                <div className="p-3">
                  <div className="flex gap-2 mb-2">
                    <input
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="名前"
                      className="w-24 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <input
                      value={customRole}
                      onChange={e => setCustomRole(e.target.value)}
                      placeholder="役割・属性（例: 40代の主婦、節約重視）"
                      onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      onClick={addCustom}
                      disabled={!customName.trim() || !customRole.trim()}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Plus size={13} /> 追加
                    </button>
                  </div>
                  {customList.length > 0 && (
                    <div className="space-y-1">
                      {customList.map(c => (
                        <div key={c.id} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getAvatarColor(c.id)}`}>
                            {c.name.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-gray-800">{c.name}</span>
                          <span className="text-[10px] text-gray-400 flex-1 truncate">— {c.role}</span>
                          <button onClick={() => setCustomList(prev => prev.filter(x => x.id !== c.id))} className="text-gray-300 hover:text-red-400 transition-colors ml-auto">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 右カラム: 設定 + 選択中 + 開始 ── */}
          <div className="w-64 shrink-0 sticky top-6 space-y-4">

            {/* ファシリテーター設定 */}
            <div className={`border rounded-xl p-4 space-y-3 transition-colors ${facilitatorEnabled ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-0.5 flex items-center gap-1.5">
                    <span className="text-violet-500">◆</span> ファシリテーター
                  </p>
                  <p className="text-[10px] text-gray-400 leading-tight">議論を整理し、次の発言者を指名する進行役</p>
                </div>
                <button
                  onClick={() => setFacilitatorEnabled(v => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${facilitatorEnabled ? 'bg-violet-500' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${facilitatorEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {facilitatorEnabled && (
                <>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">名前</p>
                    <input
                      value={facilitatorName}
                      onChange={e => setFacilitatorName(e.target.value)}
                      placeholder="ファシリテーター"
                      className="w-full text-xs border border-violet-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">発言間隔（通常の発言 N 回ごとに1回）</p>
                    <div className="flex items-center gap-2">
                      {[2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setFacilitatorInterval(n)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            facilitatorInterval === n
                              ? 'bg-violet-500 text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-violet-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 設定（上に） */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">最大発言数</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMaxTurns(t => Math.max(4, t - 2))}
                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >−</button>
                  <span className="text-xl font-bold text-gray-900 w-8 text-center">{maxTurns}</span>
                  <button
                    onClick={() => setMaxTurns(t => Math.min(60, t + 2))}
                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >+</button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">この発言数を上限に議論。結論が出れば早めに終了します</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">AI自動終了</p>
                  <p className="text-[10px] text-gray-400 leading-tight">結論が出たら自動停止</p>
                </div>
                <button
                  onClick={() => setAutoEnd(v => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${autoEnd ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${autoEnd ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>

            {/* 参加者テンプレート */}
            <ParticipantTemplatePanel
              templates={participantTemplates}
              currentConfig={buildParticipantConfig()}
              onLoad={(t) => {
                setSelectedPresetIds(t.presetIds)
                setSelectedPersonaIds(t.personaIds)
                setCustomList(t.customList)
                if (t.facilitatorEnabled !== undefined) setFacilitatorEnabled(t.facilitatorEnabled)
                if (t.facilitatorName) setFacilitatorName(t.facilitatorName)
                if (t.facilitatorInterval) setFacilitatorInterval(t.facilitatorInterval)
                if (t.maxTurns) setMaxTurns(t.maxTurns)
              }}
              onSave={saveParticipantTemplate}
              onDelete={deleteParticipantTemplate}
            />

            {/* 選択中の参加者 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">選択中の参加者</p>
                {participants.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {participants.length}人
                  </span>
                )}
              </div>
              <div className="p-3 min-h-[100px]">
                {participants.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-center">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      左のロールや<br />ペルソナをクリックして追加
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {participants.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getAvatarColor(p.id)}`}>
                          {p.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium text-gray-800 flex-1 truncate">{p.name}</span>
                        <button
                          onClick={() => removeParticipant(p)}
                          className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 開始ボタン */}
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              <Play size={15} />
              {participants.length >= 2
                ? `${participants.length}人で対話を開始`
                : '参加者を2人以上選ぶ'}
            </button>
            {participants.length >= 2 && !topic.trim() && (
              <p className="text-center text-xs text-gray-400">テーマを入力してください</p>
            )}
          </div>
        </div>

        {/* ── セッション履歴 ── */}
        {deliberationSessions.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MessageSquare size={14} className="text-gray-400" />
                セッション履歴
              </h3>
              <span className="text-xs text-gray-400">{deliberationSessions.length}件</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...deliberationSessions].reverse().map(s => (
                <div
                  key={s.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm hover:border-gray-300 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      s.status === 'completed'
                        ? 'bg-green-50 text-green-600 border border-green-200'
                        : 'bg-amber-50 text-amber-600 border border-amber-200'
                    }`}>
                      {s.status === 'completed' ? '完了' : '中断'}
                    </span>
                    <button
                      onClick={() => deleteDeliberationSession(s.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-2">{s.topic}</p>
                  <p className="text-xs text-gray-400 mb-3">
                    {s.participantNames.slice(0, 3).join('・')}
                    {s.participantNames.length > 3 && ` 他${s.participantNames.length - 3}人`}
                    　{s.messages.length}発言
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">
                      {new Date(s.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => setViewingSession(s)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
                    >
                      記録を見る <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── セッション記録ビューワー ── */}
        {viewingSession && (
          <SessionViewer session={viewingSession} onClose={() => setViewingSession(null)} />
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════
  // サマリー画面
  // ═══════════════════════════════════════
  if (screen === 'summary') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">対話のまとめ</h2>
            <p className="text-sm text-gray-400 mt-0.5">{topic}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
            >
              <Download size={14} /> ダウンロード
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              新しいセッション
            </button>
          </div>
        </div>

        {summary ? (
          <div className="space-y-5">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-indigo-800 mb-2">結論</h3>
              <p className="text-sm text-indigo-900 leading-relaxed">{summary.conclusion}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">合意した点</h3>
              <ul className="space-y-1.5">
                {summary.agreements.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-green-500 shrink-0">✓</span>{a}</li>
                ))}
              </ul>
            </div>
            {summary.disagreements.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">見解の相違</h3>
                <ul className="space-y-1.5">
                  {summary.disagreements.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-amber-500 shrink-0">△</span>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.nextActions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">次のアクション</h3>
                <ul className="space-y-1.5">
                  {summary.nextActions.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <ChevronRight size={14} className="text-indigo-400 shrink-0 mt-0.5" />{n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
            サマリーを生成できませんでした
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════
  // セッション画面（スプリット）
  // ═══════════════════════════════════════
  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{topic}</p>
          <p className="text-xs text-gray-400 truncate">{participants.map(p => p.name).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 border border-gray-200 rounded-full px-2.5 py-0.5">
            {currentTurn} / {maxTurns} 発言
          </span>
          {isRunning ? (
            <button onClick={() => { pausedByUserRef.current = true; isRunningRef.current = false }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              <Square size={11} /> 一時停止
            </button>
          ) : (
            <button onClick={async () => {
              const reason = await runLoop(participants, facilitatorInterval)
              if (reason === 'concluded' || reason === 'cap') await finalizeSession()
              else await saveCurrentSession('active')
            }} disabled={currentTurn >= maxTurns} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 transition-colors">
              <Play size={11} /> 再開
            </button>
          )}
          <button onClick={handleEnd} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg transition-colors">
            まとめる
          </button>
        </div>
      </div>

      {/* スプリットエリア */}
      <div className="flex flex-1 min-h-0">
        {/* ── 左: チャット ── */}
        <div className="flex flex-col w-[52%] border-r border-gray-200 min-h-0">
          {/* APIキー・エラーバナー（常に上部に表示） */}
          {!settings.apiKey && (
            <div className="shrink-0 flex items-start gap-3 bg-red-50 border-b border-red-200 px-4 py-3">
              <AlertTriangle size={16} className="shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-800">APIキーが未設定です</p>
                <p className="text-xs text-red-600">設定画面でGemini APIキーを登録してください</p>
              </div>
              <button onClick={handleReset} className="shrink-0 text-xs text-red-600 underline">戻る</button>
            </div>
          )}
          {sessionError && (
            <div className="shrink-0 flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-4 py-3">
              <AlertTriangle size={16} className="shrink-0 text-amber-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">セッションが停止しました</p>
                <p className="text-xs text-amber-700 mt-0.5">{sessionError}</p>
              </div>
              <button onClick={handleReset} className="shrink-0 text-xs text-amber-700 underline">戻る</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 py-8">
                {isRunning ? (
                  <>
                    <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{loadingPhase || 'AIが準備中...'}</p>
                      <p className="text-xs text-gray-400 mt-1">しばらくお待ちください</p>
                    </div>
                  </>
                ) : sessionError || !settings.apiKey ? null : (
                  <>
                    <MessageSquare size={28} className="text-gray-200" />
                    <p className="text-sm text-gray-400">まだ発言がありません</p>
                  </>
                )}
              </div>
            )}
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {currentSpeaker && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex gap-0.5">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-gray-400">{currentSpeaker}が発言中...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserSend() } }}
                placeholder="いつでも発言を割り込めます..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button onClick={handleUserSend} disabled={!userInput.trim()} className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── 右: 成果物 ── */}
        <div className="flex flex-col w-[48%] min-h-0 bg-white">
          <div className="shrink-0 border-b border-gray-200 flex items-center justify-between px-2">
            <div className="flex">
              {([
                ['minutes', <FileText size={11} />, '議事録'],
                ['spec', <Wrench size={11} />, '仕様'],
                ['risk', <AlertTriangle size={11} />, 'リスク'],
                ['design', <Palette size={11} />, 'デザイン'],
              ] as [ArtifactTab, React.ReactNode, string][]).map(([tab, icon, label]) => (
                <button
                  key={tab}
                  onClick={() => setArtifactTab(tab)}
                  className={`flex items-center gap-1 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    artifactTab === tab
                      ? 'border-teal-500 text-teal-700'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 pr-1">
              {artifactTab === 'design' ? (
                <button
                  onClick={handleGenerateDesign}
                  disabled={designGenerating || messages.length === 0}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-40 px-2 py-1.5 rounded-md hover:bg-violet-50 transition-colors font-medium"
                >
                  {designGenerating ? <Loader size={11} className="animate-spin" /> : <Palette size={11} />}
                  生成
                </button>
              ) : (
                <button
                  onClick={() => triggerArtifactUpdate(messagesRef.current)}
                  disabled={artifactUpdating || messages.length === 0}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw size={11} className={artifactUpdating ? 'animate-spin' : ''} />
                  更新
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {artifactTab === 'design' ? (
              <DesignPanel designSpec={designSpec} generating={designGenerating} onGenerate={handleGenerateDesign} hasMessages={messages.length > 0} />
            ) : !artifact ? (
              <div className="text-center text-gray-300 text-sm py-12">
                <FileText size={28} className="mx-auto mb-2" />
                <p>数発言後に自動生成</p>
                <p className="text-xs mt-1 text-gray-200">または右上の「更新」で手動生成</p>
              </div>
            ) : (
              <ArtifactPanel artifact={artifact} tab={artifactTab} topic={topic} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── メッセージバブル ──
function MessageBubble({ msg }: { msg: DeliberationMessage }) {
  if (msg.isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
            {msg.content}
          </div>
          <p className="text-right text-xs text-gray-400 mt-1">あなた</p>
        </div>
      </div>
    )
  }

  // ファシリテーター専用スタイル
  if (msg.participantId === FACILITATOR_ID) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] w-full">
          <div className="flex items-center gap-2 mb-1.5 justify-center">
            <span className="text-xs font-semibold text-violet-500">◆ {msg.participantName}</span>
            <span className="text-[10px] text-violet-300">— 進行役</span>
          </div>
          <div className={`bg-violet-50 border rounded-2xl px-5 py-3 text-sm leading-relaxed text-violet-900 ${
            msg.isStreaming ? 'border-violet-300' : 'border-violet-200'
          }`}>
            {msg.content || (msg.isStreaming ? <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse rounded-sm" /> : null)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${getAvatarColor(msg.participantId)}`}>
        {msg.participantName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className="text-xs font-semibold text-gray-700">{msg.participantName}</span>
          <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{msg.role.slice(0, 18)}</span>
        </div>
        <div className={`bg-white border rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-gray-800 ${msg.isStreaming ? 'border-indigo-200' : 'border-gray-200'}`}>
          {msg.content || (msg.isStreaming ? <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse rounded-sm" /> : null)}
        </div>
      </div>
    </div>
  )
}

// ── 議事録・仕様・リスク パネル ──
function ArtifactPanel({ artifact, tab, topic }: { artifact: ArtifactData; tab: ArtifactTab; topic: string }) {
  if (tab === 'minutes') {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">テーマ</p>
          <p className="text-sm text-gray-800 font-medium">{topic}</p>
        </div>
        {artifact.agreements.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">主な合意点</p>
            <ul className="space-y-1.5">{artifact.agreements.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-green-400 shrink-0">✓</span>{a}</li>
            ))}</ul>
          </div>
        )}
        {artifact.concerns.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">主な懸念点</p>
            <ul className="space-y-1.5">{artifact.concerns.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-amber-400 shrink-0">△</span>{c}</li>
            ))}</ul>
          </div>
        )}
        {artifact.openQuestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">未解決の論点</p>
            <ul className="space-y-1.5">{artifact.openQuestions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-gray-300 shrink-0">?</span>{q}</li>
            ))}</ul>
          </div>
        )}
      </div>
    )
  }

  if (tab === 'spec') {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">仕様・要件メモ</p>
        {artifact.specNotes.length === 0 ? (
          <p className="text-sm text-gray-400">仕様に関連した発言が出ると自動的に記録されます</p>
        ) : (
          <ul className="space-y-2">
            {artifact.specNotes.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-indigo-400 shrink-0">→</span>{s}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">リスク一覧</p>
      {artifact.risks.length === 0 ? (
        <p className="text-sm text-gray-400">リスクに関する発言が出ると自動的に記録されます</p>
      ) : (
        <div className="space-y-2">
          {artifact.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-gray-50 rounded-lg px-3 py-2">
              <span className={`text-xs font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded ${
                r.level === 'high' ? 'bg-red-100 text-red-600' : r.level === 'mid' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {r.level === 'high' ? '高' : r.level === 'mid' ? '中' : '低'}
              </span>
              <span className="text-sm text-gray-700">{r.item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── デザインパネル ──
function DesignPanel({ designSpec, generating, onGenerate, hasMessages }: {
  designSpec: DesignSpec | null
  generating: boolean
  onGenerate: () => void
  hasMessages: boolean
}) {
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <Loader size={24} className="text-violet-500 animate-spin" />
        <p className="text-sm text-gray-500">デザイン仕様を生成中...</p>
      </div>
    )
  }

  if (!designSpec) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
          <Palette size={22} className="text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">画面設計を自動生成</p>
          <p className="text-xs text-gray-400">議論の内容からUIデザイン仕様を生成します</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!hasMessages}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-40 transition-colors"
        >
          <Palette size={14} /> デザイン仕様を生成
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 概要 */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1.5">プロダクト概要</p>
        <p className="text-sm text-violet-900 leading-relaxed">{designSpec.overview}</p>
      </div>

      {/* 画面一覧 */}
      {designSpec.screens.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">画面設計</p>
          <div className="space-y-3">
            {designSpec.screens.map((s, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* 画面ヘッダー（モック的なタイトルバー） */}
                <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-gray-400 ml-2 font-mono">{s.name}</span>
                </div>
                {/* 画面コンテンツ */}
                <div className="p-3 bg-white">
                  <p className="text-xs text-gray-600 mb-2 leading-relaxed">{s.description}</p>
                  {s.components.length > 0 && (
                    <div className="space-y-1">
                      {s.components.map((c, j) => (
                        <div key={j} className="flex items-center gap-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-2.5 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-sm bg-violet-400 shrink-0" />
                          <span className="text-xs text-gray-600">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主要機能 */}
      {designSpec.keyFeatures.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">主要機能</p>
          <ul className="space-y-1.5">
            {designSpec.keyFeatures.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-violet-400 shrink-0">◆</span>{f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 技術スタック */}
      {designSpec.techStack.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">推奨技術スタック</p>
          <div className="flex flex-wrap gap-1.5">
            {designSpec.techStack.map((t, i) => (
              <span key={i} className="px-2.5 py-1 bg-gray-900 text-gray-200 rounded-lg text-xs font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ── セッション記録ビューワー ──
function SessionViewer({ session, onClose }: { session: DeliberationSessionRecord; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  session.status === 'completed'
                    ? 'bg-green-50 text-green-600 border-green-200'
                    : 'bg-amber-50 text-amber-600 border-amber-200'
                }`}>
                  {session.status === 'completed' ? '完了' : '中断'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(session.updated_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm leading-snug">{session.topic}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {session.participantNames.join('・')}　{session.messages.length}発言
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* まとめ */}
        {session.summary && (
          <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
            <p className="text-xs font-semibold text-indigo-700 mb-1">結論</p>
            <p className="text-sm text-indigo-900">{session.summary.conclusion}</p>
          </div>
        )}

        {/* 会話ログ */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {session.messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.isUser ? 'flex-row-reverse' : ''}`}>
              {!m.isUser && (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${getAvatarColor(m.participantId)}`}>
                  {m.participantName.charAt(0)}
                </div>
              )}
              <div className={`max-w-[80%] ${m.isUser ? 'items-end' : ''} flex flex-col gap-0.5`}>
                {!m.isUser && (
                  <p className="text-[10px] text-gray-400 font-medium px-1">{m.participantName}</p>
                )}
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.isUser
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── 参加者テンプレートパネル ── */
function ParticipantTemplatePanel({
  templates,
  currentConfig,
  onLoad,
  onSave,
  onDelete,
}: {
  templates: ParticipantTemplate[]
  currentConfig: DeliberationParticipantConfig
  onLoad: (t: DeliberationParticipantConfig & { facilitatorEnabled: boolean; facilitatorName: string; facilitatorInterval: number; maxTurns: number }) => void
  onSave: (t: ParticipantTemplate) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [showSave, setShowSave] = useState(false)

  const hasParticipants = currentConfig.presetIds.length + currentConfig.personaIds.length + currentConfig.customList.length > 0

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      id: generateId(),
      name: name.trim(),
      presetIds: currentConfig.presetIds,
      personaIds: currentConfig.personaIds,
      customList: currentConfig.customList,
      created_at: now(),
    })
    setName('')
    setShowSave(false)
    setSaving(false)
  }

  if (templates.length === 0 && !hasParticipants) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">参加者テンプレート</p>
        {hasParticipants && !showSave && (
          <button
            onClick={() => setShowSave(true)}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium px-2 py-1 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            + 現在の構成を保存
          </button>
        )}
      </div>

      {showSave && (
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="テンプレート名"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            保存
          </button>
          <button
            onClick={() => { setShowSave(false); setName('') }}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="space-y-1">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-2 group">
              <button
                onClick={() => onLoad({
                  presetIds: t.presetIds,
                  personaIds: t.personaIds,
                  customList: t.customList,
                  facilitatorEnabled: false,
                  facilitatorName: 'ファシリテーター',
                  facilitatorInterval: 4,
                  maxTurns: 20,
                  autoEnd: true,
                })}
                className="flex-1 text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 transition-colors"
              >
                {t.name}
                <span className="text-gray-400 ml-1.5">({t.presetIds.length + t.personaIds.length + t.customList.length}人)</span>
              </button>
              <button
                onClick={() => onDelete(t.id)}
                className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
