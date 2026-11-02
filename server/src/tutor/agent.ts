import { query } from '@anthropic-ai/claude-agent-sdk';
import { env, looksLikeModelUnavailable, modelUnavailableError } from '../env.js';
import { getDb, type ChatMessageRow, type LessonRow } from '../db.js';
import { projectRoot } from '../paths.js';
import { buildSystemPrompt, buildTurnPrompt } from './prompt-builder.js';
import { createTutorToolsServer, TUTOR_TOOL_NAMES, type TutorToolCallbacks } from './tools.js';

export interface TutorTurnCallbacks extends TutorToolCallbacks {
  onTextDelta: (text: string) => void;
}

export interface TutorTurnResult {
  assistantText: string;
}

/**
 * Run one tutor turn for a lesson. The latest learner message must already be
 * stored in chat_messages. Streams text deltas / questions / progress through
 * the callbacks and returns the full assistant text of the turn.
 */
export async function runTutorTurn(
  lesson: LessonRow,
  callbacks: TutorTurnCallbacks,
  abortController: AbortController,
): Promise<TutorTurnResult> {
  const db = getDb();
  const messages = db
    .prepare('SELECT * FROM chat_messages WHERE lesson_id = ? ORDER BY id')
    .all(lesson.id) as ChatMessageRow[];

  const systemPrompt = buildSystemPrompt(lesson);
  const prompt = buildTurnPrompt(messages);
  const tutorServer = createTutorToolsServer(lesson.id, callbacks);

  const q = query({
    prompt,
    options: {
      model: env.tutorModel,
      systemPrompt: { type: 'custom', prompt: systemPrompt },
      mcpServers: { tutor: tutorServer },
      tools: [], // no built-in tools; the tutor only gets its own MCP tools
      allowedTools: TUTOR_TOOL_NAMES,
      maxTurns: 16,
      includePartialMessages: true,
      persistSession: false,
      cwd: projectRoot,
      abortController,
      env: process.env,
    },
  });

  let assistantText = '';

  for await (const message of q) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        message.parent_tool_use_id === null
      ) {
        assistantText += event.delta.text;
        callbacks.onTextDelta(event.delta.text);
      }
    } else if (message.type === 'assistant') {
      if (message.error === 'model_not_found') throw modelUnavailableError(env.tutorModel, 'TUTOR_MODEL');
    } else if (message.type === 'result') {
      if (message.subtype !== 'success') {
        if (looksLikeModelUnavailable(message.errors)) throw modelUnavailableError(env.tutorModel, 'TUTOR_MODEL');
        throw new Error(`Tutor run failed: ${message.subtype}`);
      }
    }
  }

  return { assistantText };
}
