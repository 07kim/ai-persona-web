import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Download, Upload, X, Edit3, MapPin, Heart, AlertCircle, Target, ChevronRight, Users, Gamepad2, Film, Smartphone, Clock, MessageCircle, Sparkles, Filter } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { downloadJson, genderLabel, countryName, now } from '../lib/utils'
import { generateId } from '../lib/utils'
import { generateAutoTags } from '../lib/autoTags'
import type { Persona } from '../types'

const AVATAR_PALETTES = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700', accent: '#6366f1' },
  { bg: 'bg-teal-100', text: 'text-teal-700', accent: '#14b8a6' },
  { bg: 'bg-rose-100', text: 'text-rose-700', accent: '#f43f5e' },
  { bg: 'bg-amber-100', text: 'text-amber-700', accent: '#f59e0b' },
  { bg: 'bg-violet-100', text: 'text-violet-700', accent: '#8b5cf6' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', accent: '#06b6d4' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', accent: '#10b981' },
  { bg: 'bg-orange-100', text: 'text-orange-700', accent: '#f97316' },
  { bg: 'bg-pink-100', text: 'text-pink-700', accent: '#ec4899' },
  { bg: 'bg-sky-100', text: 'text-sky-700', accent: '#0ea5e9' },
]

function getPalette(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

export default function PersonaList() {
  const { personas, deletePersona, addPersonas } = useAppStore()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterGender, setFilterGender] = useState<string>('')
  const [filterAgeMin, setFilterAgeMin] = useState('')
  const [filterAgeMax, setFilterAgeMax] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [importError, setImportError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  // グループ一覧
  const groups = Array.from(new Set(personas.map(p => p.group).filter(Boolean))) as string[]

  const filtered = personas.filter(p => {
    const textMatch = `${p.name} ${p.occupation} ${p.city ?? ''} ${p.tags.join(' ')} ${p.background} ${p.values.join(' ')} ${p.goals.join(' ')}`
      .toLowerCase().includes(search.toLowerCase())
    const genderMatch = !filterGender || p.gender === filterGender
    const ageMin = filterAgeMin ? parseInt(filterAgeMin) : 0
    const ageMax = filterAgeMax ? parseInt(filterAgeMax) : 999
    const ageMatch = p.age >= ageMin && p.age <= ageMax
    const groupMatch = !filterGroup || p.group === filterGroup
    return textMatch && genderMatch && ageMatch && groupMatch
  })

  const activeFilterCount = [filterGender, filterAgeMin, filterAgeMax, filterGroup].filter(Boolean).length

  const selected = personas.find(p => p.id === selectedId) ?? null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleDelete(id: string) {
    await deletePersona(id)
    if (selectedId === id) setSelectedId(null)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const list: Persona[] = Array.isArray(data) ? data : data.personas ?? []
      if (!list.length) { setImportError('有効なペルソナデータが見つかりませんでした'); return }
      const ts = now()
      const imported: Persona[] = list.map(p => ({
        ...p,
        id: p.id ?? generateId(),
        tags: p.tags?.length ? p.tags : generateAutoTags(p),
        created_at: p.created_at ?? ts,
        updated_at: ts,
      }))
      // 既存IDと重複しないものだけ追加
      const existingIds = new Set(personas.map(p => p.id))
      const toAdd = imported.filter(p => !existingIds.has(p.id))
      if (!toAdd.length) { setImportError('インポートするペルソナがすでに全て存在します'); return }
      await addPersonas(toAdd)
    } catch {
      setImportError('JSONの解析に失敗しました。正しい形式のファイルを選択してください')
    }
    if (importRef.current) importRef.current.value = ''
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">ペルソナ管理</h2>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} / {personas.length}件</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => downloadJson(personas, 'personas.json')}
            disabled={!personas.length}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={14} /> エクスポート
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload size={14} /> インポート
          </button>
          <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <Link
            to="/personas/compare"
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            比較
          </Link>
          <Link
            to="/personas/new"
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus size={14} /> 手動作成
          </Link>
          <Link
            to="/personas/generate"
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> AIで生成
          </Link>
        </div>
      </div>

      {importError && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{importError}</div>
      )}

      {/* 検索 + フィルター */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="名前・職業・タグ・価値観で絞り込む"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          />
        </div>
        <button
          onClick={() => setShowFilter(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border transition-colors ${
            showFilter || activeFilterCount > 0
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter size={14} />
          フィルター
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* フィルターパネル */}
      {showFilter && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">性別</p>
            <select
              value={filterGender}
              onChange={e => setFilterGender(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">すべて</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">年齢（以上）</p>
            <input
              type="number"
              value={filterAgeMin}
              onChange={e => setFilterAgeMin(e.target.value)}
              placeholder="例: 20"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">年齢（以下）</p>
            <input
              type="number"
              value={filterAgeMax}
              onChange={e => setFilterAgeMax(e.target.value)}
              placeholder="例: 40"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">グループ</p>
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">すべて</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterGender(''); setFilterAgeMin(''); setFilterAgeMax(''); setFilterGroup('') }}
              className="col-span-full text-xs text-red-500 hover:text-red-700 text-left"
            >
              フィルターをリセット
            </button>
          )}
        </div>
      )}

      {/* カードグリッド */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {personas.length === 0 ? (
            <div className="space-y-3">
              <p className="text-base">まだペルソナがありません</p>
              <Link
                to="/personas/generate"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus size={14} /> ペルソナを生成する
              </Link>
            </div>
          ) : (
            <p>条件に一致するペルソナが見つかりません</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <PersonaCard
              key={p.id}
              persona={p}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>
      )}

      {/* 詳細オーバーレイ */}
      {selected && (
        <PersonaOverlay
          persona={selected}
          onClose={() => setSelectedId(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

/* ── カード ── */
function PersonaCard({ persona: p, onClick }: { persona: Persona; onClick: () => void }) {
  const pal = getPalette(p.id)
  const MAX_TAGS = 4
  const visibleTags = p.tags.slice(0, MAX_TAGS)
  const hiddenTagCount = p.tags.length - MAX_TAGS

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all text-left w-full group"
    >
      {/* アバターバー */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0 ${pal.bg} ${pal.text}`}>
            {p.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 leading-tight">{p.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{p.age}歳 · {genderLabel(p.gender)}</p>
          </div>
          <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
        </div>

        {/* 職業・場所 */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-700">{p.occupation}</span>
          {(p.city || p.country) && (
            <span className="flex items-center gap-0.5 text-gray-400">
              <MapPin size={10} />
              {[p.city, p.country ? countryName(p.country) : ''].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* 背景 */}
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-3">
          {p.background}
        </p>

        {/* 価値観プレビュー */}
        {p.values.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {p.values.slice(0, 3).map((v, i) => (
              <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                {v}
              </span>
            ))}
            {p.values.length > 3 && (
              <span className="text-xs text-gray-400">+{p.values.length - 3}</span>
            )}
          </div>
        )}

        {/* タグ */}
        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map(tag => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            {hiddenTagCount > 0 && (
              <span className="text-xs text-gray-400 px-1 py-0.5">+{hiddenTagCount}</span>
            )}
          </div>
        )}
      </div>

      {/* 下部バー：課題・目標サマリー */}
      <div className="mt-auto border-t border-gray-100 px-5 py-2.5 flex gap-4">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <AlertCircle size={11} className="text-amber-400" />
          課題 {p.pain_points.length}件
        </span>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Target size={11} className="text-teal-400" />
          目標 {p.goals.length}件
        </span>
      </div>
    </button>
  )
}

/* ── 詳細オーバーレイ ── */
function PersonaOverlay({
  persona: p,
  onClose,
  onDelete,
}: {
  persona: Persona
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const pal = getPalette(p.id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete() {
    onDelete(p.id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in">
        {/* ヘッダー */}
        <div className="px-7 pt-7 pb-5 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 ${pal.bg} ${pal.text}`}>
                {p.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {p.age}歳 · {genderLabel(p.gender)} · {p.occupation}
                </p>
                {(p.city || p.country) && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={11} />
                    {[p.city, p.country ? countryName(p.country) : ''].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <Link
                to={`/personas/${p.id}`}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={onClose}
              >
                <Edit3 size={13} /> 編集
              </Link>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* スクロールコンテンツ */}
        <div className="flex-1 overflow-y-auto px-7 pb-7 space-y-6">

          {/* 背景・経歴 */}
          <Section title="背景・経歴" color="gray">
            <p className="text-sm text-gray-700 leading-relaxed">{p.background}</p>
          </Section>

          {/* 価値観 */}
          {p.values.length > 0 && (
            <Section title="価値観・信念" icon={<Heart size={14} className="text-rose-400" />} color="rose">
              <div className="flex flex-wrap gap-2">
                {p.values.map((v, i) => (
                  <span key={i} className="text-sm bg-rose-50 text-rose-700 border border-rose-100 px-3 py-1 rounded-full">
                    {v}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* 課題・悩み */}
          {p.pain_points.length > 0 && (
            <Section title="課題・悩み" icon={<AlertCircle size={14} className="text-amber-400" />} color="amber">
              <ul className="space-y-2">
                {p.pain_points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {pt}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 目標・願望 */}
          {p.goals.length > 0 && (
            <Section title="目標・願望" icon={<Target size={14} className="text-teal-500" />} color="teal">
              <ul className="space-y-2">
                {p.goals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {g}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* エピソード */}
          {p.personal_episode && (
            <Section title="エピソード・口癖" icon={<MessageCircle size={14} className="text-violet-400" />} color="violet">
              <p className="text-sm text-gray-700 leading-relaxed italic">「{p.personal_episode}」</p>
            </Section>
          )}

          {/* 家族構成 */}
          {p.family && (
            <Section title="家族構成" icon={<Users size={14} className="text-blue-400" />} color="blue">
              <p className="text-sm text-gray-700">{p.family}</p>
            </Section>
          )}

          {/* 1日のルーティン */}
          {p.daily_routine && (
            <Section title="典型的な1日" icon={<Clock size={14} className="text-orange-400" />} color="orange">
              <p className="text-sm text-gray-700 leading-relaxed">{p.daily_routine}</p>
            </Section>
          )}

          {/* 趣味 */}
          {p.hobbies && p.hobbies.length > 0 && (
            <Section title="趣味・日課" icon={<Gamepad2 size={14} className="text-emerald-400" />} color="emerald">
              <div className="flex flex-wrap gap-2">
                {p.hobbies.map((h, i) => (
                  <span key={i} className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full">{h}</span>
                ))}
              </div>
            </Section>
          )}

          {/* 好きなコンテンツ */}
          {p.favorite_content && p.favorite_content.length > 0 && (
            <Section title="好きなコンテンツ" icon={<Film size={14} className="text-pink-400" />} color="pink">
              <div className="flex flex-wrap gap-2">
                {p.favorite_content.map((c, i) => (
                  <span key={i} className="text-sm bg-pink-50 text-pink-700 border border-pink-100 px-3 py-1 rounded-full">{c}</span>
                ))}
              </div>
            </Section>
          )}

          {/* コンテンツからの影響 */}
          {p.content_influence && (
            <Section title="コンテンツが与えた影響" icon={<Sparkles size={14} className="text-fuchsia-400" />} color="fuchsia">
              <p className="text-sm text-gray-700 leading-relaxed">{p.content_influence}</p>
            </Section>
          )}

          {/* アプリ・スマホ */}
          {(p.apps_used?.length || p.screen_time) && (
            <Section title="スマホ・アプリ" icon={<Smartphone size={14} className="text-sky-400" />} color="sky">
              {p.screen_time && <p className="text-sm text-gray-500 mb-2">{p.screen_time}</p>}
              {p.apps_used && p.apps_used.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.apps_used.map((a, i) => (
                    <span key={i} className="text-sm bg-sky-50 text-sky-700 border border-sky-100 px-3 py-1 rounded-full">{a}</span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* タグ */}
          {p.tags.length > 0 && (
            <Section title="タグ" color="gray">
              <div className="flex flex-wrap gap-1.5">
                {p.tags.map(tag => (
                  <span key={tag} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* 削除 */}
          <div className="pt-2 border-t border-gray-100">
            {confirmDelete ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-600 flex-1">本当に削除しますか？</p>
                <button
                  onClick={handleDelete}
                  className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  削除する
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 transition-colors"
              >
                <Trash2 size={14} /> このペルソナを削除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  color,
  children,
}: {
  title: string
  icon?: React.ReactNode
  color: 'gray' | 'rose' | 'amber' | 'teal' | 'violet' | 'blue' | 'orange' | 'emerald' | 'pink' | 'sky' | 'fuchsia'
  children: React.ReactNode
}) {
  const bar = {
    gray: 'bg-gray-400',
    rose: 'bg-rose-400',
    amber: 'bg-amber-400',
    teal: 'bg-teal-400',
    violet: 'bg-violet-400',
    blue: 'bg-blue-400',
    orange: 'bg-orange-400',
    emerald: 'bg-emerald-400',
    pink: 'bg-pink-400',
    sky: 'bg-sky-400',
    fuchsia: 'bg-fuchsia-400',
  }[color]

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`w-0.5 h-4 rounded-full ${bar}`} />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
        {icon}
      </div>
      {children}
    </div>
  )
}
