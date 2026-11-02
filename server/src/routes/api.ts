import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDb, type ChatMessageRow, type LessonRow, type ModuleRow } from '../db.js';
import { syncContent, ensureLessonContent, getAdaptation, retryAdaptation } from '../sync/sync.js';
import { completeLesson, getCompletion } from '../complete.js';
import { runTutorTurn } from '../tutor/agent.js';
import { embedMessageAsync } from '../rag/embeddings.js';

interface ChatBody {
  message?: string;
  answer?: { questionId: string; choice?: string; text?: string };
}

function sse(reply: FastifyReply) {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  return {
    send(event: string, data: unknown) {
      if (!raw.writableEnded) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!raw.writableEnded) raw.end();
    },
  };
}

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // Array of modules with lessons_done / lessons_total (client contract).
  app.get('/api/modules', async () => {
    const modules = db.prepare('SELECT * FROM modules ORDER BY phase_num').all() as ModuleRow[];
    const counts = db
      .prepare(
        `SELECT module_id,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
         FROM lessons GROUP BY module_id`,
      )
      .all() as Array<{ module_id: number; total: number; done: number }>;
    const byModule = new Map(counts.map((c) => [c.module_id, c]));

    return modules.map((m) => {
      const c = byModule.get(m.id);
      return {
        id: m.id,
        phase_num: m.phase_num,
        title: m.title,
        status: m.status,
        est_hours: m.est_hours,
        lesson_count: m.lesson_count,
        lessons_done: c?.done ?? 0,
        lessons_total: c?.total ?? m.lesson_count,
      };
    });
  });

  // Flat array of lesson rows (client contract).
  app.get<{ Params: { phase: string } }>('/api/modules/:phase/lessons', async (req, reply) => {
    const phaseNum = Number(req.params.phase);
    const moduleRow = db.prepare('SELECT * FROM modules WHERE phase_num = ?').get(phaseNum) as
      | ModuleRow
      | undefined;
    if (!moduleRow) return reply.code(404).send({ error: `Phase ${phaseNum} not found` });
    return db
      .prepare(
        'SELECT id, module_id, num, slug, title, status, score FROM lessons WHERE module_id = ? ORDER BY num',
      )
      .all(moduleRow.id);
  });

  app.get<{ Params: { id: string } }>('/api/lessons/:id', async (req, reply) => {
    const id = Number(req.params.id);
    let lesson: LessonRow;
    try {
      lesson = await ensureLessonContent(id);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
    const summaryRow = db.prepare('SELECT summary FROM lesson_summaries WHERE lesson_id = ?').get(id) as
      | { summary: string }
      | undefined;
    const moduleRow = db.prepare('SELECT phase_num FROM modules WHERE id = ?').get(lesson.module_id) as {
      phase_num: number;
    };
    return {
      id: lesson.id,
      module_id: lesson.module_id,
      phase_num: moduleRow.phase_num,
      num: lesson.num,
      slug: lesson.slug,
      title: lesson.title,
      status: lesson.status,
      score: lesson.score,
      // Raw text is never served: the client shows adaptation progress until it lands.
      adapted: lesson.math_normalized === 1,
      md: lesson.math_normalized === 1 ? lesson.md : null,
      adaptation: lesson.math_normalized === 1 ? null : adaptationView(id),
      quiz_json: lesson.quiz_json,
      summary: summaryRow?.summary ?? null,
    };
  });

  app.post<{ Params: { id: string } }>('/api/lessons/:id/adaptation/retry', async (req, reply) => {
    const id = Number(req.params.id);
    try {
      await retryAdaptation(id);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
    return { ok: true };
  });

  // Raw chat_messages rows (client parses meta_json itself).
  app.get<{ Params: { id: string } }>('/api/lessons/:id/messages', async (req, reply) => {
    const id = Number(req.params.id);
    const exists = db.prepare('SELECT id FROM lessons WHERE id = ?').get(id);
    if (!exists) return reply.code(404).send({ error: `Lesson ${id} not found` });
    return db
      .prepare(
        'SELECT id, lesson_id, role, content, meta_json, created_at FROM chat_messages WHERE lesson_id = ? ORDER BY id',
      )
      .all(id) as Array<Pick<ChatMessageRow, 'id' | 'lesson_id' | 'role' | 'content' | 'meta_json' | 'created_at'>>;
  });

  app.post<{ Params: { id: string }; Body: ChatBody }>('/api/lessons/:id/chat', async (req, reply) => {
    const id = Number(req.params.id);
    let lesson: LessonRow;
    try {
      lesson = await ensureLessonContent(id);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
    // The tutor must teach from the adapted text, never the raw one.
    if (!lesson.math_normalized) return reply.code(409).send({ error: 'Lesson is still being adapted' });

    const body = req.body ?? {};
    const hasHistory =
      (db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE lesson_id = ?').get(id) as { n: number }).n > 0;

    if (body.message) {
      const info = db
        .prepare("INSERT INTO chat_messages (lesson_id, role, content) VALUES (?, 'user', ?)")
        .run(id, body.message);
      embedMessageAsync(Number(info.lastInsertRowid), body.message);
    } else if (body.answer) {
      const content = body.answer.choice ?? body.answer.text ?? '';
      if (!content) return reply.code(400).send({ error: 'answer needs choice or text' });
      const info = db
        .prepare("INSERT INTO chat_messages (lesson_id, role, content, meta_json) VALUES (?, 'answer', ?, ?)")
        .run(id, content, JSON.stringify({ questionId: body.answer.questionId }));
      embedMessageAsync(Number(info.lastInsertRowid), content);
    } else if (hasHistory) {
      return reply.code(400).send({ error: 'body needs message or answer' });
    }
    // No message + empty history = lesson kickoff: the tutor starts the flow.

    if (lesson.status === 'not_started') {
      db.prepare("UPDATE lessons SET status = 'in_progress' WHERE id = ?").run(id);
      lesson = { ...lesson, status: 'in_progress' };
    }

    const stream = sse(reply);
    const abortController = new AbortController();
    req.raw.on('close', () => abortController.abort());

    // Assistant text is stored in chunks: whatever was written before a question
    // card goes in before the question row, so the history keeps its real order.
    let pendingText = '';
    const savePendingText = () => {
      if (!pendingText.trim()) return;
      const info = db
        .prepare("INSERT INTO chat_messages (lesson_id, role, content) VALUES (?, 'assistant', ?)")
        .run(id, pendingText);
      embedMessageAsync(Number(info.lastInsertRowid), pendingText);
      pendingText = '';
    };

    try {
      await runTutorTurn(
        lesson,
        {
          onTextDelta: (text) => {
            pendingText += text;
            stream.send('text_delta', { text });
          },
          beforeQuestion: savePendingText,
          onQuestion: (question) => stream.send('question', question),
          onProgress: (progress) => stream.send('progress', progress),
        },
        abortController,
      );
      savePendingText();
      const fresh = db.prepare('SELECT status, score FROM lessons WHERE id = ?').get(id) as {
        status: string;
        score: string | null;
      };
      stream.send('done', { status: fresh.status, score: fresh.score });
    } catch (err) {
      req.log.error(err);
      stream.send('error', { message: (err as Error).message });
    } finally {
      stream.end();
    }
  });

  app.post<{ Params: { id: string }; Body: { score?: string; note?: string } }>(
    '/api/lessons/:id/complete',
    async (req, reply) => {
      const id = Number(req.params.id);
      const exists = db.prepare('SELECT id FROM lessons WHERE id = ?').get(id);
      if (!exists) return reply.code(404).send({ error: `Lesson ${id} not found` });
      return await completeLesson(id, req.body?.score ?? null, req.body?.note ?? null);
    },
  );

  // Polled by the client while POST /complete is in flight.
  app.get<{ Params: { id: string } }>('/api/lessons/:id/complete/progress', async (req) => {
    const c = getCompletion(Number(req.params.id));
    if (!c) return { state: 'idle' as const };
    return {
      state: 'running' as const,
      stage: c.stage,
      percent: c.stage === 'saving' ? 98 : Math.min(95, Math.round((c.written / Math.max(1, c.expected)) * 100)),
      elapsedSec: Math.round((Date.now() - c.startedAt) / 1000),
    };
  });

  app.post('/api/sync', async () => {
    return await syncContent();
  });
}

/** Client-facing progress: percent is an estimate (output chars vs. source chars), capped below 100. */
function adaptationView(lessonId: number) {
  const a = getAdaptation(lessonId);
  if (!a) return { state: 'running' as const, percent: 0, attempt: 1, attempts: 1, elapsedSec: 0 };
  if (a.state === 'failed') return { state: 'failed' as const, error: a.error };
  return {
    state: 'running' as const,
    percent: Math.min(95, Math.round((a.written / Math.max(1, a.expected)) * 100)),
    attempt: a.attempt,
    attempts: a.attempts,
    elapsedSec: Math.round((Date.now() - a.startedAt) / 1000),
  };
}
