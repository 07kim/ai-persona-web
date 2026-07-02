import { useState, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  Cpu, ChevronDown, Eye, EyeOff,
  CheckCircle, Users, Wand2, MessageSquare,
  ClipboardList, BarChart2, Home, MessagesSquare, Play,
  AlertCircle, Loader, Search, FileText, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import CommandPalette from './CommandPalette'
import { validateApiKey } from '../lib/ai'
import { getProvider, getApiKeyForModel, detectProviderFromKey, DEFAULT_MODEL_FOR_PROVIDER } from '../types'

const MODEL_GROUPS = [
  {
    label: 'Google Gemini',
    provider: 'gemini' as const,
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（推奨）' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    label: 'OpenAI',
    provider: 'openai' as const,
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini（低コスト）' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    label: 'Anthropic',
    provider: 'anthropic' as const,
    models: [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（低コスト）' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8（高性能）' },
    ],
  },
]


type NavItem = { to: string; label: string; icon: React.ElementType; end?: boolean }
type NavGroup = { label?: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    items: [{ to: '/', label: 'ホーム', icon: Home, end: true }],
  },
  {
    label: 'ペルソナ',
    items: [
      { to: '/personas/generate', label: 'ペルソナ生成', icon: Wand2, end: true },
      { to: '/personas', label: 'ペルソナ管理', icon: Users, end: true },
    ],
  },
  {
    label: 'インタビュー',
    items: [
      { to: '/discussion', label: 'インタビュー・議論', icon: MessageSquare, end: true },
      { to: '/discussion/history', label: 'インタビュー履歴', icon: ClipboardList, end: true },
    ],
  },
  {
    label: '対話',
    items: [
      { to: '/deliberation', label: '対話セッション', icon: MessagesSquare, end: true },
      { to: '/deliberation/sessions', label: '対話管理', icon: FileText, end: true },
    ],
  },
  {
    label: 'アンケート',
    items: [
      { to: '/survey/templates', label: 'アンケート設問', icon: FileText },
      { to: '/survey', label: 'アンケート実行', icon: Play, end: true },
      { to: '/survey/results', label: '結果確認', icon: BarChart2 },
    ],
  },
]

const BREADCRUMB_LABELS: Record<string, string> = {
  personas: 'ペルソナ管理',
  generate: 'ペルソナ生成',
  new: 'ペルソナ手動作成',
  discussion: 'インタビュー・議論',
  deliberation: '対話セッション',
  sessions: '対話管理',
  history: 'インタビュー履歴',
  survey: 'アンケート実行',
  templates: 'アンケート設問',
  results: '結果確認',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      {sidebarOpen && <Sidebar onToggle={() => setSidebarOpen(false)} onOpenCmd={() => setCmdOpen(true)} />}

      <div className="flex-1 flex flex-col min-w-0">
        {/* トップバー */}
        <header className="h-11 shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-3 z-20">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <Breadcrumb />
          <div className="flex-1" />
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Search size={12} />
            <span>コマンド</span>
            <kbd className="text-[10px] border border-gray-300 bg-white rounded px-1 text-gray-500">⌘K</kbd>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

/* ── パンくず ── */
function Breadcrumb() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  if (parts.length === 0) return <span className="text-xs text-gray-500 font-medium">ホーム</span>
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400">
      {parts.map((p, i) => {
        const label = BREADCRUMB_LABELS[p] ?? p
        const isLast = i === parts.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="text-gray-300" />}
            <span className={isLast ? 'text-gray-700 font-medium' : ''}>{label}</span>
          </span>
        )
      })}
    </div>
  )
}

