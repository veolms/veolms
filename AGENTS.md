# VeoLMS Monorepo Agent Instructions

This repository is a monorepo containing the following packages and applications:

- `apps/web`: React Router frontend. Follow the instructions in `apps/web/AGENTS.md`.
- `apps/api`: Fastify backend API. Follow the instructions in `apps/api/AGENTS.md`.
- `packages/contracts`: Shared Zod schemas and TypeScript request/response contracts.
- `packages/database`: Shared database migrations and schema definitions.
- `packages/config`: Shared configuration and environment validation.
- `packages/fleet-types`: Shared fleet manager interfaces, provider lifecycle contracts, and command specifications. Follow the instructions in `packages/fleet-types/AGENTS.md`.

## Monorepo Rules

1. Always use contracts from `@veolms/contracts` for API requests and responses between backend and frontend.
2. For frontend architecture, state management, and API integrations, strictly adhere to `apps/web/AGENTS.md`.
3. For backend architecture, layered service pattern, and database repositories, strictly adhere to `apps/api/AGENTS.md`.
4. For fleet management, pluggable provider architecture, and lifecycle implementations, strictly adhere to `packages/fleet-types/AGENTS.md`.
