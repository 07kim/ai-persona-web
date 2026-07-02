import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, Users, Clock, CheckCircle2, ChevronRight,
  Trash2, Download, Play, AlertCircle, RotateCcw,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { DiscussionSession, Message, Persona } from '../types'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function downloadMarkdown(session: DiscussionSession) {
  const lines: string[] = [
    `# ${session.mode === 'interview' ? 'インタビュー' : 'グループ議論'}: ${session.topic}`,
    `日時: ${fmt(session.updated_at)}`,
    '',
  ]
  session.messages.forEach(m => {
    const name = m.role === 'user' ? 'あなた' : (m.persona_name ?? 'ファシリテーター')
    lines.push(`**${name}**: ${m.content}`, '')
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `discussion-${session.id.slice(0, 8)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DiscussionHistory() {
  const navigate = useNavigate()
  const { discussions, personas, deleteDiscussion } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const sorted = [...discussions].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
  const selected = sorted.find(s => s.id === selectedId) ?? null

  async function handleDelete(id: string) {
    await deleteDiscussion(id)
    if (selectedId === id) setSelectedId(null)
    setConfirmDeleteId(null)
  }

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden">
      {/* 左ペイン */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">インタビュー履歴</h2>
          <p className="text-xs text-gray-400 mt-0.5">{sorted.length}件の記録</p>
        </div>

        {sorted.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 px-6 text-center">
            <MessageSquare size={32} className="text-gray-200" />
            <div>
              <p className="text-sm">履歴がありません</p>
              <p className="text-xs mt-1">インタビュー・議論を終了すると<br />ここに記録が残ります</p>
            </div>
            <button
              onClick={() => navigate('/discussion')}
              className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800"
            >
              <Play size={11} /> インタビューを始める
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            {sorted.map(s => {
              const personaNames = s.persona_ids
                .map(id => personas.find(p => p.id === id)?.name ?? id)
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors group ${
                    selectedId === s.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {s.mode === 'interview'
                          ? <MessageSquare size={10} className="text-sky-400 shrink-0" />
                          : <Users size={10} className="text-violet-400 shrink-0" />}
                        <span className="text-[10px] font-semibold text-gray-500">
                          {s.mode === 'interview' ? 'インタビュー' : 'グループ議論'}
                        </span>
                        {s.status === 'ended'
                          ? <CheckCircle2 size={10} className="text-green-400" />
                          : <Clock size={10} className="text-amber-400" />}
                        <span className="text-[10px] text-gray-400">{fmt(s.updated_at)}</span>
                      </div>
                      <p className={`text-xs font-medium truncate ${selectedId === s.id ? 'text-indigo-900' : 'text-gray-800'}`}>
                        {s.topic}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {personaNames.join('・')}　{s.messages.length}発言
                      </p>
                    </div>
                    <ChevronRight size={13} className={`shrink-0 mt-0.5 ${selectedId === s.id ? 'text-indigo-400' : 'text-gray-300'}`} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 右ペイン */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selected ? (
          <SessionDetail
            session={selected}
            personas={personas}
            confirmDeleteId={confirmDeleteId}
            onConfirmDelete={setConfirmDeleteId}
            onDelete={handleDelete}
            onResume={() => navigate('/discussion', { state: { resumeSession: selected } })}
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
  personas,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onResume,
}: {
  session: DiscussionSession
  personas: Persona[]
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => void
  onResume: () => void
}) {
  const personaNames = s.persona_ids.map(id => personas.find(p => p.id === id)?.name ?? id)

  return (
    <>
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                s.mode === 'interview'
                  ? 'bg-sky-50 text-sky-600 border-sky-200'
                  : 'bg-violet-50 text-violet-600 border-violet-200'
              }`}>
                {s.mode === 'interview'
                  ? <><MessageSquare size={10} /> インタビュー</>
                  : <><Users size={10} /> グループ議論</>}
              </span>
              {s.status === 'ended'
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200"><CheckCircle2 size={10} /> 完了</span>
                : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 border border-amber-200"><Clock size={10} /> 中断</span>}
              <span className="text-xs text-gray-400">{fmt(s.updated_at)}</span>
            </div>
            <h3 className="font-bold text-gray-900 text-base leading-snug truncate">{s.topic}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {personaNames.map((n, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700">
                  {n}
                </span>
              ))}
              <span className="text-[11px] text-gray-400">{s.messages.length}発言</span>
              {s.mode === 'group' && (
                <span className="text-[11px] text-gray-400">
                  ラウンド {s.current_round}/{s.total_rounds}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* インタビューは常に再開可、グループは残りラウンドがある場合のみ */}
            {(s.mode === 'interview' || s.current_round <= s.total_rounds) && (
              <button
                onClick={onResume}
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
                <button onClick={() => onDelete(s.id)} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">削除</button>
                <button onClick={() => onConfirmDelete(null)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
              </div>
            ) : (
              <button onClick={() => onConfirmDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 会話ログ */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {s.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <AlertCircle size={24} className="text-gray-200" />
            <p className="text-sm">会話ログがありません</p>
          </div>
        ) : (
          s.messages.map(m => <MessageBubble key={m.id} msg={m} />)
        )}
      </div>
    </>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    )
  }
  if (msg.role === 'facilitator') {
    return (
      <div className="flex justify-center">
        <div className="bg-violet-50 border border-violet-200 text-violet-800 rounded-xl px-4 py-2.5 max-w-[85%] text-sm leading-relaxed text-center">
          <p className="text-[10px] font-semibold text-violet-400 mb-1">ファシリテーター</p>
          {msg.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {(msg.persona_name ?? '?').charAt(0)}
      </div>
      <div className="max-w-[75%] flex flex-col gap-0.5">
        <p className="text-[10px] text-gray-400 font-medium px-1">{msg.persona_name}</p>
        <div className="bg-white text-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm border border-gray-100">
          {msg.content}
        </div>
      </div>
    </div>
  )
}
