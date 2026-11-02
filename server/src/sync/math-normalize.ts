import { runUtil } from '../tutor/util-query.js';
import { readLearnerProfile, type LearnerProfile } from './learning-md.js';

const systemPrompt = (profile: LearnerProfile) => `You rewrite a Markdown lesson from the course "AI Engineering from Scratch" for one specific learner. This is a rewrite, not a summary: keep ALL technical content, all code, all sections, in the same order.

# The reader
- New to ML math and ML practice.
- English level ${profile.englishLevel}. Native language: ${profile.nativeLanguage}.
- ADHD, possibly autism. Walls of text and visible piles of future work cause anxiety and kill focus.

# Language rules (ASD-STE100 spirit)
- Short sentences: about 20 words or fewer. One idea per sentence. Active voice.
- One word, one meaning for the whole document. Do not alternate synonyms for the same concept.
- Define every technical term at FIRST use, in ten words or fewer, in parentheses. Example: "rank (the number of independent directions in a matrix)".
- No idioms, no filler, no decoration.

# ADHD/autism shape
- Number the main content sections: start each "## " section title with "Section N of M — ".
- Start each section with one line: what the reader can do after it, and a time estimate like "~5 min".
- End each section with one line: "✓ Checkpoint: " plus one short self-check question.
- Mark every reference to a concept the course has NOT taught yet with "(later in the course — not needed now)". Examples: SVD, eigenvalues, PCA, ridge regression, regularization.
- In the Exercises section, add one line at the top: "Optional. Pick one. One is enough for today."
- Keep lists at 5 items or fewer; split longer lists by theme.

# Formatting rules
- Keep fenced code blocks byte-identical, including their language tags. Never rewrite code or comments in code.
- Keep \`\`\`mermaid blocks byte-identical.
- Delete \`\`\`figure blocks entirely (they cannot render).
- Write all math as LaTeX: inline $...$, standalone $$...$$. Never use \`\`\`math, \`\`\`latex or \`\`\`tex fences — they do not render. Convert plain-text math like sqrt(3^2+2^2) to $\\sqrt{3^{2}+2^{2}}$. A fenced code block with no language tag that contains ONLY formulas becomes a $$...$$ block.
- Keep the document title, the opening quote, and the metadata lines (Type, Languages, Prerequisites, Time).

# Output
Output the FULL rewritten document and NOTHING else. The first line of your output must be the "# " title heading. No preamble, no commentary before or after, no code fence around the document.`;

/** Everything before the first heading is model chatter — cut it. */
function stripPreamble(text: string): string {
  const idx = text.search(/^# /m);
  return idx > 0 ? text.slice(idx) : text;
}

/**
 * The model sometimes writes display math as GitHub-style ```math fences
 * (also ```latex / ```tex). The renderer only knows $$...$$ — convert them.
 * Deterministic and idempotent, safe to run on already-adapted lessons.
 */
export function fixMathFences(md: string): string {
  return md.replace(/^```(?:math|latex|tex)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm, (_, tex: string) => `$$\n${tex.trim()}\n$$`);
}

/**
 * One-shot LLM pass: rewrite the lesson for the ADHD/simple-english reader
 * and convert plain-text math to LaTeX. Returns null when the output looks
 * broken — the caller keeps the original and may retry later.
 */
export async function normalizeMath(md: string, onText?: (chunk: string) => void): Promise<string | null> {
  if (!md.trim()) return md;
  const result = fixMathFences(stripPreamble((await runUtil(systemPrompt(readLearnerProfile()), md, onText)).trim()));
  if (!result.startsWith('# ')) return null;
  // Sanity: a rewrite may shorten, but not collapse or balloon.
  if (result.length < md.length * 0.4 || result.length > md.length * 1.6) return null;
  if ((result.match(/^## /gm) ?? []).length < 3) return null;
  return result;
}
