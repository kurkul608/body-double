import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';
import type { QuestionPayload } from '../lib/types';

export interface QuestionCardProps {
  question: QuestionPayload;
  /** answered questions render read-only with the chosen answer highlighted; '' means skipped */
  answered?: string;
  onSubmit?: (answer: { choice?: string; text?: string }) => void;
  onSkip?: () => void;
}

/** Mirrors the CLI AskUserQuestion card: option buttons + optional free text. */
export function QuestionCard({ question, answered, onSubmit, onSkip }: QuestionCardProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const readOnly = answered !== undefined || !onSubmit;
  const canSubmit = !readOnly && (choice !== null || text.trim().length > 0);

  const submit = () => {
    if (!canSubmit || !onSubmit) return;
    onSubmit({
      choice: choice ?? undefined,
      text: text.trim() ? text.trim() : undefined,
    });
  };

  return (
    <Card className="border-now/40 bg-now-soft/40">
      <CardHeader className="pb-2">
        <CardTitle className="font-sans text-sm font-semibold text-now">
          Question from your tutor
        </CardTitle>
        <p className="text-sm leading-relaxed">{question.question}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {question.options.map((option) => {
          const selected = readOnly ? answered === option : choice === option;
          return (
            <button
              key={option}
              type="button"
              disabled={readOnly}
              onClick={() => {
                setChoice((prev) => (prev === option ? null : option));
              }}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                selected
                  ? 'border-now bg-now text-white'
                  : 'border-line bg-card hover:border-now/60',
                readOnly && !selected && 'opacity-60',
              )}
            >
              {option}
            </button>
          );
        })}
        {question.allow_free_text && !readOnly && (
          <Textarea
            rows={2}
            placeholder="Or write your own answer…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        )}
        {readOnly && answered !== undefined && answered !== '' && !question.options.includes(answered) && (
          <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm italic">
            {answered}
          </p>
        )}
        {readOnly && answered === '' && (
          <p className="px-1 text-xs italic text-ink-soft">skipped — no problem</p>
        )}
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="now" size="sm" disabled={!canSubmit} onClick={submit}>
              Submit answer
            </Button>
            {onSkip && (
              <Button variant="ghost" size="sm" onClick={onSkip}>
                Skip
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
