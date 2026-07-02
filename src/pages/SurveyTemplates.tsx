import { useState } from 'react'
import { Plus, Trash2, Edit3, X, ArrowLeft, List, FileText, SlidersHorizontal, GripVertical, ClipboardList, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { generateId, now, formatDate } from '../lib/utils'
import type { SurveyTemplate, Question, QuestionType } from '../types'

interface PresetDef {
  name: string
  description: string
  emoji: string
  questions: Omit<Question, 'id'>[]
}

const SURVEY_PRESETS: PresetDef[] = [
  {
    name: 'UXリサーチ',
    description: 'ユーザー体験・使いやすさの調査',
    emoji: '🔍',
    questions: [
      { text: 'この製品を使う主な目的は何ですか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '全体的な使いやすさを評価してください', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '最も便利に感じる機能はどれですか？', question_type: 'multiple_choice', options: ['デザイン・見た目', '操作のシンプルさ', '処理の速さ', '機能の豊富さ', 'サポート体制'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '使っていて困ったことや不満を感じた点はありますか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'この製品を友人や同僚に推薦したいと思いますか？', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 10, scale_min_label: '全く思わない', scale_max_label: '強くそう思う', allow_multiple: false, max_selections: 0 },
    ],
  },
  {
    name: '製品フィードバック',
    description: '新製品・サービスへの率直な意見収集',
    emoji: '📦',
    questions: [
      { text: 'この製品の第一印象を教えてください', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '価格に対する満足度はいかがですか？', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'この製品を購入・利用したいと思いますか？', question_type: 'multiple_choice', options: ['すぐに購入したい', '検討してみる', 'あまり思わない', '全く思わない'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'この製品の良かった点を教えてください', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'さらに追加してほしい機能や改善点はありますか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
    ],
  },
  {
    name: '顧客満足度（CS）',
    description: 'サービスや対応への満足度調査',
    emoji: '⭐',
    questions: [
      { text: 'サービス全体の満足度を教えてください', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 10, scale_min_label: '非常に不満', scale_max_label: '非常に満足', allow_multiple: false, max_selections: 0 },
      { text: '対応のスピードはいかがでしたか？', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, scale_min_label: '非常に遅い', scale_max_label: '非常に速い', allow_multiple: false, max_selections: 0 },
      { text: 'スタッフ・サポートの対応はいかがでしたか？', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, scale_min_label: '非常に悪い', scale_max_label: '非常に良い', allow_multiple: false, max_selections: 0 },
      { text: 'また利用したいと思いますか？', question_type: 'multiple_choice', options: ['ぜひ利用したい', '機会があれば利用する', 'あまり思わない', '利用しない'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '改善のご要望やご意見があればお聞かせください', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
    ],
  },
  {
    name: 'コンセプト評価',
    description: 'アイデアや企画への反応・評価',
    emoji: '💡',
    questions: [
      { text: 'このコンセプトに興味を持ちましたか？', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, scale_min_label: '全く興味なし', scale_max_label: '非常に興味あり', allow_multiple: false, max_selections: 0 },
      { text: 'コンセプトのどの点が最も魅力的でしたか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '感じた課題や懸念点を教えてください', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: '実際に利用・購入する可能性はありますか？', question_type: 'multiple_choice', options: ['高い', 'やや高い', 'どちらともいえない', 'やや低い', '低い'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'このコンセプトを改善するとしたら何を変えますか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
    ],
  },
  {
    name: 'ブランド認知',
    description: 'ブランドイメージや認知度の把握',
    emoji: '🏷️',
    questions: [
      { text: 'このブランドをどこで知りましたか？', question_type: 'multiple_choice', options: ['SNS', 'Web広告', '口コミ・紹介', '店頭', 'テレビ・雑誌', 'その他'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'このブランドにどのようなイメージを持っていますか？', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'ブランドへの信頼度を評価してください', question_type: 'scale_rating', options: [], scale_min: 1, scale_max: 5, scale_min_label: '全く信頼しない', scale_max_label: '非常に信頼する', allow_multiple: false, max_selections: 0 },
      { text: 'このブランドの製品を購入・利用したことはありますか？', question_type: 'multiple_choice', options: ['複数回ある', '1回ある', 'ない'], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
      { text: 'このブランドに期待することを教えてください', question_type: 'free_text', options: [], scale_min: 1, scale_max: 5, allow_multiple: false, max_selections: 0 },
    ],
  },
]

const TYPE_ICON: Record<QuestionType, React.ElementType> = {
  multiple_choice: List,
  free_text: FileText,
  scale_rating: SlidersHorizontal,
}

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: '選択式',
  free_text: '自由記述',
  scale_rating: 'スケール',
}

export default function SurveyTemplates() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useAppStore()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [presetInitial, setPresetInitial] = useState<Partial<SurveyTemplate> | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(true)

  function openPreset(preset: PresetDef) {
    setPresetInitial({
      name: preset.name,
      questions: preset.questions.map(q => ({ ...q, id: generateId() })),
    })
    setCreating(true)
  }

  if (creating) {
    return (
      <TemplateEditor
        initial={presetInitial ? { id: '', name: presetInitial.name ?? '', questions: presetInitial.questions ?? [], images: [], created_at: '', updated_at: '' } : undefined}
        isPreset={!!presetInitial}
        onSave={async (t) => { await addTemplate(t); setCreating(false); setPresetInitial(null) }}
        onCancel={() => { setCreating(false); setPresetInitial(null) }}
      />
    )
  }

  if (editingId) {
    const tmpl = templates.find(t => t.id === editingId)
    if (!tmpl) { setEditingId(null); return null }
    return (
      <TemplateEditor
        initial={tmpl}
        onSave={async (t) => { await updateTemplate(t); setEditingId(null) }}
        onCancel={() => setEditingId(null)}
      />
    )
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">アンケート設問</h2>
          <p className="text-sm text-gray-400 mt-0.5">{templates.length}件のテンプレート</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus size={16} /> 新規作成
        </button>
      </div>

      {/* デフォルトプリセット */}
      <div className="mb-8 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100 rounded-2xl overflow-hidden">
        <button
          onClick={() => setPresetsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-teal-50/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-teal-500" />
            <span className="text-sm font-semibold text-teal-800">デフォルトプリセット</span>
            <span className="text-xs text-teal-500">{SURVEY_PRESETS.length}種類</span>
          </div>
          {presetsOpen
            ? <ChevronUp size={15} className="text-teal-400" />
            : <ChevronDown size={15} className="text-teal-400" />}
        </button>
        {presetsOpen && (
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SURVEY_PRESETS.map(preset => (
              <div key={preset.name} className="bg-white rounded-xl border border-teal-100 p-4 flex items-start justify-between gap-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xl shrink-0 mt-0.5">{preset.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{preset.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{preset.description}</p>
                    <p className="text-xs text-teal-500 mt-1 font-medium">{preset.questions.length}問</p>
                  </div>
                </div>
                <button
                  onClick={() => openPreset(preset)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-xs font-medium transition-colors"
                >
                  <Plus size={12} /> 使う
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 空状態 */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
            <ClipboardList size={32} className="text-teal-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">テンプレートがありません</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs">
            上のプリセットを使うか、新規作成でテンプレートを追加しましょう
          </p>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm"
          >
            <Plus size={16} /> はじめて作成する
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map(t => {
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-gray-900 text-base">{t.name}</h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                          {t.questions.length}問
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">作成: {formatDate(t.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(t.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg hover:bg-teal-100 transition-colors font-medium"
                    >
                      <Edit3 size={13} /> 編集
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`「${t.name}」を削除しますか？`)) deleteTemplate(t.id)
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* 設問プレビュー */}
                {t.questions.length > 0 && (
                  <div className="space-y-1.5 border-t border-gray-100 pt-4">
                    {t.questions.slice(0, 3).map((q, i) => {
                      const Icon = TYPE_ICON[q.question_type]
                      return (
                        <div key={q.id} className="flex items-center gap-2.5 text-sm text-gray-500">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs flex items-center justify-center font-medium">
                            {i + 1}
                          </span>
                          <Icon size={12} className="flex-shrink-0 text-gray-300" />
                          <span className="truncate">{q.text || '(未入力)'}</span>
                          <span className="flex-shrink-0 text-xs text-gray-300">{TYPE_LABEL[q.question_type]}</span>
                        </div>
                      )
                    })}
                    {t.questions.length > 3 && (
                      <p className="text-xs text-gray-400 pl-7">他 {t.questions.length - 3} 問...</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// テンプレートエディター
// ============================================================

function TemplateEditor({
  initial,
  isPreset,
  onSave,
  onCancel,
}: {
  initial?: SurveyTemplate
  isPreset?: boolean
  onSave: (t: SurveyTemplate) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? [])
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropBeforeIdx, setDropBeforeIdx] = useState<number | null>(null)

  function addQuestion() {
    setQuestions(prev => [...prev, {
      id: generateId(),
      text: '',
      question_type: 'multiple_choice',
      options: ['選択肢1', '選択肢2'],
      scale_min: 1,
      scale_max: 5,
      scale_min_label: '',
      scale_max_label: '',
      allow_multiple: false,
      max_selections: 0,
    }])
  }

  function updateQ<K extends keyof Question>(idx: number, key: K, val: Question[K]) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [key]: val } : q))
  }

  function removeQ(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  function addOption(idx: number) {
    const q = questions[idx]
    updateQ(idx, 'options', [...q.options, `選択肢${q.options.length + 1}`])
  }

  function removeOption(qIdx: number, optIdx: number) {
    const q = questions[qIdx]
    updateQ(qIdx, 'options', q.options.filter((_, i) => i !== optIdx))
  }

  function updateOption(qIdx: number, optIdx: number, val: string) {
    const q = questions[qIdx]
    const opts = [...q.options]
    opts[optIdx] = val
    updateQ(qIdx, 'options', opts)
  }

  function moveQuestion(from: number, insertBefore: number) {
    if (from === insertBefore || from === insertBefore - 1) return
    setQuestions(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      const to = insertBefore > from ? insertBefore - 1 : insertBefore
      next.splice(to, 0, item)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    setNameError(false)
    setSaving(true)
    try {
      const ts = now()
      await onSave({
        id: (isPreset || !initial?.id) ? generateId() : initial.id,
        name: name.trim(),
        questions,
        images: (!isPreset && initial?.images) ? initial.images : [],
        created_at: (!isPreset && initial?.created_at) ? initial.created_at : ts,
        updated_at: ts,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* スティッキーヘッダー */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={16} />
            <span>戻る</span>
          </button>
          <h2 className="text-base font-semibold text-gray-900">
            {isPreset ? 'プリセットから作成' : initial ? 'テンプレートを編集' : '新規テンプレート'}
          </h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-3">
        {/* テンプレート名カード */}
        <div className="bg-white rounded-2xl border-t-4 border-teal-500 shadow-sm p-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            テンプレート名 <span className="text-red-400">*</span>
          </label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); if (e.target.value.trim()) setNameError(false) }}
            placeholder="例: 新製品コンセプト調査"
            className={`w-full text-xl font-medium border-0 border-b-2 px-0 py-2 focus:outline-none transition-colors bg-transparent ${
              nameError ? 'border-red-300 placeholder-red-300' : 'border-gray-200 focus:border-teal-500 placeholder-gray-300'
            }`}
          />
          {nameError && <p className="mt-1.5 text-xs text-red-500">テンプレート名を入力してください</p>}
          <p className="mt-3 text-xs text-gray-400">{questions.length}問 · ドラッグで設問を並び替えられます</p>
        </div>

        {/* 設問一覧 */}
        <div
          onDragOver={e => e.preventDefault()}
          onDragLeave={() => setDropBeforeIdx(null)}
        >
          {questions.map((q, idx) => (
            <div key={q.id}>
              {/* ドロップゾーン: カードの上（idx番の前） */}
              <div
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropBeforeIdx(idx) }}
                onDrop={e => {
                  e.preventDefault()
                  if (dragIdx !== null) moveQuestion(dragIdx, idx)
                  setDragIdx(null); setDropBeforeIdx(null)
                }}
                className={`h-2 mx-2 rounded-full transition-all duration-150 ${
                  dropBeforeIdx === idx && dragIdx !== idx && dragIdx !== idx - 1
                    ? 'bg-teal-400 h-3 shadow-sm shadow-teal-200'
                    : 'bg-transparent'
                }`}
              />
              <QuestionCard
                q={q}
                idx={idx}
                isDragging={dragIdx === idx}
                onDragStart={() => { setDragIdx(idx); setDropBeforeIdx(null) }}
                onUpdate={updateQ}
                onRemove={removeQ}
                onAddOption={addOption}
                onRemoveOption={removeOption}
                onUpdateOption={updateOption}
              />
            </div>
          ))}
          {/* 最後の設問の下のドロップゾーン */}
          {questions.length > 0 && (
            <div
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropBeforeIdx(questions.length) }}
              onDrop={e => {
                e.preventDefault()
                if (dragIdx !== null) moveQuestion(dragIdx, questions.length)
                setDragIdx(null); setDropBeforeIdx(null)
              }}
              className={`h-2 mx-2 rounded-full transition-all duration-150 mt-0.5 ${
                dropBeforeIdx === questions.length && dragIdx !== questions.length - 1
                  ? 'bg-teal-400 h-3 shadow-sm shadow-teal-200'
                  : 'bg-transparent'
              }`}
            />
          )}
        </div>

        {/* 設問追加ボタン */}
        <button
          onClick={addQuestion}
          className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/50 transition-colors flex items-center justify-center gap-2 font-medium"
        >
          <Plus size={16} /> 設問を追加する
        </button>

        {questions.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-2xl disabled:opacity-40 transition-colors text-base shadow-sm"
          >
            {saving ? '保存中...' : `${questions.length}問で保存する`}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 設問カード
// ============================================================

interface QuestionCardProps {
  q: Question
  idx: number
  isDragging: boolean
  onDragStart: () => void
  onUpdate: <K extends keyof Question>(idx: number, key: K, val: Question[K]) => void
  onRemove: (idx: number) => void
  onAddOption: (idx: number) => void
  onRemoveOption: (qIdx: number, optIdx: number) => void
  onUpdateOption: (qIdx: number, optIdx: number, val: string) => void
}

function QuestionCard({
  q, idx, isDragging,
  onDragStart,
  onUpdate, onRemove, onAddOption, onRemoveOption, onUpdateOption,
}: QuestionCardProps) {
  const scaleNums = Array.from(
    { length: Math.min(q.scale_max - q.scale_min + 1, 11) },
    (_, i) => q.scale_min + i,
  )
  const scaleOverflow = q.scale_max - q.scale_min + 1 > 11

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm transition-all ring-1 ring-gray-200 ${
        isDragging ? 'opacity-40 scale-[0.99]' : ''
      }`}
    >
      {/* ヘッダー行: グリップ | Q番号 | タイプセレクト | 削除 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        {/* ドラッグハンドル */}
        <div
          draggable
          onDragStart={onDragStart}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-400 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          title="ドラッグして並び替え"
        >
          <GripVertical size={16} />
        </div>
        <span className="text-xs font-bold text-teal-600 shrink-0 w-6">Q{idx + 1}</span>
        {/* 質問文 — ヘッダーに一体化 */}
        <input
          value={q.text}
          onChange={e => onUpdate(idx, 'text', e.target.value)}
          placeholder="質問文を入力してください..."
          className="flex-1 text-sm font-medium text-gray-800 focus:outline-none placeholder-gray-300 bg-transparent"
        />
        {/* タイプセレクト */}
        <select
          value={q.question_type}
          onChange={e => onUpdate(idx, 'question_type', e.target.value as QuestionType)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-200 cursor-pointer shrink-0"
        >
          <option value="multiple_choice">📋 選択式</option>
          <option value="free_text">✏️ 自由記述</option>
          <option value="scale_rating">📊 スケール</option>
        </select>
        <button
          onClick={() => onRemove(idx)}
          className="p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* ボディ */}
      <div className="px-5 py-4">

        {/* ── 選択式 ── */}
        {q.question_type === 'multiple_choice' && (
          <div>
            <div className="space-y-1.5 mb-3">
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-3 group/opt">
                  {q.allow_multiple
                    ? <span className="w-[18px] h-[18px] rounded border-2 border-gray-300 shrink-0 bg-white" />
                    : <span className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 shrink-0 bg-white" />
                  }
                  <input
                    value={opt}
                    onChange={e => onUpdateOption(idx, optIdx, e.target.value)}
                    className="flex-1 text-sm text-gray-700 border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none py-1.5 bg-transparent transition-colors"
                    placeholder={`選択肢 ${optIdx + 1}`}
                  />
                  {q.options.length > 2 && (
                    <button
                      onClick={() => onRemoveOption(idx, optIdx)}
                      className="opacity-0 group-hover/opt:opacity-100 p-0.5 text-gray-300 hover:text-red-400 rounded transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              {/* 選択肢追加行（Googleフォーム風） */}
              <div className="flex items-center gap-3 pt-1">
                {q.allow_multiple
                  ? <span className="w-[18px] h-[18px] rounded border-2 border-gray-200 shrink-0" />
                  : <span className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 shrink-0" />
                }
                <button
                  onClick={() => onAddOption(idx)}
                  className="text-sm text-gray-400 hover:text-teal-600 transition-colors text-left"
                >
                  選択肢を追加...
                </button>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer w-fit select-none">
                <input
                  type="checkbox"
                  checked={q.allow_multiple}
                  onChange={e => onUpdate(idx, 'allow_multiple', e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-400"
                />
                複数選択を許可する（チェックボックス形式）
              </label>
            </div>
          </div>
        )}

        {/* ── 自由記述 ── */}
        {q.question_type === 'free_text' && (
          <div>
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">
              <p className="mb-3 text-xs font-medium text-gray-500">回答欄プレビュー</p>
              <div className="space-y-1">
                <div className="h-px bg-gray-300 w-full" />
                <div className="h-px bg-gray-200 w-3/4" />
                <div className="h-px bg-gray-200 w-1/2" />
              </div>
              <p className="mt-2 text-xs text-gray-400">回答者がここに自由に記述します</p>
            </div>
          </div>
        )}

        {/* ── スケール ── */}
        {q.question_type === 'scale_rating' && (
          <div className="space-y-5">
            {/* 数値ボタンプレビュー */}
            <div className="bg-gray-50 rounded-xl px-4 py-4">
              <p className="text-xs font-medium text-gray-500 mb-3">回答プレビュー</p>
              <div className="flex flex-wrap gap-2 justify-center mb-2">
                {scaleNums.map(n => (
                  <div
                    key={n}
                    className="w-10 h-10 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center text-sm font-semibold text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors cursor-default"
                  >
                    {n}
                  </div>
                ))}
                {scaleOverflow && (
                  <div className="w-10 h-10 flex items-center justify-center text-gray-400 text-xs">
                    ···
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs px-1">
                <span className={q.scale_min_label ? 'text-teal-600 font-medium' : 'text-gray-400'}>
                  {q.scale_min}{q.scale_min_label ? ` — ${q.scale_min_label}` : ''}
                </span>
                <span className={q.scale_max_label ? 'text-teal-600 font-medium' : 'text-gray-400'}>
                  {q.scale_max_label ? `${q.scale_max_label} — ` : ''}{q.scale_max}
                </span>
              </div>
            </div>

            {/* 設定エリア */}
            <div className="space-y-4">
              {/* 数値範囲 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">数値範囲</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-xs text-gray-500 whitespace-nowrap">最小値</label>
                    <input
                      type="number"
                      value={q.scale_min}
                      onChange={e => onUpdate(idx, 'scale_min', parseInt(e.target.value, 10))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                    />
                  </div>
                  <span className="text-gray-300 text-lg">〜</span>
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-xs text-gray-500 whitespace-nowrap">最大値</label>
                    <input
                      type="number"
                      value={q.scale_max}
                      onChange={e => onUpdate(idx, 'scale_max', parseInt(e.target.value, 10))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                    />
                  </div>
                </div>
              </div>
              {/* 端点ラベル */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">端点ラベル <span className="font-normal text-gray-400">（任意）</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">{q.scale_min}（最小値）の説明</label>
                    <input
                      type="text"
                      value={q.scale_min_label ?? ''}
                      onChange={e => onUpdate(idx, 'scale_min_label', e.target.value)}
                      placeholder="例: 全く思わない"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">{q.scale_max}（最大値）の説明</label>
                    <input
                      type="text"
                      value={q.scale_max_label ?? ''}
                      onChange={e => onUpdate(idx, 'scale_max_label', e.target.value)}
                      placeholder="例: 強くそう思う"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
