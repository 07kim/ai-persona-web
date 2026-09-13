import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessagesSquare, Trash2, ChevronRight, MessageSquare,
  CheckCircle2, Clock, AlertCircle, FileText, Play, Download, RotateCcw,
  Search, X, Palette,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PRESET_ROLES } from '../lib/presetRoles'
import type { DeliberationSessionRecord, DeliberationMessage, Persona } from '../types'

function downloadArtifact(s: DeliberationSessionRecord) {
  if (!s.artifact) return
  const { agreements, concerns, openQuestions, specNotes, risks } = s.artifact
  const lines: string[] = [
    `# 議事録アーティファクト: ${s.topic}`,
    `日時: ${new Date(s.updated_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    `参加者: ${s.participantNames.join('、')}`,
    '',
  ]
  if (agreements.length > 0) {
    lines.push('## 合意事項', ...agreements.map(a => `- ${a}`), '')
  }
  if (specNotes.length > 0) {
    lines.push('## 仕様メモ', ...specNotes.map(n => `- ${n}`), '')
  }
  if (concerns.length > 0) {
    lines.push('## 懸念事項', ...concerns.map(c => `- ${c}`), '')
  }
  if (openQuestions.length > 0) {
    lines.push('## 未解決の問い', ...openQuestions.map(q => `- ${q}`), '')
  }
  if (risks.length > 0) {
    lines.push('## リスク', ...risks.map(r => `- [${r.level === 'high' ? '高' : r.level === 'mid' ? '中' : '低'}] ${r.item}`), '')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `artifact-${s.id.slice(0, 8)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadMarkdown(s: DeliberationSessionRecord) {
  const lines: string[] = [
    `# 対話セッション: ${s.topic}`,
    `日時: ${new Date(s.updated_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    `参加者: ${s.participantNames.join('、')}`,
    '',
    '## 会話ログ',
    '',
  ]
  s.messages.forEach(m => lines.push(`**${m.participantName}**: ${m.content}`, ''))
  if (s.summary) {
    lines.push('## まとめ', '', `**結論**: ${s.summary.conclusion}`, '')
    if (s.summary.agreements.length > 0) lines.push('### 合意事項', ...s.summary.agreements.map(a => `- ${a}`), '')
    if (s.summary.nextActions.length > 0) lines.push('### ネクストアクション', ...s.summary.nextActions.map(a => `- ${a}`), '')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deliberation-${s.id.slice(0, 8)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
]

function getAvatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** セッションの検索対象テキストを生成（topic + 参加者名 + 役職） */
function buildSearchText(s: DeliberationSessionRecord, personas: Persona[]): string {
  const parts: string[] = [s.topic, ...s.participantNames]
  const cfg = s.participantConfig
  if (cfg) {
    cfg.presetIds.forEach(id => {
      const r = PRESET_ROLES.find(r => r.id === id)
      if (r) parts.push(r.name, r.description)
    })
    cfg.personaIds.forEach(id => {
      const p = personas.find(p => p.id === id)
      if (p) parts.push(p.name, p.occupation)
    })
    cfg.customList.forEach(c => parts.push(c.name, c.role))
  }
  return parts.join(' ').toLowerCase()
}

export default function DeliberationSessions() {
  const navigate = useNavigate()
  const { deliberationSessions, personas, deleteDeliberationSession } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'summary' | 'artifact' | 'design'>('chat')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')

  const sorted = useMemo(() =>
    [...deliberationSessions].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ), [deliberationSessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter(s => {
      if (statusFilter === 'active' && s.status !== 'active') return false
      if (statusFilter === 'completed' && s.status !== 'completed') return false
      if (!q) return true
      return buildSearchText(s, personas).includes(q)
    })
  }, [sorted, query, statusFilter, personas])

  const selected = sorted.find(s => s.id === selectedId) ?? null

  async function handleDelete(id: string) {
    await deleteDeliberationSession(id)
    if (selectedId === id) setSelectedId(null)
    setConfirmDeleteId(null)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左ペイン: セッション一覧 */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">対話セッション管理</h2>
            <span className="text-xs text-gray-400">
              {query || statusFilter !== 'all' ? `${filtered.length} / ` : ''}{sorted.length}件
            </span>
          </div>

          {/* 検索バー */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="テーマ・役職・参加者名で検索"
              className="w-full text-xs pl-7 pr-6 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* ステータスフィルター */}
          <div className="flex gap-1">
            {([
              { key: 'all', label: 'すべて' },
              { key: 'active', label: '進行中' },
              { key: 'completed', label: '完了' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-colors ${
                  statusFilter === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 px-6 text-center">
            <MessagesSquare size={32} className="text-gray-200" />
            <div>
              <p className="text-sm">セッションがありません</p>
              <p className="text-xs mt-1">対話セッションを開始すると<br />ここに記録が残ります</p>
            </div>
            <button
              onClick={() => navigate('/deliberation')}
              className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800"
            >
              <Play size={11} /> セッションを始める
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 px-6 text-center">
            <Search size={24} className="text-gray-200" />
            <p className="text-sm">該当なし</p>
            <button onClick={() => { setQuery(''); setStatusFilter('all') }} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
              フィルターをリセット
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            {filtered.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setActiveTab('chat') }}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors group ${
                  selectedId === s.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {s.status === 'completed' ? (
                        <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                      ) : (
                        <Clock size={11} className="text-amber-400 shrink-0" />
                      )}
                      <span className={`text-[10px] font-semibold ${
                        s.status === 'completed' ? 'text-green-600' : 'text-amber-500'
                      }`}>
                        {s.status === 'completed' ? '完了' : '進行中'}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmt(s.updated_at)}</span>
                    </div>
                    <p className={`text-xs font-medium truncate leading-snug ${
                      selectedId === s.id ? 'text-indigo-900' : 'text-gray-800'
                    }`}>
                      {s.topic}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {s.participantNames.join('・')}
                    </p>
                    {s.participantConfig && s.participantConfig.presetIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.participantConfig.presetIds.slice(0, 3).map(id => {
                          const r = PRESET_ROLES.find(r => r.id === id)
                          return r ? (
                            <span key={id} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 font-medium border border-indigo-100">
                              {r.name}
                            </span>
                          ) : null
                        })}
                        {s.participantConfig.presetIds.length > 3 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                            +{s.participantConfig.presetIds.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {s.messages.length}発言
                    </p>
                  </div>
                  <ChevronRight size={13} className={`shrink-0 mt-0.5 transition-colors ${
                    selectedId === s.id ? 'text-indigo-400' : 'text-gray-300 group-hover:text-gray-400'
                  }`} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右ペイン: 詳細 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selected ? (
          <SessionDetail
            session={selected}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            confirmDeleteId={confirmDeleteId}
            onConfirmDelete={setConfirmDeleteId}
            onDelete={handleDelete}
            onContinue={() => navigate('/deliberation', { state: { resumeSession: selected } })}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <MessageSquare size={40} className="text-gray-200" />
            <p className="text-sm">左のセッションを選択してください</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SessionDetail({
  session: s,
  activeTab,
  onTabChange,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onContinue,
}: {
  session: DeliberationSessionRecord
  activeTab: 'chat' | 'summary' | 'artifact' | 'design'
  onTabChange: (t: 'chat' | 'summary' | 'artifact' | 'design') => void
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => void
  onContinue: () => void
}) {
  return (
    <>
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {s.status === 'completed' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                  <CheckCircle2 size={10} /> 完了
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 border border-amber-200">
                  <Clock size={10} /> 中断
                </span>
              )}
              <span className="text-xs text-gray-400">{fmt(s.updated_at)}</span>
            </div>
            <h3 className="font-bold text-gray-900 text-base leading-snug truncate">{s.topic}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {s.participantNames.map((n, i) => (
                <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${getAvatarColor(n)}`}>
                  {n}
                </span>
              ))}
              <span className="text-[11px] text-gray-400">{s.messages.length}発言</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {s.status === 'active' && s.participantConfig && (
              <button
                onClick={onContinue}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                <RotateCcw size={11} /> 続きを再開
              </button>
            )}
            <button
              onClick={() => downloadMarkdown(s)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Markdownでダウンロード"
            >
              <Download size={14} />
            </button>
            {confirmDeleteId === s.id ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">削除しますか？</span>
                <button
                  onClick={() => onDelete(s.id)}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  削除
                </button>
                <button
                  onClick={() => onConfirmDelete(null)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmDelete(s.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* タブ */}
        <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-4">
          {([
            { key: 'chat', label: '会話ログ', icon: MessageSquare },
            { key: 'summary', label: '結論・まとめ', icon: CheckCircle2 },
            { key: 'artifact', label: '議事録', icon: FileText },
            { key: 'design', label: 'デザイン', icon: Palette },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chat' && <ChatTab messages={s.messages} />}
        {activeTab === 'summary' && <SummaryTab session={s} />}
        {activeTab === 'artifact' && <ArtifactTab session={s} />}
        {activeTab === 'design' && <DesignTab session={s} />}
      </div>
    </>
  )
}

function ChatTab({ messages }: { messages: DeliberationMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        会話ログがありません
      </div>
    )
  }

  return (
    <div className="px-6 py-5 space-y-4">
      {messages.map(m => (
        <div key={m.id} className={`flex gap-3 ${m.isUser ? 'flex-row-reverse' : ''}`}>
          {!m.isUser && (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${getAvatarColor(m.participantId)}`}>
              {m.participantName.charAt(0)}
            </div>
          )}
          <div className={`max-w-[75%] flex flex-col gap-0.5 ${m.isUser ? 'items-end' : ''}`}>
            {!m.isUser && (
              <p className="text-[10px] text-gray-400 font-medium px-1">{m.participantName}</p>
            )}
            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.isUser
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100'
            }`}>
              {m.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SummaryTab({ session: s }: { session: DeliberationSessionRecord }) {
  if (!s.summary) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <AlertCircle size={24} className="text-gray-200" />
        <p className="text-sm">まとめがありません</p>
        <p className="text-xs">セッションが完了すると自動生成されます</p>
      </div>
    )
  }

  const { conclusion, agreements, disagreements, nextActions } = s.summary

  return (
    <div className="px-6 py-5 space-y-5">
      {conclusion && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">結論</p>
          <p className="text-sm text-indigo-900 leading-relaxed">{conclusion}</p>
        </div>
      )}
      {agreements.length > 0 && (
        <SummarySection title="合意事項" color="green" items={agreements} />
      )}
      {disagreements.length > 0 && (
        <SummarySection title="未解決の対立点" color="amber" items={disagreements} />
      )}
      {nextActions.length > 0 && (
        <SummarySection title="ネクストアクション" color="teal" items={nextActions} />
      )}
    </div>
  )
}

function SummarySection({ title, color, items }: { title: string; color: string; items: string[] }) {
  const styles: Record<string, { bar: string; dot: string; text: string }> = {
    green: { bar: 'bg-green-400', dot: 'bg-green-100 text-green-600', text: 'text-green-600' },
    amber: { bar: 'bg-amber-400', dot: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
    teal: { bar: 'bg-teal-400', dot: 'bg-teal-100 text-teal-600', text: 'text-teal-600' },
  }
  const s = styles[color] ?? styles.green

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`w-0.5 h-4 rounded-full ${s.bar}`} />
        <p className={`text-xs font-semibold uppercase tracking-wider ${s.text}`}>{title}</p>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${s.dot}`}>
              {i + 1}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArtifactTab({ session: s }: { session: DeliberationSessionRecord }) {
  if (!s.artifact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <FileText size={24} className="text-gray-200" />
        <p className="text-sm">議事録がありません</p>
      </div>
    )
  }

  const { agreements, concerns, openQuestions, specNotes, risks } = s.artifact

  const riskColor: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    mid: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const riskLabel: Record<string, string> = { high: '高', mid: '中', low: '低' }

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => downloadArtifact(s)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
        >
          <Download size={12} /> 議事録をダウンロード
        </button>
      </div>
      {agreements.length > 0 && (
        <ArtifactSection title="合意事項" items={agreements} bullet="✓" bulletColor="text-green-500" />
      )}
      {specNotes.length > 0 && (
        <ArtifactSection title="仕様メモ" items={specNotes} bullet="📝" bulletColor="" />
      )}
      {concerns.length > 0 && (
        <ArtifactSection title="懸念事項" items={concerns} bullet="!" bulletColor="text-amber-500" />
      )}
      {openQuestions.length > 0 && (
        <ArtifactSection title="未解決の問い" items={openQuestions} bullet="?" bulletColor="text-indigo-500" />
      )}
      {risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">リスク</p>
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${riskColor[r.level] ?? riskColor.low}`}>
                  {riskLabel[r.level] ?? r.level}
                </span>
                {r.item}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DesignTab({ session: s }: { session: DeliberationSessionRecord }) {
  const spec = s.designSpec
  if (!spec) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <Palette size={24} className="text-gray-200" />
        <p className="text-sm">デザイン仕様がありません</p>
        <p className="text-xs">対話画面の「デザイン」タブで生成できます</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {/* 概要 */}
      {spec.overview && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1.5">プロダクト概要</p>
          <p className="text-sm text-violet-900 leading-relaxed">{spec.overview}</p>
        </div>
      )}

      {/* 画面設計 */}
      {spec.screens.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">画面設計</p>
          <div className="space-y-3">
            {spec.screens.map((sc, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-gray-400 ml-2 font-mono">{sc.name}</span>
                </div>
                <div className="p-3 bg-white">
                  <p className="text-xs text-gray-600 mb-2 leading-relaxed">{sc.description}</p>
                  {sc.components.length > 0 && (
                    <div className="space-y-1">
                      {sc.components.map((c, j) => (
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
      {spec.keyFeatures.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">主要機能</p>
          <ul className="space-y-1.5">
            {spec.keyFeatures.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-violet-400 shrink-0">◆</span>{f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 技術スタック */}
      {spec.techStack.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">推奨技術スタック</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.techStack.map((t, i) => (
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

function ArtifactSection({ title, items, bullet, bulletColor }: {
  title: string; items: string[]; bullet: string; bulletColor: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`shrink-0 mt-0.5 font-bold ${bulletColor}`}>{bullet}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
