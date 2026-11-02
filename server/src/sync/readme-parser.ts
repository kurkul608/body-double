export interface ParsedLesson {
  num: number;
  title: string;
  slug: string; // "phases/<phase-dir>/<lesson-dir>" without trailing slash
}

export interface ParsedPhase {
  phaseNum: number;
  title: string;
  lessons: ParsedLesson[];
}

const LESSON_ROW = /^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/;

function parseLessonTable(block: string): ParsedLesson[] {
  const lessons: ParsedLesson[] = [];
  for (const line of block.split('\n')) {
    const m = LESSON_ROW.exec(line.trim());
    if (!m) continue;
    const slug = m[3]!.replace(/\/+$/, '').replace(/^\.?\//, '');
    if (!slug.startsWith('phases/')) continue;
    lessons.push({ num: Number(m[1]), title: m[2]!.trim(), slug });
  }
  return lessons;
}

/**
 * The course README lists Phase 0 as a plain `### Phase 0: Title` section and
 * phases 1+ inside `<details id="phase-N"><summary><b>Phase N — Title</b>...` blocks.
 */
export function parseCourseReadme(readme: string): ParsedPhase[] {
  const phases: ParsedPhase[] = [];

  // Phase 0: heading `### Phase 0: Setup & Tooling` up to the first <details>.
  const p0Head = /^###\s*Phase 0[:—–-]?\s*(.+?)\s*(?:`.*`)?\s*$/m.exec(readme);
  if (p0Head) {
    const start = p0Head.index;
    const end = readme.indexOf('<details', start);
    const block = readme.slice(start, end === -1 ? undefined : end);
    const title = p0Head[1]!.replace(/`[^`]*`/g, '').trim();
    phases.push({ phaseNum: 0, title, lessons: parseLessonTable(block) });
  }

  // Phases 1+ in <details id="phase-N"> blocks.
  const detailsRe = /<details id="phase-(\d+)">([\s\S]*?)<\/details>/g;
  let m: RegExpExecArray | null;
  while ((m = detailsRe.exec(readme)) !== null) {
    const phaseNum = Number(m[1]);
    const body = m[2]!;
    const titleMatch = /<summary><b>Phase \d+\s*[—–-]\s*([^<]+)<\/b>/.exec(body);
    const title = titleMatch ? titleMatch[1]!.trim() : `Phase ${phaseNum}`;
    phases.push({ phaseNum, title, lessons: parseLessonTable(body) });
  }

  return phases;
}
