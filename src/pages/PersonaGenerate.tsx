import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Loader, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { generatePersonas, checkAndImprovePersona, parseUserFriendlyError } from '../lib/ai'
import { parseFileToText, getSupportedExtensions } from '../lib/fileParser'
import { generateId, now } from '../lib/utils'
import { generateAutoTags } from '../lib/autoTags'
import type { DataSourceType, Persona } from '../types'
import { DATA_SOURCE_LABELS } from '../types'

const DATA_SOURCE_DESCRIPTIONS: Record<DataSourceType, string> = {
  interview: '顧客インタビューや1on1ヒアリングの記録',
  market_report: '市場調査レポートや分析データ',
  review: '商品レビューや口コミデータ',
  purchase: '購買履歴やトランザクションデータ',
  other: 'その他のデータ',
}

export default function PersonaGenerate() {
  const navigate = useNavigate()
  const { settings, addPersonas } = useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState('')
  const [sourceType, setSourceType] = useState<DataSourceType>('interview')
  const [instruction, setInstruction] = useState('')
  const [count, setCount] = useState(3)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'generating' | 'checking' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState<Persona[]>([])
  const [checkProgress, setCheckProgress] = useState('')

  async function handleFileDrop(files: FileList | null) {
    if (!files?.length) return
    const f = files[0]
    setFile(f)
    setStatus('parsing')
    setError('')
    try {
      const text = await parseFileToText(f)
      setFileText(text)
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました。対応形式（.txt, .csv, .json, .md）を確認してください。')
      setStatus('error')
    }
  }

  async function handleGenerate() {
    if (!settings.apiKey) {
      setError('APIキーが設定されていません。画面左下のサイドバーから入力してください。')
      setStatus('error')
      return
    }
    if (!fileText.trim() && !instruction.trim()) {
      setError('データファイルをアップロードするか、追加の指示を入力してください。')
      setStatus('error')
      return
    }

    setStatus('generating')
    setError('')
    setGenerated([])

    try {
      const rawPersonas = await generatePersonas(fileText, count, sourceType, instruction, settings)
      const ts = now()
      const personas: Persona[] = rawPersonas.map(p => ({
        ...p,
        id: generateId(),
        tags: generateAutoTags(p),
        created_at: ts,
        updated_at: ts,
        generation_context: {
          source_type: sourceType,
          custom_instruction: instruction,
          source_filename: file?.name,
        },
      }))

      // 品質チェック＆改善
      setStatus('checking')
      const improvedPersonas: Persona[] = []
      for (let i = 0; i < personas.length; i++) {
        const p = personas[i]
        setCheckProgress(`${p.name} の品質チェック中... (${i + 1}/${personas.length})`)
        try {
          const result = await checkAndImprovePersona(p, fileText || instruction, settings)
          improvedPersonas.push(result.improved ? { ...result.persona, updated_at: now() } : p)
        } catch {
          improvedPersonas.push(p)
        }
      }
      setCheckProgress('')

      await addPersonas(improvedPersonas)
      setGenerated(improvedPersonas)
      setStatus('done')
    } catch (e) {
      setError(parseUserFriendlyError(e, settings.model || 'gemini-2.0-flash'))
      setStatus('error')
    }
  }

  const etaSec = settings.quotaSafeMode
    ? Math.ceil((count / Math.max(1, settings.quotaRpm)) * 60)
    : null

  const isGenerating = status === 'generating'
  const isParsing = status === 'parsing'
  const isChecking = status === 'checking'

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">ペルソナ生成</h2>
      <p className="text-sm text-gray-400 mb-7">データファイルをアップロードするか、追加の指示だけでペルソナを生成できます</p>

      <div className="space-y-5">
        {/* ファイルアップロード */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">データファイル</p>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileDrop(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              file
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
            }`}
          >
            {file ? (
              <div>
                <FileText size={28} className="mx-auto text-indigo-400 mb-2" />
                <p className="text-sm font-semibold text-indigo-800">{file.name}</p>
                <p className="text-xs text-indigo-400 mt-0.5">{fileText.length.toLocaleString()} 文字を読み込みました</p>
                <p className="text-xs text-gray-400 mt-2">クリックして別のファイルを選択</p>
              </div>
            ) : (
              <div>
                <Upload size={28} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-600 mb-1">
                  クリックまたはドラッグしてアップロード
                </p>
                <p className="text-xs text-gray-400">.txt .csv .json .md に対応</p>
              </div>
            )}
            {isParsing && (
              <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                <Loader size={20} className="animate-spin text-indigo-500" />
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={getSupportedExtensions()}
            onChange={e => handleFileDrop(e.target.files)}
            className="hidden"
          />
        </div>

        {/* データ種別 */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">データの種類</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(DATA_SOURCE_LABELS) as [DataSourceType, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSourceType(key)}
                className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  sourceType === key
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-medium ${sourceType === key ? 'text-indigo-800' : 'text-gray-700'}`}>
                  {label}
                </p>
                <p className={`text-xs mt-0.5 ${sourceType === key ? 'text-indigo-500' : 'text-gray-400'}`}>
                  {DATA_SOURCE_DESCRIPTIONS[key]}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 生成数 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">生成するペルソナ数</p>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCount(c => Math.max(1, c - 1))}
                className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-lg font-bold"
              >
                −
              </button>
              <span className="text-2xl font-bold text-gray-900 w-8 text-center">{count}</span>
              <button
                onClick={() => setCount(c => Math.min(20, c + 1))}
                className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-lg font-bold"
              >
                +
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-600">件のペルソナ</p>
              {etaSec && (
                <p className="text-xs text-amber-600 mt-0.5">制限内モードON — 推定約{etaSec}秒</p>
              )}
            </div>
          </div>
        </div>

        {/* 追加指示（折りたたみ可能） */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            指示・条件 <span className="normal-case font-normal text-gray-400">（データファイルなしでも生成できます）</span>
          </p>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="例: 30〜40代の女性を中心に、子育て中の共働き世帯のペルソナを生成してください"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none bg-white"
          />
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 生成中 */}
        {isGenerating && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3">
            <Loader size={16} className="animate-spin text-indigo-500 shrink-0" />
            <p className="text-sm text-indigo-700">AIがペルソナを生成中... しばらくお待ちください</p>
          </div>
        )}

        {/* 品質チェック中 */}
        {isChecking && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <Loader size={16} className="animate-spin text-amber-500 shrink-0" />
            <div>
              <p className="text-sm text-amber-700 font-medium">品質チェック・改善中</p>
              <p className="text-xs text-amber-600 mt-0.5">{checkProgress}</p>
            </div>
          </div>
        )}

        {/* 完了 */}
        {status === 'done' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-sm font-semibold text-green-800">{generated.length}件のペルソナを生成しました！</p>
            </div>
            <div className="space-y-1.5 mb-3">
              {generated.map(p => (
                <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-green-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{p.age}歳 · {p.occupation}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/personas')}
              className="text-sm text-green-700 font-medium hover:text-green-900"
            >
              ペルソナ一覧を確認する →
            </button>
          </div>
        )}

        {/* 実行ボタン */}
        {status !== 'done' && (
          <button
            onClick={handleGenerate}
            disabled={isGenerating || isParsing || isChecking}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {(isGenerating || isChecking) && <Loader size={16} className="animate-spin" />}
            {isParsing ? 'ファイルを読み込み中...' :
             isGenerating ? `${count}件のペルソナを生成中...` :
             isChecking ? '品質チェック中...' :
             `${count}件のペルソナを生成する`}
          </button>
        )}
      </div>
    </div>
  )
}
