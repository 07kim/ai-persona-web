import { openDB, type IDBPDatabase } from 'idb'
import type { Persona, SurveyTemplate, SurveyRun, DiscussionSession, Settings, DeliberationSessionRecord, ParticipantTemplate } from '../types'

const DB_NAME = 'ai-persona-db'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('personas')) {
          db.createObjectStore('personas', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('survey_templates')) {
          db.createObjectStore('survey_templates', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('survey_runs')) {
          db.createObjectStore('survey_runs', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('discussions')) {
          db.createObjectStore('discussions', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings')
        }
        if (!db.objectStoreNames.contains('deliberation_sessions')) {
          db.createObjectStore('deliberation_sessions', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('participant_templates')) {
          db.createObjectStore('participant_templates', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// Persona CRUD
export async function getAllPersonas(): Promise<Persona[]> {
  const db = await getDb()
  return db.getAll('personas')
}

export async function putPersona(persona: Persona): Promise<void> {
  const db = await getDb()
  await db.put('personas', persona)
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('personas', id)
}

// SurveyTemplate CRUD
export async function getAllTemplates(): Promise<SurveyTemplate[]> {
  const db = await getDb()
  return db.getAll('survey_templates')
}

export async function putTemplate(template: SurveyTemplate): Promise<void> {
  const db = await getDb()
  await db.put('survey_templates', template)
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('survey_templates', id)
}

// SurveyRun CRUD
export async function getAllSurveyRuns(): Promise<SurveyRun[]> {
  const db = await getDb()
  return db.getAll('survey_runs')
}

export async function putSurveyRun(run: SurveyRun): Promise<void> {
  const db = await getDb()
  await db.put('survey_runs', run)
}

export async function deleteSurveyRun(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('survey_runs', id)
}

// Discussion CRUD
export async function getAllDiscussions(): Promise<DiscussionSession[]> {
  const db = await getDb()
  return db.getAll('discussions')
}

export async function putDiscussion(session: DiscussionSession): Promise<void> {
  const db = await getDb()
  await db.put('discussions', session)
}

export async function deleteDiscussion(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('discussions', id)
}

// DeliberationSession CRUD
export async function getAllDeliberationSessions(): Promise<DeliberationSessionRecord[]> {
  const db = await getDb()
  return db.getAll('deliberation_sessions')
}

export async function putDeliberationSession(session: DeliberationSessionRecord): Promise<void> {
  const db = await getDb()
  await db.put('deliberation_sessions', session)
}

export async function deleteDeliberationSession(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('deliberation_sessions', id)
}

// ParticipantTemplate CRUD
export async function getAllParticipantTemplates(): Promise<ParticipantTemplate[]> {
  const db = await getDb()
  return db.getAll('participant_templates')
}

export async function putParticipantTemplate(t: ParticipantTemplate): Promise<void> {
  const db = await getDb()
  await db.put('participant_templates', t)
}

export async function deleteParticipantTemplate(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('participant_templates', id)
}

// Settings
export async function getSettings(): Promise<Settings | null> {
  const db = await getDb()
  return db.get('settings', 'main') as Promise<Settings | null>
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  await db.put('settings', settings, 'main')
}
