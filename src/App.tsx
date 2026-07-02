import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

function AppInit({ children }: { children: React.ReactNode }) {
  const init = useAppStore(s => s.init)
  useEffect(() => { init() }, [init])
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit>
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
      </AppInit>
    </BrowserRouter>
  )
}
