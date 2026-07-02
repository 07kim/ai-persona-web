import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { Persona } from '../types'
import { X, Plus, ArrowLeft } from 'lucide-react'

const MAX_COMPARE = 3

const COMPARE_FIELDS: { key: keyof Persona; label: string }[] = [
  { key: 'age', label: '年齢' },
  { key: 'gender', label: '性別' },
  { key: 'occupation', label: '職業' },
  { key: 'country', label: '国' },
  { key: 'city', label: '都市' },
  { key: 'background', label: '背景' },
  { key: 'values', label: '価値観' },
  { key: 'pain_points', label: 'ペインポイント' },
  { key: 'goals', label: 'ゴール' },
  { key: 'family', label: '家族構成' },
  { key: 'hobbies', label: '趣味・日課' },
  { key: 'apps_used', label: 'よく使うアプリ' },
  { key: 'personal_episode', label: '人物エピソード' },
]

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
]

function getAvatarColor(idx: number) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length]
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'number') return String(value)
  return String(value)
}

export default function PersonaCompare() {
  const navigate = useNavigate()
  const { personas } = useAppStore()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const selected = selectedIds.map(id => personas.find(p => p.id === id)).filter(Boolean) as Persona[]

  const available = personas.filter(p =>
    !selectedIds.includes(p.id) &&
    (search === '' || p.name.includes(search) || p.occupation.includes(search))
  )

  function addPersona(id: string) {
    if (selectedIds.length >= MAX_COMPARE) return
    setSelectedIds(prev => [...prev, id])
  }

  function removePersona(id: string) {
    setSelectedIds(prev => prev.filter(x => x !== id))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-lg font-bold text-gray-900">ペルソナ比較</h2>
        </div>
        <p className="text-xs text-gray-400 ml-9">最大{MAX_COMPARE}人のペルソナを横並びで比較できます</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左: 選択ペイン */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-200 shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              比較に追加 ({selectedIds.length}/{MAX_COMPARE})
            </p>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="名前・職業で検索"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {available.map(p => (
              <button
                key={p.id}
                onClick={() => addPersona(p.id)}
                disabled={selectedIds.length >= MAX_COMPARE}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{p.age}歳 · {p.occupation}</p>
                </div>
                <Plus size={12} className="text-gray-300 group-hover:text-indigo-400 shrink-0" />
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                {search ? '一致するペルソナがありません' : '全ペルソナ選択済み'}
              </p>
            )}
          </div>
        </div>

        {/* 右: 比較テーブル */}
        <div className="flex-1 overflow-auto">
          {selected.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              左のペルソナを選択して比較を始めてください
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32 border-r border-gray-100">
                    項目
                  </th>
                  {selected.map((p, idx) => (
                    <th key={p.id} className="px-4 py-3 border-r border-gray-100 last:border-r-0 min-w-48">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(idx)}`}>
                            {p.name.charAt(0)}
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-gray-900">{p.name}</p>
                            <p className="text-[10px] text-gray-400 font-normal">{p.age}歳 · {p.occupation}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removePersona(p.id)}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map((field, rowIdx) => (
                  <tr key={field.key} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-500 border-r border-gray-100 align-top whitespace-nowrap">
                      {field.label}
                    </td>
                    {selected.map(p => (
                      <td key={p.id} className="px-4 py-3 text-xs text-gray-700 border-r border-gray-100 last:border-r-0 align-top leading-relaxed">
                        {renderValue(p[field.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* タグ */}
                <tr className="bg-white">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-500 border-r border-gray-100 align-top whitespace-nowrap">
                    タグ
                  </td>
                  {selected.map(p => (
                    <td key={p.id} className="px-4 py-3 border-r border-gray-100 last:border-r-0 align-top">
                      {p.tags && p.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
