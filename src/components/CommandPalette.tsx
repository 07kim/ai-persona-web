import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Users, PlusCircle, MessageSquare, ClipboardList,
  BarChart2, Settings, ShieldAlert, Home, MessagesSquare,
} from 'lucide-react'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  admin?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    { id: 'home', label: 'ホームへ移動', icon: <Home size={15} />, action: () => navigate('/') },
    { id: 'generate', label: 'ペルソナ生成', description: 'データファイルからペルソナを作成', icon: <PlusCircle size={15} />, action: () => navigate('/personas/generate') },
    { id: 'personas', label: 'ペルソナ管理', description: '作成済みペルソナの一覧・編集', icon: <Users size={15} />, action: () => navigate('/personas') },
    { id: 'discussion', label: 'インタビュー・議論', description: 'ペルソナとの対話セッション', icon: <MessageSquare size={15} />, action: () => navigate('/discussion') },
    { id: 'deliberation', label: '対話セッション', description: '複数の視点でテーマを議論し成果物を生成', icon: <MessagesSquare size={15} />, action: () => navigate('/deliberation') },
    { id: 'templates', label: 'アンケート設問', description: '設問テンプレートの作成・管理', icon: <ClipboardList size={15} />, action: () => navigate('/survey/templates') },
    { id: 'survey', label: 'アンケート実行', description: 'ペルソナへのアンケート一括実施', icon: <ClipboardList size={15} />, action: () => navigate('/survey') },
    { id: 'results', label: '結果確認', description: '集計・エクスポート・AIレポート', icon: <BarChart2 size={15} />, action: () => navigate('/survey/results') },
    { id: 'settings', label: '設定', description: 'APIキー・モデル・制限内モード', icon: <Settings size={15} />, action: () => navigate('/settings') },
    {
      id: 'admin', label: '管理者モード — プロンプト編集',
      description: 'AIへの指示文を直接編集（上級者向け）',
      icon: <ShieldAlert size={15} />,
      action: () => navigate('/admin'),
      admin: true,
    },
  ]

  const filtered = commands.filter(c =>
    !query || `${c.label} ${c.description ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!open) return null

  function select(cmd: Command) {
    cmd.action()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* パレット本体 */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 検索入力 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="コマンドを検索..."
            className="flex-1 text-sm focus:outline-none text-gray-800 placeholder-gray-400"
          />
          <kbd className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* コマンドリスト */}
        <ul className="py-2 max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">
              「{query}」に一致するコマンドが見つかりません
            </li>
          )}
          {filtered.map(cmd => (
            <li key={cmd.id}>
              <button
                onClick={() => select(cmd)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  cmd.admin ? 'hover:bg-amber-50' : ''
                }`}
              >
                <span className={`shrink-0 ${cmd.admin ? 'text-amber-600' : 'text-gray-500'}`}>
                  {cmd.icon}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${cmd.admin ? 'text-amber-700' : 'text-gray-800'}`}>
                    {cmd.label}
                  </p>
                  {cmd.description && (
                    <p className="text-xs text-gray-400 truncate">{cmd.description}</p>
                  )}
                </div>
                {cmd.admin && (
                  <span className="ml-auto shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                    管理者
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* フッター */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-400">
          <span><kbd className="border border-gray-200 rounded px-1">↑</kbd><kbd className="border border-gray-200 rounded px-1 ml-0.5">↓</kbd> 移動</span>
          <span><kbd className="border border-gray-200 rounded px-1">Enter</kbd> 実行</span>
          <span className="ml-auto">⌘K で開く</span>
        </div>
      </div>
    </div>
  )
}
