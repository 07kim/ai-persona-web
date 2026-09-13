import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Download, ChevronRight, BarChart2, Loader, FileText, LayoutGrid, List, TrendingUp, MessagesSquare } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { generateInsightReport } from '../lib/ai'
import { downloadJson, downloadCsv, formatDate } from '../lib/utils'
import type { SurveyRun, Question } from '../types'

type PageTab = 'runs' | 'compare'

export default function SurveyResults() {
  const navigate = useNavigate()
  const { surveyRuns, templates, deleteSurveyRun, settings } = useAppStore()
  const [pageTab, setPageTab] = useState<PageTab>('runs')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<Record<string, 'table' | 'compare' | 'chart'>>({})
  const [insightRunId, setInsightRunId] = useState<string | null>(null)
  const [insightText, setInsightText] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [compareTemplateId, setCompareTemplateId] = useState<string>('')

  const sorted = [...surveyRuns].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // 同一テンプレートを複数回実行したもの（経時比較用）
  const multiRunTemplates = useMemo(() => {
    const byTemplate: Record<string, SurveyRun[]> = {}
    for (const run of surveyRuns) {
      if (!byTemplate[run.template_id]) byTemplate[run.template_id] = []
      byTemplate[run.template_id].push(run)
    }
    return Object.entries(byTemplate).filter(([, runs]) => runs.length >= 2)
  }, [surveyRuns])

  const compareRuns = useMemo(() =>
    compareTemplateId
      ? sorted.filter(r => r.template_id === compareTemplateId)
      : [],
    [compareTemplateId, sorted]
  )

  async function handleInsight(run: SurveyRun) {
    setInsightRunId(run.id)
    setInsightLoading(true)
    setInsightText('')
    const template = templates.find(t => t.id === run.template_id)
    const summary = buildSummary(run, template?.questions ?? [])
    await generateInsightReport(summary, settings, chunk => { setInsightText(prev => prev + chunk) })
    setInsightLoading(false)
  }

  function buildSummary(run: SurveyRun, questions: Question[]) {
    const summary: Record<string, unknown> = { template: run.template_name, total_respondents: run.results.length, questions: {} }
    for (const q of questions) {
      const answers = run.results.flatMap(r => r.answers.filter(a => a.question_id === q.id)).map(a => a.answer)
      if (q.question_type === 'multiple_choice') {
        const counts: Record<string, number> = {}
        for (const a of answers) for (const part of a.split('|')) { const k = part.trim(); counts[k] = (counts[k] ?? 0) + 1 }
        const total = answers.length
        summary.questions = { ...(summary.questions as Record<string, unknown>), [q.text]: { type: 'choice', distribution: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v}件 (${Math.round(v / total * 100)}%)`])) } }
      } else if (q.question_type === 'scale_rating') {
        const nums = answers.map(a => parseFloat(a)).filter(n => !isNaN(n))
        const avg = nums.reduce((s, n) => s + n, 0) / (nums.length || 1)
        summary.questions = { ...(summary.questions as Record<string, unknown>), [q.text]: { type: 'scale', average: avg.toFixed(2), count: nums.length } }
      } else {
        summary.questions = { ...(summary.questions as Record<string, unknown>), [q.text]: { type: 'text', responses: answers.slice(0, 5) } }
      }
    }
    return summary
  }

  function handleDownloadCsv(run: SurveyRun) {
    const template = templates.find(t => t.id === run.template_id)
    const questions = template?.questions ?? []
    const header = ['ペルソナ名', ...questions.map(q => q.text)]
    const rows = run.results.map(r => [r.persona_name, ...questions.map(q => { const ans = r.answers.find(a => a.question_id === q.id); return ans?.answer ?? r.error ?? '' })])
    downloadCsv([header, ...rows], `survey_${run.id}.csv`)
  }

  if (surveyRuns.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center py-16 text-gray-400">
        アンケートの実行結果がありません。アンケート実行ページから実施してください。
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          結果確認
          <span className="text-sm font-normal text-gray-400 ml-2">{surveyRuns.length}件</span>
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setPageTab('runs')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${pageTab === 'runs' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            実行履歴
          </button>
          {multiRunTemplates.length > 0 && (
            <button onClick={() => setPageTab('compare')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${pageTab === 'compare' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              <TrendingUp size={13} /> 経時比較
            </button>
          )}
        </div>
      </div>

      {/* ── 実行履歴タブ ── */}
      {pageTab === 'runs' && (
        <div className="space-y-4">
          {sorted.map(run => {
            const isExpanded = expandedId === run.id
            const isInsightOpen = insightRunId === run.id
            const template = templates.find(t => t.id === run.template_id)
            const currentViewMode = viewMode[run.id] ?? 'chart'

            return (
              <div key={run.id} className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 flex items-center justify-between">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                    className="flex-1 text-left flex items-start gap-2 group/title"
                    aria-expanded={isExpanded}
                  >
                    <ChevronRight
                      size={16}
                      className={`shrink-0 mt-0.5 text-gray-400 group-hover/title:text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 group-hover/title:text-indigo-600 transition-colors">{run.template_name}</h3>
                        <StatusBadge status={run.status} />
                        {run.materials && run.materials.length > 0 && (
                          <span className="text-xs text-gray-400">資料{run.materials.length}件</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{run.results.length}人 · {formatDate(run.created_at)} · {isExpanded ? '閉じる' : 'クリックで展開'}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    {run.status === 'completed' && (
                      <button onClick={() => navigate('/deliberation', { state: { surveyRunId: run.id, surveyTopic: run.template_name } })}
                        title="この結果をもとに対話する"
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 font-medium mr-1">
                        <MessagesSquare size={11} /> 対話へ
                      </button>
                    )}
                    <button onClick={() => handleDownloadCsv(run)} className="p-1.5 text-gray-400 hover:text-gray-700" title="CSV"><Download size={15} /></button>
                    <button onClick={() => downloadJson(run, `survey_${run.id}.json`)} className="p-1.5 text-gray-400 hover:text-gray-700" title="JSON"><FileText size={15} /></button>
                    <button onClick={() => { if (window.confirm('削除しますか？')) deleteSurveyRun(run.id) }} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={15} /></button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-5">
                    <div className="mb-4">
                      <button onClick={() => handleInsight(run)} disabled={insightLoading}
                        className="flex items-center gap-1.5 text-sm px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-40">
                        {insightLoading && isInsightOpen ? <Loader size={13} className="animate-spin" /> : <BarChart2 size={13} />}
                        AIインサイトレポートを生成
                      </button>
                      {isInsightOpen && insightText && (
                        <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-900 whitespace-pre-wrap leading-relaxed">
                          {insightText}
                        </div>
                      )}
                    </div>

                    {template && run.results.length > 0 && (
                      <>
                        <div className="flex items-center gap-1 mb-4">
                          {([['chart', BarChart2, 'グラフ'], ['table', List, '一覧'], ['compare', LayoutGrid, '質問別']] as const).map(([mode, Icon, label]) => (
                            <button key={mode} onClick={() => setViewMode(v => ({ ...v, [run.id]: mode }))}
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${currentViewMode === mode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                              <Icon size={12} /> {label}
                            </button>
                          ))}
                        </div>

                        {/* ── グラフビュー ── */}
                        {currentViewMode === 'chart' && (
                          <div className="space-y-6">
                            {template.questions.map((q, qi) => {
                              const answers = run.results.flatMap(r => r.answers.filter(a => a.question_id === q.id)).map(a => a.answer)
                              return (
                                <div key={q.id}>
                                  <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">{qi + 1}</span>
                                    {q.text}
                                  </p>
                                  {q.question_type === 'multiple_choice' && <ChoiceChart answers={answers} />}
                                  {q.question_type === 'scale_rating' && <ScaleChart answers={answers} min={q.scale_min} max={q.scale_max} />}
                                  {q.question_type === 'free_text' && (
                                    <div className="space-y-1.5">
                                      {answers.map((a, i) => (
                                        <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700 border border-gray-100">
                                          <span className="text-gray-400 font-medium mr-2">{run.results[i]?.persona_name}</span>{a}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ── 一覧ビュー ── */}
                        {currentViewMode === 'table' && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-2 pr-4 font-medium text-gray-500">ペルソナ</th>
                                  {template.questions.map(q => (
                                    <th key={q.id} className="text-left py-2 px-2 font-medium text-gray-500 max-w-32">
                                      <span className="line-clamp-2">{q.text}</span>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {run.results.map(r => (
                                  <tr key={r.persona_id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{r.persona_name}</td>
                                    {r.error ? (
                                      <td colSpan={template.questions.length} className="py-2 px-2 text-red-400">エラー: {r.error.slice(0, 60)}</td>
                                    ) : (
                                      template.questions.map(q => {
                                        const ans = r.answers.find(a => a.question_id === q.id)
                                        return <td key={q.id} className="py-2 px-2 text-gray-600 max-w-48"><span className="line-clamp-3">{ans?.answer ?? '—'}</span></td>
                                      })
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* ── 質問別比較ビュー ── */}
                        {currentViewMode === 'compare' && (
                          <div className="space-y-5">
                            {template.questions.map((q, qi) => (
                              <div key={q.id}>
                                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">{qi + 1}</span>
                                  {q.text}
                                </p>
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(run.results.length, 3)}, 1fr)` }}>
                                  {run.results.map(r => {
                                    const ans = r.answers.find(a => a.question_id === q.id)
                                    return (
                                      <div key={r.persona_id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <p className="text-[10px] font-semibold text-indigo-600 mb-1 truncate">{r.persona_name}</p>
                                        {r.error ? <p className="text-xs text-red-400">{r.error.slice(0, 40)}</p>
                                          : <p className="text-xs text-gray-700 leading-relaxed">{ans?.answer ?? '—'}</p>}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 経時比較タブ ── */}
      {pageTab === 'compare' && (
        <div>
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">比較するテンプレートを選択</p>
            <div className="flex flex-wrap gap-2">
              {multiRunTemplates.map(([tid, runs]) => {
                const tmpl = templates.find(t => t.id === tid)
                return (
                  <button key={tid} onClick={() => setCompareTemplateId(tid)}
                    className={`text-sm px-4 py-2 rounded-xl border-2 font-medium transition-all ${compareTemplateId === tid ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                    {tmpl?.name ?? tid}
                    <span className="ml-1.5 text-xs text-gray-400">{runs.length}回</span>
                  </button>
                )
              })}
            </div>
          </div>

          {compareTemplateId && compareRuns.length >= 2 && (() => {
            const tmpl = templates.find(t => t.id === compareTemplateId)
            if (!tmpl) return null
            return (
              <div className="space-y-6">
                {tmpl.questions.map((q, qi) => (
                  <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0">{qi + 1}</span>
                      {q.text}
                    </p>
                    {q.question_type === 'scale_rating' ? (
                      <div className="space-y-3">
                        {compareRuns.map(run => {
                          const answers = run.results.flatMap(r => r.answers.filter(a => a.question_id === q.id)).map(a => parseFloat(a.answer)).filter(n => !isNaN(n))
                          const avg = answers.length ? answers.reduce((s, n) => s + n, 0) / answers.length : 0
                          const pct = ((avg - q.scale_min) / (q.scale_max - q.scale_min)) * 100
                          return (
                            <div key={run.id} className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-32 shrink-0">{formatDate(run.created_at)}</span>
                              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-bold text-gray-700 w-10 text-right">{avg.toFixed(1)}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : q.question_type === 'multiple_choice' ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left py-1.5 pr-4 text-gray-400 font-medium">実施日</th>
                              <th className="text-left py-1.5 px-2 text-gray-400 font-medium">回答者数</th>
                              <th className="text-left py-1.5 px-2 text-gray-400 font-medium">最多回答</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareRuns.map(run => {
                              const answers = run.results.flatMap(r => r.answers.filter(a => a.question_id === q.id)).map(a => a.answer)
                              const counts: Record<string, number> = {}
                              for (const a of answers) for (const part of a.split('|')) { const k = part.trim(); counts[k] = (counts[k] ?? 0) + 1 }
                              const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
                              return (
                                <tr key={run.id} className="border-b border-gray-50">
                                  <td className="py-1.5 pr-4 text-gray-600">{formatDate(run.created_at)}</td>
                                  <td className="py-1.5 px-2 text-gray-600">{run.results.length}人</td>
                                  <td className="py-1.5 px-2 text-gray-800 font-medium">{top ? `${top[0]} (${top[1]}件)` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {compareRuns.map(run => (
                          <div key={run.id}>
                            <p className="text-[10px] text-gray-400 mb-1">{formatDate(run.created_at)} · {run.results.length}人</p>
                            <div className="space-y-1">
                              {run.results.slice(0, 2).map(r => {
                                const ans = r.answers.find(a => a.question_id === q.id)
                                return (
                                  <p key={r.persona_id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                                    <span className="font-medium text-gray-700 mr-2">{r.persona_name}</span>{ans?.answer ?? '—'}
                                  </p>
                                )
                              })}
                              {run.results.length > 2 && <p className="text-xs text-gray-400 pl-1">他 {run.results.length - 2} 人...</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function ChoiceChart({ answers }: { answers: string[] }) {
  const counts: Record<string, number> = {}
  for (const a of answers) for (const part of a.split('|')) { const k = part.trim(); if (k) counts[k] = (counts[k] ?? 0) + 1 }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const max = entries[0]?.[1] ?? 1
  return (
    <div className="space-y-2">
      {entries.map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-32 shrink-0 truncate" title={label}>{label}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">{count}件</span>
        </div>
      ))}
    </div>
  )
}

function ScaleChart({ answers, min, max }: { answers: string[]; min: number; max: number }) {
  const nums = answers.map(a => parseFloat(a)).filter(n => !isNaN(n))
  if (nums.length === 0) return <p className="text-xs text-gray-400">回答なし</p>
  const avg = nums.reduce((s, n) => s + n, 0) / nums.length
  const counts: Record<number, number> = {}
  for (let i = min; i <= max; i++) counts[i] = 0
  for (const n of nums) counts[Math.round(n)] = (counts[Math.round(n)] ?? 0) + 1
  const maxCount = Math.max(...Object.values(counts))
  const pct = ((avg - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold text-gray-800">平均 {avg.toFixed(1)}</span>
        <span className="text-xs text-gray-400">({min}〜{max})</span>
      </div>
      <div className="flex gap-1 items-end h-12">
        {Object.entries(counts).map(([val, count]) => (
          <div key={val} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full bg-indigo-200 rounded-t" style={{ height: `${maxCount > 0 ? (count / maxCount) * 36 : 0}px` }} />
            <span className="text-[10px] text-gray-400">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { completed: 'bg-green-100 text-green-700', running: 'bg-blue-100 text-blue-700', failed: 'bg-red-100 text-red-700' }
  const labels: Record<string, string> = { completed: '完了', running: '実行中', failed: '失敗' }
  return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>{labels[status] ?? status}</span>
}
