import { getDb } from '../db.js';
import { adaptLesson } from '../sync/sync.js';

// Usage: pnpm adapt <phase_num> [concurrency]
// Fetches every lesson of the phase and runs the ADHD rewrite, waiting for each.
const phaseNum = Number(process.argv[2]);
const concurrency = Number(process.argv[3]) || 3;
if (!Number.isInteger(phaseNum)) {
  console.error('Usage: pnpm adapt <phase_num> [concurrency]');
  process.exit(1);
}

const lessons = getDb()
  .prepare(
    'SELECT l.id, l.num, l.title FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.phase_num = ? ORDER BY l.num',
  )
  .all(phaseNum) as Array<{ id: number; num: number; title: string }>;
if (lessons.length === 0) {
  console.error(`No lessons for phase ${phaseNum}. Run pnpm sync first.`);
  process.exit(1);
}

const queue = [...lessons];
const failed: string[] = [];

async function worker(): Promise<void> {
  for (let lesson = queue.shift(); lesson; lesson = queue.shift()) {
    const label = `${phaseNum}.${lesson.num} ${lesson.title}`;
    try {
      const result = await adaptLesson(lesson.id);
      console.log(`${result.padEnd(8)} ${label}`);
      if (result === 'rejected') failed.push(label);
    } catch (err) {
      console.log(`error    ${label}: ${(err as Error).message}`);
      failed.push(label);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`Done: ${lessons.length - failed.length}/${lessons.length} adapted.`);
if (failed.length) process.exitCode = 1;
