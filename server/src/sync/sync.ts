import { getDb, type LessonRow } from '../db.js';
import { fetchCourseReadme, fetchLessonDoc, fetchLessonQuiz } from './github.js';
import { parseCourseReadme } from './readme-parser.js';
import { parsePathTable, readLearningMd } from './learning-md.js';
import { normalizeMath } from './math-normalize.js';

export interface SyncResult {
  phases: number;
  lessons: number;
  seededStatuses: number;
}

/**
 * Pull the course README, upsert modules + lessons, and seed module statuses
 * and hour estimates from the Path table of profile/LEARNING.md.
 */
export async function syncContent(): Promise<SyncResult> {
  const readme = await fetchCourseReadme();
  const phases = parseCourseReadme(readme);
  if (phases.length === 0) throw new Error('README parser produced no phases — layout changed?');

  let pathEntries: ReturnType<typeof parsePathTable> = [];
  try {
    pathEntries = parsePathTable(readLearningMd());
  } catch {
    // profile/LEARNING.md missing is not fatal for sync; statuses just stay as-is.
  }
  const pathByPhase = new Map(pathEntries.map((e) => [e.phaseNum, e]));

  const db = getDb();
  const upsertModule = db.prepare(`
    INSERT INTO modules (phase_num, title, lesson_count)
    VALUES (@phase_num, @title, @lesson_count)
    ON CONFLICT(phase_num) DO UPDATE SET title = excluded.title, lesson_count = excluded.lesson_count
  `);
  const seedModule = db.prepare(
    'UPDATE modules SET status = ?, est_hours = ? WHERE phase_num = ?',
  );
  const getModuleId = db.prepare('SELECT id FROM modules WHERE phase_num = ?');
  const upsertLesson = db.prepare(`
    INSERT INTO lessons (module_id, num, slug, title)
    VALUES (@module_id, @num, @slug, @title)
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, num = excluded.num, module_id = excluded.module_id
  `);

  let lessonTotal = 0;
  let seeded = 0;

  const run = db.transaction(() => {
    for (const phase of phases) {
      upsertModule.run({
        phase_num: phase.phaseNum,
        title: phase.title,
        lesson_count: phase.lessons.length,
      });
      const seedEntry = pathByPhase.get(phase.phaseNum);
      if (seedEntry) {
        seedModule.run(seedEntry.status, seedEntry.estHours, phase.phaseNum);
        seeded++;
      }
      const moduleId = (getModuleId.get(phase.phaseNum) as { id: number }).id;
      for (const lesson of phase.lessons) {
        upsertLesson.run({ module_id: moduleId, num: lesson.num, slug: lesson.slug, title: lesson.title });
        lessonTotal++;
      }
    }
  });
  run();

  return { phases: phases.length, lessons: lessonTotal, seededStatuses: seeded };
}

// In-flight guard: concurrent requests for the same lesson share one GitHub fetch.
const inflightFetch = new Map<number, Promise<void>>();

/**
 * Live state of the ADHD rewrite per lesson, polled by the client so it can
 * show progress instead of the raw lesson. Absent = never started or done.
 * In-memory only: a server restart forgets failures and restarts the job.
 */
export type AdaptationState =
  | { state: 'running'; attempt: number; attempts: number; written: number; expected: number; startedAt: number }
  | { state: 'failed'; error: string };

const adaptations = new Map<number, AdaptationState>();
const ADAPT_ATTEMPTS = 2;

export function getAdaptation(lessonId: number): AdaptationState | null {
  return adaptations.get(lessonId) ?? null;
}

/**
 * Lazy per-lesson content fetch: docs/en.md + quiz.json, cached in the DB.
 * Returns the lesson row immediately; if it is not adapted yet, the ADHD
 * rewrite starts in the background (math_normalized = 1 when it lands).
 * A failed rewrite stays failed until retryAdaptation() — no silent LLM loops.
 */
export async function ensureLessonContent(lessonId: number): Promise<LessonRow> {
  const lesson = await fetchLessonIfMissing(lessonId);
  if (!lesson.math_normalized && !adaptations.has(lessonId)) startAdaptation(lessonId, lesson.md ?? '');
  return lesson;
}

/** Clear a failed rewrite and start it again. */
export async function retryAdaptation(lessonId: number): Promise<void> {
  if (adaptations.get(lessonId)?.state === 'running') return;
  adaptations.delete(lessonId);
  await ensureLessonContent(lessonId);
}

/**
 * Blocking version for batch CLI runs: fetch if needed, then wait for the
 * ADHD rewrite and persist it. Retries a rejected rewrite up to `attempts` times.
 */
export async function adaptLesson(
  lessonId: number,
  attempts = ADAPT_ATTEMPTS,
): Promise<'adapted' | 'already' | 'rejected'> {
  const lesson = await fetchLessonIfMissing(lessonId);
  if (lesson.math_normalized) return 'already';
  return (await runAdaptation(lessonId, lesson.md ?? '', attempts)) ? 'adapted' : 'rejected';
}

/** Fire-and-forget wrapper that records the outcome in `adaptations`. */
function startAdaptation(lessonId: number, md: string): void {
  runAdaptation(lessonId, md, ADAPT_ATTEMPTS)
    .then((ok) => {
      if (ok) adaptations.delete(lessonId);
      else adaptations.set(lessonId, { state: 'failed', error: 'The rewrite failed quality checks.' });
    })
    .catch((err: unknown) => {
      adaptations.set(lessonId, { state: 'failed', error: (err as Error).message });
    });
}

/**
 * Run the rewrite with retries, streaming progress into `adaptations`.
 * Persists and returns true on success; false when every attempt was rejected.
 */
async function runAdaptation(lessonId: number, md: string, attempts: number): Promise<boolean> {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const progress: AdaptationState = {
      state: 'running',
      attempt,
      attempts,
      written: 0,
      expected: md.length,
      startedAt,
    };
    adaptations.set(lessonId, progress);
    const normalized = await normalizeMath(md, (chunk) => {
      progress.written += chunk.length;
    });
    if (normalized === null) continue;
    getDb().prepare('UPDATE lessons SET md = ?, math_normalized = 1 WHERE id = ?').run(normalized, lessonId);
    return true;
  }
  return false;
}

async function fetchLessonIfMissing(lessonId: number): Promise<LessonRow> {
  const db = getDb();
  let lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as LessonRow | undefined;
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

  if (lesson.md === null) {
    let fetching = inflightFetch.get(lessonId);
    if (!fetching) {
      fetching = (async () => {
        const [md, quiz] = await Promise.all([fetchLessonDoc(lesson.slug), fetchLessonQuiz(lesson.slug)]);
        if (md === null) throw new Error(`Lesson content not found upstream for ${lesson.slug}`);
        db.prepare(
          "UPDATE lessons SET md = ?, quiz_json = ?, fetched_at = datetime('now') WHERE id = ?",
        ).run(md, quiz, lessonId);
      })().finally(() => inflightFetch.delete(lessonId));
      inflightFetch.set(lessonId, fetching);
    }
    await fetching;
    lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as LessonRow;
  }
  return lesson;
}
