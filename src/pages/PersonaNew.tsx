import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, Plus, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { generateId, now } from '../lib/utils'
import { generateAutoTags } from '../lib/autoTags'
import type { Persona } from '../types'

const EMPTY: Omit<Persona, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  age: 30,
  gender: undefined,
  country: 'JP',
  city: '',
  occupation: '',
  background: '',
  values: [],
  pain_points: [],
  goals: [],
  tags: [],
  family: '',
  hobbies: [],
  favorite_content: [],
  apps_used: [],
  screen_time: '',
  personal_episode: '',
  daily_routine: '',
  content_influence: '',
}

export default function PersonaNew() {
  const navigate = useNavigate()
  const { addPersonas } = useAppStore()
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY })
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  function update(partial: Partial<typeof EMPTY>) {
    setForm(f => ({ ...f, ...partial }))
  }

  function setListItem(key: 'values' | 'pain_points' | 'goals', idx: number, val: string) {
    const arr = [...form[key]]
    arr[idx] = val
    update({ [key]: arr })
  }
  function removeListItem(key: 'values' | 'pain_points' | 'goals', idx: number) {
    update({ [key]: form[key].filter((_, i) => i !== idx) })
  }
  function addListItem(key: 'values' | 'pain_points' | 'goals') {
    update({ [key]: [...form[key], ''] })
  }

  function setOptItem(key: 'hobbies' | 'favorite_content' | 'apps_used', idx: number, val: string) {
    const arr = [...(form[key] ?? [])]
    arr[idx] = val
    update({ [key]: arr })
  }
  function removeOptItem(key: 'hobbies' | 'favorite_content' | 'apps_used', idx: number) {
    update({ [key]: (form[key] ?? []).filter((_, i) => i !== idx) })
  }
  function addOptItem(key: 'hobbies' | 'favorite_content' | 'apps_used') {
    update({ [key]: [...(form[key] ?? []), ''] })
  }

  async function handleSave() {
    const errs: string[] = []
    if (!form.name.trim()) errs.push('名前は必須です')
    if (!form.occupation.trim()) errs.push('職業は必須です')
    if (errs.length) { setErrors(errs); return }

    const ts = now()
    const autoTags = generateAutoTags(form)
    const mergedTags = Array.from(new Set([...form.tags, ...autoTags]))
    const persona: Persona = {
      ...form,
      name: form.name.trim(),
      occupation: form.occupation.trim(),
      tags: mergedTags,
      id: generateId(),
      created_at: ts,
      updated_at: ts,
    }
    await addPersonas([persona])
    navigate(`/personas/${persona.id}`)
  }

  const inputClass = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white'
  const textareaClass = `${inputClass} resize-none`

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/personas" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} /> 一覧へ戻る
        </Link>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Save size={14} /> 保存する
        </button>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-1">ペルソナを手動作成</h2>
      <p className="text-sm text-gray-400 mb-6">入力した内容はブラウザに保存され、リロードしても消えません</p>

      {/* バリデーションエラー */}
      {errors.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
          {errors.map((e, i) => <p key={i} className="text-sm text-red-600">{e}</p>)}
        </div>
      )}

      {/* 基本情報 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">基本情報</p>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">名前 <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={e => update({ name: e.target.value })} className={inputClass} placeholder="山田 花子" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">年齢</label>
            <input type="number" value={form.age} onChange={e => update({ age: parseInt(e.target.value, 10) || 0 })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">性別</label>
            <select value={form.gender ?? ''} onChange={e => update({ gender: (e.target.value as 'male'|'female'|'other') || undefined })} className={inputClass}>
              <option value="">未設定</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">居住地</label>
            <input value={form.city ?? ''} onChange={e => update({ city: e.target.value })} className={inputClass} placeholder="東京" />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">職業 <span className="text-red-400">*</span></label>
          <input value={form.occupation} onChange={e => update({ occupation: e.target.value })} className={inputClass} placeholder="Webデザイナー" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">背景・経歴</label>
          <textarea value={form.background} onChange={e => update({ background: e.target.value })} rows={4} className={textareaClass} placeholder="この人物の経歴、生活状況、価値観の背景など" />
        </div>
      </div>

      {/* 価値観・課題・目標 */}
      {(['values', 'pain_points', 'goals'] as const).map(key => {
        const labels = { values: '価値観', pain_points: '課題・悩み', goals: '目標・願望' }
        const placeholders = { values: '例：家族との時間を最優先にする', pain_points: '例：仕事と育児の両立が難しい', goals: '例：3年以内にフリーランスになる' }
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{labels[key]}</p>
            <ul className="space-y-2">
              {form[key].map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={e => setListItem(key, idx, e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder={placeholders[key]}
                  />
                  <button onClick={() => removeListItem(key, idx)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => addListItem(key)} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
              <Plus size={12} /> 追加
            </button>
          </div>
        )
      })}

      {/* タグ */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">タグ</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map((tag, idx) => (
            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
              {tag}
              <button onClick={() => update({ tags: form.tags.filter((_, i) => i !== idx) })} className="text-gray-400 hover:text-red-400">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <input
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newTag.trim()) {
              update({ tags: [...form.tags, newTag.trim()] })
              setNewTag('')
            }
          }}
          placeholder="タグを入力してEnter"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {/* 具体的な人物像 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">具体的な人物像</p>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">家族構成</label>
          <input value={form.family ?? ''} onChange={e => update({ family: e.target.value })} className={inputClass} placeholder="例：既婚、子ども2人（8歳・5歳）" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">エピソード・口癖</label>
          <textarea value={form.personal_episode ?? ''} onChange={e => update({ personal_episode: e.target.value })} rows={3} className={textareaClass} placeholder="その人らしいエピソードや口癖（100〜200字）" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">典型的な1日</label>
          <textarea value={form.daily_routine ?? ''} onChange={e => update({ daily_routine: e.target.value })} rows={3} className={textareaClass} placeholder="朝〜夜の過ごし方" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">スマホ利用</label>
          <input value={form.screen_time ?? ''} onChange={e => update({ screen_time: e.target.value })} className={inputClass} placeholder="例：1日4〜5時間。通勤中にSNS、夜はYouTube" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">コンテンツからの影響</label>
          <textarea value={form.content_influence ?? ''} onChange={e => update({ content_influence: e.target.value })} rows={3} className={textareaClass} placeholder="好きなコンテンツが価値観・行動・ライフスタイルにどう影響しているか" />
        </div>
      </div>

      {/* 趣味・コンテンツ・アプリ */}
      {(['hobbies', 'favorite_content', 'apps_used'] as const).map(key => {
        const labels = { hobbies: '趣味・日課', favorite_content: '好きなコンテンツ', apps_used: 'よく使うアプリ' }
        const placeholders = { hobbies: '例：週3回のランニング', favorite_content: '例：ワンピース、米津玄師', apps_used: '例：Instagram' }
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{labels[key]}</p>
            <ul className="space-y-2">
              {(form[key] ?? []).map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={e => setOptItem(key, idx, e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder={placeholders[key]}
                  />
                  <button onClick={() => removeOptItem(key, idx)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => addOptItem(key)} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
              <Plus size={12} /> 追加
            </button>
          </div>
        )
      })}

      {/* 下部保存ボタン */}
      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 text-sm px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
        >
          <Save size={14} /> ペルソナを保存する
        </button>
      </div>
    </div>
  )
}
