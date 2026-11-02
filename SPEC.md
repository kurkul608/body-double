# Body Double — Spec (server/client contract)

A self-hosted AI tutor for the course
[AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch),
built for learners with ADHD. This file is the contract between `server/` and
`client/`. Change it together with both sides.

## Workspace

- pnpm workspace at the project root: `server/` + `client/`. Use pnpm only.
- Node 20+, TypeScript everywhere, ESM.
- Nothing reads or writes outside the project root.

## Files and paths

| Path | What it is |
|---|---|
| `.env` | Config (gitignored). Template: `.env.example`. |
| `data/learn.db` | SQLite database. Auto-created, gitignored. |
| `profile/LEARNING.md` | Learner profile + progress (gitignored). Template: `profile/LEARNING.example.md`. Optional. |
| `skills/<name>/SKILL.md` | Vendored source skills appended to the tutor prompt (`i-have-adhd`, `simple-english`). |
| `server/src/tutor/system-prompt.md` | Base tutor prompt with `{{LEARNER_NAME}}`, `{{NATIVE_LANGUAGE}}`, `{{ENGLISH_LEVEL}}` placeholders. |

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | API key for the Claude Agent SDK. If unset, the server logs a warning at startup. |
| `TUTOR_MODEL` | `opus` | Model for the tutor chat. Aliases or full model IDs. |
| `UTIL_MODEL` | `sonnet` | Model for lesson rewrites and summaries. |
| `PORT` | `3111` | Fastify port. |

If the API reports that a model is not found or not available, the error
message is: `Model X is not available for your API key. Change TUTOR_MODEL (or UTIL_MODEL) in .env.`

## Server (`server/`)

- Fastify on `127.0.0.1:PORT`. better-sqlite3. Claude Agent SDK
  (`@anthropic-ai/claude-agent-sdk`); the server passes `process.env` to the
  SDK unchanged.

### SQLite schema

```sql
modules(id INTEGER PK, phase_num INTEGER UNIQUE, title TEXT, status TEXT, -- Do|Review|Skip|Done
        est_hours INTEGER, lesson_count INTEGER)
lessons(id INTEGER PK, module_id INTEGER FK, num INTEGER, slug TEXT UNIQUE, title TEXT,
        md TEXT, quiz_json TEXT, status TEXT DEFAULT 'not_started', -- not_started|in_progress|done
        score TEXT, fetched_at TEXT, math_normalized INTEGER DEFAULT 0)
chat_messages(id INTEGER PK, lesson_id INTEGER FK, role TEXT, -- user|assistant|question|answer
        content TEXT, meta_json TEXT, embedding BLOB, created_at TEXT)
lesson_summaries(lesson_id INTEGER PK, summary TEXT, mistakes TEXT, updated_at TEXT)
glossary(id INTEGER PK, term TEXT UNIQUE, definition_en TEXT, note_native TEXT, lesson_id INTEGER)
```

Migrations are versioned by `PRAGMA user_version`. One idempotent fix-up runs
after them: older databases get their glossary note column renamed to
`note_native`.

### Learner profile (`profile/LEARNING.md`)

- YAML-style front matter with flat `key: value` lines: `name`,
  `native_language`, `english_level`. Defaults: `the learner`, `English`, `B2`.
- `## Path` table: `| <phase> | <name> | <Do|Review|Skip|Done> | <hours or --> |`.
  Sync seeds `modules.status` and `modules.est_hours` from it.
- `## Progress log` table: `| Date | Lesson | Quiz | Note |`. Lesson completion
  appends one row: `| YYYY-MM-DD | PP/LL Title | <score or DONE> | <note> |`.
- The whole file is appended to the tutor system prompt.
- If the file is missing: the prompt uses the defaults, sync seeds nothing,
  and the Progress log append is skipped with a log line. The database stays
  the source of truth.

### Content sync

`POST /api/sync` and `pnpm sync` fetch the course README from
`https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/main/README.md`,
parse phases and lessons (rows `| 01 | [Title](phases/<dir>/<lesson-dir>/) |`;
Phase 0 is a `### Phase 0:` section, phases 1+ are `<details id="phase-N">`
blocks), and upsert `modules` + `lessons`. Then they seed phase statuses from
the Path table.

