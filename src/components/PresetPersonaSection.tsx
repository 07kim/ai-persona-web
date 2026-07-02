import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, CheckCircle, Plus } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PERSONA_PRESETS } from '../data/personaPresets'
import { generateId } from '../lib/utils'
import { now } from '../lib/utils'
import { generateAutoTags } from '../lib/autoTags'
import type { Persona } from '../types'

interface Props {
  /** 現在選択中のペルソナID配列 */
  selectedIds: string[]
  /** 選択が変わったとき */
  onSelect: (ids: string[]) => void
  /** 複数選択を許可するか（false = 1人のみ） */
  multi?: boolean
}

export function PresetPersonaSection({ selectedIds, onSelect, multi = true }: Props) {
  const { personas, addPersonas } = useAppStore()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<Set<string>>(new Set())

  /** プリセット名がストアに存在するか確認 */
  function findInStore(name: string): Persona | undefined {
    return personas.find(p => p.name === name && p.generation_context?.source_type === 'preset')
  }

  async function handleSelect(preset: typeof PERSONA_PRESETS[number]) {
    let persona = findInStore(preset.name)

    if (!persona) {
      setAdding(prev => new Set([...prev, preset.name]))
      const ts = now()
      persona = {
        ...preset,
        id: generateId(),
        tags: preset.tags.length ? preset.tags : generateAutoTags(preset),
        created_at: ts,
        updated_at: ts,
      }
      await addPersonas([persona])
      setAdding(prev => { const s = new Set(prev); s.delete(preset.name); return s })
    }

    const id = persona.id
    if (multi) {
      onSelect(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
    } else {
      onSelect(selectedIds.includes(id) ? [] : [id])
    }
  }

  return (
    <div className="mb-3 border border-indigo-100 rounded-xl overflow-hidden bg-indigo-50/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-indigo-500" />
          <span className="text-xs font-semibold text-indigo-700">プリセットペルソナ</span>
          <span className="text-[10px] text-indigo-400">{PERSONA_PRESETS.length}種類の典型的な日本人ペルソナ</span>
        </div>
        {open ? <ChevronUp size={13} className="text-indigo-400" /> : <ChevronDown size={13} className="text-indigo-400" />}
      </button>

      {open && (
        <div className="border-t border-indigo-100 p-3 grid grid-cols-2 gap-2">
          {PERSONA_PRESETS.map(preset => {
            const stored = findInStore(preset.name)
            const isSelected = stored ? selectedIds.includes(stored.id) : false
            const isAdding = adding.has(preset.name)

            return (
              <button
                key={preset.name}
                onClick={() => handleSelect(preset)}
                disabled={isAdding}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-indigo-100 bg-white hover:border-indigo-300'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isSelected ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {isAdding ? '…' : preset.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-800' : 'text-gray-800'}`}>
                    {preset.name}
                  </p>
                  <p className={`text-[10px] truncate ${isSelected ? 'text-indigo-400' : 'text-gray-400'}`}>
                    {preset.age}歳 · {preset.occupation}
                  </p>
                </div>
                <div className="shrink-0">
                  {isSelected
                    ? <CheckCircle size={13} className="text-indigo-500" />
                    : stored
                      ? <CheckCircle size={13} className="text-gray-300" />
                      : <Plus size={13} className="text-indigo-300" />
                  }
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
