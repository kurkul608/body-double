import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  insertProgressLogRow,
  parsePathTable,
  parseProfileHeader,
} from '../src/sync/learning-md.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_MD = fs.readFileSync(
  path.resolve(here, '..', '..', 'profile', 'LEARNING.example.md'),
  'utf8',
);

describe('parseProfileHeader', () => {
  it('reads the example profile and skips comment lines', () => {
    expect(parseProfileHeader(EXAMPLE_MD)).toEqual({
      name: 'Alex',
      nativeLanguage: 'Spanish',
      englishLevel: 'B2',
    });
  });

  it('returns defaults for null input', () => {
    expect(parseProfileHeader(null)).toEqual(DEFAULT_PROFILE);
  });

  it('returns defaults when there is no front matter', () => {
    expect(parseProfileHeader('# My path\n\nname: Not front matter\n')).toEqual(DEFAULT_PROFILE);
  });

  it('falls back to defaults for empty or missing values', () => {
    const md = '---\nname:\nnative_language: ""\n---\n';
    expect(parseProfileHeader(md)).toEqual(DEFAULT_PROFILE);
  });

  it('strips quotes, accepts CRLF and mixed-case keys', () => {
    const md = '---\r\nName: "Maria"\r\nENGLISH_LEVEL: \'B1\'\r\n---\r\n';
    expect(parseProfileHeader(md)).toEqual({
      name: 'Maria',
      nativeLanguage: DEFAULT_PROFILE.nativeLanguage,
      englishLevel: 'B1',
    });
  });
});

describe('parsePathTable', () => {
  it('parses all 20 phases from the example file', () => {
    const entries = parsePathTable(EXAMPLE_MD);
    expect(entries).toHaveLength(20);
    expect(entries[0]).toEqual({ phaseNum: 0, status: 'Do', estHours: null });
    expect(entries[4]).toEqual({ phaseNum: 4, status: 'Skip', estHours: null });
    expect(entries.map((e) => e.phaseNum)).toEqual([...Array(20).keys()]);
  });

  it('reads numeric hours and drops rows with an unknown status', () => {
    const md = `## Path

| Phase | Name | Status | Est. hours |
|-------|------|--------|------------|
| 1 | Math Foundations | Review | 23 |
| 2 | ML Fundamentals | Maybe | 10 |
| 3 | Deep Learning Core | Done | 40 |

## Progress log

| 4 | Not in the path section | Do | 1 |
`;
    expect(parsePathTable(md)).toEqual([
      { phaseNum: 1, status: 'Review', estHours: 23 },
      { phaseNum: 3, status: 'Done', estHours: 40 },
    ]);
  });

  it('returns an empty list when there is no Path section', () => {
    expect(parsePathTable('# Nothing\n')).toEqual([]);
  });
});

describe('insertProgressLogRow', () => {
  const entry = {
    date: '2026-11-02',
    lessonLabel: '01/02 Vectors, Matrices & Operations',
    quiz: '8/10',
    note: 'Good.',
  };

  it('appends the row after the last row of the Progress log table', () => {
    const out = insertProgressLogRow(EXAMPLE_MD, entry);
    expect(out).toContain(
      '| 2026-01-01 | 00/01 Example lesson | DONE | Example row. |\n' +
        '| 2026-11-02 | 01/02 Vectors, Matrices & Operations | 8/10 | Good. |',
    );
    expect(out.length).toBeGreaterThan(EXAMPLE_MD.length);
    // Everything else is unchanged.
    expect(out.replace('\n| 2026-11-02 | 01/02 Vectors, Matrices & Operations | 8/10 | Good. |', '')).toBe(
      EXAMPLE_MD,
    );
  });

  it('inserts before the next section, not at the end of the file', () => {
    const md = `## Progress log

| Date | Lesson | Quiz | Note |
|------|--------|------|------|

## Notes

| a | b |
`;
    const out = insertProgressLogRow(md, entry);
    const rowIdx = out.indexOf('| 2026-11-02 |');
    expect(rowIdx).toBeGreaterThan(-1);
    expect(rowIdx).toBeLessThan(out.indexOf('## Notes'));
    expect(out).toContain('|------|--------|------|------|\n| 2026-11-02 |');
  });

  it('escapes pipes and flattens newlines in cell values', () => {
    const out = insertProgressLogRow(EXAMPLE_MD, {
      ...entry,
      note: 'a | b\n  c',
    });
    expect(out).toContain('| 8/10 | a \\| b c |');
  });

  it('throws when the section or its table is missing', () => {
    expect(() => insertProgressLogRow('# No log\n', entry)).toThrow(/Progress log/);
    expect(() => insertProgressLogRow('## Progress log\n\nNo table.\n', entry)).toThrow(
      /table not found/,
    );
  });
});
