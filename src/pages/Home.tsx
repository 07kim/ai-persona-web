import { Link } from 'react-router-dom'
import {
  Wand2, Users, MessageSquare, ClipboardList, BarChart2,
  MessagesSquare, Play, ArrowRight, FileText, Layers, Clock, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'おはようございます'
  if (h < 17) return 'こんにちは'
  return 'こんばんは'
}

export default function Home() {
  const { personas, surveyRuns, discussions, deliberationSessions } = useAppStore()

  const recentPersonas = [...personas]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4)

  const recentActivity = [
    ...discussions.map(d => ({ type: 'discussion' as const, id: d.id, label: d.topic, sub: d.mode === 'interview' ? 'インタビュー' : 'グループ議論', time: d.updated_at, to: '/discussion/history' })),
    ...deliberationSessions.map(d => ({ type: 'deliberation' as const, id: d.id, label: d.topic, sub: '対話セッション', time: d.updated_at, to: '/deliberation/sessions' })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}分前`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}時間前`
    return `${Math.floor(hrs / 24)}日前`
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* ヒーローヘッダー */}
      <div className="bg-white border-b border-slate-200/80 px-8 py-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-2">AI Persona System</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{greet()}</h1>
          <p className="text-sm text-slate-500">顧客データからペルソナを生成し、インタビュー・議論・アンケートで深いインサイトを引き出します</p>

          {/* スタット */}
          <div className="flex flex-wrap gap-3 mt-6">
            <StatPill label="ペルソナ" value={personas.length} to="/personas" color="indigo" />
            <StatPill label="インタビュー" value={discussions.length} to="/discussion/history" color="sky" />
            <StatPill label="対話セッション" value={deliberationSessions.length} to="/deliberation/sessions" color="violet" />
            <StatPill label="アンケート" value={surveyRuns.length} to="/survey/results" color="teal" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">

        {/* 最近のアクティビティ */}
        {(recentPersonas.length > 0 || recentActivity.length > 0) && (
          <div className="grid grid-cols-2 gap-5">
            {recentPersonas.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/80 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Users size={12} className="text-indigo-400" /> 最近のペルソナ
                  </p>
                  <Link to="/personas" className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5">
                    すべて <ChevronRight size={10} />
                  </Link>
                </div>
                <div className="space-y-2">
                  {recentPersonas.map(p => (
                    <Link key={p.id} to={`/personas/${p.id}`} className="flex items-center gap-2.5 hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors group">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{p.age}歳 · {p.occupation}</p>
                      </div>
                      <ChevronRight size={11} className="text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {recentActivity.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/80 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Clock size={12} className="text-violet-400" /> 最近のアクティビティ
                </p>
                <div className="space-y-2">
                  {recentActivity.map(a => (
                    <Link key={a.id} to={a.to} className="flex items-center gap-2.5 hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors group">
                      <div className={`w-7 h-7 rounded-full text-xs flex items-center justify-center shrink-0 ${a.type === 'discussion' ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-700'}`}>
                        {a.type === 'discussion' ? <MessageSquare size={12} /> : <MessagesSquare size={12} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{a.label}</p>
                        <p className="text-[10px] text-slate-400">{a.sub} · {fmtRelative(a.time)}</p>
                      </div>
                      <ChevronRight size={11} className="text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* ワークフロー: ペルソナ */}
        <Section
          icon={<Layers size={15} className="text-indigo-400" />}
          title="ペルソナ"
          subtitle="顧客データからAIペルソナを生成・管理します"
          accent="indigo"
        >
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              icon={<Wand2 size={18} />}
              title="ペルソナ生成"
              desc="データ・テキストを貼り付けてペルソナをAI生成"
              to="/personas/generate"
              accent="indigo"
              primary
            />
            <ActionCard
              icon={<Users size={18} />}
              title="ペルソナ管理"
              desc={`${personas.length}件のペルソナを管理・編集`}
              to="/personas"
              accent="indigo"
            />
          </div>
        </Section>

        {/* ワークフロー: インタビュー */}
        <Section
          icon={<MessageSquare size={15} className="text-sky-400" />}
          title="インタビュー"
          subtitle="ペルソナと1対1でインタビューし、過去のセッションを管理します"
          accent="sky"
        >
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              icon={<MessageSquare size={18} />}
              title="インタビュー・議論"
              desc="ペルソナに直接質問して深掘りする"
              to="/discussion"
              accent="sky"
              primary
            />
            <ActionCard
              icon={<Layers size={18} />}
              title="インタビュー履歴"
              desc={`${discussions.length}件のインタビューを確認・再開`}
              to="/discussion/history"
              accent="sky"
            />
          </div>
        </Section>

        {/* ワークフロー: 対話 */}
        <Section
          icon={<MessagesSquare size={15} className="text-violet-400" />}
          title="対話セッション"
          subtitle="複数キャラクターで構造化ディスカッションを行い、管理します"
          accent="violet"
        >
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              icon={<MessagesSquare size={18} />}
              title="対話セッション開始"
              desc="複数の役割・ペルソナで議論させる"
              to="/deliberation"
              accent="violet"
              primary
            />
            <ActionCard
              icon={<FileText size={18} />}
              title="対話管理"
              desc={`${deliberationSessions.length}件のセッションを確認・再開`}
              to="/deliberation/sessions"
              accent="violet"
            />
          </div>
        </Section>

        {/* ワークフロー: アンケート */}
        <Section
          icon={<ClipboardList size={15} className="text-teal-400" />}
          title="アンケート調査"
          subtitle="設問テンプレートを作り、ペルソナに一括回答させて集計・分析"
          accent="teal"
        >
          <div className="grid grid-cols-3 gap-3">
            <ActionCard
              icon={<FileText size={18} />}
              title="設問を作成"
              desc="選択式・自由記述・スケール評価"
              to="/survey/templates"
              accent="teal"
              primary
            />
            <ActionCard
              icon={<Play size={18} />}
              title="アンケート実行"
              desc="ペルソナに一括回答させる"
              to="/survey"
              accent="teal"
            />
            <ActionCard
              icon={<BarChart2 size={18} />}
              title="結果確認"
              desc="集計・AIレポート・エクスポート"
              to="/survey/results"
              accent="teal"
            />
          </div>
        </Section>
      </div>
    </div>
  )
}

/* ── スタットピル ── */
function StatPill({ label, value, to, color }: {
  label: string; value: number; to: string; color: 'indigo' | 'teal' | 'violet' | 'sky'
}) {
  const colors = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    teal: 'text-teal-600 bg-teal-50 border-teal-100',
    violet: 'text-violet-600 bg-violet-50 border-violet-100',
    sky: 'text-sky-600 bg-sky-50 border-sky-100',
  }[color]

  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 border rounded-xl px-4 py-2.5 hover:shadow-sm transition-shadow ${colors}`}
    >
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium opacity-70">{label}</span>
    </Link>
  )
}

/* ── セクション ── */
function Section({ icon, title, subtitle, accent, children }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: 'indigo' | 'sky' | 'teal' | 'violet'
  children: React.ReactNode
}) {
  const border: Record<string, string> = {
    indigo: 'border-indigo-200',
    sky: 'border-sky-200',
    teal: 'border-teal-200',
    violet: 'border-violet-200',
  }

  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 pb-3 border-b ${border[accent]}`}>
        {icon}
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/* ── アクションカード ── */
function ActionCard({ icon, title, desc, to, accent, primary }: {
  icon: React.ReactNode
  title: string
  desc: string
  to: string
  accent: 'indigo' | 'sky' | 'teal' | 'violet'
  primary?: boolean
}) {
  const accentMap = {
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-500', ring: 'ring-indigo-500/20', btn: 'bg-indigo-600 hover:bg-indigo-700' },
    sky:    { bg: 'bg-sky-500/10',    text: 'text-sky-500',    ring: 'ring-sky-500/20',    btn: 'bg-sky-600 hover:bg-sky-700' },
    teal:   { bg: 'bg-teal-500/10',   text: 'text-teal-500',   ring: 'ring-teal-500/20',   btn: 'bg-teal-600 hover:bg-teal-700' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-500', ring: 'ring-violet-500/20', btn: 'bg-violet-600 hover:bg-violet-700' },
  }[accent]

  return (
    <Link
      to={to}
      className="group bg-white rounded-xl border border-slate-200/80 p-5 hover:shadow-md hover:border-slate-300 transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${accentMap.bg} ${accentMap.text} flex items-center justify-center ring-1 ${accentMap.ring}`}>
          {icon}
        </div>
        {primary && (
          <span className="text-[10px] font-semibold text-white bg-slate-800 rounded-full px-2 py-0.5 uppercase tracking-wide">
            開始
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{title}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
      <div className={`flex items-center gap-1 text-xs font-medium ${accentMap.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
        開く <ArrowRight size={11} />
      </div>
    </Link>
  )
}