When a lesson is opened, the server lazily fetches
`phases/<dir>/<lesson>/docs/en.md` and `quiz.json` and caches them. Then a
background rewrite with `UTIL_MODEL` adapts the text for the learner (simple
English at the profile's level, numbered sections, checkpoints, LaTeX math).
`math_normalized = 1` marks an adapted lesson. The raw text is never served.
`pnpm --filter server adapt <phase> [concurrency]` adapts a whole phase.

### API

| Method | Path | Result |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/modules` | Phases with `lessons_done` / `lessons_total`. |
| GET | `/api/modules/:phase/lessons` | Lesson rows of one phase. |
| GET | `/api/lessons/:id` | Lesson: `md` (only when adapted), `adapted`, `adaptation` progress, `quiz_json`, `status`, `score`, `summary`. |
| POST | `/api/lessons/:id/adaptation/retry` | Restart a failed rewrite. |
| GET | `/api/lessons/:id/messages` | Chat history of the lesson. |
| POST | `/api/lessons/:id/chat` | One tutor turn. Body `{message}`, `{answer: {questionId, choice|text}}`, or empty (lesson kickoff when there is no history). Response is SSE. `409` while the lesson is still being adapted. |
| POST | `/api/lessons/:id/complete` | Finalize: summary (`UTIL_MODEL`), score, Progress log row. |
| GET | `/api/lessons/:id/complete/progress` | Progress of a running completion. |
| POST | `/api/sync` | Content sync (see above). |

### SSE events (`POST /api/lessons/:id/chat`)

| Event | Data |
|---|---|
| `text_delta` | `{ text }` |
| `question` | `{ questionId, question, options[], allow_free_text }` |
| `progress` | `{ text }` |
| `done` | `{ status, score }` |
| `error` | `{ message }` |

### Tutor agent

- System prompt per turn: `system-prompt.md` (placeholders filled from the
  profile header) + the vendored `SKILL.md` files + `profile/LEARNING.md` +
  current lesson text and quiz + glossary + all lesson summaries.
- Turn prompt: the chat history of the current lesson.
- Custom tools (in-process MCP server `tutor`):
  - `ask_question({question, options[], allow_free_text})` — SSE `question`; the
    learner's answer arrives as the next message.
  - `add_glossary_term({term, definition_en, note_native?})`
  - `search_history({query, top_k})` — cosine search over embeddings of chat
    messages from other lessons.
  - `mark_lesson_done({score, note?})` — runs the completion logic.

### Embeddings (RAG)

- `@huggingface/transformers`, model `Xenova/all-MiniLM-L6-v2`, local, no API key.
  The first call downloads the model (~90 MB) to the cache.
- Every chat message is embedded on write (async, never blocks SSE) and stored
  as a Float32 BLOB. Search is brute-force cosine.

## Client (`client/`)

- Vite + React 18 + TypeScript + Tailwind + shadcn/ui-style components.
  react-markdown + remark-gfm, KaTeX for math, Mermaid diagrams.
- Dev proxy `/api` → `http://localhost:3111`.
- localStorage keys use the `body-double:` prefix.

### Palette (warm, study-friendly)

```
--paper #F6F8F5  --ink #1C2620  --ink-soft #4A5A50  --line #D8E0D9  --card #FFFFFF
--accent #0E7C5B (progress/success)  --now #0E5C7C (current)
--warn #A8730E  --mono-bg #EDF1EC
dark: paper #141A16, ink #E4EAE4, card #1B231E, accent #4CC59A, now #5FB3D9
```

Fonts (Google Fonts): Spectral (headings), IBM Plex Sans (text), IBM Plex Mono (code, numbers).

### Pages

1. **Home `/`** — grid of phases: number, title, status badge, lesson progress
   (n/m + bar), hours. Skip phases are muted. Overall progress on top and a
   "Continue where you left off" button.
2. **Phase `/phase/:num`** — lesson list: number, title, status, score.
3. **Lesson `/lesson/:id`** — two panes: lesson text on the left, chat on the
   right (tabs on mobile). Chat: streamed answers, question cards (options +
   free text + submit), history restored from the database, a "tutor is
   thinking" indicator, a "Complete lesson" button.

### ADHD UX rules

- Visible progress everywhere.
- One screen, one action; the next step is always obvious.
- No walls of text: lessons render in sections, chat-first.
