// Desktop chat dock: width and open/closed state, kept in localStorage.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const KEY = 'body-double:chat-layout';

export const CHAT_MIN_WIDTH = 360;
export const CHAT_MAX_WIDTH = 720;
// Keep at least this much room for the lesson column.
const LESSON_MIN_WIDTH = 560;

interface ChatLayout {
  width: number;
  open: boolean;
}

function defaultWidth(): number {
  // ~30% of the viewport: wide enough for code in answers, never dominant.
  return clampWidth(Math.round(window.innerWidth * 0.3));
}

function clampWidth(width: number): number {
  const roomLeft = window.innerWidth - LESSON_MIN_WIDTH;
  return Math.max(CHAT_MIN_WIDTH, Math.min(width, CHAT_MAX_WIDTH, roomLeft));
}

function load(): ChatLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as ChatLayout).width === 'number' &&
        typeof (parsed as ChatLayout).open === 'boolean'
      ) {
        const layout = parsed as ChatLayout;
        return { width: clampWidth(layout.width), open: layout.open };
      }
    }
  } catch {
    // storage unavailable — fall back to defaults
  }
  return { width: defaultWidth(), open: true };
}

function save(layout: ChatLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // storage unavailable — non-fatal
  }
}

export function useChatLayout() {
  const [layout, setLayout] = useState<ChatLayout>(load);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => save(layout), [layout]);

  // Re-clamp when the window shrinks so the lesson column never gets squeezed.
  useEffect(() => {
    const onResize = () => setLayout((prev) => ({ ...prev, width: clampWidth(prev.width) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggle = useCallback(() => setLayout((prev) => ({ ...prev, open: !prev.open })), []);

  const resetWidth = useCallback(
    () => setLayout((prev) => ({ ...prev, width: defaultWidth() })),
    [],
  );

  const onHandlePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = { x: e.clientX, width: layout.width };
      setResizing(true);
    },
    [layout.width],
  );

  const onHandlePointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (!start) return;
    // The dock sits on the right, so dragging left makes it wider.
    const width = clampWidth(start.width + (start.x - e.clientX));
    setLayout((prev) => (prev.width === width ? prev : { ...prev, width }));
  }, []);

  const onHandlePointerUp = useCallback(() => {
    dragStart.current = null;
    setResizing(false);
  }, []);

  const onHandleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? step : -step;
      setLayout((prev) => ({ ...prev, width: clampWidth(prev.width + delta) }));
    }
  }, []);

  return {
    width: layout.width,
    open: layout.open,
    resizing,
    toggle,
    resetWidth,
    handleProps: {
      onPointerDown: onHandlePointerDown,
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: onHandlePointerUp,
      onKeyDown: onHandleKeyDown,
      onDoubleClick: resetWidth,
    },
  };
}
