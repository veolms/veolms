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
