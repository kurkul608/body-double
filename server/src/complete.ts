import { getDb, type ChatMessageRow, type LessonRow } from './db.js';
import { appendProgressLogRow } from './sync/learning-md.js';
import { runUtil } from './tutor/util-query.js';

export interface CompleteResult {
  status: 'done';
  score: string | null;
  summary: string;
}

const SUMMARIZER_SYSTEM = `You summarize one tutoring session for a learning platform's long-term memory.
Reply with JSON only, no markdown fence, matching exactly:
{"summary": "...", "mistakes": "..."}
- "summary": 3-6 short sentences. What the learner now understands and can do, in concrete terms. Simple English.
- "mistakes": 1-3 short sentences on what was hard, wrong answers, weak spots. Empty string if none.`;

/** Typical size of the summarizer's JSON reply; the progress bar fills against it. */
const EXPECTED_REPLY_CHARS = 900;

/**
 * Live state of a running lesson completion, so the client can poll progress.
 * In-memory only; absent = not running.
 */
export interface CompletionState {
  stage: 'reading' | 'writing' | 'saving';
  written: number;
  expected: number;
  startedAt: number;
}

const completions = new Map<number, CompletionState>();

export function getCompletion(lessonId: number): CompletionState | null {
  return completions.get(lessonId) ?? null;
}

/**
 * Finalize a lesson: build a summary of the chat via UTIL_MODEL, store it,
 * mark the lesson done with a score, and append a Progress log row to profile/LEARNING.md.
 */
export async function completeLesson(
  lessonId: number,
  score: string | null,
  note: string | null,
): Promise<CompleteResult> {
  const progress: CompletionState = {
    stage: 'reading',
    written: 0,
    expected: EXPECTED_REPLY_CHARS,
    startedAt: Date.now(),
  };
  completions.set(lessonId, progress);
  try {
    return await finalizeLesson(lessonId, score, note, progress);
  } finally {
    completions.delete(lessonId);
  }
}

async function finalizeLesson(
  lessonId: number,
  score: string | null,
  note: string | null,
  progress: CompletionState,
): Promise<CompleteResult> {
  const db = getDb();
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as LessonRow | undefined;
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);
  const moduleRow = db.prepare('SELECT phase_num, title FROM modules WHERE id = ?').get(lesson.module_id) as {
    phase_num: number;
    title: string;
  };

  const messages = db
    .prepare('SELECT * FROM chat_messages WHERE lesson_id = ? ORDER BY id')
    .all(lessonId) as ChatMessageRow[];

  let summary = '';
  let mistakes = '';
  if (messages.length > 0) {
    const transcript = messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n');
    const raw = await runUtil(
      SUMMARIZER_SYSTEM,
      `Lesson: Phase ${moduleRow.phase_num} — ${moduleRow.title}, Lesson ${lesson.num}: ${lesson.title}\n` +
        (score ? `Quiz score: ${score}\n` : '') +
        `\nTranscript:\n\n${transcript}`,
      (chunk) => {
        progress.stage = 'writing';
        progress.written += chunk.length;
      },
    );
    try {
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as {
        summary?: string;
        mistakes?: string;
      };
      summary = parsed.summary ?? raw;
      mistakes = parsed.mistakes ?? '';
    } catch {
      summary = raw;
    }
  } else {
    summary = `Lesson marked done without a chat session.`;
  }

  progress.stage = 'saving';
  db.prepare(
    `INSERT INTO lesson_summaries (lesson_id, summary, mistakes, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(lesson_id) DO UPDATE SET summary = excluded.summary, mistakes = excluded.mistakes, updated_at = excluded.updated_at`,
  ).run(lessonId, summary, mistakes || null);

  db.prepare("UPDATE lessons SET status = 'done', score = ? WHERE id = ?").run(score, lessonId);

  const pad = (n: number) => String(n).padStart(2, '0');
  try {
    const appended = appendProgressLogRow({
      date: new Date().toISOString().slice(0, 10),
      lessonLabel: `${pad(moduleRow.phase_num)}/${pad(lesson.num)} ${lesson.title}`,
      quiz: score ?? 'DONE',
      note: note ?? summary.split(/(?<=\.)\s+/)[0] ?? '',
    });
    if (!appended) console.log('profile/LEARNING.md not found — skipping Progress log append.');
  } catch (err) {
    // LEARNING.md sync is best-effort; the DB stays the source of truth.
    console.error('Failed to append Progress log row to LEARNING.md:', err);
  }

  return { status: 'done', score, summary };
}
