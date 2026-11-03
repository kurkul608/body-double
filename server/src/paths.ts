import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at server/src/paths.ts (dev via tsx) or server/dist/paths.js
// (built). In both cases the parent of its directory is the server package root.
// Every path below resolves inside the project root.
const here = path.dirname(fileURLToPath(import.meta.url));

/** <projectRoot>/server */
export const serverRoot = path.resolve(here, '..');

/** Project root (the pnpm workspace root). */
export const projectRoot = path.resolve(serverRoot, '..');

/** <projectRoot>/data — SQLite lives here, auto-created, gitignored. */
export const dataDir = path.join(projectRoot, 'data');

export const dbPath = path.join(dataDir, 'learn.db');

/** transformers.js model cache — under data/ so a Docker volume keeps it. */
export const modelCacheDir = path.join(dataDir, 'models');

export const envFile = path.join(projectRoot, '.env');

/** Kept in src (not dist) so the md file needs no build-step copying. */
export const systemPromptPath = path.join(serverRoot, 'src', 'tutor', 'system-prompt.md');

/** Learner profile + progress. Gitignored; created from profile/LEARNING.example.md. */
export const learningMdPath = path.join(projectRoot, 'profile', 'LEARNING.md');

/** Vendored source skills appended to the tutor system prompt. */
export const skillPaths = [
  { title: 'Skill: i-have-adhd', file: path.join(projectRoot, 'skills', 'i-have-adhd', 'SKILL.md') },
  { title: 'Skill: simple-english', file: path.join(projectRoot, 'skills', 'simple-english', 'SKILL.md') },
];
