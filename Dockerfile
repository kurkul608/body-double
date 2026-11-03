# syntax=docker/dockerfile:1
# glibc base on purpose: onnxruntime-node and the Claude Agent SDK native CLI
# do not support musl (alpine).
FROM node:26-trixie-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Node 25+ no longer bundles corepack; install it so packageManager stays the
# single source of the pnpm version.
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY client/package.json client/
RUN corepack install && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
  && pnpm --filter server deploy --prod --legacy /prod/server

FROM node:26-trixie-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3111
# paths.ts resolves the project root as the parent of /app/server.
WORKDIR /app/server
COPY --from=build --chown=node:node /prod/server ./
COPY --from=build --chown=node:node /src/server/dist ./dist
COPY --from=build --chown=node:node /src/server/src/tutor/system-prompt.md ./src/tutor/system-prompt.md
COPY --from=build --chown=node:node /src/skills /app/skills
# Root package.json is the app version source (read by /api/health).
COPY --from=build --chown=node:node /src/package.json /app/package.json
RUN mkdir -p /app/data /app/profile && chown node:node /app/data /app/profile
USER node
EXPOSE 3111
CMD ["node", "dist/index.js"]

FROM nginx:alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/client/dist /usr/share/nginx/html
