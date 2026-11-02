import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/api';
import type { ChatMessage, ChatRequest, QuestionPayload } from '../lib/types';
import { Markdown } from './Markdown';
import { QuestionCard } from './QuestionCard';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

type Bubble =
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string }
  | { kind: 'question'; question: QuestionPayload; answered?: string }
  | { kind: 'error'; content: string };

function parseQuestionMeta(msg: ChatMessage): QuestionPayload {
  try {
    const meta = msg.meta_json ? (JSON.parse(msg.meta_json) as Partial<QuestionPayload>) : {};
    return {
      questionId: meta.questionId ?? `history-${msg.id}`,
      question: meta.question ?? msg.content,
      options: Array.isArray(meta.options) ? meta.options : [],
      allow_free_text: meta.allow_free_text ?? true,
    };
  } catch {
    return {
      questionId: `history-${msg.id}`,
      question: msg.content,
      options: [],
      allow_free_text: true,
    };
  }
}

function historyToBubbles(messages: ChatMessage[]): {
  bubbles: Bubble[];
  pending: QuestionPayload | null;
} {
  const bubbles: Bubble[] = [];
  // A question is only "skipped" if the user wrote something after it.
  // The trailing unanswered question survives page reloads as the active card.
  let lastUnanswered: { index: number; question: QuestionPayload } | null = null;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    switch (msg.role) {
      case 'user':
        lastUnanswered = null;
        bubbles.push({ kind: 'user', content: msg.content });
        break;
      case 'assistant':
        if (msg.content.trim()) bubbles.push({ kind: 'assistant', content: msg.content });
        break;
      case 'question': {
        const question = parseQuestionMeta(msg);
        const next = messages[i + 1];
        if (next && next.role === 'answer') {
          bubbles.push({ kind: 'question', question, answered: next.content });
          i++;
        } else {
          lastUnanswered = { index: bubbles.length, question };
          bubbles.push({ kind: 'question', question, answered: '' });
        }
        break;
      }
      case 'answer':
        lastUnanswered = null;
        bubbles.push({ kind: 'user', content: msg.content });
        break;
    }
  }
  if (lastUnanswered) {
    bubbles[lastUnanswered.index] = { kind: 'question', question: lastUnanswered.question };
    return { bubbles, pending: lastUnanswered.question };
  }
  return { bubbles, pending: null };
}

export interface ChatPanelProps {
  lessonId: number;
  initialMessages: ChatMessage[];
  /** fires after each finished exchange (statuses may have changed server-side) */
  onExchangeDone?: () => void;
}

