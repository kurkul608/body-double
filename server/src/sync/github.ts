const RAW_BASE = 'https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/main/';

export async function fetchRaw(relPath: string): Promise<string | null> {
  const url = RAW_BASE + relPath.replace(/^\/+/, '');
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub fetch failed ${res.status} for ${url}`);
  return await res.text();
}

export async function fetchCourseReadme(): Promise<string> {
  const text = await fetchRaw('README.md');
  if (!text) throw new Error('Course README.md not found');
  return text;
}

/** slug is the lesson dir path like "phases/01-math-foundations/01-linear-algebra-intuition" */
export async function fetchLessonDoc(slug: string): Promise<string | null> {
  return fetchRaw(`${slug}/docs/en.md`);
}

export async function fetchLessonQuiz(slug: string): Promise<string | null> {
  const raw = await fetchRaw(`${slug}/quiz.json`);
  if (!raw) return null;
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}
