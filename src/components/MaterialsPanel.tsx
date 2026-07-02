import { useRef, useState } from 'react'
import { Paperclip, X, Link as LinkIcon, FileText, Image, Code, Video, FileArchive, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { generateId, now } from '../lib/utils'
import { parseFileToText } from '../lib/fileParser'
import type { MaterialItem } from '../types'

const MATERIAL_ICONS: Record<MaterialItem['type'], React.ElementType> = {
  image: Image,
  document: FileText,
  code: Code,
  url: LinkIcon,
  video: Video,
  pdf: FileArchive,
}

const MATERIAL_COLORS: Record<MaterialItem['type'], string> = {
  image: 'text-pink-500',
  document: 'text-blue-500',
  code: 'text-violet-500',
  url: 'text-teal-500',
  video: 'text-orange-500',
  pdf: 'text-red-500',
}

function isVideoUrl(url: string): boolean {
  return /youtu\.?be|vimeo\.com|dailymotion|niconico|nicovideo/.test(url)
}

function getVideoThumbnail(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`
  return null
}

interface MaterialsPanelProps {
  materials: MaterialItem[]
  onChange: (materials: MaterialItem[]) => void
  label?: string
  description?: string
  collapsed?: boolean
}

export default function MaterialsPanel({
  materials,
  onChange,
  label = '参考資料を添付する（任意）',
  description = '画像・PDF・動画URL・テキストファイル・コードなどを添付できます',
  collapsed = true,
}: MaterialsPanelProps) {
  const [open, setOpen] = useState(!collapsed)
  const [urlInput, setUrlInput] = useState('')
  const [preview, setPreview] = useState<MaterialItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function remove(id: string) {
    onChange(materials.filter(m => m.id !== id))
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const next: MaterialItem[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      let type: MaterialItem['type'] = 'document'
      let content = ''
      let mime_type = file.type

      if (file.type.startsWith('image/')) {
        type = 'image'
        content = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
      } else if (file.type.startsWith('video/')) {
        type = 'video'
        content = `[動画ファイル: ${file.name}（${(file.size / 1024 / 1024).toFixed(1)} MB）]`
      } else if (ext === 'pdf') {
        type = 'pdf'
        content = `[PDFファイル: ${file.name}]`
      } else if (/^(ts|tsx|js|jsx|py|java|go|rs|cpp|c|cs|rb|swift|kt|sh|bash|yaml|yml|toml)$/.test(ext)) {
        type = 'code'
        try { content = await parseFileToText(file) } catch { content = '' }
      } else {
        try { content = await parseFileToText(file) } catch { content = '' }
      }

      next.push({ id: generateId(), name: file.name, type, content, mime_type, added_at: now() })
    }
    onChange([...materials, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }

  function addUrl() {
    const url = urlInput.trim()
    if (!url) return
    const type: MaterialItem['type'] = isVideoUrl(url) ? 'video' : 'url'
    onChange([...materials, { id: generateId(), name: url, type, content: '', url, added_at: now() }])
    setUrlInput('')
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* ヘッダー（折りたたみトグル） */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <Paperclip size={14} className="text-gray-400 shrink-0" />
        <span className="text-sm font-medium text-gray-700 flex-1">{label}</span>
        {materials.length > 0 && (
          <span className="text-xs bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-medium">
            {materials.length}件
          </span>
        )}
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-gray-400">{description}</p>

          {/* 添付済み資料リスト */}
          {materials.length > 0 && (
            <div className="space-y-1.5">
              {materials.map(m => {
                const Icon = MATERIAL_ICONS[m.type]
                const colorClass = MATERIAL_COLORS[m.type]
                const thumb = m.type === 'video' && m.url ? getVideoThumbnail(m.url) : null
                return (
                  <div key={m.id} className="flex items-center gap-2.5 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 group">
                    {thumb ? (
                      <img src={thumb} className="w-8 h-6 object-cover rounded shrink-0" alt="" />
                    ) : m.type === 'image' && m.content.startsWith('data:') ? (
                      <img src={m.content} className="w-8 h-6 object-cover rounded shrink-0" alt="" />
                    ) : (
                      <Icon size={14} className={`${colorClass} shrink-0`} />
                    )}
                    <span className="text-xs text-gray-700 truncate flex-1">{m.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0 hidden group-hover:block capitalize">{m.type}</span>
                    {(m.type === 'image' || (m.type === 'video' && m.url)) && (
                      <button
                        onClick={() => setPreview(m)}
                        className="p-0.5 text-gray-300 hover:text-teal-500 shrink-0 transition-colors"
                        title="プレビュー"
                      >
                        <Play size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(m.id)}
                      className="p-0.5 text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 追加コントロール */}
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors shrink-0"
            >
              <Paperclip size={12} /> ファイルを選択
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.cpp,.c,.cs,.rb,.swift,.kt,.sh,.yaml,.yml,.toml"
              onChange={e => handleFiles(e.target.files)}
              className="hidden"
            />
            <div className="flex-1 flex gap-1.5">
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUrl()}
                placeholder="URL / YouTube リンクを貼り付けて Enter"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 bg-white min-w-0"
              />
              <button
                onClick={addUrl}
                disabled={!urlInput.trim()}
                className="text-xs px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors shrink-0"
              >
                <LinkIcon size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* プレビューモーダル */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-3xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreview(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 z-10"
            >
              <X size={16} />
            </button>
            {preview.type === 'image' && preview.content.startsWith('data:') && (
              <img src={preview.content} className="max-w-full max-h-[80vh] rounded-xl" alt={preview.name} />
            )}
            {preview.type === 'video' && preview.url && (
              <div className="bg-black rounded-xl overflow-hidden">
                {preview.url.includes('youtu') ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${preview.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]}`}
                    width="640" height="360" allowFullScreen
                    className="block"
                    title={preview.name}
                  />
                ) : (
                  <a href={preview.url} target="_blank" rel="noopener noreferrer"
                    className="text-white text-sm px-6 py-4 flex items-center gap-2">
                    <Video size={16} /> {preview.url} を新しいタブで開く
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
