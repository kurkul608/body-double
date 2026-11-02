import { randomUUID } from 'node:crypto';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDb } from '../db.js';
import { completeLesson } from '../complete.js';
import { searchHistory } from '../rag/embeddings.js';

export interface QuestionPayload {
  questionId: string;
  question: string;
  options: string[];
  allow_free_text: boolean;
}

export interface TutorToolCallbacks {
  /** Called before a question row is stored, so text written before it is stored first. */
  beforeQuestion: () => void;
  onQuestion: (question: QuestionPayload) => void;
  onProgress: (progress: { text: string }) => void;
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * In-process MCP server with the tutor's custom tools, bound to one lesson and
 * one SSE response via callbacks. Tool names as seen by the model:
 * mcp__tutor__ask_question, mcp__tutor__add_glossary_term,
 * mcp__tutor__search_history, mcp__tutor__mark_lesson_done.
 */
export function createTutorToolsServer(lessonId: number, callbacks: TutorToolCallbacks) {
  const askQuestion = tool(
    'ask_question',
    'Show the learner an interactive question card with answer options. The question is optional for the learner: the next user message may be an answer, a skip, or a free message instead. After calling this tool, end your turn immediately: output no further text and call no further tools.',
    {
      question: z.string().describe('The question text, simple English'),
      options: z.array(z.string()).min(0).max(6).describe('2-4 answer options; empty array for free-text-only'),
      allow_free_text: z.boolean().describe('Whether the learner may type their own answer'),
    },
    async (args) => {
      const questionId = randomUUID();
      const meta = {
        questionId,
        question: args.question,
        options: args.options,
        allow_free_text: args.allow_free_text,
      };
      callbacks.beforeQuestion();
      getDb()
        .prepare("INSERT INTO chat_messages (lesson_id, role, content, meta_json) VALUES (?, 'question', ?, ?)")
        .run(lessonId, args.question, JSON.stringify(meta));
      callbacks.onQuestion(meta);
      return textResult(
        `Question ${questionId} is now displayed to the learner. End your turn now. The learner's answer will arrive as the next message.`,
      );
    },
  );

  const addGlossaryTerm = tool(
    'add_glossary_term',
    'Add a technical term to the learner glossary (a review deck). Call it for every new term you define in a lesson.',
    {
      term: z.string().describe('The term in English, singular, lowercase unless a proper noun'),
      definition_en: z.string().describe('One-sentence definition in simple English'),
      note_native: z.string().optional().describe("Optional hint or translation in the learner's native language"),
    },
    async (args) => {
      getDb()
        .prepare(
          `INSERT INTO glossary (term, definition_en, note_native, lesson_id) VALUES (?, ?, ?, ?)
           ON CONFLICT(term) DO UPDATE SET definition_en = excluded.definition_en, note_native = excluded.note_native`,
        )
        .run(args.term, args.definition_en, args.note_native ?? null, lessonId);
      callbacks.onProgress({ text: `Glossary: added "${args.term}"` });
      return textResult(`Added "${args.term}" to the glossary.`);
    },
  );

  const searchHistoryTool = tool(
    'search_history',
    'Semantic search over the learner chat history from OTHER lessons. Use it to connect today to what the learner already covered, or to check whether a topic came up before.',
    {
      query: z.string().describe('What to look for, in English'),
      top_k: z.number().int().min(1).max(20).describe('How many results to return (default 5)'),
    },
    async (args) => {
      callbacks.onProgress({ text: `Searching history: ${args.query}` });
      const hits = await searchHistory(args.query, args.top_k, lessonId);
      if (hits.length === 0) return textResult('No matching history found.');
      const lines = hits.map(
        (h, i) =>
          `${i + 1}. [similarity ${h.similarity.toFixed(2)}] Lesson "${h.lessonTitle}" (${h.createdAt}), ${h.role}: ${h.content.slice(0, 500)}`,
      );
      return textResult(lines.join('\n\n'));
    },
  );

  const markLessonDone = tool(
    'mark_lesson_done',
    'Finalize the current lesson: store the quiz score, generate and save the lesson summary, and sync the learner progress log. Call only after the quiz, with an honest score.',
    {
      score: z.string().describe('Quiz result, e.g. "7/9"'),
      note: z.string().optional().describe('Short note: what was hard, what to review'),
    },
    async (args) => {
      callbacks.onProgress({ text: `Finalizing lesson, score ${args.score}` });
      const result = await completeLesson(lessonId, args.score, args.note ?? null);
      return textResult(`Lesson marked done with score ${args.score}. Summary saved:\n${result.summary}`);
    },
  );

  return createSdkMcpServer({
    name: 'tutor',
    version: '1.0.0',
    tools: [askQuestion, addGlossaryTerm, searchHistoryTool, markLessonDone],
  });
}

export const TUTOR_TOOL_NAMES = [
  'mcp__tutor__ask_question',
  'mcp__tutor__add_glossary_term',
  'mcp__tutor__search_history',
  'mcp__tutor__mark_lesson_done',
];
