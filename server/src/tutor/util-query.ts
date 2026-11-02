import { query } from '@anthropic-ai/claude-agent-sdk';
import { env, looksLikeModelUnavailable, modelUnavailableError } from '../env.js';

/**
 * One-shot call to UTIL_MODEL (summaries, titles, lesson rewrites).
 * No tools, single turn, returns the final text. Pass `onText` to also
 * receive text deltas as they stream (used for progress reporting).
 */
export async function runUtil(
  systemPrompt: string,
  prompt: string,
  onText?: (chunk: string) => void,
): Promise<string> {
  const q = query({
    prompt,
    options: {
      model: env.utilModel,
      systemPrompt: { type: 'custom', prompt: systemPrompt },
      tools: [],
      maxTurns: 1,
      includePartialMessages: onText !== undefined,
      persistSession: false,
      env: process.env,
    },
  });

  for await (const message of q) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText?.(event.delta.text);
    } else if (message.type === 'assistant') {
      if (message.error === 'model_not_found') throw modelUnavailableError(env.utilModel, 'UTIL_MODEL');
    } else if (message.type === 'result') {
      if (message.subtype === 'success') return message.result;
      if (looksLikeModelUnavailable(message.errors)) throw modelUnavailableError(env.utilModel, 'UTIL_MODEL');
      throw new Error(`Utility model call failed: ${message.subtype}`);
    }
  }
  throw new Error('Utility model call produced no result');
}
