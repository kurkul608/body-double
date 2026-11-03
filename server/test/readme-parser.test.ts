import { describe, expect, it } from 'vitest';
import { parseCourseReadme } from '../src/sync/readme-parser.js';

// Trimmed copy of the upstream course README format
// (rohitg00/ai-engineering-from-scratch). Keep the structure as upstream has it.
const README = `# AI Engineering from Scratch

<details>
<summary><b>Who is this for?</b></summary>

| 01 | [Not a lesson](phases/99-not-a-phase/01-nope/) | Learn | — |

</details>

## Curriculum

### Phase 0: Setup & Tooling \`13 lessons\`
> Get your environment ready for everything that follows.

| # | Lesson | Type | Lang |
|:---:|--------|:----:|------|
| 01 | [Dev Environment](phases/00-setup-and-tooling/01-dev-environment/) | Build | Python |
| 02 | [Git & Collaboration](phases/00-setup-and-tooling/02-git-and-collaboration/) | Learn | — |
| 03 | [External Link](https://example.com/not-a-lesson) | Learn | — |

<details id="phase-1">
<summary><b>Phase 1 — Math Foundations</b> &nbsp;<code>22 lessons</code>&nbsp; <em>The intuition behind every AI algorithm, through code.</em></summary>
<br/>

| # | Lesson | Type | Lang |
|:---:|--------|:----:|------|
| 01 | [Linear Algebra Intuition](phases/01-math-foundations/01-linear-algebra-intuition/) | Learn | Python, Julia |
| 02 | [Vectors, Matrices & Operations](phases/01-math-foundations/02-vectors-matrices-operations/) | Build | Python, Julia |

</details>

<details id="phase-2">
<summary><b>Phase 2 — ML Fundamentals</b> &nbsp;<code>21 lessons</code>&nbsp; <em>Classical ML — still the backbone of most production AI.</em></summary>
<br/>

| # | Lesson | Type | Lang |
|:---:|--------|:----:|------|
| 01 | [What Is Machine Learning](phases/02-ml-fundamentals/01-what-is-machine-learning/) | Learn | Python |

</details>
`;

describe('parseCourseReadme', () => {
  const phases = parseCourseReadme(README);

  it('finds Phase 0 and every <details id="phase-N"> block in order', () => {
    expect(phases.map((p) => p.phaseNum)).toEqual([0, 1, 2]);
  });

  it('strips the lesson-count code span from the Phase 0 title', () => {
    expect(phases[0]!.title).toBe('Setup & Tooling');
  });

  it('reads phase 1+ titles from the <summary> tag', () => {
    expect(phases[1]!.title).toBe('Math Foundations');
    expect(phases[2]!.title).toBe('ML Fundamentals');
  });

  it('parses lesson rows into num, title and slug without trailing slash', () => {
    expect(phases[1]!.lessons).toEqual([
      {
        num: 1,
        title: 'Linear Algebra Intuition',
        slug: 'phases/01-math-foundations/01-linear-algebra-intuition',
      },
      {
        num: 2,
        title: 'Vectors, Matrices & Operations',
        slug: 'phases/01-math-foundations/02-vectors-matrices-operations',
      },
    ]);
  });

  it('skips links that do not point into phases/', () => {
    expect(phases[0]!.lessons.map((l) => l.num)).toEqual([1, 2]);
  });

  it('ignores rows in <details> blocks without a phase id', () => {
    const slugs = phases.flatMap((p) => p.lessons.map((l) => l.slug));
    expect(slugs.some((s) => s.includes('99-not-a-phase'))).toBe(false);
  });

  it('accepts ./-prefixed slugs', () => {
    const md = `<details id="phase-3">
<summary><b>Phase 3 — Deep Learning Core</b></summary>

| 01 | [Neurons](./phases/03-deep-learning-core/01-neurons/) | Learn | Python |
</details>`;
    expect(parseCourseReadme(md)).toEqual([
      {
        phaseNum: 3,
        title: 'Deep Learning Core',
        lessons: [{ num: 1, title: 'Neurons', slug: 'phases/03-deep-learning-core/01-neurons' }],
      },
    ]);
  });

  it('returns an empty list for a README without phases', () => {
    expect(parseCourseReadme('# Nothing here\n')).toEqual([]);
  });
});
