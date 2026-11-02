import fs from 'node:fs';
import Database from 'better-sqlite3';
import { dataDir, dbPath } from './paths.js';

export type ModuleStatus = 'Do' | 'Review' | 'Skip' | 'Done';
export type LessonStatus = 'not_started' | 'in_progress' | 'done';
export type ChatRole = 'user' | 'assistant' | 'question' | 'answer';

export interface ModuleRow {
  id: number;
  phase_num: number;
  title: string;
  status: ModuleStatus;
  est_hours: number | null;
  lesson_count: number;
}

export interface LessonRow {
  id: number;
  module_id: number;
  num: number;
  slug: string;
  title: string;
  md: string | null;
  quiz_json: string | null;
  status: LessonStatus;
  score: string | null;
  fetched_at: string | null;
  math_normalized: number;
}

export interface ChatMessageRow {
  id: number;
  lesson_id: number;
  role: ChatRole;
  content: string;
  meta_json: string | null;
  embedding: Buffer | null;
  created_at: string;
}

export interface LessonSummaryRow {
  lesson_id: number;
  summary: string;
  mistakes: string | null;
  updated_at: string;
}

export interface GlossaryRow {
  id: number;
  term: string;
  definition_en: string;
  note_native: string | null;
  lesson_id: number | null;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS modules (
    id INTEGER PRIMARY KEY,
    phase_num INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Do',
    est_hours INTEGER,
    lesson_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES modules(id),
    num INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    md TEXT,
    quiz_json TEXT,
    status TEXT NOT NULL DEFAULT 'not_started',
    score TEXT,
    fetched_at TEXT,
    UNIQUE(module_id, num)
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    meta_json TEXT,
    embedding BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_lesson ON chat_messages(lesson_id);
  CREATE TABLE IF NOT EXISTS lesson_summaries (
    lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id),
    summary TEXT NOT NULL,
    mistakes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS glossary (
    id INTEGER PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    definition_en TEXT NOT NULL,
    note_native TEXT,
    lesson_id INTEGER REFERENCES lessons(id)
  );
  `,
  `
  ALTER TABLE lessons ADD COLUMN math_normalized INTEGER NOT NULL DEFAULT 0;
  `,
];

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  const version = d.pragma('user_version', { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    d.exec(MIGRATIONS[i]!);
    d.pragma(`user_version = ${i + 1}`);
  }
  renameLegacyGlossaryNote(d);
}

/** Pre-rename name of glossary.note_native (old databases still have it). */
const LEGACY_GLOSSARY_NOTE = 'note_ru';

/** Idempotent: rename the legacy glossary note column if it is still there. */
function renameLegacyGlossaryNote(d: Database.Database): void {
  const columns = d.prepare('PRAGMA table_info(glossary)').all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === LEGACY_GLOSSARY_NOTE)) {
    d.exec(`ALTER TABLE glossary RENAME COLUMN ${LEGACY_GLOSSARY_NOTE} TO note_native`);
  }
}