/* ── サイドバー ── */
function Sidebar({ onToggle, onOpenCmd }: { onToggle: () => void; onOpenCmd: () => void }) {
  const { settings, saveSettings } = useAppStore()
  const [selectedModel, setSelectedModel] = useState(settings.model)

  const provider = getProvider(selectedModel)
  const currentKey = getApiKeyForModel(settings, selectedModel)

  const providerLabel = provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Gemini'
  const providerPlaceholder = provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'AIza...'
  const providerField = provider === 'openai' ? 'openaiApiKey' : provider === 'anthropic' ? 'anthropicApiKey' : 'apiKey'

  const [keyInput, setKeyInput] = useState(currentKey)
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [keyMessage, setKeyMessage] = useState('')
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null)

  useEffect(() => {
    const newKey = getApiKeyForModel(settings, selectedModel)
    setKeyInput(newKey)
    setKeyStatus('idle')
    setKeyMessage('')
    setDetectedProvider(null)
  }, [selectedModel, settings])

  async function handleModelChange(newModel: string) {
    setSelectedModel(newModel)
    await saveSettings({ ...settings, model: newModel })
  }

  function handleKeyChange(val: string) {
    setKeyInput(val)
    setKeyStatus('idle')
    const detected = detectProviderFromKey(val.trim())
    setDetectedProvider(detected && detected !== provider
      ? (detected === 'openai' ? 'OpenAI' : detected === 'anthropic' ? 'Anthropic' : 'Gemini')
      : null)
  }

  async function handleSaveKey() {
    const trimmed = keyInput.trim()
    if (trimmed === currentKey) return
    if (!trimmed) {
      await saveSettings({ ...settings, [providerField]: '' })
      setKeyStatus('idle')
      setDetectedProvider(null)
      return
    }
    const detected = detectProviderFromKey(trimmed) ?? provider
    const detectedField = detected === 'openai' ? 'openaiApiKey' : detected === 'anthropic' ? 'anthropicApiKey' : 'apiKey'
    setKeyStatus('testing')
    setKeyMessage('確認中...')
    const result = await validateApiKey(trimmed, detected)
    if (result.ok) {
      const newModel = detected !== provider ? DEFAULT_MODEL_FOR_PROVIDER[detected] : selectedModel
      await saveSettings({ ...settings, [detectedField]: trimmed, model: newModel })
      if (detected !== provider) setSelectedModel(newModel)
      setKeyStatus('ok')
      const label = detected === 'openai' ? 'OpenAI' : detected === 'anthropic' ? 'Anthropic' : 'Gemini'
      setKeyMessage(detected !== provider ? `${label}キーを検出・自動切替` : '有効なキーです')
      setDetectedProvider(null)
      setTimeout(() => setKeyStatus('idle'), 4000)
    } else {
      setKeyStatus('error')
      setKeyMessage(result.message)
    }
  }

  const hasKey = !!currentKey

  return (
    <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* ロゴ */}
      <div className="h-11 flex items-center gap-2.5 px-3 border-b border-gray-200 shrink-0">
        <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center shrink-0">
          <Cpu size={13} className="text-white" />
        </div>
        <Link to="/" className="text-sm font-semibold text-gray-900 flex-1 truncate">
          AIペルソナ
        </Link>
        <button
          onClick={onToggle}
          className="p-1 rounded text-gray-300 hover:text-gray-500 transition-colors"
          title="サイドバーを閉じる"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* 検索 */}
      <div className="px-2 pt-2.5 pb-1 shrink-0">
        <button
          onClick={onOpenCmd}
          className="w-full flex items-center gap-2 text-xs text-gray-400 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Search size={12} />
          <span className="flex-1 text-left">検索 / コマンド</span>
          <kbd className="text-[10px] text-gray-400 bg-white border border-gray-200 rounded px-1">⌘K</kbd>
        </button>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto">
        {NAV.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
            {group.label && (
              <p className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {group.label}
              </p>
            )}
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* モデル & APIキー */}
      <div className="border-t border-gray-200 p-3 space-y-3 shrink-0">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">使用モデル</p>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={e => handleModelChange(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg pl-2.5 pr-6 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-300 appearance-none cursor-pointer"
            >
              {MODEL_GROUPS.map(group => (
                <optgroup key={group.provider} label={group.label}>
                  {group.models.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                keyStatus === 'ok' || hasKey ? 'bg-green-500' : 'bg-red-400'
              }`} />
              {providerLabel} APIキー
            </span>
            {keyStatus === 'testing' && <Loader size={11} className="text-indigo-500 animate-spin" />}
            {keyStatus === 'ok' && <CheckCircle size={11} className="text-green-500" />}
            {keyStatus === 'error' && <AlertCircle size={11} className="text-red-400" />}
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => handleKeyChange(e.target.value)}
              onBlur={handleSaveKey}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
              placeholder={hasKey ? '設定済み' : providerPlaceholder}
              className={`w-full text-xs border rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 bg-gray-50 ${
                keyStatus === 'error' ? 'border-red-300 focus:ring-red-300' :
                keyStatus === 'ok' ? 'border-green-300 focus:ring-green-300' :
                'border-gray-200 focus:ring-indigo-300'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          {detectedProvider && keyStatus === 'idle' && (
            <p className="text-[10px] text-indigo-500 mt-1 leading-tight">{detectedProvider}キーを検出 — Enterで保存</p>
          )}
          {keyStatus === 'idle' && !hasKey && !detectedProvider && (
            <p className="text-[10px] text-amber-500 mt-1 leading-tight">APIキーを入力してEnterで保存</p>
          )}
          {keyStatus !== 'idle' && keyMessage && (
            <p className={`text-[10px] mt-1 leading-tight ${
              keyStatus === 'ok' ? 'text-green-600' :
              keyStatus === 'error' ? 'text-red-500' : 'text-gray-400'
            }`}>{keyMessage}</p>
          )}
        </div>
      </div>
    </aside>
  )
}
