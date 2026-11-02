import { syncContent } from '../sync/sync.js';

const result = await syncContent();
console.log(
  `Synced ${result.phases} phases, ${result.lessons} lessons. Seeded ${result.seededStatuses} phase statuses from LEARNING.md.`,
);
