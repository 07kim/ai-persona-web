import { useEffect, useRef, useCallback, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Monitor } from 'lucide-react'
import Layout from './components/Layout'
import { useAppStore } from './store/useAppStore'
import Home from './pages/Home'
import Settings from './pages/Settings'
import PersonaList from './pages/PersonaList'
import PersonaGenerate from './pages/PersonaGenerate'
import PersonaDetail from './pages/PersonaDetail'
import Discussion from './pages/Discussion'
import Deliberation from './pages/Deliberation'
import DeliberationSessions from './pages/DeliberationSessions'
import PersonaNew from './pages/PersonaNew'
import Survey from './pages/Survey'
import SurveyTemplates from './pages/SurveyTemplates'
import SurveyResults from './pages/SurveyResults'
import Admin from './pages/Admin'
import DiscussionHistory from './pages/DiscussionHistory'
import PersonaCompare from './pages/PersonaCompare'

function DemoBanner() {
  const disableDemoMode = useAppStore(s => s.disableDemoMode)
  return (
    <div className="shrink-0 z-50 flex items-center justify-center gap-3 bg-amber-400 text-amber-950 text-sm font-bold py-1.5 shadow-md">
      <span className="animate-pulse">●</span>
      <span>デモモード — 表示データはすべてサンプルです</span>
      <button
        onClick={disableDemoMode}
        className="ml-3 text-xs bg-amber-950/20 hover:bg-amber-950/30 rounded px-2 py-0.5 transition-colors"
      >
        終了
      </button>
    </div>
  )
}

/** スマホ幅では専用の案内を表示（PCモードで続行も可能） */
function MobileGate({ children }: { children: React.ReactNode }) {
  // スマホ判定：狭い画面 かつ タッチ端末（狭いだけのPCウィンドウは除外）
  const detect = () =>
    window.innerWidth < 768 &&
    window.matchMedia('(pointer: coarse)').matches
  const [isNarrow, setIsNarrow] = useState(detect)
  const [forcePc, setForcePc] = useState(false)

  useEffect(() => {
    const onResize = () => setIsNarrow(detect())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (isNarrow && !forcePc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 py-12 bg-slate-50 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
          <Monitor size={30} className="text-indigo-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-slate-900">PCでのご利用を推奨しています</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            このアプリはスマートフォンの画面には最適化されていません。<br />
            快適にご利用いただくため、PCブラウザで開いてください。
          </p>
        </div>
        <button
          onClick={() => setForcePc(true)}
          className="text-sm font-medium text-indigo-600 border border-indigo-200 bg-white rounded-lg px-5 py-2.5 hover:bg-indigo-50 transition-colors"
        >
          このままPCモードで開く
        </button>
        <p className="text-xs text-slate-400">※ PCモードでは画面が横に広がり、操作しづらい場合があります</p>
      </div>
    )
  }

  return <>{children}</>
}

function AppInit({ children }: { children: React.ReactNode }) {
  const init = useAppStore(s => s.init)
  const enableDemoMode = useAppStore(s => s.enableDemoMode)
  const demoMode = useAppStore(s => s.demoMode)
  const keyBuf = useRef<string[]>([])
  const dBuf = useRef<number[]>([])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (demoMode) return
    // "demo" シーケンス検知
    keyBuf.current = [...keyBuf.current, e.key].slice(-4)
    if (keyBuf.current.join('') === 'demo') {
      enableDemoMode()
      keyBuf.current = []
      dBuf.current = []
      return
    }
    // "d" 5回連続検知（1秒以内）
    const now = Date.now()
    if (e.key === 'd') {
      dBuf.current = [...dBuf.current.filter(t => now - t < 1000), now]
      if (dBuf.current.length >= 5) {
        enableDemoMode()
        keyBuf.current = []
        dBuf.current = []
      }
    } else {
      dBuf.current = []
    }
  }, [demoMode, enableDemoMode])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => { init() }, [init])
  return <>{children}</>
}

export default function App() {
  const demoMode = useAppStore(s => s.demoMode)
  return (
    <BrowserRouter>
      <MobileGate>
      <AppInit>
        <div className="flex flex-col h-screen overflow-hidden">
        {demoMode && <DemoBanner />}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/personas" element={<PersonaList />} />
            <Route path="/personas/generate" element={<PersonaGenerate />} />
            <Route path="/personas/new" element={<PersonaNew />} />
            <Route path="/personas/compare" element={<PersonaCompare />} />
            <Route path="/personas/:id" element={<PersonaDetail />} />
            <Route path="/discussion" element={<Discussion />} />
            <Route path="/discussion/history" element={<DiscussionHistory />} />
            <Route path="/deliberation" element={<Deliberation />} />
            <Route path="/deliberation/sessions" element={<DeliberationSessions />} />
            <Route path="/survey" element={<Survey />} />
            <Route path="/survey/templates" element={<SurveyTemplates />} />
            <Route path="/survey/results" element={<SurveyResults />} />
          </Route>
          {/* 管理者モード: Layout外（独自の全画面レイアウト） */}
          <Route path="/admin" element={<Admin />} />
        </Routes>
        </div>
        </div>
      </AppInit>
      </MobileGate>
    </BrowserRouter>
  )
}
