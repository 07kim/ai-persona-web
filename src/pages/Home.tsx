import { Link } from 'react-router-dom'
import {
  Wand2, Users, MessageSquare, ClipboardList, BarChart2,
  MessagesSquare, Play, FileText, Clock, ChevronRight, ArrowUpRight,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'おはようございます'
  if (h < 17) return 'こんにちは'
  return 'こんばんは'
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  return `${Math.floor(hrs / 24)}日前`
}

export default function Home() {
  const { personas, surveyRuns, discussions, deliberationSessions } = useAppStore()

  const recentPersonas = [...personas]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4)

  const recentActivity = [
    ...discussions.map(d => ({
      id: d.id, label: d.topic,
      sub: d.mode === 'interview' ? 'インタビュー' : 'グループ議論',
      time: d.updated_at, to: '/discussion/history',
      color: 'bg-sky-100 text-sky-600',
      icon: <MessageSquare size={11} />,
    })),
    ...deliberationSessions.map(d => ({
      id: d.id, label: d.topic, sub: '対話',
      time: d.updated_at, to: '/deliberation/sessions',
      color: 'bg-violet-100 text-violet-600',
      icon: <MessagesSquare size={11} />,
    })),
    ...surveyRuns.map(r => ({
      id: r.id, label: r.template_name, sub: 'アンケート',
      time: r.created_at, to: '/survey/results',
      color: 'bg-teal-100 text-teal-600',
      icon: <ClipboardList size={11} />,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6)

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">

      {/* ── トップバー: 挨拶 + スタット ── */}
      <div className="shrink-0 bg-white border-b border-slate-200/80 px-6 py-3.5 flex items-center gap-6">
        <div className="shrink-0">
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">AI Persona System</p>
          <h1 className="text-base font-bold text-slate-900 leading-tight">{greet()}</h1>
        </div>
        <div className="flex gap-2 flex-1">
          <StatChip label="ペルソナ" value={personas.length} to="/personas" color="indigo" />
          <StatChip label="インタビュー" value={discussions.length} to="/discussion/history" color="sky" />
          <StatChip label="対話" value={deliberationSessions.length} to="/deliberation/sessions" color="violet" />
          <StatChip label="アンケート" value={surveyRuns.length} to="/survey/results" color="teal" />
        </div>
      </div>

      {/* ── ボディ: 左パネル + 右アクショングリッド ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* 左: 最近の活動 */}
        <aside className="w-52 shrink-0 border-r border-slate-200/80 bg-white flex flex-col overflow-hidden">
          {/* 最近のペルソナ */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">最近のペルソナ</p>
              <Link to="/personas" className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5">
                全て <ChevronRight size={9} />
              </Link>
            </div>
            {recentPersonas.length === 0 ? (
              <p className="text-[11px] text-slate-300 px-1">まだありません</p>
            ) : (
              <div className="space-y-0.5">
                {recentPersonas.map(p => (
                  <Link key={p.id} to={`/personas/${p.id}`}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{p.age}歳 · {p.occupation}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 最近の活動 */}
          <div className="border-t border-slate-100 p-3 overflow-y-auto flex-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Clock size={9} /> 最近の活動
            </p>
            {recentActivity.length === 0 ? (
              <p className="text-[11px] text-slate-300 px-1">まだありません</p>
            ) : (
              <div className="space-y-0.5">
                {recentActivity.map(a => (
                  <Link key={a.id} to={a.to}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${a.color}`}>
                      {a.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-700 truncate">{a.label}</p>
                      <p className="text-[10px] text-slate-400">{a.sub} · {fmtRelative(a.time)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 右: アクションカード 4カラム */}
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-4 gap-3 h-full min-h-0">

            {/* ペルソナ */}
            <FeatureCol
              label="ペルソナ"
              color="indigo"
              icon={<Users size={12} />}
              cards={[
                { icon: <Wand2 size={16} />, title: 'ペルソナ生成', desc: 'データからAI生成', to: '/personas/generate', primary: true },
                { icon: <Users size={16} />, title: 'ペルソナ管理', desc: `${personas.length}件を編集・管理`, to: '/personas' },
              ]}
            />

            {/* インタビュー */}
            <FeatureCol
              label="インタビュー"
              color="sky"
              icon={<MessageSquare size={12} />}
              cards={[
                { icon: <MessageSquare size={16} />, title: 'インタビュー開始', desc: '1対1で深掘り', to: '/discussion', primary: true },
                { icon: <FileText size={16} />, title: 'インタビュー履歴', desc: `${discussions.length}件を確認・再開`, to: '/discussion/history' },
              ]}
            />

            {/* 対話 */}
            <FeatureCol
              label="対話セッション"
              color="violet"
              icon={<MessagesSquare size={12} />}
              cards={[
                { icon: <MessagesSquare size={16} />, title: '対話セッション開始', desc: '複数で構造化議論', to: '/deliberation', primary: true },
                { icon: <FileText size={16} />, title: '対話管理', desc: `${deliberationSessions.length}件を確認・再開`, to: '/deliberation/sessions' },
              ]}
            />

            {/* アンケート */}
            <FeatureCol
              label="アンケート"
              color="teal"
              icon={<ClipboardList size={12} />}
              cards={[
                { icon: <FileText size={16} />, title: '設問を作成', desc: '選択・自由・スケール', to: '/survey/templates', primary: true },
                { icon: <Play size={16} />, title: 'アンケート実行', desc: 'ペルソナに一括回答', to: '/survey' },
                { icon: <BarChart2 size={16} />, title: '結果確認', desc: `${surveyRuns.length}件を集計・分析`, to: '/survey/results' },
              ]}
            />

          </div>
        </main>
      </div>
    </div>
  )
}

/* ── スタットチップ ── */
function StatChip({ label, value, to, color }: {
  label: string; value: number; to: string
  color: 'indigo' | 'sky' | 'teal' | 'violet'
}) {
  const c = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    sky: 'text-sky-600 bg-sky-50 border-sky-100',
    teal: 'text-teal-600 bg-teal-50 border-teal-100',
    violet: 'text-violet-600 bg-violet-50 border-violet-100',
  }[color]
  return (
    <Link to={to} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 hover:shadow-sm transition-shadow ${c}`}>
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="text-xs font-medium opacity-70 leading-tight">{label}</span>
    </Link>
  )
}

/* ── フィーチャーカラム ── */
function FeatureCol({ label, color, icon, cards }: {
  label: string
  color: 'indigo' | 'sky' | 'teal' | 'violet'
  icon: React.ReactNode
  cards: { icon: React.ReactNode; title: string; desc: string; to: string; primary?: boolean }[]
}) {
  const accent = {
    indigo: { border: 'border-indigo-200', label: 'text-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-500', btn: 'bg-indigo-600 hover:bg-indigo-700', ring: 'ring-indigo-500/20' },
    sky:    { border: 'border-sky-200',    label: 'text-sky-500',    bg: 'bg-sky-500/10',    text: 'text-sky-500',    btn: 'bg-sky-600 hover:bg-sky-700',       ring: 'ring-sky-500/20' },
    teal:   { border: 'border-teal-200',   label: 'text-teal-500',   bg: 'bg-teal-500/10',   text: 'text-teal-500',   btn: 'bg-teal-600 hover:bg-teal-700',     ring: 'ring-teal-500/20' },
    violet: { border: 'border-violet-200', label: 'text-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-500', btn: 'bg-violet-600 hover:bg-violet-700', ring: 'ring-violet-500/20' },
  }[color]

  return (
    <div className="flex flex-col gap-2">
      {/* カラムヘッダー */}
      <div className={`flex items-center gap-1.5 pb-2 border-b ${accent.border}`}>
        <span className={accent.label}>{icon}</span>
        <span className={`text-xs font-semibold ${accent.label}`}>{label}</span>
      </div>

      {/* カード群 */}
      {cards.map(card => (
        <Link
          key={card.to}
          to={card.to}
          className="group bg-white rounded-xl border border-slate-200/80 p-4 hover:shadow-md hover:border-slate-300 transition-all flex flex-col gap-2.5"
        >
          <div className="flex items-start justify-between">
            <div className={`w-8 h-8 rounded-lg ${accent.bg} ${accent.text} flex items-center justify-center ring-1 ${accent.ring}`}>
              {card.icon}
            </div>
            {card.primary && (
              <span className="text-[9px] font-bold text-white bg-slate-800 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                開始
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">{card.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{card.desc}</p>
          </div>
          <div className={`flex items-center gap-0.5 text-[11px] font-medium ${accent.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
            開く <ArrowUpRight size={10} />
          </div>
        </Link>
      ))}
    </div>
  )
}
