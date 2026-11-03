import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { completeLesson, getCompletionProgress, getLesson, getMessages, retryAdaptation } from '../lib/api';
import { CHAT_MAX_WIDTH, CHAT_MIN_WIDTH, useChatLayout } from '../lib/chat-layout';
import { saveLastLesson } from '../lib/last-lesson';
import { cn } from '../lib/utils';
import type { ChatMessage, CompletionProgress, LessonAdaptation, LessonDetail } from '../lib/types';
import { ChatPanel } from '../components/ChatPanel';
import { Markdown } from '../components/Markdown';
import { LessonStatusBadge } from '../components/StatusBadge';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ErrorState, LoadingState } from './HomePage';

export function LessonPage() {
  const params = useParams<{ id: string }>();
  const lessonId = Number(params.id);

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completion, setCompletion] = useState<CompletionProgress | null>(null);
  const [mobileTab, setMobileTab] = useState<'lesson' | 'chat'>('lesson');
  const chat = useChatLayout();

  useEffect(() => {
    if (!Number.isFinite(lessonId)) {
      setError('Invalid lesson id');
      return;
    }
    setLesson(null);
    setMessages(null);
    Promise.all([getLesson(lessonId), getMessages(lessonId)]).then(
      ([lessonData, messageRows]) => {
        setLesson(lessonData);
        setMessages(messageRows);
        saveLastLesson({
          id: lessonData.id,
          title: lessonData.title,
          phase_num: lessonData.phase_num ?? 0,
        });
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load lesson'),
    );
  }, [lessonId]);

  // Until the server-side ADHD rewrite lands, poll the lesson and swap it in
  // the moment it is ready. A failed rewrite stops polling until Retry.
  const waitingForAdaptation = lesson !== null && !lesson.adapted && lesson.adaptation?.state !== 'failed';
  useEffect(() => {
    if (!waitingForAdaptation) return;
    const timer = setInterval(() => {
      getLesson(lessonId).then(
        (fresh) => setLesson((prev) => (prev?.id === fresh.id ? fresh : prev)),
        () => undefined,
      );
    }, 1500);
    return () => clearInterval(timer);
  }, [waitingForAdaptation, lessonId]);

  const handleRetryAdaptation = () => {
    retryAdaptation(lessonId)
      .then(() => getLesson(lessonId))
      .then(
        (fresh) => setLesson((prev) => (prev?.id === fresh.id ? fresh : prev)),
        (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to restart adaptation'),
      );
  };

  // While the summary is being written, poll its progress for the bar.
  useEffect(() => {
    if (!completing) {
      setCompletion(null);
      return;
    }
    const timer = setInterval(() => {
      getCompletionProgress(lessonId).then(setCompletion, () => undefined);
    }, 700);
    return () => clearInterval(timer);
  }, [completing, lessonId]);

  // After each finished chat exchange the tutor may have changed status/score.
  const refreshLessonMeta = useCallback(() => {
    getLesson(lessonId).then(
      (fresh) => setLesson((prev) => (prev ? { ...prev, ...fresh } : fresh)),
      () => undefined,
    );
  }, [lessonId]);

  const handleComplete = () => {
    if (completing || !lesson || lesson.status === 'done') return;
    setCompleting(true);
    completeLesson(lessonId)
      .then((result) => {
        setLesson((prev) =>
          prev
            ? {
                ...prev,
                status: result.status ?? 'done',
                score: result.score ?? prev.score,
                summary: result.summary ?? prev.summary,
              }
            : prev,
        );
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to complete lesson');
      })
      .finally(() => setCompleting(false));
  };

  if (error) return <ErrorState message={error} />;
  if (!lesson || !messages) return <LoadingState />;

  const backTo = lesson.phase_num !== undefined ? `/phase/${lesson.phase_num}` : '/';

  const lessonPane = (
    <ScrollArea className="h-full px-4 py-6 md:px-8">
      {/* Reading column (~70ch) centered in whatever space the chat dock leaves */}
      <div className="mx-auto w-full max-w-184">
        {lesson.summary && lesson.status === 'done' && (
          <div className="mb-6 rounded-xl border border-accent/40 bg-accent-soft p-4">
            <p className="text-sm font-semibold text-accent">Your summary</p>
            <div className="mt-1 text-sm leading-relaxed">
              <Markdown variant="chat">{lesson.summary}</Markdown>
            </div>
          </div>
        )}
        <Markdown variant="lesson">{lesson.md ?? ''}</Markdown>
        <div className="h-16" />
      </div>
    </ScrollArea>
  );

  const chatPane = (
    <ChatPanel lessonId={lessonId} initialMessages={messages} onExchangeDone={refreshLessonMeta} />
  );

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-card px-4 py-3 md:px-6">
      <Link to={backTo} className="text-sm text-ink-soft hover:text-ink hover:underline">
        ← Phase {lesson.phase_num ?? ''}
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono text-sm text-ink-soft">
          {String(lesson.num).padStart(2, '0')}
        </span>
        <h1 className="truncate font-heading text-base font-semibold md:text-lg">
          {lesson.title}
        </h1>
        <LessonStatusBadge status={lesson.status} />
        {lesson.score && <Badge variant="accent">score {lesson.score}</Badge>}
      </div>
      {lesson.status !== 'done' && (
        <Button size="sm" onClick={handleComplete} disabled={completing}>
          {completing ? 'Summarizing…' : '✓ Complete lesson'}
        </Button>
      )}
    </header>
  );

  const completionBar = completing && <CompletionBar progress={completion} />;

  if (!lesson.adapted) {
    return (
      <div className="flex h-screen flex-col">
        {header}
        {completionBar}
        <AdaptingState adaptation={lesson.adaptation} onRetry={handleRetryAdaptation} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {header}
      {completionBar}

      {/* Desktop: lesson column centered in the free space + resizable chat dock */}
      <div className={cn('hidden min-h-0 flex-1 md:flex', chat.resizing && 'select-none')}>
        <div className="min-w-0 flex-1">{lessonPane}</div>
        {chat.open && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat panel (double-click to reset)"
              aria-valuenow={chat.width}
              aria-valuemin={CHAT_MIN_WIDTH}
              aria-valuemax={CHAT_MAX_WIDTH}
              tabIndex={0}
              {...chat.handleProps}
              className={cn(
                'group relative w-px shrink-0 cursor-col-resize bg-line outline-hidden',
                'before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[""]',
                'focus-visible:bg-accent',
                chat.resizing && 'bg-accent',
              )}
            >
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </div>
            <aside
              aria-label="Tutor chat"
              style={{ width: chat.width }}
              className="flex min-h-0 shrink-0 flex-col bg-paper"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
                <span className="text-sm font-semibold">Tutor</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={chat.toggle}
                  title="Hide chat (focus mode)"
                  aria-label="Hide chat"
                >
                  Hide →
                </Button>
              </div>
              <div className="min-h-0 flex-1">{chatPane}</div>
            </aside>
          </>
        )}
      </div>
      {!chat.open && (
        <Button
          onClick={chat.toggle}
          className="fixed bottom-6 right-6 z-10 hidden shadow-lg md:inline-flex"
          aria-label="Show tutor chat"
        >
          💬 Ask tutor
        </Button>
      )}

      {/* Mobile: tabs */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(v) => setMobileTab(v as 'lesson' | 'chat')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-4 mt-3 self-start">
            <TabsTrigger value="lesson">Lesson</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>
          <TabsContent value="lesson" className="min-h-0 flex-1">
            {lessonPane}
          </TabsContent>
          <TabsContent value="chat" className="min-h-0 flex-1">
            {chatPane}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const COMPLETION_STAGE_LABEL = {
  reading: 'Reading your chat…',
  writing: 'Writing your summary…',
  saving: 'Saving progress…',
} as const;

/** Thin strip under the header while POST /complete runs. */
function CompletionBar({ progress }: { progress: CompletionProgress | null }) {
  const running = progress?.state === 'running' ? progress : null;
  const percent = running?.percent ?? 0;
  return (
    <div className="shrink-0 border-b border-line bg-accent-soft px-4 py-2 md:px-6" aria-live="polite">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-accent">
          {running ? COMPLETION_STAGE_LABEL[running.stage] : 'Starting…'}
        </span>
        <span className="font-mono text-ink-soft">
          ~{percent}% · {running?.elapsedSec ?? 0}s
        </span>
      </div>
      <Progress className="mt-1.5 h-1.5" value={percent} aria-label="Summary progress" />
    </div>
  );
}

/** Shown instead of the lesson and chat while the server rewrites the lesson. */
function AdaptingState({
  adaptation,
  onRetry,
}: {
  adaptation: LessonAdaptation | null;
  onRetry: () => void;
}) {
  if (adaptation?.state === 'failed') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="font-heading text-lg font-semibold">Could not adapt this lesson</p>
        <p className="mt-2 text-sm text-ink-soft">{adaptation.error}</p>
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const percent = adaptation?.percent ?? 0;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-24">
      <p className="font-heading text-lg font-semibold">Adapting this lesson for you</p>
      <p className="mt-1 text-sm text-ink-soft">
        Short blocks, simple English, clean formulas. The lesson opens by itself when ready.
      </p>
      <Progress className="mt-5" value={percent} aria-label="Adaptation progress" />
      <div className="mt-2 flex justify-between font-mono text-xs text-ink-soft">
        <span>~{percent}%</span>
        <span>
          {adaptation && adaptation.attempts > 1 && adaptation.attempt > 1
            ? `attempt ${adaptation.attempt}/${adaptation.attempts} · `
            : ''}
          {adaptation?.elapsedSec ?? 0}s
        </span>
      </div>
    </div>
  );
}
