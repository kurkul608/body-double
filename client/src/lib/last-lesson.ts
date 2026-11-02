// "Continue where you left off" — last opened lesson, kept in localStorage.

const KEY = 'body-double:last-lesson';

export interface LastLesson {
  id: number;
  title: string;
  phase_num: number;
}

export function saveLastLesson(entry: LastLesson): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // storage unavailable — non-fatal
  }
}

export function loadLastLesson(): LastLesson | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as LastLesson).id === 'number'
    ) {
      return parsed as LastLesson;
    }
    return null;
  } catch {
    return null;
  }
}
