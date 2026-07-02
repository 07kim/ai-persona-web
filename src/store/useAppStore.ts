import { create } from 'zustand'
import type { Persona, SurveyTemplate, SurveyRun, DiscussionSession, Settings, DeliberationSessionRecord, ParticipantTemplate } from '../types'
import * as db from '../lib/db'

interface AppState {
  personas: Persona[]
  templates: SurveyTemplate[]
  surveyRuns: SurveyRun[]
  discussions: DiscussionSession[]
  deliberationSessions: DeliberationSessionRecord[]
  participantTemplates: ParticipantTemplate[]
  settings: Settings
  initialized: boolean

  init: () => Promise<void>

  // Personas
  addPersonas: (personas: Persona[]) => Promise<void>
  updatePersona: (persona: Persona) => Promise<void>
  deletePersona: (id: string) => Promise<void>

  // Templates
  addTemplate: (template: SurveyTemplate) => Promise<void>
  updateTemplate: (template: SurveyTemplate) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>

  // Survey Runs
  addSurveyRun: (run: SurveyRun) => Promise<void>
  updateSurveyRun: (run: SurveyRun) => Promise<void>
  deleteSurveyRun: (id: string) => Promise<void>

  // Discussions
  addDiscussion: (session: DiscussionSession) => Promise<void>
  updateDiscussion: (session: DiscussionSession) => Promise<void>
  deleteDiscussion: (id: string) => Promise<void>

  // DeliberationSessions
  saveDeliberationSession: (session: DeliberationSessionRecord) => Promise<void>
  deleteDeliberationSession: (id: string) => Promise<void>

  // ParticipantTemplates
  saveParticipantTemplate: (t: ParticipantTemplate) => Promise<void>
  deleteParticipantTemplate: (id: string) => Promise<void>

  // Settings
  saveSettings: (settings: Settings) => Promise<void>

  // Export / Import
  exportAll: () => object
  importAll: (data: {
    personas?: Persona[]
    templates?: SurveyTemplate[]
    surveyRuns?: SurveyRun[]
    discussions?: DiscussionSession[]
    deliberationSessions?: DeliberationSessionRecord[]
    participantTemplates?: ParticipantTemplate[]
  }) => Promise<void>
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  model: 'gemini-2.5-flash',
  quotaSafeMode: false,
  quotaRpm: 10,
}

