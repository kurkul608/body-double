import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getModules, SERVER_UNREACHABLE } from '../lib/api';
import { loadLastLesson } from '../lib/last-lesson';
import type { ModuleWithProgress } from '../lib/types';
import { pct, TOTAL_COURSE_LESSONS, cn } from '../lib/utils';
import { ModuleStatusBadge } from '../components/StatusBadge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Progress } from '../components/ui/progress';

export function HomePage() {
  const [modules, setModules] = useState<ModuleWithProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getModules().then(setModules, (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Failed to load modules');
    });
  }, []);

  const totals = useMemo(() => {
    if (!modules) return null;
    const done = modules.reduce((sum, m) => sum + m.lessons_done, 0);
    const activeHours = modules
      .filter((m) => m.status === 'Do' || m.status === 'Review')
      .reduce((sum, m) => sum + m.est_hours, 0);
    return { done, activeHours };
  }, [modules]);

  const lastLesson = loadLastLesson();

  const continueTarget = useMemo(() => {
    if (lastLesson) {
      return { to: `/lesson/${lastLesson.id}`, label: `Continue: ${lastLesson.title}` };
    }
    const next = modules?.find(
      (m) => m.status !== 'Skip' && m.status !== 'Done' && m.lessons_done < m.lesson_count,
    );
    if (next) {
      return { to: `/phase/${next.phase_num}`, label: `Start Phase ${next.phase_num}` };
    }
    return null;
  }, [lastLesson, modules]);

  if (error) return <ErrorState message={error} />;
  if (!modules || !totals) return <LoadingState />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">
          AI Engineering from Scratch
        </p>
        <h1 className="mt-1 font-heading text-3xl font-semibold">Your learning path</h1>

        <Card className="mt-5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink-soft">Overall progress</span>
                <span className="font-mono text-sm font-medium">
                  {totals.done} / {TOTAL_COURSE_LESSONS} lessons
                </span>
              </div>
              <Progress className="mt-2 h-2.5" value={pct(totals.done, TOTAL_COURSE_LESSONS)} />
              <p className="mt-2 text-xs text-ink-soft">
                ~{totals.activeHours} h left in active phases
              </p>
            </div>
            {continueTarget && (
              <Button size="lg" onClick={() => navigate(continueTarget.to)}>
                {continueTarget.label} →
              </Button>
            )}
          </CardContent>
        </Card>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.id} module={m} />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({ module: m }: { module: ModuleWithProgress }) {
  const total = m.lesson_count || m.lessons_total;
  const skipped = m.status === 'Skip';
  return (
    <Link to={`/phase/${m.phase_num}`} className={cn('group', skipped && 'opacity-50')}>
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="flex-row items-start justify-between gap-2 pb-3">
          <span className="font-mono text-2xl font-semibold text-ink-soft">
            {String(m.phase_num).padStart(2, '0')}
          </span>
          <ModuleStatusBadge status={m.status} />
        </CardHeader>
        <CardContent className="pt-0">
          <h2 className="font-heading text-base font-semibold leading-snug group-hover:text-accent">
            {m.title}
          </h2>
          <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
            <span className="font-mono">
              {m.lessons_done}/{total} lessons
            </span>
            <span>{m.est_hours} h</span>
          </div>
          <Progress
            className="mt-1.5"
            value={pct(m.lessons_done, total)}
            barClassName={m.status === 'Done' ? 'bg-accent' : skipped ? 'bg-line' : 'bg-accent'}
          />
        </CardContent>
      </Card>
    </Link>
  );
}

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center py-24 text-sm text-ink-soft">
      Loading…
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-heading text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-soft">{message}</p>
      {message === SERVER_UNREACHABLE && (
        <p className="mt-4 text-xs text-ink-soft">
          Is the server running on port 3111? Start it, then reload.
        </p>
      )}
    </div>
  );
}
