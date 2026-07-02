import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Play, Loader, CheckCircle, AlertCircle, ClipboardList, Paperclip, X, Link as LinkIcon, FileText, Image, Code, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { generateSurveyResponse, parseUserFriendlyError } from '../lib/ai'
import { generateId, now, sleep } from '../lib/utils'
import { parseFileToText } from '../lib/fileParser'
import type { SurveyRun, PersonaSurveyResult, MaterialItem } from '../types'

export default function Survey() {
  const navigate = useNavigate()
  const location = useLocation()
  const preSelectedIds: string[] = location.state?.preSelectedPersonaIds ?? []

  const { personas, templates, settings, addSurveyRun, updateSurveyRun } = useAppStore()

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(preSelectedIds)
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // 資料添付
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const groups = Array.from(new Set(personas.map(p => p.group).filter(Boolean))) as string[]
  const filteredPersonas = groupFilter ? personas.filter(p => p.group === groupFilter) : personas

  function togglePersona(id: string) {
    setSelectedPersonaIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }
  function selectAll() { setSelectedPersonaIds(filteredPersonas.map(p => p.id)) }
  function clearAll() { setSelectedPersonaIds([]) }

  async function handleFileAttach(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      let content = ''
      let type: MaterialItem['type'] = 'document'
      if (isImage) {
        type = 'image'
        content = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
      } else {
        try { content = await parseFileToText(file) } catch { content = '' }
        if (file.name.match(/\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|cs|rb|swift|kt)$/i)) type = 'code'
      }
      setMaterials(prev => [...prev, {
        id: generateId(), name: file.name, type, content, mime_type: file.type, added_at: now(),
      }])
    }
  }

  function addUrlMaterial() {
    const url = urlInput.trim()
    if (!url) return
    setMaterials(prev => [...prev, {
      id: generateId(), name: url, type: 'url', content: '', url, added_at: now(),
    }])
    setUrlInput('')
  }

  async function handleRun() {
    if (!selectedTemplate || selectedPersonaIds.length === 0) return
    if (!settings.apiKey && !settings.openaiApiKey && !settings.anthropicApiKey) {
      setError('APIキーが設定されていません。設定画面で入力してください。'); return
    }

    setRunning(true); setError(''); setDone(false); setProgress(0)

    const id = generateId()
    const run: SurveyRun = {
      id,
      template_id: selectedTemplate.id,
      template_name: selectedTemplate.name,
      persona_ids: selectedPersonaIds,
      results: [],
      created_at: now(),
      status: 'running',
      progress: 0,
      materials: materials.length > 0 ? materials : undefined,
    }
    await addSurveyRun(run)

    const results: PersonaSurveyResult[] = []
    const total = selectedPersonaIds.length
    const intervalMs = settings.quotaSafeMode ? Math.ceil(60000 / Math.max(1, settings.quotaRpm)) : 0

    for (let i = 0; i < selectedPersonaIds.length; i++) {
      const pid = selectedPersonaIds[i]
      const persona = personas.find(p => p.id === pid)
      if (!persona) continue

      setProgressText(`${persona.name} が回答中... (${i + 1}/${total})`)

      let result: PersonaSurveyResult
      try {
        const answers = await generateSurveyResponse(persona, selectedTemplate.questions, settings, materials)
        result = { persona_id: pid, persona_name: persona.name, answers }
      } catch (e) {
        result = { persona_id: pid, persona_name: persona.name, answers: [], error: parseUserFriendlyError(e) }
      }

      results.push(result)
      const pct = Math.round(((i + 1) / total) * 100)
      setProgress(pct)
      await updateSurveyRun({ ...run, results: [...results], progress: pct, status: i === total - 1 ? 'completed' : 'running' })
      if (intervalMs > 0 && i < total - 1) await sleep(intervalMs)
    }

    setProgressText(''); setRunning(false); setDone(true)
  }

  if (templates.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <ClipboardList size={40} className="text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500 font-medium mb-1">アンケートテンプレートがありません</p>
        <p className="text-sm text-gray-400 mb-5">先に設問テンプレートを作成してください</p>
        <a href="/survey/templates" className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
          設問テンプレートを作成する
        </a>
      </div>
    )
  }

  if (personas.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-gray-400">ペルソナがありません。先にペルソナを生成してください。</p>
      </div>
    )
  }

  const MATERIAL_ICONS: Record<MaterialItem['type'], React.ElementType> = {
    image: Image, document: FileText, code: Code, url: LinkIcon, video: FileText, pdf: FileText,
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">アンケート実行</h2>
      <p className="text-sm text-gray-400 mb-7">テンプレートとペルソナを選んで一括回答させます</p>

      {/* ── ステップ1: テンプレート選択 ── */}
      <div className="mb-7">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">1. アンケートを選ぶ</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map(t => {
            const selected = selectedTemplateId === t.id
            return (
              <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${selected ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className={`text-sm font-semibold ${selected ? 'text-teal-800' : 'text-gray-900'}`}>{t.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${selected ? 'bg-teal-200 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>{t.questions.length}問</span>
                </div>
                {t.questions.slice(0, 2).map((q, i) => (
                  <p key={q.id} className={`text-xs truncate ${selected ? 'text-teal-600' : 'text-gray-400'}`}>Q{i + 1}. {q.text || '（設問なし）'}</p>
                ))}
                {t.questions.length > 2 && (
                  <p className={`text-xs mt-0.5 ${selected ? 'text-teal-500' : 'text-gray-300'}`}>... 他{t.questions.length - 2}問</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ステップ2: 参考資料添付 ── */}
      <div className="mb-7">
        <button
          onClick={() => setMaterialsOpen(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700"
        >
          <Paperclip size={13} />
          2. 参考資料を添付する（任意）
          {materials.length > 0 && <span className="text-teal-600 normal-case font-medium">{materials.length}件</span>}
          {materialsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {materialsOpen && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs text-gray-500">アプリのスクリーンショット・仕様書・URL などを添付すると、その資料を参考にペルソナが回答します</p>
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 text-gray-700 font-medium">
                <Paperclip size={12} /> ファイルを添付
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,.txt,.md,.csv,.json,.pdf,.ts,.tsx,.js,.jsx,.py"
                onChange={e => handleFileAttach(e.target.files)}
                className="hidden" />
              <div className="flex-1 flex gap-1.5">
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addUrlMaterial()}
                  placeholder="URLを貼り付けて Enter"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 bg-white" />
                <button onClick={addUrlMaterial} disabled={!urlInput.trim()}
                  className="text-xs px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40">
                  <LinkIcon size={12} />
                </button>
              </div>
            </div>

            {materials.length > 0 && (
              <div className="space-y-1.5">
                {materials.map(m => {
                  const Icon = MATERIAL_ICONS[m.type]
                  return (
                    <div key={m.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                      <Icon size={13} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-700 truncate flex-1">{m.name}</span>
                      <button onClick={() => setMaterials(prev => prev.filter(x => x.id !== m.id))}
                        className="text-gray-300 hover:text-red-400 shrink-0"><X size={13} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ステップ3: ペルソナ選択 ── */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            3. 回答するペルソナを選ぶ
            {selectedPersonaIds.length > 0 && (
              <span className="ml-2 text-teal-600 normal-case font-medium">{selectedPersonaIds.length}人選択中</span>
            )}
          </h3>
          <div className="flex gap-3">
            <button onClick={selectAll} className="text-xs text-teal-600 hover:text-teal-800 font-medium">全選択</button>
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600">解除</button>
          </div>
        </div>

        {/* グループフィルター */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button onClick={() => setGroupFilter('')}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${!groupFilter ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              すべて
            </button>
            {groups.map(g => (
              <button key={g} onClick={() => setGroupFilter(g === groupFilter ? '' : g)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${groupFilter === g ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-2">
          {filteredPersonas.map(p => {
            const selected = selectedPersonaIds.includes(p.id)
            return (
              <button key={p.id} onClick={() => togglePersona(p.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${selected ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {p.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${selected ? 'text-teal-800' : 'text-gray-800'}`}>{p.name}</p>
                  <p className={`text-xs truncate ${selected ? 'text-teal-500' : 'text-gray-400'}`}>{p.age}歳 · {p.occupation}{p.group ? ` · ${p.group}` : ''}</p>
                </div>
                <div className={`w-4 h-4 rounded border-2 shrink-0 ml-auto flex items-center justify-center ${selected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                  {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 制限内モード */}
      {settings.quotaSafeMode && selectedPersonaIds.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          制限内モード ON — 推定所要時間: 約{Math.ceil(selectedPersonaIds.length / settings.quotaRpm * 60)}秒
        </div>
      )}

      {/* 進捗バー */}
      {running && (
        <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">{progressText}</span>
            <span className="text-sm font-semibold text-gray-900">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-teal-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {done && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">アンケートが完了しました！</p>
            <button onClick={() => navigate('/survey/results')} className="text-sm text-green-700 underline mt-0.5">
              結果を確認する →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={!selectedTemplateId || selectedPersonaIds.length === 0 || running}
        className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {running ? (
          <><Loader size={16} className="animate-spin" /> 実行中...</>
        ) : (
          <>
            <Play size={16} />
            {selectedPersonaIds.length > 0 && selectedTemplateId
              ? `${selectedPersonaIds.length}人にアンケートを実行する`
              : 'アンケートを実行する'}
          </>
        )}
      </button>

      {(!selectedTemplateId || selectedPersonaIds.length === 0) && !running && (
        <p className="text-center text-xs text-gray-400 mt-2">
          {!selectedTemplateId ? 'アンケートを選んでください' : 'ペルソナを1人以上選んでください'}
        </p>
      )}
    </div>
  )
}
