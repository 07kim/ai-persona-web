import { useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit3, Save, X, Trash2, Plus, MessageSquare, ClipboardList, Users, Printer, Loader, Send, BarChart2, Clock, CheckCircle2, Paperclip } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { genderLabel, countryName, formatDate, now } from '../lib/utils'
import { generateInterviewReply } from '../lib/ai'
import MaterialsPanel from '../components/MaterialsPanel'
import type { Persona, MaterialItem } from '../types'

type Tab = 'profile' | 'chat' | 'activity' | 'materials'

interface ChatMsg { role: 'user' | 'persona'; content: string }

export default function PersonaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useAppStore()
  const { personas, updatePersona, deletePersona, settings } = store

  const persona = personas.find(p => p.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Persona | null>(persona ?? null)
  const [newTag, setNewTag] = useState('')
  const [tab, setTab] = useState<Tab>('profile')

  // 深掘りチャット
  const [chatInput, setChatInput] = useState('')
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatHistoryRef = useRef<Array<{ role: 'user' | 'model'; parts: { text: string }[] }>>([])
  const chatBottomRef = useRef<HTMLDivElement>(null)

  if (!persona || !form) {
    return (
      <div className="p-8 text-center text-gray-400">
        ペルソナが見つかりません。
        <Link to="/personas" className="ml-2 text-blue-600 underline">一覧へ戻る</Link>
      </div>
    )
  }

  function updateForm(partial: Partial<Persona>) {
    setForm(f => f ? { ...f, ...partial } : f)
  }
  function setOptionalListItem(key: 'hobbies' | 'favorite_content' | 'apps_used', idx: number, val: string) {
    if (!form) return
    const arr = [...(form[key] ?? [])]
    arr[idx] = val
    updateForm({ [key]: arr })
  }
  function removeOptionalListItem(key: 'hobbies' | 'favorite_content' | 'apps_used', idx: number) {
    if (!form) return
    updateForm({ [key]: (form[key] ?? []).filter((_, i) => i !== idx) })
  }
  function addOptionalListItem(key: 'hobbies' | 'favorite_content' | 'apps_used') {
    if (!form) return
    updateForm({ [key]: [...(form[key] ?? []), ''] })
  }
  function setListItem(key: 'values' | 'pain_points' | 'goals', idx: number, val: string) {
    if (!form) return
    const arr = [...form[key]]
    arr[idx] = val
    updateForm({ [key]: arr })
  }
  function removeListItem(key: 'values' | 'pain_points' | 'goals', idx: number) {
    if (!form) return
    updateForm({ [key]: form[key].filter((_, i) => i !== idx) })
  }
  function addListItem(key: 'values' | 'pain_points' | 'goals') {
    if (!form) return
    updateForm({ [key]: [...form[key], ''] })
  }
  async function handleSave() {
    if (!form) return
    await updatePersona({ ...form, updated_at: now() })
    setEditing(false)
  }
  async function handleDelete() {
    if (!persona) return
    if (!window.confirm(`「${persona.name}」を削除しますか？`)) return
    await deletePersona(persona.id)
    navigate('/personas')
  }

  async function handleChatSend() {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput('')
    const userMsg: ChatMsg = { role: 'user', content: text }
    setChatMsgs(prev => [...prev, userMsg])
    setChatLoading(true)

    const historyForApi = [...chatHistoryRef.current, { role: 'user' as const, parts: [{ text }] }]

    let reply = ''
    const personaMsg: ChatMsg = { role: 'persona', content: '' }
    setChatMsgs(prev => [...prev, personaMsg])

    try {
      if (!persona) { setChatLoading(false); return }
      await generateInterviewReply(
        persona,
        chatHistoryRef.current,
        text,
        settings,
        chunk => {
          reply += chunk
          setChatMsgs(prev => {
            const next = [...prev]
            next[next.length - 1] = { role: 'persona', content: reply }
            return next
          })
        },
      )
      chatHistoryRef.current = [
        ...historyForApi,
        { role: 'model', parts: [{ text: reply }] },
      ]
    } catch {
      setChatMsgs(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'persona', content: '（エラーが発生しました）' }
        return next
      })
    }
    setChatLoading(false)
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function handlePrint() {
    window.print()
  }

  // 活動ログを既存データから導出
  const myRuns = persona ? (store.surveyRuns ?? []).filter((r: { persona_ids: string[] }) => r.persona_ids.includes(persona.id)) : []
  const myDiscussions = persona ? (store.discussions ?? []).filter((d: { persona_ids: string[] }) => d.persona_ids.includes(persona.id)) : []
  const myDeliberations = persona ? (store.deliberationSessions ?? []).filter(
    (d: { participantConfig?: { personaIds: string[] } }) => d.participantConfig?.personaIds.includes(persona.id)
  ) : []
  const activityItems = persona ? [
    ...myRuns.map((r: { template_name: string; created_at: string; status: string }) => ({ type: 'survey' as const, title: `アンケート: ${r.template_name}`, date: r.created_at, status: r.status })),
    ...myDiscussions.map((d: { mode: string; topic: string; updated_at: string; status: string }) => ({ type: 'discussion' as const, title: `${d.mode === 'interview' ? 'インタビュー' : 'グループ議論'}: ${d.topic}`, date: d.updated_at, status: d.status })),
    ...myDeliberations.map((d: { topic: string; updated_at: string; status: string }) => ({ type: 'deliberation' as const, title: `対話: ${d.topic}`, date: d.updated_at, status: d.status })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []

  const display = editing ? form : persona

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <Link to="/personas" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} /> 一覧へ戻る
        </Link>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* クイックアクション */}
          {!editing && (
            <>
              <button
                onClick={() => navigate('/discussion', { state: { preSelectedPersonaIds: [persona.id] } })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100 font-medium transition-colors"
              >
                <MessageSquare size={12} /> インタビュー
              </button>
              <button
                onClick={() => navigate('/survey', { state: { preSelectedPersonaIds: [persona.id] } })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 font-medium transition-colors"
              >
                <ClipboardList size={12} /> アンケート
              </button>
              <button
                onClick={() => navigate('/deliberation', { state: { preSelectedPersonaIds: [persona.id] } })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 font-medium transition-colors"
              >
                <Users size={12} /> 対話に追加
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                <Printer size={12} /> カード出力
              </button>
            </>
          )}
          {editing ? (
            <>
              <button onClick={handleSave} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Save size={14} /> 保存
              </button>
              <button onClick={() => { setForm(persona); setEditing(false) }} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Edit3 size={14} /> 編集
              </button>
              <button onClick={handleDelete} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                <Trash2 size={14} /> 削除
              </button>
            </>
          )}
        </div>
      </div>

      {/* タブ */}
      {!editing && (
        <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
          {(['profile', 'chat', 'activity', 'materials'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'profile' ? 'プロフィール' : t === 'chat' ? '深掘りチャット' : t === 'activity' ? '活動記録' : '資料'}
              {t === 'activity' && activityItems.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                  {activityItems.length}
                </span>
              )}
              {t === 'materials' && (persona.materials?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-xs bg-teal-100 text-teal-600 rounded-full px-1.5 py-0.5">
                  {persona.materials!.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── プロフィールタブ ── */}
      {(tab === 'profile' || editing) && (
        <>
          {/* 基本情報 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 print:border-2 print:border-blue-200">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold shrink-0">
                {display.name.charAt(0)}
              </div>
              <div className="flex-1">
                {editing ? (
                  <input value={form.name} onChange={e => updateForm({ name: e.target.value })}
                    className="text-xl font-bold border-b border-gray-200 focus:outline-none focus:border-blue-400 w-full" />
                ) : (
                  <h3 className="text-xl font-bold text-gray-900">{display.name}</h3>
                )}
                <div className="flex gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                  {editing ? (
                    <>
                      <input type="number" value={form.age} onChange={e => updateForm({ age: parseInt(e.target.value, 10) })}
                        className="w-16 border-b border-gray-200 focus:outline-none focus:border-blue-400 text-sm" />
                      <span>歳</span>
                      <select value={form.gender ?? ''} onChange={e => updateForm({ gender: (e.target.value as 'male' | 'female' | 'other') || undefined })}
                        className="border-b border-gray-200 focus:outline-none text-sm bg-transparent">
                        <option value="">不明</option>
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                        <option value="other">その他</option>
                      </select>
                      <input value={form.occupation} onChange={e => updateForm({ occupation: e.target.value })}
                        className="border-b border-gray-200 focus:outline-none focus:border-blue-400 text-sm flex-1" placeholder="職業" />
                    </>
                  ) : (
                    <>
                      <span>{display.age}歳</span><span>·</span>
                      <span>{genderLabel(display.gender)}</span><span>·</span>
                      <span>{display.occupation}</span>
                      {display.city && <><span>·</span><span>{display.city}</span></>}
                      {display.country && <><span>·</span><span>{countryName(display.country)}</span></>}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">グループ</p>
              {editing ? (
                <input value={form.group ?? ''} onChange={e => updateForm({ group: e.target.value || undefined })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="例：ユーザー調査2024、プロジェクトA" />
              ) : (
                <p className="text-sm text-gray-700">{display.group || <span className="text-gray-300">未設定</span>}</p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">背景・経歴</p>
              {editing ? (
                <textarea value={form.background} onChange={e => updateForm({ background: e.target.value })}
                  rows={4} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              ) : (
                <p className="text-sm text-gray-700 leading-relaxed">{display.background}</p>
              )}
            </div>
          </div>

          {/* 価値観・課題・目標 */}
          {(['values', 'pain_points', 'goals'] as const).map(key => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                {key === 'values' ? '価値観' : key === 'pain_points' ? '課題・悩み' : '目標・願望'}
              </p>
              <ul className="space-y-1.5">
                {(editing ? form[key] : display[key]).map((item: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-gray-300 text-sm mt-0.5">·</span>
                    {editing ? (
                      <>
                        <input value={item} onChange={e => setListItem(key, idx, e.target.value)}
                          className="flex-1 text-sm border-b border-gray-200 focus:outline-none focus:border-blue-400" />
                        <button onClick={() => removeListItem(key, idx)} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                      </>
                    ) : (
                      <span className="text-sm text-gray-700">{item}</span>
                    )}
                  </li>
                ))}
              </ul>
              {editing && (
                <button onClick={() => addListItem(key)} className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                  <Plus size={12} /> 追加
                </button>
              )}
            </div>
          ))}

          {/* タグ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">タグ</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(editing ? form.tags : persona.tags).map((tag: string, idx: number) => (
                <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {tag}
                  {editing && (
                    <button onClick={() => updateForm({ tags: form.tags.filter((_, i) => i !== idx) })} className="text-gray-400 hover:text-red-400">
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {editing && (
              <div className="flex gap-2">
                <input value={newTag} onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { updateForm({ tags: [...form.tags, newTag.trim()] }); setNewTag('') } }}
                  placeholder="タグを入力してEnter"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            )}
          </div>

          {/* 具体的な人物像 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-3 mt-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">具体的な人物像</p>
            {[
              { key: 'family' as const, label: '家族構成', placeholder: '例：既婚、子ども2人（8歳・5歳）', multiline: false },
              { key: 'personal_episode' as const, label: 'エピソード・口癖', placeholder: 'その人らしいエピソードや口癖（100〜200字）', multiline: true },
              { key: 'daily_routine' as const, label: '典型的な1日', placeholder: '朝〜夜の過ごし方', multiline: true },
              { key: 'screen_time' as const, label: 'スマホ利用時間・タイミング', placeholder: '例：1日4〜5時間。通勤中にSNS、夜はYouTube', multiline: false },
            ].map(({ key, label, placeholder, multiline }) => (
              <div key={key} className="mb-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                {editing ? (
                  multiline ? (
                    <textarea value={(form[key] as string) ?? ''} onChange={e => updateForm({ [key]: e.target.value })}
                      rows={3} placeholder={placeholder}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                  ) : (
                    <input value={(form[key] as string) ?? ''} onChange={e => updateForm({ [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  )
                ) : (
                  <p className="text-sm text-gray-700">
                    {key === 'personal_episode' && display[key]
                      ? `「${display[key]}」`
                      : display[key] || <span className="text-gray-300">未設定</span>}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* 趣味・コンテンツ・アプリ */}
          {(['hobbies', 'favorite_content', 'apps_used'] as const).map(key => {
            const labels = { hobbies: '趣味・日課', favorite_content: '好きなコンテンツ', apps_used: 'よく使うアプリ' }
            const placeholders = { hobbies: '例：週3回のランニング', favorite_content: '例：ワンピース、米津玄師', apps_used: '例：Instagram' }
            const items = (editing ? form[key] : display[key]) ?? []
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{labels[key]}</p>
                <ul className="space-y-1.5">
                  {items.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-gray-300 text-sm mt-0.5">·</span>
                      {editing ? (
                        <>
                          <input value={item} onChange={e => setOptionalListItem(key, idx, e.target.value)}
                            className="flex-1 text-sm border-b border-gray-200 focus:outline-none focus:border-blue-400"
                            placeholder={placeholders[key]} />
                          <button onClick={() => removeOptionalListItem(key, idx)} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                        </>
                      ) : (
                        <span className="text-sm text-gray-700">{item}</span>
                      )}
                    </li>
                  ))}
                  {items.length === 0 && !editing && <li className="text-sm text-gray-300">未設定</li>}
                </ul>
                {editing && (
                  <button onClick={() => addOptionalListItem(key)} className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                    <Plus size={12} /> 追加
                  </button>
                )}
              </div>
            )
          })}

          <p className="text-xs text-gray-400 mt-4">作成: {formatDate(persona.created_at)} · 更新: {formatDate(persona.updated_at)}</p>
        </>
      )}

      {/* ── 深掘りチャットタブ ── */}
      {tab === 'chat' && !editing && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">
              {persona.name} として会話する
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              このペルソナに直接話しかけて、価値観・行動・考え方を深掘りできます
            </p>
          </div>

          <div className="h-96 overflow-y-auto px-5 py-4 space-y-4">
            {chatMsgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <MessageSquare size={32} className="text-gray-200" />
                <p className="text-sm">質問を入力して {persona.name} と話してみましょう</p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {[
                    '最近の悩みを教えてください',
                    'どんな時が一番充実していますか？',
                    '理想のサービスはどんなものですか？',
                  ].map(q => (
                    <button key={q} onClick={() => { setChatInput(q) }}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 hover:bg-blue-100">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'persona' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-1 mr-2">
                    {persona.name.charAt(0)}
                  </div>
                )}
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {m.content || <span className="animate-pulse">▋</span>}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
              placeholder={`${persona.name} に話しかける...`}
              disabled={chatLoading}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {chatLoading ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── 活動記録タブ ── */}
      {tab === 'activity' && !editing && (
        <div className="space-y-3">
          {activityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <BarChart2 size={32} className="text-gray-200" />
              <p className="text-sm">まだ活動記録がありません</p>
              <p className="text-xs text-center text-gray-300">インタビュー・アンケート・対話に参加すると<br />ここに記録が表示されます</p>
            </div>
          ) : (
            activityItems.map((item, i) => {
              const icon = item.type === 'survey'
                ? <ClipboardList size={14} className="text-teal-500" />
                : item.type === 'discussion'
                  ? <MessageSquare size={14} className="text-sky-500" />
                  : <Users size={14} className="text-violet-500" />
              const statusIcon = item.status === 'completed' || item.status === 'ended'
                ? <CheckCircle2 size={12} className="text-green-400" />
                : <Clock size={12} className="text-amber-400" />
              return (
                <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                  </div>
                  {statusIcon}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── 資料タブ ── */}
      {tab === 'materials' && !editing && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip size={16} className="text-teal-500" />
              <h3 className="text-sm font-semibold text-gray-800">参考資料</h3>
              <p className="text-xs text-gray-400 ml-1">このペルソナに紐付いた資料を管理できます</p>
            </div>
            <MaterialsPanel
              materials={persona.materials ?? []}
              onChange={async (mats: MaterialItem[]) => {
                await updatePersona({ ...persona, materials: mats, updated_at: now() })
              }}
              label="資料を追加する"
              description="画像・PDF・YouTube動画・テキストファイルなどを添付できます。インタビューやアンケート実行時に参考資料として渡せます。"
              collapsed={false}
            />
          </div>
          {(persona.materials?.length ?? 0) === 0 && (
            <p className="text-xs text-center text-gray-300 py-4">
              資料を追加するとインタビューやアンケートの参考情報として活用できます
            </p>
          )}
        </div>
      )}

      {/* 印刷用スタイル */}
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  )
}
