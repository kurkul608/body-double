import { getDb } from '../db.js';
import { modelCacheDir } from '../paths.js';

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

/** Lazy-load the transformers.js pipeline; first call downloads the model to cache. */
async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = modelCacheDir;
      const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return pipe as unknown as FeatureExtractor;
    })();
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(text.slice(0, 4000), { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}

/** Fire-and-forget: embed a chat message and store the vector. Never blocks SSE. */
export function embedMessageAsync(messageId: number, content: string): void {
  void (async () => {
    try {
      const vector = await embed(content);
      getDb()
        .prepare('UPDATE chat_messages SET embedding = ? WHERE id = ?')
        .run(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength), messageId);
    } catch (err) {
      console.error(`Embedding failed for message ${messageId}:`, err);
    }
  })();
}

function cosine(a: Float32Array, b: Float32Array): number {
  // Vectors are L2-normalized at embed time, so dot product == cosine similarity.
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

export interface HistoryHit {
  lessonId: number;
  lessonTitle: string;
  role: string;
  content: string;
  similarity: number;
  createdAt: string;
}

/** Brute-force cosine search over all embedded chat messages outside the current lesson. */
export async function searchHistory(
  query: string,
  topK: number,
  excludeLessonId: number,
): Promise<HistoryHit[]> {
  const queryVec = await embed(query);
  const rows = getDb()
    .prepare(
      `SELECT m.lesson_id, m.role, m.content, m.embedding, m.created_at, l.title AS lesson_title
       FROM chat_messages m JOIN lessons l ON l.id = m.lesson_id
       WHERE m.embedding IS NOT NULL AND m.lesson_id != ?`,
    )
    .all(excludeLessonId) as Array<{
    lesson_id: number;
    role: string;
    content: string;
    embedding: Buffer;
    created_at: string;
    lesson_title: string;
  }>;

  const scored = rows.map((row) => {
    const vec = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    return {
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      role: row.role,
      content: row.content,
      similarity: cosine(queryVec, vec),
      createdAt: row.created_at,
    };
  });
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, Math.max(1, topK));
}
