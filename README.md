# Body Double

A self-hosted AI tutor built for ADHD brains.

## Quickstart

```bash
pnpm install
cp .env.example .env && cp profile/LEARNING.example.md profile/LEARNING.md   # add ANTHROPIC_API_KEY, edit your profile
pnpm sync && pnpm dev
```

`pnpm sync` pulls the course outline. `pnpm dev` starts the API (port 3111)
and the Vite client; open the Vite URL it prints. The server does not serve
the client build yet, so there is no production `start` command.

See `SPEC.md` for the server/client contract. License: MIT (see `LICENSE` and
`THIRD_PARTY_NOTICES.md`).
