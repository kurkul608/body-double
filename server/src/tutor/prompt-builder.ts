import fs from 'node:fs';
import { getDb, type ChatMessageRow, type GlossaryRow, type LessonRow } from '../db.js';
import { skillPaths, systemPromptPath } from '../paths.js';
import { parseProfileHeader, readLearningMdIfExists } from '../sync/learning-md.js';

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Full tutor system prompt: distilled rules (with {{LEARNER_NAME}},
 * {{NATIVE_LANGUAGE}}, {{ENGLISH_LEVEL}} filled from the profile header) + the
 * vendored source SKILL.md files + the learner's profile/LEARNING.md + this
 * lesson's content + glossary + all lesson summaries (long-term memory across lessons).
 */
export function buildSystemPrompt(lesson: LessonRow): string {
  const parts: string[] = [];

  const base = readIfExists(systemPromptPath);
  if (!base) throw new Error(`system-prompt.md not found at ${systemPromptPath}`);
  const learning = readLearningMdIfExists();
  const profile = parseProfileHeader(learning);
  parts.push(
    base
      .replaceAll('{{LEARNER_NAME}}', profile.name)
      .replaceAll('{{NATIVE_LANGUAGE}}', profile.nativeLanguage)
      .replaceAll('{{ENGLISH_LEVEL}}', profile.englishLevel),
  );

  for (const skill of skillPaths) {
    const content = readIfExists(skill.file);
    if (content) parts.push(`\n\n---\n\n# ${skill.title} (full source)\n\n${content}`);
  }

  if (learning) parts.push(`\n\n---\n\n# Learner profile and progress (LEARNING.md)\n\n${learning}`);
  else parts.push(`\n\n---\n\n# Learner profile and progress\n\nNo profile/LEARNING.md exists yet. Use the defaults above.`);

  const db = getDb();
  const moduleRow = db.prepare('SELECT phase_num, title FROM modules WHERE id = ?').get(lesson.module_id) as
    | { phase_num: number; title: string }
    | undefined;

  parts.push(
    `\n\n---\n\n# Current lesson\n\n` +
      `Phase ${moduleRow?.phase_num ?? '?'}: ${moduleRow?.title ?? ''} — Lesson ${lesson.num}: ${lesson.title}\n` +
      `Lesson status: ${lesson.status}\n\n## Lesson content (docs/en.md)\n\n${lesson.md ?? '(content not fetched)'}`,
  );

  if (lesson.quiz_json) {
    parts.push(`\n\n## Lesson quiz (quiz.json)\n\n\`\`\`json\n${lesson.quiz_json}\n\`\`\``);
  } else {
    parts.push(`\n\n## Lesson quiz\n\nNo quiz.json exists for this lesson. Write 3–5 questions yourself at quiz time.`);
  }

  const glossary = db.prepare('SELECT * FROM glossary ORDER BY term').all() as GlossaryRow[];
  if (glossary.length > 0) {
    const lines = glossary.map(
      (g) => `- **${g.term}** — ${g.definition_en}${g.note_native ? ` (${profile.nativeLanguage}: ${g.note_native})` : ''}`,
    );
    parts.push(`\n\n---\n\n# Glossary so far (terms already defined — do not re-add)\n\n${lines.join('\n')}`);
  }

  const summaries = db
    .prepare(
      `SELECT s.lesson_id, s.summary, s.mistakes, l.title, l.num, m.phase_num
       FROM lesson_summaries s
       JOIN lessons l ON l.id = s.lesson_id
       JOIN modules m ON m.id = l.module_id
       ORDER BY m.phase_num, l.num`,
    )
    .all() as Array<{ lesson_id: number; summary: string; mistakes: string | null; title: string; num: number; phase_num: number }>;
  if (summaries.length > 0) {
    const blocks = summaries.map(
      (s) =>
        `## Phase ${s.phase_num}, Lesson ${s.num}: ${s.title}\n${s.summary}` +
        (s.mistakes ? `\nMistakes/weak spots: ${s.mistakes}` : ''),
    );
    parts.push(`\n\n---\n\n# Summaries of completed lessons (the learner's history)\n\n${blocks.join('\n\n')}`);
  }

  return parts.join('');
}

function labelFor(msg: ChatMessageRow): string {
  switch (msg.role) {
    case 'user':
      return 'Learner';
    case 'assistant':
      return 'Tutor';
    case 'question': {
      let suffix = '';
      try {
        const meta = msg.meta_json ? (JSON.parse(msg.meta_json) as { options?: string[] }) : null;
        if (meta?.options?.length) suffix = ` [options: ${meta.options.join(' | ')}]`;
      } catch {
        // ignore malformed meta
      }
      return `Tutor asked (interactive question)${suffix}\nQuestion`;
    }
    case 'answer':
      return 'Learner answered';
  }
}

/**
 * The prompt for one tutor turn: the transcript of this lesson's conversation.
 * The newest message (already stored in the DB) is framed as the message to
 * respond to.
 */
export function buildTurnPrompt(messages: ChatMessageRow[]): string {
  if (messages.length === 0) {
    return (
      'The learner pressed "Start lesson". Send only the Step 1 message (frame the problem). ' +
      'Do not call ask_question in this turn and do not start Step 2. ' +
      'End with one line: "Reply when you are ready for Step 2."'
    );
  }
  const history = messages.slice(0, -1);
  const current = messages[messages.length - 1]!;

  const parts: string[] = [];
  if (history.length > 0) {
    const lines = history.map((m) => `${labelFor(m)}: ${m.content}`);
    parts.push(`Conversation so far in this lesson:\n\n${lines.join('\n\n')}`);
  }
  parts.push(`New message — ${labelFor(current)}: ${current.content}\n\nRespond as the tutor.`);
  return parts.join('\n\n---\n\n');
}
