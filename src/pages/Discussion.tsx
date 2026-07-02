import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Send, Loader, RefreshCw, MessageSquare, Users, Download, ChevronRight, AlertTriangle, History, Lightbulb, Image, FileText, Code, Link as LinkIcon, X, Plus, Paperclip } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  generateInterviewReply, generatePersonaReply, generateFacilitatorSummary,
  generateDiscussionSummary, parseUserFriendlyError, suggestInterviewQuestions,
} from '../lib/ai'
import { generateId, now } from '../lib/utils'
import { parseFileToText } from '../lib/fileParser'
import type { DiscussionSession, Message, Persona, DeliberationSummary, MaterialItem } from '../types'
import type { Part } from '@google/generative-ai'
import { PresetPersonaSection } from '../components/PresetPersonaSection'

type Mode = 'setup' | 'session' | 'summary'

export default function Discussion() {
  const { personas, settings, addDiscussion, updateDiscussion } = useAppStore()
  const location = useLocation()
  const locationState = (location.state as { resumeSession?: DiscussionSession; preSelectedPersonaIds?: string[] } | null)
  const resumeSession = locationState?.resumeSession ?? null
  const preSelectedPersonaIds = locationState?.preSelectedPersonaIds ?? []

  const [mode, setMode] = useState<Mode>(resumeSession ? 'session' : 'setup')
  const [topic, setTopic] = useState(resumeSession?.topic ?? '')
  const [sessionMode, setSessionMode] = useState<'interview' | 'group'>(resumeSession?.mode ?? 'interview')
  const [selectedIds, setSelectedIds] = useState<string[]>(resumeSession?.persona_ids ?? preSelectedPersonaIds)
  const [totalRounds, setTotalRounds] = useState(resumeSession?.total_rounds ?? 3)

  // 添付資料
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [showMaterials, setShowMaterials] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 質問提案
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const [activeSession, setActiveSession] = useState<DiscussionSession | null>(resumeSession ?? null)
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingMsg, setStreamingMsg] = useState('')
  const [streamingRole, setStreamingRole] = useState<string>('')
  const [sessionError, setSessionError] = useState('')
  const [summaryData, setSummaryData] = useState<DeliberationSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // インタビュー再開時：過去メッセージからchatHistoryを復元
  const chatHistoryRef = useRef<Array<{ role: 'user' | 'model'; parts: Part[] }>>(
    resumeSession?.mode === 'interview'
      ? resumeSession.messages
          .filter(m => m.role === 'user' || m.role === 'persona')
          .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
          }))
      : []
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages, streamingMsg])

  function togglePersona(id: string) {
    if (sessionMode === 'interview') {
      setSelectedIds([id])
    } else {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }
  }

  async function startSession() {
    if (!topic.trim() || selectedIds.length === 0) return

    const session: DiscussionSession = {
      id: generateId(),
      topic,
      mode: sessionMode,
      persona_ids: selectedIds,
      messages: [],
      created_at: now(),
      updated_at: now(),
      status: 'active',
      current_round: 1,
      total_rounds: sessionMode === 'group' ? totalRounds : 1,
    }

    chatHistoryRef.current = []
    setSessionError('')
    setSummaryData(null)
    await addDiscussion(session)
    setActiveSession(session)
    setMode('session')

    if (sessionMode === 'group') {
      await runGroupRound(session, 1)
    }
  }

  async function runGroupRound(session: DiscussionSession, round: number) {
    setIsGenerating(true)
    setSessionError('')
    const roundPersonas = session.persona_ids
      .map(id => personas.find(p => p.id === id))
      .filter(Boolean) as Persona[]

    const prevMessages = session.messages
    let updatedSession = session
    const roundMessages: Message[] = []

    for (const persona of roundPersonas) {
      setStreamingRole(persona.name)
      setStreamingMsg('')
      let text = ''
      let success = false

      // 最大2回試みる
      for (let attempt = 0; attempt < 2 && !success; attempt++) {
        try {
          text = ''
          const history = [...prevMessages, ...roundMessages].map(m => ({
            role: m.role,
            content: m.content,
            name: m.persona_name,
          }))
          await generatePersonaReply(
            persona, session.topic, history, round, session.total_rounds, settings,
            chunk => { text += chunk; setStreamingMsg(text) },
          )
          success = true
        } catch (e) {
          const friendly = parseUserFriendlyError(e)
          if (attempt === 1) {
            // 2回失敗したらエラーバナーを出してこのペルソナをスキップ
            setSessionError(`${persona.name}の発言生成に失敗しました: ${friendly}`)
            text = ''
          } else {
            // 1回目の失敗: 短く待ってリトライ
            await new Promise(r => setTimeout(r, 2000))
          }
        }
      }

      if (!success) {
        setStreamingMsg('')
        continue
      }

      const msg: Message = {
        id: generateId(),
        role: 'persona',
        persona_id: persona.id,
        persona_name: persona.name,
        content: text,
        timestamp: now(),
        round,
      }
      roundMessages.push(msg)
      updatedSession = { ...updatedSession, messages: [...updatedSession.messages, msg], updated_at: now() }
      setActiveSession({ ...updatedSession })
    }

    // ファシリテーター要約
    setStreamingMsg('')
    setStreamingRole('ファシリテーター')
    let facText = ''
    try {
      await generateFacilitatorSummary(
        session.topic, round, session.total_rounds,
        roundMessages.map(m => ({ name: m.persona_name ?? '', content: m.content })),
        settings,
        chunk => { facText += chunk; setStreamingMsg(facText) },
      )
    } catch (e) {
      const friendly = parseUserFriendlyError(e)
      setSessionError(`ファシリテーターの要約生成に失敗しました: ${friendly}`)
    }

    const facMsg: Message = {
      id: generateId(), role: 'facilitator', persona_name: 'ファシリテーター',
      content: facText, timestamp: now(), round,
    }

    updatedSession = {
      ...updatedSession,
      messages: facText ? [...updatedSession.messages, facMsg] : updatedSession.messages,
      current_round: round + 1,
      status: round >= session.total_rounds ? 'ended' : 'active',
      updated_at: now(),
    }

    setStreamingMsg('')
    setStreamingRole('')
    setIsGenerating(false)
    setActiveSession({ ...updatedSession })
    await updateDiscussion(updatedSession)
  }

  async function sendInterviewMessage() {
    if (!inputText.trim() || !activeSession || isGenerating) return

    const userMsg: Message = { id: generateId(), role: 'user', content: inputText, timestamp: now() }
    // 再開後に送信した場合 status を active に戻す
    const updatedWithUser = { ...activeSession, status: 'active' as const, messages: [...activeSession.messages, userMsg], updated_at: now() }
    setActiveSession(updatedWithUser)
    setInputText('')
    setIsGenerating(true)
    setStreamingMsg('')
    setSessionError('')

    const persona = personas.find(p => p.id === activeSession.persona_ids[0])
    if (!persona) { setIsGenerating(false); return }

    chatHistoryRef.current.push({ role: 'user', parts: [{ text: inputText }] })

    setStreamingRole(persona.name)
    let replyText = ''
    const historyForApi = chatHistoryRef.current.slice(0, -1)

    try {
      await generateInterviewReply(
        persona, historyForApi, inputText, settings,
        chunk => { replyText += chunk; setStreamingMsg(replyText) },
        materials,
      )
    } catch (e) {
      const friendly = parseUserFriendlyError(e)
      setSessionError(`${persona.name}の返答生成に失敗しました: ${friendly}`)
      setStreamingMsg('')
      setStreamingRole('')
      setIsGenerating(false)
      return
    }

    chatHistoryRef.current.push({ role: 'model', parts: [{ text: replyText }] })

    const replyMsg: Message = {
      id: generateId(), role: 'persona',
      persona_id: persona.id, persona_name: persona.name,
      content: replyText, timestamp: now(),
    }

    const finalSession = { ...updatedWithUser, messages: [...updatedWithUser.messages, replyMsg], updated_at: now() }
    setStreamingMsg('')
    setStreamingRole('')
    setIsGenerating(false)
    setActiveSession(finalSession)
    await updateDiscussion(finalSession)
  }

  async function nextGroupRound() {
    if (!activeSession || isGenerating) return
    await runGroupRound(activeSession, activeSession.current_round)
  }

  async function handleShowSummary() {
    if (!activeSession) return
    setSummaryLoading(true)
    try {
      const msgs = activeSession.messages.map(m => ({
        role: m.role,
        name: m.persona_name ?? 'ユーザー',
        content: m.content,
      }))
      const sum = await generateDiscussionSummary(
        activeSession.topic,
        activeSession.mode,
        msgs,
        settings,
      )
      setSummaryData(sum)
      // セッションを完了状態で保存
      const completed = { ...activeSession, status: 'ended' as const, updated_at: now() }
      setActiveSession(completed)
      await updateDiscussion(completed)
      setMode('summary')
    } catch (e) {
      setSessionError(`まとめの生成に失敗しました: ${parseUserFriendlyError(e)}`)
    } finally {
      setSummaryLoading(false)
    }
  }

  function handleDownload() {
    if (!activeSession) return
    const lines: string[] = [
      `# ${activeSession.mode === 'interview' ? 'インタビュー' : 'グループ議論'}: ${activeSession.topic}`,
      '',
    ]
    activeSession.messages.forEach(m => {
      const name = m.role === 'user' ? 'あなた' : (m.persona_name ?? 'ファシリテーター')
      lines.push(`**${name}**: ${m.content}`, '')
    })
    if (summaryData) {
      lines.push('---', '## まとめ', '', `### 結論`, summaryData.conclusion, '')
      lines.push('### 主な意見・発見', ...summaryData.agreements.map(a => `- ${a}`), '')
      if (summaryData.disagreements.length > 0) {
        lines.push('### 異なる意見・課題', ...summaryData.disagreements.map(d => `- ${d}`), '')
      }
      if (summaryData.nextActions.length > 0) {
        lines.push('### 次のアクション', ...summaryData.nextActions.map(n => `- ${n}`))
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `discussion-${activeSession.id.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function resetToSetup() {
    // 現在のセッションを保存してから戻る
    if (activeSession) {
      const status = activeSession.status === 'active' ? 'ended' : activeSession.status
      await updateDiscussion({ ...activeSession, status, updated_at: now() })
    }
    setMode('setup')
    setActiveSession(null)
    setStreamingMsg('')
    setSessionError('')
    setSummaryData(null)
    chatHistoryRef.current = []
  }

  async function handleSuggestQuestions() {
    if (!topic.trim() || selectedIds.length === 0) return
    const persona = personas.find(p => p.id === selectedIds[0])
    if (!persona) return
    setLoadingSuggestions(true)
    setSuggestedQuestions([])
    try {
      const questions = await suggestInterviewQuestions(topic, persona, settings)
      setSuggestedQuestions(questions)
    } catch {
      // 失敗時は無視
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    let content = ''
    let type: MaterialItem['type'] = 'document'
    if (file.type.startsWith('image/')) {
      type = 'image'
      content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    } else {
      content = await parseFileToText(file)
      if (file.name.match(/\.(ts|tsx|js|jsx|py|java|c|cpp|go|rb|rs|swift|kt)$/i)) type = 'code'
    }
    const item: MaterialItem = {
      id: generateId(), name: file.name, type, content, mime_type: file.type, added_at: now(),
    }
    setMaterials(m => [...m, item])
  }

  function handleUrlAttach() {
    const url = urlInput.trim()
    if (!url) return
    const item: MaterialItem = {
      id: generateId(), name: url, type: 'url', content: url, url, added_at: now(),
    }
    setMaterials(m => [...m, item])
    setUrlInput('')
  }

  // ── セットアップ画面 ──
  if (mode === 'setup') {
    if (personas.length === 0) {
      return (
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-gray-400">ペルソナがありません。先にペルソナを生成してください。</p>
        </div>
      )
    }

    const canStart = topic.trim() && selectedIds.length > 0

    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-gray-900">インタビュー・議論</h2>
          <Link
            to="/discussion/history"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <History size={13} /> 履歴を見る
          </Link>
        </div>
        <p className="text-sm text-gray-400 mb-6">ペルソナに質問したり、複数ペルソナで議論させます</p>

        {/* モード選択 */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">モードを選ぶ</p>
          <div className="grid grid-cols-2 gap-3">
            <ModeCard
              selected={sessionMode === 'interview'}
              icon={<MessageSquare size={20} />}
              title="1対1インタビュー"
              desc="あなたが質問し、ペルソナが答えます。深掘りに最適"
              onClick={() => { setSessionMode('interview'); setSelectedIds([]) }}
            />
            <ModeCard
              selected={sessionMode === 'group'}
              icon={<Users size={20} />}
              title="グループ議論"
              desc="複数のペルソナがファシリテーターの進行で議論します"
              onClick={() => { setSessionMode('group'); setSelectedIds([]) }}
            />
          </div>
        </div>

        {/* テーマ入力 */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
            テーマ・トピック
          </label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={sessionMode === 'interview'
              ? '例: 最近のオンラインショッピング体験について教えてください'
              : '例: 新しいサブスクサービスの導入についてどう思いますか？'}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none bg-white"
          />
        </div>

        {/* ペルソナ選択 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {sessionMode === 'interview' ? 'インタビューするペルソナ（1人）' : 'グループに参加するペルソナ'}
            </p>
          </div>
          <PresetPersonaSection
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            multi={sessionMode === 'group'}
          />
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              作成済みペルソナ
              {selectedIds.length > 0 && (
                <span className="ml-2 text-indigo-600 normal-case font-medium">
                  {selectedIds.length}人選択中
                </span>
              )}
            </p>
            {sessionMode === 'group' && (
              <div className="flex gap-3">
                <button onClick={() => setSelectedIds(personas.map(p => p.id))} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">全選択</button>
                <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-gray-600">解除</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {personas.map(p => {
              const selected = selectedIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePersona(p.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    selected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selected ? 'text-indigo-800' : 'text-gray-800'}`}>
                      {p.name}
                    </p>
                    <p className={`text-xs truncate ${selected ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {p.age}歳 · {p.occupation}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* グループ: ラウンド数 */}
        {sessionMode === 'group' && (
          <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">ラウンド数</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTotalRounds(r => Math.max(1, r - 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors font-bold"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-gray-900 w-8 text-center">{totalRounds}</span>
                <button
                  onClick={() => setTotalRounds(r => Math.min(10, r + 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors font-bold"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-gray-400">
                ラウンド — 各ラウンドで全ペルソナが発言し、ファシリテーターが要約します
              </p>
            </div>
          </div>
        )}

        {/* インタビュー: 質問提案 */}
        {sessionMode === 'interview' && selectedIds.length > 0 && topic.trim() && (
          <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Lightbulb size={12} className="text-amber-400" /> 質問の提案
              </p>
              <button
                onClick={handleSuggestQuestions}
                disabled={loadingSuggestions}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg disabled:opacity-40 transition-colors font-medium"
              >
                {loadingSuggestions ? <Loader size={11} className="animate-spin" /> : <Lightbulb size={11} />}
                {loadingSuggestions ? '生成中...' : 'AIに提案してもらう'}
              </button>
            </div>
            {suggestedQuestions.length > 0 ? (
              <ul className="space-y-1.5">
                {suggestedQuestions.map((q, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setTopic(q)}
                      className="w-full text-left text-xs text-gray-700 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors"
                    >
                      {i + 1}. {q}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">ボタンを押すとAIが質問を提案します</p>
            )}
          </div>
        )}

        {/* 添付資料 */}
        <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMaterials(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Paperclip size={14} className="text-gray-400" />
              添付資料
              {materials.length > 0 && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                  {materials.length}
                </span>
              )}
            </span>
            <span className="text-xs text-gray-400">{showMaterials ? '▲' : '▼'}</span>
          </button>
          {showMaterials && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  <Plus size={11} /> ファイル追加
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileAttach}
                  accept="image/*,.pdf,.txt,.md,.csv,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.go,.rb,.rs,.swift,.kt" />
              </div>
              <div className="flex gap-2">
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUrlAttach() } }}
                  placeholder="URLを入力してEnter"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  onClick={handleUrlAttach}
                  disabled={!urlInput.trim()}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
                >
                  <LinkIcon size={11} /> 追加
                </button>
              </div>
              {materials.length > 0 && (
                <ul className="space-y-1.5">
                  {materials.map(m => (
                    <li key={m.id} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      {m.type === 'image' ? <Image size={11} className="text-blue-400 shrink-0" />
                        : m.type === 'url' ? <LinkIcon size={11} className="text-indigo-400 shrink-0" />
                        : m.type === 'code' ? <Code size={11} className="text-green-500 shrink-0" />
                        : <FileText size={11} className="text-gray-400 shrink-0" />}
                      <span className="flex-1 truncate">{m.name}</span>
                      <button onClick={() => setMaterials(prev => prev.filter(x => x.id !== m.id))} className="text-gray-300 hover:text-red-400 shrink-0">
                        <X size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          onClick={startSession}
          disabled={!canStart}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl disabled:opacity-40 transition-colors text-sm"
        >
          {sessionMode === 'interview' ? 'インタビューを開始する' : '議論を開始する'}
        </button>
        {!canStart && (
          <p className="text-center text-xs text-gray-400 mt-2">
            {!topic.trim() ? 'テーマを入力してください' : 'ペルソナを選んでください'}
          </p>
        )}
      </div>
    )
  }

  // ── まとめ画面 ──
  if (mode === 'summary') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {activeSession?.mode === 'interview' ? 'インタビューのまとめ' : '議論のまとめ'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{activeSession?.topic}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
            >
              <Download size={14} /> ダウンロード
            </button>
            <button
              onClick={resetToSetup}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              新しいセッション
            </button>
          </div>
        </div>

        {summaryData ? (
          <div className="space-y-5">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-indigo-800 mb-2">結論・主な発見</h3>
              <p className="text-sm text-indigo-900 leading-relaxed">{summaryData.conclusion}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">主な意見・共通点</h3>
              <ul className="space-y-1.5">
                {summaryData.agreements.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-green-500 shrink-0">✓</span>{a}
                  </li>
                ))}
              </ul>
            </div>
            {summaryData.disagreements.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">異なる意見・課題</h3>
                <ul className="space-y-1.5">
                  {summaryData.disagreements.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-amber-500 shrink-0">△</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summaryData.nextActions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">次のアクション</h3>
                <ul className="space-y-1.5">
                  {summaryData.nextActions.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <ChevronRight size={14} className="text-indigo-400 shrink-0 mt-0.5" />{n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => setMode('session')}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ← 会話に戻る
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
            まとめを生成できませんでした
          </div>
        )}
      </div>
    )
  }

  // ── セッション画面 ──
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-gray-900 truncate max-w-md">{activeSession?.topic}</h3>
          <p className="text-xs text-gray-400">
            {activeSession?.mode === 'interview'
              ? `インタビュー · ${personas.find(p => p.id === activeSession.persona_ids[0])?.name ?? ''}`
              : `グループ議論 · ラウンド ${Math.min(activeSession?.current_round ?? 1, activeSession?.total_rounds ?? 1)} / ${activeSession?.total_rounds}`}
          </p>
        </div>
        <button
          onClick={resetToSetup}
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          終了
        </button>
      </div>

      {/* エラーバナー */}
      {sessionError && (
        <div className="shrink-0 flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-6 py-3">
          <AlertTriangle size={16} className="shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">エラーが発生しました</p>
            <p className="text-xs text-amber-700 mt-0.5">{sessionError}</p>
          </div>
          <button
            onClick={() => setSessionError('')}
            className="shrink-0 text-xs text-amber-600 hover:text-amber-800 font-medium"
          >
            閉じる
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-gray-50">
        {activeSession?.messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {(isGenerating || streamingMsg) && (
          <div className={`rounded-xl px-4 py-3 max-w-xl text-sm leading-relaxed ${
            streamingRole === 'ファシリテーター'
              ? 'bg-purple-50 border border-purple-200 mx-auto text-purple-800'
              : 'bg-white border border-gray-200 text-gray-800'
          }`}>
            <p className="text-xs text-gray-400 mb-1 font-medium">{streamingRole}...</p>
            {streamingMsg || <Loader size={14} className="animate-spin text-gray-400" />}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-6 py-3 shrink-0">
        {activeSession?.mode === 'interview' ? (
          /* インタビューは常に入力可（再開後も続けて質問できる） */
          <div className="flex gap-2">
            <input
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInterviewMessage() } }}
              placeholder="質問を入力... (Enter で送信)"
              disabled={isGenerating}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50"
            />
            <button
              onClick={sendInterviewMessage}
              disabled={!inputText.trim() || isGenerating}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        ) : activeSession?.mode === 'group' && activeSession.current_round <= activeSession.total_rounds ? (
          /* グループ議論：残りラウンドがあれば実行ボタン */
          <button
            onClick={nextGroupRound}
            disabled={isGenerating}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating
              ? <><Loader size={14} className="animate-spin" /> 生成中...</>
              : <><RefreshCw size={14} /> ラウンド {activeSession.current_round} を実行する</>}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <p className="text-sm text-gray-400">全ラウンド終了</p>
            <div className="flex gap-3">
              <button
                onClick={handleShowSummary}
                disabled={summaryLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {summaryLoading
                  ? <><Loader size={14} className="animate-spin" /> まとめを生成中...</>
                  : 'まとめを見る'}
              </button>
              <button
                onClick={resetToSetup}
                className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-4 py-2 transition-colors"
              >
                新しいセッション
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModeCard({ selected, icon, title, desc, onClick }: {
  selected: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition-all ${
        selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className={`mb-2 ${selected ? 'text-indigo-600' : 'text-gray-400'}`}>{icon}</div>
      <p className={`text-sm font-semibold mb-1 ${selected ? 'text-indigo-800' : 'text-gray-800'}`}>{title}</p>
      <p className={`text-xs leading-relaxed ${selected ? 'text-indigo-500' : 'text-gray-400'}`}>{desc}</p>
    </button>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 max-w-lg text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'facilitator') {
    return (
      <div className="flex justify-center">
        <div className="bg-purple-50 border border-purple-200 text-purple-800 rounded-xl px-4 py-3 max-w-2xl text-sm leading-relaxed">
          <p className="text-xs text-purple-400 mb-1 font-medium">ファシリテーター · ラウンド{msg.round}</p>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 max-w-2xl">
      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
        {(msg.persona_name ?? '?').charAt(0)}
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1 font-medium">
          {msg.persona_name}{msg.round ? ` · ラウンド${msg.round}` : ''}
        </p>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm leading-relaxed text-gray-800">
          {msg.content}
        </div>
      </div>
    </div>
  )
}
