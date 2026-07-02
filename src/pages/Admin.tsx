import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, RotateCcw, Save, AlertTriangle, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { PROMPT_DEFS, getPrompt, setPrompt, resetPrompt, isCustomized, resetAll } from '../lib/prompts'

export default function Admin() {
  const navigate = useNavigate()
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [customized, setCustomized] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmResetAll, setConfirmResetAll] = useState(false)

  useEffect(() => {
    const initial: Record<string, string> = {}
    const cust: Record<string, boolean> = {}
    const exp: Record<string, boolean> = {}
    for (const def of PROMPT_DEFS) {
      initial[def.key] = getPrompt(def.key)
      cust[def.key] = isCustomized(def.key)
      exp[def.key] = false
    }
    setPrompts(initial)
    setCustomized(cust)
    setExpanded(exp)
  }, [])

  function handleChange(key: string, value: string) {
    setPrompts(p => ({ ...p, [key]: value }))
  }

  function handleSave(key: string) {
    setPrompt(key, prompts[key])
    setCustomized(c => ({ ...c, [key]: true }))
    setSaved(s => ({ ...s, [key]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
  }

  function handleReset(key: string) {
    resetPrompt(key)
    const def = PROMPT_DEFS.find(d => d.key === key)!
    setPrompts(p => ({ ...p, [key]: def.defaultValue }))
    setCustomized(c => ({ ...c, [key]: false }))
  }

  function handleResetAll() {
    resetAll()
    const initial: Record<string, string> = {}
    const cust: Record<string, boolean> = {}
    for (const def of PROMPT_DEFS) {
      initial[def.key] = def.defaultValue
      cust[def.key] = false
    }
    setPrompts(initial)
    setCustomized(cust)
    setConfirmResetAll(false)
  }

  function toggleExpand(key: string) {
    setExpanded(e => ({ ...e, [key]: !e[key] }))
  }

  const customCount = Object.values(customized).filter(Boolean).length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ヘッダー */}
      <div className="border-b border-gray-800 px-8 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors mr-1"
        >
          <ArrowLeft size={16} />
        </button>
        <ShieldAlert size={20} className="text-amber-400" />
        <div>
          <h1 className="text-base font-bold text-white">管理者モード — プロンプトエディタ</h1>
          <p className="text-xs text-gray-500">AIへの指示文を直接編集できます。変更はブラウザに保存されます。</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {customCount > 0 && (
            <span className="text-xs bg-amber-900 text-amber-300 px-2 py-1 rounded-full">
              {customCount}件カスタマイズ中
            </span>
          )}
          {confirmResetAll ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">本当に全リセットしますか？</span>
              <button onClick={handleResetAll} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">実行</button>
              <button onClick={() => setConfirmResetAll(false)} className="text-xs px-3 py-1.5 border border-gray-700 text-gray-400 rounded-lg hover:bg-gray-800">キャンセル</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmResetAll(true)}
              disabled={customCount === 0}
              className="text-xs px-3 py-1.5 border border-gray-700 text-gray-400 rounded-lg hover:bg-gray-800 disabled:opacity-30 flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> 全てデフォルトに戻す
            </button>
          )}
        </div>
      </div>

      {/* 警告バナー */}
      <div className="mx-8 mt-5 mb-6 flex items-start gap-3 bg-amber-950 border border-amber-800 rounded-xl px-4 py-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-300 leading-relaxed">
          <p className="font-semibold mb-0.5">上級者向け機能です</p>
          プロンプトを変更するとAIの挙動が大きく変わります。誤った指示を与えると出力の品質が低下する場合があります。
          変更内容はブラウザのローカルストレージに保存され、データはサーバーに送信されません。
        </div>
      </div>

      {/* プロンプトリスト */}
      <div className="px-8 pb-12 space-y-4">
        {PROMPT_DEFS.map(def => {
          const isExp = expanded[def.key]
          const isCust = customized[def.key]
          const isSaved = saved[def.key]
          const currentVal = prompts[def.key] ?? ''

          return (
            <div key={def.key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* カードヘッダー */}
              <button
                onClick={() => toggleExpand(def.key)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-gray-100">{def.label}</p>
                    {isCust && (
                      <span className="text-xs bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded-full">カスタム</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{def.description}</p>
                </div>
                {isExp ? <ChevronUp size={16} className="text-gray-500 shrink-0" /> : <ChevronDown size={16} className="text-gray-500 shrink-0" />}
              </button>

              {/* エディタ */}
              {isExp && (
                <div className="px-5 pb-5 border-t border-gray-800">
                  <textarea
                    value={currentVal}
                    onChange={e => handleChange(def.key, e.target.value)}
                    rows={12}
                    spellCheck={false}
                    className="w-full mt-4 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y"
                  />
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => handleSave(def.key)}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                    >
                      <Save size={13} />
                      {isSaved ? '保存しました ✓' : '保存する'}
                    </button>
                    {isCust && (
                      <button
                        onClick={() => handleReset(def.key)}
                        className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-700 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <RotateCcw size={12} /> デフォルトに戻す
                      </button>
                    )}
                    <span className="ml-auto text-xs text-gray-600">
                      {currentVal.length} 文字
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
