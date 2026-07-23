FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.14.0
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/config-lint/package.json packages/config-lint/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY packages/test-kit/package.json packages/test-kit/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm build

FROM build AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@atlas/web", "start"]

FROM build AS api
EXPOSE 3001
CMD ["pnpm", "--filter", "@atlas/api", "start"]

FROM build AS worker
EXPOSE 3002
CMD ["pnpm", "--filter", "@atlas/worker", "start"]