export function ChatPanel({ lessonId, initialMessages, onExchangeDone }: ChatPanelProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => historyToBubbles(initialMessages).bubbles);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressNote, setProgressNote] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QuestionPayload | null>(
    () => historyToBubbles(initialMessages).pending,
  );
  const [input, setInput] = useState('');

  const streamRef = useRef('');
  const settledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { bubbles: fromHistory, pending } = historyToBubbles(initialMessages);
    setBubbles(fromHistory);
    setActiveQuestion(pending);
    setStreamText('');
    streamRef.current = '';
  }, [lessonId, initialMessages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, streamText, thinking, activeQuestion]);

  const flushStream = useCallback(() => {
    const text = streamRef.current;
    streamRef.current = '';
    setStreamText('');
    if (text.trim()) {
      setBubbles((prev) => [...prev, { kind: 'assistant', content: text }]);
    }
  }, []);

  const runStream = useCallback(
    (body: ChatRequest) => {
      setBusy(true);
      setThinking(true);
      setProgressNote(null);
      settledRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;

      void streamChat(
        lessonId,
        body,
        {
          onTextDelta: (text) => {
            setThinking(false);
            streamRef.current += text;
            setStreamText(streamRef.current);
          },
          onQuestion: (question) => {
            setThinking(false);
            flushStream();
            setActiveQuestion(question);
            setBubbles((prev) => [...prev, { kind: 'question', question }]);
          },
          onProgress: (text) => {
            setProgressNote(text || null);
          },
          onDone: () => {
            settledRef.current = true;
            flushStream();
            setThinking(false);
            setBusy(false);
            setProgressNote(null);
            onExchangeDone?.();
          },
          onError: (message) => {
            settledRef.current = true;
            flushStream();
            setThinking(false);
            setBusy(false);
            setProgressNote(null);
            setBubbles((prev) => [...prev, { kind: 'error', content: message }]);
          },
        },
        controller.signal,
      ).then(() => {
        // Stream ended without an explicit done/error event — clean up.
        if (!settledRef.current) {
          settledRef.current = true;
          flushStream();
          setThinking(false);
          setProgressNote(null);
          setBusy(false);
        }
      });
    },
    [lessonId, flushStream, onExchangeDone],
  );

  /** Questions are optional: dismiss the active card (renders as skipped). */
  const dismissQuestion = () => {
    if (!activeQuestion) return;
    const qid = activeQuestion.questionId;
    setBubbles((prev) =>
      prev.map((b) =>
        b.kind === 'question' && b.question.questionId === qid ? { ...b, answered: '' } : b,
      ),
    );
    setActiveQuestion(null);
  };

  const sendMessage = () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    dismissQuestion();
    setBubbles((prev) => [...prev, { kind: 'user', content: message }]);
    runStream({ message });
  };

  const skipQuestion = () => {
    if (busy) return;
    dismissQuestion();
    const message = 'Skip this one — continue.';
    setBubbles((prev) => [...prev, { kind: 'user', content: message }]);
    runStream({ message });
  };

  const submitAnswer = (answer: { choice?: string; text?: string }) => {
    if (!activeQuestion) return;
    const display = [answer.choice, answer.text].filter(Boolean).join(' — ');
    setBubbles((prev) =>
      prev.map((b) =>
        b.kind === 'question' && b.question.questionId === activeQuestion.questionId
          ? { ...b, answered: display }
          : b,
      ),
    );
    const questionId = activeQuestion.questionId;
    setActiveQuestion(null);
    runStream({ answer: { questionId, ...answer } });
  };

  const showEmptyState = bubbles.length === 0 && !busy && !streamText;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 px-4 py-4">
        <div className="flex flex-col gap-3">
          {showEmptyState && (
            <div className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
              <p className="font-medium text-ink">Your tutor is ready.</p>
              <p className="mt-1">One click and the lesson begins.</p>
              <Button className="mt-3" onClick={() => runStream({})}>
                ▶ Start lesson
              </Button>
            </div>
          )}
          {bubbles.map((bubble, i) => (
            <BubbleView
              key={i}
              bubble={bubble}
              isActiveQuestion={
                bubble.kind === 'question' &&
                activeQuestion?.questionId === bubble.question.questionId &&
                bubble.answered === undefined
              }
              onSubmitAnswer={submitAnswer}
              onSkip={skipQuestion}
            />
          ))}
          {streamText && (
            <div className="max-w-[95%] self-start rounded-xl rounded-bl-sm border border-line bg-card px-3.5 py-2.5 shadow-sm">
              <Markdown variant="chat">{streamText}</Markdown>
            </div>
          )}
          {thinking && (
            <div className="flex items-center gap-2 self-start rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink-soft shadow-sm">
              <span className="flex gap-1">
                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              tutor is thinking…
            </div>
          )}
          {progressNote && (
            <div className="self-start text-xs italic text-ink-soft">{progressNote}</div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-line bg-card p-3">
        {activeQuestion && (
          <p className="px-1 pb-2 text-xs text-ink-soft">
            The question above is optional — answer it, skip it, or just type.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            placeholder={busy ? 'Tutor is replying… (you can type ahead)' : 'Ask your tutor… (Enter to send)'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            className="resize-none"
          />
          <Button onClick={sendMessage} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function BubbleView({
  bubble,
  isActiveQuestion,
  onSubmitAnswer,
  onSkip,
}: {
  bubble: Bubble;
  isActiveQuestion: boolean;
  onSubmitAnswer: (answer: { choice?: string; text?: string }) => void;
  onSkip: () => void;
}) {
  switch (bubble.kind) {
    case 'user':
      return (
        <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-now px-3.5 py-2.5 text-sm text-white shadow-sm">
          {bubble.content}
        </div>
      );
    case 'assistant':
      return (
        <div className="max-w-[95%] self-start rounded-xl rounded-bl-sm border border-line bg-card px-3.5 py-2.5 shadow-sm">
          <Markdown variant="chat">{bubble.content}</Markdown>
        </div>
      );
    case 'question':
      return (
        <div className={cn('self-stretch', !isActiveQuestion && 'opacity-90')}>
          <QuestionCard
            question={bubble.question}
            answered={isActiveQuestion ? undefined : (bubble.answered ?? '')}
            onSubmit={isActiveQuestion ? onSubmitAnswer : undefined}
            onSkip={isActiveQuestion ? onSkip : undefined}
          />
        </div>
      );
    case 'error':
      return (
        <div className="self-start rounded-xl border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          {bubble.content}
        </div>
      );
  }
}
