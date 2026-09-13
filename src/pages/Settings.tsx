import { useState, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { validateApiKey, formatGeminiModelLabel, filterUsefulGeminiModels, FALLBACK_GEMINI_MODELS } from '../lib/ai'
import { getProvider } from '../types'
import { Eye, EyeOff, CheckCircle, AlertCircle, Loader, Download, Upload, Database } from 'lucide-react'

const STATIC_MODEL_GROUPS = [
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
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（推奨）' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（低コスト）' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8（高性能）' },
    ],
  },
]

type TestState = { ok: boolean; error?: string } | null

export default function Settings() {
  const { settings, saveSettings, exportAll, importAll } = useAppStore()
  const [form, setForm] = useState(settings)
  const [showKeys, setShowKeys] = useState({ gemini: false, openai: false, anthropic: false })
  const [testing, setTesting] = useState<'gemini' | 'openai' | 'anthropic' | null>(null)
  const [testResults, setTestResults] = useState<{ gemini: TestState; openai: TestState; anthropic: TestState }>({
    gemini: null, openai: null, anthropic: null,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  function handleChange(field: string, value: string | boolean | number) {
    setForm(f => ({ ...f, [field]: value }))
    setSaved(false)
  }

  async function handleTest(provider: 'gemini' | 'openai' | 'anthropic') {
    const key = provider === 'gemini' ? form.apiKey : provider === 'openai' ? form.openaiApiKey : form.anthropicApiKey
    if (!key) return
    setTesting(provider)
    setTestResults(r => ({ ...r, [provider]: null }))
    const result = await validateApiKey(key, provider)
    if (result.ok) {
      setForm(f => {
        let newModel = f.model
        if (result.detectedModel) {
          const currentProvider = getProvider(f.model)
          if (currentProvider === provider || !f.model) {
            newModel = result.detectedModel
          }
        }
        return {
          ...f,
          model: newModel,
          ...(result.availableModels && result.availableModels.length > 0 ? { availableGeminiModels: result.availableModels } : {}),
        }
      })
    }
    setTestResults(r => ({ ...r, [provider]: { ok: result.ok, error: result.ok ? undefined : result.message } }))
    setTesting(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const data = exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-persona-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await importAll({
        personas: data.personas,
        templates: data.templates,
        surveyRuns: data.surveyRuns,
        discussions: data.discussions,
        deliberationSessions: data.deliberationSessions,
        participantTemplates: data.participantTemplates,
      })
      const counts = [
        data.personas?.length && `ペルソナ ${data.personas.length}件`,
        data.templates?.length && `テンプレート ${data.templates.length}件`,
        data.surveyRuns?.length && `アンケート結果 ${data.surveyRuns.length}件`,
        data.discussions?.length && `インタビュー ${data.discussions.length}件`,
        data.deliberationSessions?.length && `対話 ${data.deliberationSessions.length}件`,
      ].filter(Boolean).join('、')
      setImportResult({ ok: true, message: `インポート完了: ${counts || 'データなし'}` })
    } catch {
      setImportResult({ ok: false, message: 'ファイルの読み込みに失敗しました。バックアップJSONを確認してください。' })
    } finally {
      setImporting(false)
    }
  }

  const etaSec = form.quotaSafeMode ? Math.ceil(60 / Math.max(1, form.quotaRpm)) : null

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">設定</h2>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

        {/* Gemini APIキー */}
        <ApiKeySection
          title="Google Gemini APIキー"
          hint="Google AI Studio で取得できます"
          keyValue={form.apiKey}
          showKey={showKeys.gemini}
          placeholder="AIza..."
          testing={testing === 'gemini'}
          testResult={testResults.gemini}
          availableModels={form.availableGeminiModels && form.availableGeminiModels.length > 0 ? filterUsefulGeminiModels(form.availableGeminiModels) : undefined}
          onToggleShow={() => setShowKeys(s => ({ ...s, gemini: !s.gemini }))}
          onChange={v => handleChange('apiKey', v)}
          onTest={() => handleTest('gemini')}
        />

        {/* OpenAI APIキー */}
        <ApiKeySection
          title="OpenAI APIキー"
          hint="platform.openai.com で取得できます"
          keyValue={form.openaiApiKey ?? ''}
          showKey={showKeys.openai}
          placeholder="sk-..."
          testing={testing === 'openai'}
          testResult={testResults.openai}
          onToggleShow={() => setShowKeys(s => ({ ...s, openai: !s.openai }))}
          onChange={v => handleChange('openaiApiKey', v)}
          onTest={() => handleTest('openai')}
        />

        {/* Anthropic APIキー */}
        <ApiKeySection
          title="Anthropic APIキー"
          hint="console.anthropic.com で取得できます"
          keyValue={form.anthropicApiKey ?? ''}
          showKey={showKeys.anthropic}
          placeholder="sk-ant-..."
          testing={testing === 'anthropic'}
          testResult={testResults.anthropic}
          onToggleShow={() => setShowKeys(s => ({ ...s, anthropic: !s.anthropic }))}
          onChange={v => handleChange('anthropicApiKey', v)}
          onTest={() => handleTest('anthropic')}
        />

        {/* モデル */}
        {(() => {
          const rawUseful = form.availableGeminiModels && form.availableGeminiModels.length > 0
            ? filterUsefulGeminiModels(form.availableGeminiModels)
            : []
          const geminiModels = rawUseful.length > 0
            ? rawUseful.map(m => ({ value: m, label: formatGeminiModelLabel(m) }))
            : FALLBACK_GEMINI_MODELS
          const allModels = [...geminiModels, ...STATIC_MODEL_GROUPS.flatMap(g => g.models)]
          const currentLabel = allModels.find(m => m.value === form.model)?.label ?? form.model

          return (
            <Section title="使用モデル" description="選択したモデルのプロバイダーのAPIキーが必要です">
              <select
                value={form.model}
                onChange={e => handleChange('model', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                <optgroup label="Google Gemini">
                  {geminiModels.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
                {STATIC_MODEL_GROUPS.map(group => (
                  <optgroup key={group.provider} label={group.label}>
                    {group.models.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="mt-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>現在の動作モデル: {currentLabel}</span>
              </div>
            </Section>
          )
        })()}

        {/* データバックアップ */}
        <Section title="データバックアップ" description="全データをJSONファイルで保存・復元できます">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Download size={14} /> エクスポート
            </button>
            <button
              onClick={() => importRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg font-medium text-gray-700 disabled:opacity-40 transition-colors"
            >
              {importing ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
              インポート
            </button>
            <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
          {importResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${importResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {importResult.message}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <Database size={11} />
            APIキーはセキュリティのためエクスポートに含まれません
          </p>
        </Section>

        {/* 制限内モード */}
        <Section title="制限内モード" description="無料枠を超えないようにAPIコールを間引きます">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.quotaSafeMode}
              onChange={e => handleChange('quotaSafeMode', e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-300"
            />
            <span className="text-sm text-gray-700">制限内モードを有効にする</span>
          </label>
          {form.quotaSafeMode && (
            <div className="mt-3">
              <label className="text-sm text-gray-600">1分あたりの実行回数（RPM）</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.quotaRpm}
                  onChange={e => handleChange('quotaRpm', parseInt(e.target.value, 10) || 1)}
                  className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="text-sm text-gray-500">回/分</span>
              </div>
              {etaSec && (
                <p className="text-xs text-amber-600 mt-1.5">
                  ペルソナ1件あたり約{etaSec}秒の間隔を置いて実行します
                </p>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* 保存ボタン */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          {saving && <Loader size={14} className="animate-spin" />}
          保存する
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle size={14} />
            保存しました
          </span>
        )}
      </div>
    </div>
  )
}

function ApiKeySection({
  title, hint, keyValue, showKey, placeholder, testing, testResult, availableModels,
  onToggleShow, onChange, onTest,
}: {
  title: string; hint: string; keyValue: string; showKey: boolean; placeholder: string
  testing: boolean; testResult: TestState; availableModels?: string[]
  onToggleShow: () => void; onChange: (v: string) => void; onTest: () => void
}) {
  return (
    <Section title={title} description={hint}>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={keyValue}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onTest}
          disabled={!keyValue || testing}
          className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          {testing && <Loader size={13} className="animate-spin" />}
          動作確認する
        </button>
        {testResult && (
          <span className={`flex items-center gap-1.5 text-sm ${testResult.ok ? 'text-green-600 font-medium' : 'text-red-600'}`}>
            {testResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {testResult.ok
              ? `接続成功（${availableModels?.length ? `${availableModels.length}件のモデルを取得` : 'キー有効'}）`
              : '接続失敗'}
          </span>
        )}
      </div>
      {testResult && !testResult.ok && testResult.error && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          {testResult.error}
        </div>
      )}
      {availableModels && availableModels.length > 0 && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
            <CheckCircle size={12} className="text-emerald-500" />
            このキーで実際に利用可能なモデル一覧（{availableModels.length}件）:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableModels.map(m => (
              <span key={m} className="text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded shadow-xs font-mono">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function Section({
  title, description, children,
}: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="px-5 py-4">
      <div className="mb-2">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {description && <p className="text-xs text-gray-400">{description}</p>}
      </div>
      {children}
    </div>
  )
}
