// API contract types. Source of truth: SPEC.md at the project root.
// Field names for progress/quiz payloads are assumptions to sync with the server agent.

export type ModuleStatus = 'Do' | 'Review' | 'Skip' | 'Done';
export type LessonStatus = 'not_started' | 'in_progress' | 'done';
export type ChatRole = 'user' | 'assistant' | 'question' | 'answer';

/** GET /api/modules — module row + lesson progress */
export interface ModuleWithProgress {
  id: number;
  phase_num: number;
  title: string;
  status: ModuleStatus;
  est_hours: number;
  lesson_count: number;
  /** lessons with status=done in this module */
  lessons_done: number;
  /** lessons actually synced in DB for this module */
  lessons_total: number;
}

/** GET /api/modules/:phase/lessons — one row */
export interface LessonListItem {
  id: number;
  module_id: number;
  num: number;
  slug: string;
  title: string;
  status: LessonStatus;
  score: string | null;
}

export interface QuizQuestion {
  question: string;
  options?: string[];
  answer?: string | number;
  explanation?: string;
}

/** GET /api/lessons/:id */
/** Progress of the server-side ADHD rewrite; null once the lesson is adapted. */
export type LessonAdaptation =
  | { state: 'running'; percent: number; attempt: number; attempts: number; elapsedSec: number }
  | { state: 'failed'; error: string };

export interface LessonDetail extends LessonListItem {
  /** true once the ADHD rewrite landed; until then md is null */
  adapted: boolean;
  md: string | null;
  adaptation: LessonAdaptation | null;
  quiz_json: string | null;
  summary: string | null;
  /** phase number of the parent module, for breadcrumbs */
  phase_num?: number;
}

/** GET /api/lessons/:id/messages — one row */
export interface ChatMessage {
  id: number;
  lesson_id: number;
  role: ChatRole;
  content: string;
  meta_json: string | null;
  created_at: string;
}

/** POST /api/lessons/:id/chat body. Empty body {} on a fresh lesson = kickoff. */
export type ChatRequest =
  | { message: string }
  | { answer: { questionId: string; choice?: string; text?: string } }
  | Record<string, never>;

/** SSE `question` event payload (mirrors ask_question tool input) */
export interface QuestionPayload {
  questionId: string;
  question: string;
  options: string[];
  allow_free_text: boolean;
}

/** POST /api/lessons/:id/complete response (assumed shape) */
/** GET /api/lessons/:id/complete/progress — polled while completing */
export type CompletionProgress =
  | { state: 'idle' }
  | { state: 'running'; stage: 'reading' | 'writing' | 'saving'; percent: number; elapsedSec: number };

export interface CompleteResponse {
  status: LessonStatus;
  score: string | null;
  summary: string | null;
}
