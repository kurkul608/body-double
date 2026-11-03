# Body Double

A self-hosted AI tutor built for ADHD brains.

Body Double is an interactive AI tutor for the open course
[AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch).
The tutor runs on the Claude Agent SDK and teaches one lesson at a time in a chat.
It runs on your machine with your own Anthropic API key, and it stores your
progress, chat history, and glossary in a local SQLite file.

## Why "Body Double"

Body doubling is an ADHD technique: you work next to another person, and their
presence helps you stay on task. This tutor plays that role while you learn. It
stays with you through each lesson, keeps track of where you are, and tells you
the next small step.

## Features

**How the tutor talks**

1. ADHD output shape: the point comes first, short messages, numbered steps,
   lists of 5 items or fewer, a position line ("Section 3 of 6 — ...") and a
   time estimate.
2. Simple English for non-native speakers, pitched at the English level in
   your profile (in the spirit of ASD-STE100).
3. Help in your native language: when you write in your native language, the
   tutor answers that part in it, then goes back to the lesson in English.
4. Optional questions: you can skip any question card. A skip is never counted
   as a failure, except in the final quiz, where it counts as not answered.

**How it teaches**

1. Lessons are rewritten for you on first open: simple English, numbered
   sections, a checkpoint question per section, and LaTeX math.
2. Interactive question cards with answer options and free text.
3. A quiz at the end of each lesson, from the course's `quiz.json` when the
   lesson has one.
4. A glossary: the tutor adds each new term with a short English definition
   and an optional note in your native language.

**What it remembers**

1. Summaries of every finished lesson, including weak spots, go into the
   tutor's prompt for later lessons.
2. Local RAG (retrieval over your own data) over past chat messages: every
   message is embedded on your machine, and the tutor can search lessons you
   already did.
3. Progress tracking: lesson status and quiz scores in SQLite, a phase grid
   with progress bars, and a "Continue" button on the home page.
4. Sync with your `LEARNING.md`: `pnpm sync` reads your Path table, and each
   finished lesson appends a row to your Progress log.

<!-- TODO: screenshot / GIF -->

## Quickstart

Requirements: Node.js 20 or newer, [pnpm](https://pnpm.io/), and an Anthropic
API key.

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Create your config and set `ANTHROPIC_API_KEY` in `.env`.

   ```bash
   cp .env.example .env
   ```

3. Create your learner profile and edit it (see [Learner profile](#learner-profile)).

   ```bash
   cp profile/LEARNING.example.md profile/LEARNING.md
   ```

4. Pull the course outline.

   ```bash
   pnpm sync
   ```

5. Start the API (port 3111) and the Vite client, then open the Vite URL it
   prints.

   ```bash
   pnpm dev
   ```

The server does not serve the client build yet, so there is no production
`start` command. The first chat message downloads a small embedding model
to a local cache.

## Configuration

All settings live in `.env`. The template is `.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Your API key from [console.anthropic.com](https://console.anthropic.com/). Required. |
| `TUTOR_MODEL` | `opus` | Model for the tutor chat. |
| `UTIL_MODEL` | `sonnet` | Model for lesson rewrites and lesson summaries. |
| `PORT` | `3111` | Port of the API server. |

**Models.** Both model variables take an alias or a full model ID.

- An alias (`opus`, `sonnet`, `haiku`) resolves to the latest model that the
  installed SDK version knows.
- A full model ID pins one exact model version.
- If your key cannot use the model, the server tells you which variable to
  change.

**Cost.** You pay Anthropic for API usage. Every chat message sends the system
prompt, your profile, the lesson text, and the chat history of the lesson. The
first open of a lesson also runs one rewrite with `UTIL_MODEL`, and finishing a
lesson runs one summary. So the cost per lesson depends mostly on the model.
For a cheaper tutor, set `TUTOR_MODEL=sonnet`. See
[Anthropic pricing](https://www.anthropic.com/pricing).

## Learner profile

`profile/LEARNING.md` tells the tutor who you are. The tutor reads the whole
file on every message. The file is gitignored, so your notes stay out of the
repository.

The front matter has 3 fields:

| Field | Default | Used for |
|---|---|---|
| `name` | `the learner` | How the tutor addresses you. |
| `native_language` | `English` | Language for help and glossary notes. |
| `english_level` | `B2` | Level of the simple English. |

The rest of the file is free text (background, goals, neuro profile) plus two
tables. Keep their headings and columns as in the example:

- `## Path`: a status (`Do`, `Review`, `Skip`, `Done`) and hours per phase.
  `pnpm sync` reads it.
- `## Progress log`: the app appends one row per finished lesson.

The profile is optional. Without it, the tutor uses the defaults and the
database stays the only record of progress.

## Architecture

```
 Browser (Vite + React)
        |  HTTP + SSE (/api)
        v
 Server (Fastify, 127.0.0.1:PORT)
   |-- Tutor: Claude Agent SDK + in-process MCP tools  --> Anthropic API
   |-- SQLite (better-sqlite3): data/learn.db
   |-- RAG: transformers.js embeddings, local
   |-- Content sync  --> raw.githubusercontent.com (course repo)
   '-- profile/LEARNING.md (read + append)
```

- **Server** (`server/`): Fastify and SQLite through better-sqlite3. The tutor
  is a Claude Agent SDK agent with 4 in-process MCP tools: `ask_question`,
  `add_glossary_term`, `search_history`, `mark_lesson_done`. Embeddings come
  from `@huggingface/transformers` (model `Xenova/all-MiniLM-L6-v2`), with
  brute-force cosine search.
- **Client** (`client/`): Vite, React, Tailwind, Markdown with KaTeX math and
  Mermaid diagrams. Pages: a phase grid, the lessons of a phase, and a lesson
  with text and chat side by side (tabs on mobile).
- **Content**: the server fetches the course outline, lesson texts, and
  quizzes from the upstream course repository at runtime and caches them in
  your local database. This repository does not include or redistribute the
  course content.

The server/client API contract is in [`SPEC.md`](SPEC.md).

## Limitations

1. One learner per install. There are no user accounts.
2. The web UI has no authentication. The server listens on `127.0.0.1` only.
   Do not expose it to the internet as it is.
3. Only one course is supported for now: AI Engineering from Scratch.
4. You need an Anthropic API key, and API usage is paid.
5. Your data is stored locally, but chat content goes to the Anthropic API to
   get the tutor's answers.

## Contributing

1. Open an issue first for larger changes.
2. Use pnpm only. Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before a pull request.
3. Write commit messages in the
   [Conventional Commits](https://www.conventionalcommits.org/) format.
4. If you change the API, update `SPEC.md`, the server, and the client together.

## License and credits

Body Double is released under the MIT License. See [`LICENSE`](LICENSE) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

- Course: [AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch)
  by Rohit Ghumare (MIT). Fetched at runtime, not included.
- Skill [`i-have-adhd`](https://github.com/ayghri/i-have-adhd) by Ayoub Ghriss
  (MIT), included unchanged in `skills/`.
- Skill [`simple-english`](https://github.com/aminblg/simpleenglish) by AminBlg
  (MIT), included unchanged in `skills/`.
