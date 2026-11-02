import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getModules, getPhaseLessons } from '../lib/api';
import type { LessonListItem, ModuleWithProgress } from '../lib/types';
import { cn, pct } from '../lib/utils';
import { LessonStatusBadge, ModuleStatusBadge } from '../components/StatusBadge';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { ErrorState, LoadingState } from './HomePage';

export function PhasePage() {
  const params = useParams<{ num: string }>();
  const phaseNum = Number(params.num);

  const [lessons, setLessons] = useState<LessonListItem[] | null>(null);
  const [module, setModule] = useState<ModuleWithProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(phaseNum)) {
      setError('Invalid phase number');
      return;
    }
    Promise.all([getPhaseLessons(phaseNum), getModules()]).then(
      ([lessonRows, moduleRows]) => {
        setLessons(lessonRows);
        setModule(moduleRows.find((m) => m.phase_num === phaseNum) ?? null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load phase'),
    );
  }, [phaseNum]);

  const nextLessonId = useMemo(
    () => lessons?.find((l) => l.status !== 'done')?.id ?? null,
    [lessons],
  );

  if (error) return <ErrorState message={error} />;
  if (!lessons) return <LoadingState />;

  const doneCount = lessons.filter((l) => l.status === 'done').length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <nav className="mb-4 text-sm text-ink-soft">
        <Link to="/" className="hover:text-ink hover:underline">
          ← All phases
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-3xl font-semibold text-ink-soft">
            {String(phaseNum).padStart(2, '0')}
          </span>
          <h1 className="font-heading text-2xl font-semibold">
            {module?.title ?? `Phase ${phaseNum}`}
          </h1>
          {module && <ModuleStatusBadge status={module.status} />}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress className="max-w-xs" value={pct(doneCount, lessons.length)} />
          <span className="font-mono text-sm text-ink-soft">
            {doneCount}/{lessons.length} done
          </span>
          {module && <span className="text-sm text-ink-soft">· {module.est_hours} h</span>}
        </div>
      </header>

      <ol className="flex flex-col gap-2">
        {lessons.map((lesson) => {
          const isNext = lesson.id === nextLessonId;
          return (
            <li key={lesson.id}>
              <Link
                to={`/lesson/${lesson.id}`}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors',
                  isNext
                    ? 'border-accent shadow-sm hover:bg-accent-soft'
                    : 'border-line hover:border-ink-soft/40',
                  lesson.status === 'done' && 'opacity-80',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium',
                    lesson.status === 'done'
                      ? 'bg-accent text-white'
                      : lesson.status === 'in_progress'
                        ? 'bg-now text-white'
                        : 'bg-mono-bg text-ink-soft',
                  )}
                >
                  {lesson.status === 'done' ? '✓' : lesson.num}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {lesson.title}
                </span>
                {lesson.score && <Badge variant="accent">score {lesson.score}</Badge>}
                {isNext ? (
                  <Badge variant="accent">▶ next up</Badge>
                ) : (
                  <LessonStatusBadge status={lesson.status} />
                )}
              </Link>
            </li>
          );
        })}
      </ol>

      {lessons.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
          No lessons synced for this phase yet. Run <span className="font-mono">pnpm sync</span>{' '}
          on the server.
        </p>
      )}
    </div>
  );
}
