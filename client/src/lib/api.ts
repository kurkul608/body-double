import type {
  ChatMessage,
  ChatRequest,
  CompleteResponse,
  CompletionProgress,
  LessonDetail,
  LessonListItem,
  ModuleWithProgress,
  QuestionPayload,
} from './types';

/** Error text when the API server is down (fetch rejects or the Vite proxy has no upstream). */
export const SERVER_UNREACHABLE = 'Cannot reach the server.';

async function request<T>(method: 'GET' | 'POST', url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, method });
  } catch {
    throw new Error(SERVER_UNREACHABLE);
  }
  if (!res.ok) {
    // Fastify always answers errors with JSON; no JSON body means the proxy could not reach it.
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const detail = data?.error ?? data?.message;
    if (!detail) throw new Error(SERVER_UNREACHABLE);
    throw new Error(`${method} ${url} failed: ${res.status} — ${detail}`);
  }
  return res.json() as Promise<T>;
}

const getJson = <T>(url: string) => request<T>('GET', url);

// No Content-Type without a body: Fastify rejects an empty JSON body with 400.
const postJson = <T>(url: string, body?: unknown) =>
  request<T>(
    'POST',
    url,
    body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

export const getModules = () => getJson<ModuleWithProgress[]>('/api/modules');

export const getPhaseLessons = (phase: number) =>
  getJson<LessonListItem[]>(`/api/modules/${phase}/lessons`);

export const getLesson = (id: number) => getJson<LessonDetail>(`/api/lessons/${id}`);

export const retryAdaptation = (id: number) =>
  postJson<{ ok: true }>(`/api/lessons/${id}/adaptation/retry`);

export const getMessages = (id: number) =>
  getJson<ChatMessage[]>(`/api/lessons/${id}/messages`);

export const completeLesson = (id: number) =>
  postJson<CompleteResponse>(`/api/lessons/${id}/complete`);

export const getCompletionProgress = (id: number) =>
  getJson<CompletionProgress>(`/api/lessons/${id}/complete/progress`);

export const syncContent = () => postJson<unknown>('/api/sync');

// ---------------------------------------------------------------------------
// SSE over POST: fetch + ReadableStream parsing of `event:`/`data:` frames.
// ---------------------------------------------------------------------------

export interface ChatStreamHandlers {
  onTextDelta: (text: string) => void;
  onQuestion: (question: QuestionPayload) => void;
  onProgress: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function parseData(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { text: raw };
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dispatch(event: string, raw: string, handlers: ChatStreamHandlers): void {
  const data = parseData(raw);
  switch (event) {
    case 'text_delta': {
      handlers.onTextDelta(str(data.text) || str(data.delta) || str(data.value));
      break;
    }
    case 'question': {
      // Server may send the payload flat or nested under `question`.
      const nested = data.question;
      const q =
        typeof data.questionId === 'string' || Array.isArray(data.options)
          ? data
          : nested !== null && typeof nested === 'object'
            ? (nested as Record<string, unknown>)
            : data;
      handlers.onQuestion({
        questionId: str(q.questionId) || str(q.id) || `q-${Date.now()}`,
        question: str(q.question) || str(q.text),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
        allow_free_text: q.allow_free_text !== false,
      });
      break;
    }
    case 'progress': {
      handlers.onProgress(str(data.text) || str(data.message) || str(data.status));
      break;
    }
    case 'done': {
      handlers.onDone();
      break;
    }
    case 'error': {
      handlers.onError(str(data.message) || str(data.error) || 'Unknown tutor error');
      break;
    }
    default:
      // Unknown event types are ignored so the server can add events safely.
      break;
  }
}

/**
 * POST /api/lessons/:id/chat and consume the SSE response.
 * Resolves when the stream ends. `onDone`/`onError` fire from stream events;
 * transport failures also route to `onError`.
 */
export async function streamChat(
  lessonId: number,
  body: ChatRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/lessons/${lessonId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    handlers.onError(err instanceof Error ? err.message : 'Network error');
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError(`Chat request failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processFrame = (frame: string): void => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0 || event !== 'message') {
      dispatch(event, dataLines.join('\n'), handlers);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep).replace(/\r/g, '');
        buffer = buffer.slice(sep + 2);
        if (frame.trim()) processFrame(frame);
      }
    }
    const rest = buffer.replace(/\r/g, '').trim();
    if (rest) processFrame(rest);
  } catch (err) {
    if (!signal?.aborted) {
      handlers.onError(err instanceof Error ? err.message : 'Stream interrupted');
    }
  }
}
