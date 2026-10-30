# VeoLMS

VeoLMS is a lightweight learning-management platform foundation. This repository currently proves one public vertical slice: PostgreSQL to Kysely to Fastify to a statically generated React Router course catalogue.

It intentionally does not implement authentication, enrolment, payments, media processing, dashboards, monitoring, or deployment infrastructure. The public Astro website and documentation website belong in a separate repository.

## Stack

Node.js 24, TypeScript 7, pnpm, Turborepo, Fastify 5, PostgreSQL 18, Kysely, Zod, React 19, React Router 8 Framework Mode, Vite, Tailwind CSS 4, ESLint, Prettier, and Docker Compose.

## Repository

```text
apps/
  api/             Fastify public API
  web/             React Router static frontend
packages/
  config/          Shared environment validation
  contracts/       Public course contracts
  database/        Kysely client, migration, seed, and course queries
docs/              Short architecture and development notes
```

## Requirements

- Node.js 24 LTS
- pnpm 11
- PostgreSQL 18, provided either by Docker or a native installation
- Docker with Docker Compose when using the recommended container workflow

## Setup and development

Install the workspace dependencies:

```bash
pnpm install
```

Docker is the recommended database option because it provides the same isolated PostgreSQL 18 environment for every developer:

```bash
pnpm compose:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On a memory-constrained computer, PostgreSQL 18 can instead be installed directly on the host. Set `DATABASE_URL` in `.env`, do not run `pnpm compose:up`, and use the same migration, seed, and development commands. See the [development guide](docs/development.md) for both database workflows and platform-specific Docker memory notes.

The API listens at `http://localhost:4000`; the Web development server listens at `http://localhost:3000` and proxies `/api` to Fastify.

Useful commands:

```bash
pnpm dev:web
pnpm dev:api
pnpm build:api
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm verify
pnpm compose:down
```

The seed is idempotent and maintains exactly the three initial published course records defined by this scaffold.

## Static Web build

Start PostgreSQL, migrate and seed it, and keep the API running before building:

```bash
pnpm dev:api
pnpm build:web
```

The build reads course paths and content from `STATIC_BUILD_API_URL` and writes CDN-ready files to `apps/web/build/client`. There is no production frontend runtime server.

See [architecture](docs/architecture.md) and [development](docs/development.md) for the current boundaries and local workflow.
