import { useState } from 'react'
import { X, Send, CheckCircle, AlertTriangle } from 'lucide-react'

// Formspree のフォームID（ここに入れると実際にメール送信される）
//   1. https://formspree.io で登録し、送信先を kimura.k0717@gmail.com にしたフォームを作成
//   2. 発行される ID（例: "xldeabcd"）を、下記の '' の中か 環境変数 VITE_FORMSPREE_ID に設定
//   送信先アドレスは Formspree 側で管理するので、コード・フォームには一切出さない
//   ※ 未設定の間はメールアプリを開く mailto フォールバックで動作
const FORMSPREE_ID = import.meta.env.VITE_FORMSPREE_ID ?? 'xlgyyzyb'
// フォールバック用の送信先（Formspree 未設定時のみ mailto に使用。UIには表示しない）
const FALLBACK_TO = 'kimura.k0717@gmail.com'

type Category = 'bug' | 'feature' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: 'バグ・不具合' },
  { value: 'feature', label: '機能要望' },
  { value: 'other', label: 'その他' },
]

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>('feature')
  const [name, setName] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [wantReply, setWantReply] = useState(true)
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [emailError, setEmailError] = useState('')

  const categoryLabel = CATEGORIES.find(c => c.value === category)?.label ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return

    // 返信希望時はメールアドレスの形式を検証
    if (wantReply) {
      if (!replyTo.trim()) { setEmailError('返信先メールアドレスを入力してください'); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())) { setEmailError('メールアドレスの形式が正しくありません'); return }
    }
    setEmailError('')
    setStatus('sending')

    if (!FORMSPREE_ID) {
      // Formspree 未設定時は mailto フォールバック
      const subject = encodeURIComponent(`[AIペルソナ] ${categoryLabel}`)
      const lines = [
        body,
        '',
        '――――――――――',
        name.trim() ? `お名前: ${name.trim()}` : '',
        wantReply && replyTo.trim() ? `返信希望・返信先: ${replyTo.trim()}` : '',
      ].filter(Boolean)
      window.location.href = `mailto:${FALLBACK_TO}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`
      setStatus('sent')
      return
    }

    try {
      // Formspree 規約：email フィールドが返信先として使われる。件名も指定
      const payload: Record<string, string> = {
        種類: categoryLabel,
        お名前: name.trim() || '（未記入）',
        message: body,
        返信希望: wantReply ? 'はい' : 'いいえ',
        _subject: `[AIペルソナ] ${categoryLabel}${name.trim() ? `（${name.trim()}）` : ''}`,
      }
      if (wantReply && replyTo.trim()) {
        payload.email = replyTo.trim()      // 返信先（Formspreeが Reply-To に設定）
        payload._replyto = replyTo.trim()   // 後方互換
      }
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-base font-bold text-gray-900">ご意見・ご要望</p>
            <p className="text-xs text-gray-400 mt-0.5">いただいた内容は開発者に直接届きます</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle size={36} className="text-green-500" />
            <p className="text-sm font-medium text-gray-800">送信しました！</p>
            <p className="text-xs text-gray-400">貴重なフィードバックをありがとうございます。</p>
            <button onClick={onClose} className="mt-4 text-sm text-indigo-600 hover:underline font-medium">閉じる</button>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle size={36} className="text-red-500" />
            <p className="text-sm font-bold text-red-600">送信に失敗しました</p>
            <p className="text-xs text-gray-400">通信環境をご確認のうえ、時間をおいて再度お試しください。</p>
            <button onClick={() => setStatus('idle')} className="mt-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 transition-colors">
              入力に戻ってやり直す
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* カテゴリ */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">種類</label>
              <div className="flex gap-1.5">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`flex-1 text-xs rounded-lg py-2 border transition-colors ${
                      category === c.value
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 本文 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                内容 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="ご意見・ご要望・不具合の内容をお書きください"
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none placeholder:text-gray-300"
                required
              />
            </div>

            {/* 送信者名（任意） */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                お名前 <span className="text-gray-300 font-normal">（任意）</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例：山田 太郎 / 匿名でもOK"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder:text-gray-300"
              />
            </div>

            {/* 返信希望 */}
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wantReply}
                  onChange={e => { setWantReply(e.target.checked); setEmailError('') }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                />
                返信を希望する
              </label>
              {wantReply && (
                <div className="mt-2">
                  <input
                    type="email"
                    value={replyTo}
                    onChange={e => { setReplyTo(e.target.value); setEmailError('') }}
                    placeholder="返信先メールアドレス"
                    className={`w-full text-sm border rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 placeholder:text-gray-300 ${
                      emailError ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-indigo-200 focus:border-indigo-300'
                    }`}
                  />
                  {emailError && <p className="text-[11px] text-red-500 mt-1">{emailError}</p>}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!body.trim() || status === 'sending'}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg py-2.5 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
              {status === 'sending' ? '送信中...' : '送信する'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
