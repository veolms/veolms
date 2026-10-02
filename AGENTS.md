# VeoLMS Monorepo Agent Instructions

This repository is a monorepo containing the following packages and applications:

- `apps/web`: React Router frontend. Follow the instructions in `apps/web/AGENTS.md`.
- `apps/api`: Fastify backend API. Follow the instructions in `apps/api/AGENTS.md`.
- `packages/contracts`: Shared Zod schemas and TypeScript request/response contracts.
- `packages/database`: Shared database migrations and schema definitions.
- `packages/config`: Shared configuration and environment validation.

## Monorepo Rules

1. Always use contracts from `@veolms/contracts` for API requests and responses between backend and frontend.
2. For frontend architecture, state management, API integrations, visual design, and component reuse, strictly adhere to `apps/web/AGENTS.md`.
3. For backend architecture, layered service pattern, and database repositories, strictly adhere to `apps/api/AGENTS.md`.

## Frontend unit-test policy

For work under `apps/web`, do not create, restore, or update unit-test cases.
Do not add unit-test runners, setup files, or unit-test-only dependencies. Keep
browser-level E2E coverage separate and preserve existing Playwright E2E tests
unless the task explicitly asks for changes to them.

## Branch Protection Rule

**Never commit directly to the `development` branch.**

- All changes to this repo must go through a feature branch and a Pull Request.
- Branch naming: `feat/`, `fix/`, `chore/` prefixes.
- A `pre-push` git hook is installed locally to enforce this. If you are an AI assistant: do not attempt to push or commit to `development` under any circumstances.
- Cloud-specific features (billing, tenancy, analytics) must NEVER be committed here — they belong in `veolms/veolms-cloud`.
