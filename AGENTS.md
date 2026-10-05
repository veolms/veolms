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

## Frontend test policy

For work under `apps/web`, do not create, restore, or update unit-test or E2E-test cases.
Do not add unit-test runners, setup files, or test-only dependencies. E2E tests have been
decommissioned; validate changes with the relevant typecheck, lint, and build checks.

## Branch Protection Rule

**Never commit directly to the `development` branch.**

- All changes to this repo must go through a feature branch and a Pull Request.
- Branch naming: `feat/`, `fix/`, `chore/` prefixes.
- A `pre-push` git hook is installed locally to enforce this. If you are an AI assistant: do not attempt to push or commit to `development` under any circumstances.
- Cloud-specific features (billing, tenancy, analytics) must NEVER be committed here — they belong in `veolms/veolms-cloud`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
