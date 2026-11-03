# Contributing to Body Double

Thank you for helping. Open an issue first for larger changes.

## Setup

1. Install Node.js 26 or newer and [pnpm](https://pnpm.io/) 12 or newer.
2. Follow the [Quickstart](README.md#quickstart) to install dependencies, create `.env`, and sync the course.
3. Use pnpm only. Do not use npm or yarn.

## Checks

Run these before you open a pull request. CI runs the same three on every push to `main` and on every pull request.

```bash
pnpm typecheck && pnpm test && pnpm build
```

## Commits

- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) format, for example `feat: add glossary export` or `fix(server): handle empty quiz`.
- CI runs [commitlint](https://commitlint.js.org/) (`@commitlint/config-conventional`) on every commit in a pull request.
- Mark a breaking change with `!`, for example `feat!: change lesson API`.

## API changes

`SPEC.md` is the server/client API contract.
If you change the API, update `SPEC.md`, the server, and the client in the same pull request.

## Versioning and releases

- One version for the whole repo: the root `package.json` (SemVer, `0.x` for now).
- [release-please](https://github.com/googleapis/release-please) reads Conventional Commits on `main` and opens a release PR.
- In `0.x`, `fix:` bumps PATCH, and `feat:` or a breaking change (`!`) bumps MINOR.
- Merging the release PR tags `vX.Y.Z`, updates `CHANGELOG.md`, and pushes the `ghcr.io/kurkul608/body-double-server` and `ghcr.io/kurkul608/body-double-web` images (tags `X.Y.Z`, `X.Y`, `latest`).
- The running version is in `GET /api/health` and in the home page footer.