export const useAppStore = create<AppState>((set, get) => ({
  personas: [],
  templates: [],
  surveyRuns: [],
  discussions: [],
  deliberationSessions: [],
  participantTemplates: [],
  settings: DEFAULT_SETTINGS,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    const [personas, templates, surveyRuns, discussions, deliberationSessions, participantTemplates, settings] = await Promise.all([
      db.getAllPersonas(),
      db.getAllTemplates(),
      db.getAllSurveyRuns(),
      db.getAllDiscussions(),
      db.getAllDeliberationSessions(),
      db.getAllParticipantTemplates(),
      db.getSettings(),
    ])
    set({
      personas,
      templates,
      surveyRuns,
      discussions,
      deliberationSessions,
      participantTemplates,
      settings: settings ?? DEFAULT_SETTINGS,
      initialized: true,
    })
  },

  addPersonas: async (newPersonas) => {
    await Promise.all(newPersonas.map(p => db.putPersona(p)))
    set(s => ({ personas: [...s.personas, ...newPersonas] }))
  },

  updatePersona: async (persona) => {
    await db.putPersona(persona)
    set(s => ({ personas: s.personas.map(p => p.id === persona.id ? persona : p) }))
  },

  deletePersona: async (id) => {
    await db.deletePersona(id)
    set(s => ({ personas: s.personas.filter(p => p.id !== id) }))
  },

  addTemplate: async (template) => {
    await db.putTemplate(template)
    set(s => ({ templates: [...s.templates, template] }))
  },

  updateTemplate: async (template) => {
    await db.putTemplate(template)
    set(s => ({ templates: s.templates.map(t => t.id === template.id ? template : t) }))
  },

  deleteTemplate: async (id) => {
    await db.deleteTemplate(id)
    set(s => ({ templates: s.templates.filter(t => t.id !== id) }))
  },

  addSurveyRun: async (run) => {
    await db.putSurveyRun(run)
    set(s => ({ surveyRuns: [...s.surveyRuns, run] }))
  },

  updateSurveyRun: async (run) => {
    await db.putSurveyRun(run)
    set(s => ({ surveyRuns: s.surveyRuns.map(r => r.id === run.id ? run : r) }))
  },

  deleteSurveyRun: async (id) => {
    await db.deleteSurveyRun(id)
    set(s => ({ surveyRuns: s.surveyRuns.filter(r => r.id !== id) }))
  },

  addDiscussion: async (session) => {
    await db.putDiscussion(session)
    set(s => ({ discussions: [...s.discussions, session] }))
  },

  updateDiscussion: async (session) => {
    await db.putDiscussion(session)
    set(s => ({ discussions: s.discussions.map(d => d.id === session.id ? session : d) }))
  },

  deleteDiscussion: async (id) => {
    await db.deleteDiscussion(id)
    set(s => ({ discussions: s.discussions.filter(d => d.id !== id) }))
  },

  saveDeliberationSession: async (session) => {
    await db.putDeliberationSession(session)
    set(s => ({
      deliberationSessions: s.deliberationSessions.some(d => d.id === session.id)
        ? s.deliberationSessions.map(d => d.id === session.id ? session : d)
        : [...s.deliberationSessions, session],
    }))
  },

  deleteDeliberationSession: async (id) => {
    await db.deleteDeliberationSession(id)
    set(s => ({ deliberationSessions: s.deliberationSessions.filter(d => d.id !== id) }))
  },

  saveParticipantTemplate: async (t) => {
    await db.putParticipantTemplate(t)
    set(s => ({
      participantTemplates: s.participantTemplates.some(x => x.id === t.id)
        ? s.participantTemplates.map(x => x.id === t.id ? t : x)
        : [...s.participantTemplates, t],
    }))
  },

  deleteParticipantTemplate: async (id) => {
    await db.deleteParticipantTemplate(id)
    set(s => ({ participantTemplates: s.participantTemplates.filter(t => t.id !== id) }))
  },

  saveSettings: async (settings) => {
    await db.saveSettings(settings)
    set({ settings })
  },

  exportAll: () => {
    const s = get()
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      personas: s.personas,
      templates: s.templates,
      surveyRuns: s.surveyRuns,
      discussions: s.discussions,
      deliberationSessions: s.deliberationSessions,
      participantTemplates: s.participantTemplates,
    }
  },

  importAll: async (data) => {
    const ops: Promise<void>[] = []
    if (data.personas?.length) {
      data.personas.forEach(p => ops.push(db.putPersona(p)))
      set(s => {
        const existing = new Set(s.personas.map(p => p.id))
        const fresh = (data.personas ?? []).filter(p => !existing.has(p.id))
        return { personas: [...s.personas, ...fresh] }
      })
    }
    if (data.templates?.length) {
      data.templates.forEach(t => ops.push(db.putTemplate(t)))
      set(s => {
        const existing = new Set(s.templates.map(t => t.id))
        const fresh = (data.templates ?? []).filter(t => !existing.has(t.id))
        return { templates: [...s.templates, ...fresh] }
      })
    }
    if (data.surveyRuns?.length) {
      data.surveyRuns.forEach(r => ops.push(db.putSurveyRun(r)))
      set(s => {
        const existing = new Set(s.surveyRuns.map(r => r.id))
        const fresh = (data.surveyRuns ?? []).filter(r => !existing.has(r.id))
        return { surveyRuns: [...s.surveyRuns, ...fresh] }
      })
    }
    if (data.discussions?.length) {
      data.discussions.forEach(d => ops.push(db.putDiscussion(d)))
      set(s => {
        const existing = new Set(s.discussions.map(d => d.id))
        const fresh = (data.discussions ?? []).filter(d => !existing.has(d.id))
        return { discussions: [...s.discussions, ...fresh] }
      })
    }
    if (data.deliberationSessions?.length) {
      data.deliberationSessions.forEach(d => ops.push(db.putDeliberationSession(d)))
      set(s => {
        const existing = new Set(s.deliberationSessions.map(d => d.id))
        const fresh = (data.deliberationSessions ?? []).filter(d => !existing.has(d.id))
        return { deliberationSessions: [...s.deliberationSessions, ...fresh] }
      })
    }
    if (data.participantTemplates?.length) {
      data.participantTemplates.forEach(t => ops.push(db.putParticipantTemplate(t)))
      set(s => {
        const existing = new Set(s.participantTemplates.map(t => t.id))
        const fresh = (data.participantTemplates ?? []).filter(t => !existing.has(t.id))
        return { participantTemplates: [...s.participantTemplates, ...fresh] }
      })
    }
    await Promise.all(ops)
  },
}))
