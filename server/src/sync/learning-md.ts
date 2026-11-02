import fs from 'node:fs';
import type { ModuleStatus } from '../db.js';
import { learningMdPath } from '../paths.js';

export interface PathTableEntry {
  phaseNum: number;
  status: ModuleStatus;
  estHours: number | null;
}

const VALID_STATUS = new Set<string>(['Do', 'Review', 'Skip', 'Done']);

export function readLearningMd(): string {
  return fs.readFileSync(learningMdPath, 'utf8');
}

/** profile/LEARNING.md content, or null when the learner has not created it yet. */
export function readLearningMdIfExists(): string | null {
  try {
    return readLearningMd();
  } catch {
    return null;
  }
}

export interface LearnerProfile {
  name: string;
  nativeLanguage: string;
  englishLevel: string;
}

export const DEFAULT_PROFILE: LearnerProfile = {
  name: 'the learner',
  nativeLanguage: 'English',
  englishLevel: 'B2',
};

/**
 * Parse the YAML-style front matter at the top of LEARNING.md:
 *   ---
 *   name: Alex
 *   native_language: Spanish
 *   english_level: B1
 *   ---
 * Only flat `key: value` lines are read. Missing or empty keys fall back to defaults.
 */
export function parseProfileHeader(md: string | null): LearnerProfile {
  const fm = md ? /^---\r?\n([\s\S]*?)\r?\n---/.exec(md) : null;
  const fields = new Map<string, string>();
  if (fm) {
    for (const line of fm[1]!.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2]!.replace(/^(["'])(.*)\1$/, '$2').trim();
      if (value) fields.set(m[1]!.toLowerCase(), value);
    }
  }
  return {
    name: fields.get('name') ?? DEFAULT_PROFILE.name,
    nativeLanguage: fields.get('native_language') ?? DEFAULT_PROFILE.nativeLanguage,
    englishLevel: fields.get('english_level') ?? DEFAULT_PROFILE.englishLevel,
  };
}

export function readLearnerProfile(): LearnerProfile {
  return parseProfileHeader(readLearningMdIfExists());
}

/** Parse the `## Path` table: `| 1 | Math Foundations | Review | 23 |`. */
export function parsePathTable(md: string): PathTableEntry[] {
  const section = sliceSection(md, '## Path');
  if (!section) return [];
  const entries: PathTableEntry[] = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|\s*[^|]+\|\s*(\w+)\s*\|\s*([^|]+)\|/.exec(line.trim());
    if (!m) continue;
    const status = m[2]!;
    if (!VALID_STATUS.has(status)) continue;
    const hours = Number.parseInt(m[3]!.trim(), 10);
    entries.push({
      phaseNum: Number(m[1]),
      status: status as ModuleStatus,
      estHours: Number.isNaN(hours) ? null : hours,
    });
  }
  return entries;
}

function sliceSection(md: string, header: string): string | null {
  const start = md.indexOf(header);
  if (start === -1) return null;
  const rest = md.slice(start + header.length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

export interface ProgressLogEntry {
  date: string; // YYYY-MM-DD
  lessonLabel: string; // e.g. "02/01 Introduction to ML"
  quiz: string; // score, e.g. "8/10" or "DONE"
  note: string;
}

/**
 * Append one row to the `## Progress log` table in profile/LEARNING.md.
 * The row goes after the last table row of that section.
 * Returns false (and writes nothing) when profile/LEARNING.md does not exist.
 */
export function appendProgressLogRow(entry: ProgressLogEntry): boolean {
  const md = readLearningMdIfExists();
  if (md === null) return false;
  const header = '## Progress log';
  const start = md.indexOf(header);
  if (start === -1) throw new Error('LEARNING.md has no "## Progress log" section');

  const afterHeader = start + header.length;
  const rest = md.slice(afterHeader);
  const nextSectionOffset = rest.search(/^## /m);
  const sectionEnd = nextSectionOffset === -1 ? md.length : afterHeader + nextSectionOffset;
  const section = md.slice(afterHeader, sectionEnd);

  // Find end of the last table row line within the section.
  let lastRowEnd = -1;
  const rowRe = /^\|.*\|\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section)) !== null) {
    lastRowEnd = m.index + m[0].length;
  }
  if (lastRowEnd === -1) throw new Error('Progress log table not found in LEARNING.md');

  const clean = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const row = `| ${entry.date} | ${clean(entry.lessonLabel)} | ${clean(entry.quiz)} | ${clean(entry.note)} |`;

  const insertAt = afterHeader + lastRowEnd;
  const updated = md.slice(0, insertAt) + '\n' + row + md.slice(insertAt);
  fs.writeFileSync(learningMdPath, updated);
  return true;
}
