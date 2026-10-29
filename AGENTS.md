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

## Tests that guard features

Three sets of tests protect what learners and staff rely on. Run all of them with
`pnpm test:all` before pushing to `dev`.

| Set            | Where                       | Command             | Needs                          |
| -------------- | --------------------------- | ------------------- | ------------------------------ |
| API unit tests | `apps/api/src/**/*.test.ts` | `pnpm test:api`     | nothing                        |
| API flow tests | `apps/api/test/flows/`      | `pnpm test:flows`   | Docker Postgres                |
| Browser tests  | `apps/web/tests/journeys/`  | `pnpm test:browser` | Docker Postgres, Google Chrome |

The flow and browser tests cover: signing in, who can open which lesson (the lesson
lock), buying and joining courses, video playback, learning progress, and the staff
area. Each folder's README lists what each file covers.

Rules for agents:

- **Ask every time a covered feature changes.** When a change touches a feature these
  tests cover, ask the user before finishing: "This changes <feature>. Should I also
  update <test file>?" Ask each time; do not decide alone, and do not skip the
  question because the tests still pass.
- **Never bend a test to make it pass.** Do not change, skip (`.skip`, `.fixme`) or
  delete a test to get a green run. When one fails, find out whether the app or the
  test is wrong, tell the user which and why, and ask before changing the test.
- **A bug fix brings its test.** When fixing a bug in a covered feature, offer to add
  the test that would have caught it: written first, failing without the fix.
- **No frontend unit tests.** Under `apps/web`, do not add unit tests, unit-test
  runners or their setup files.
- **Browser tests are journeys, not looks.** Add browser tests only for what a person
  does and gets (sign in, open, pay, watch, save). Never for layout, styling, colours,
  preferences or screenshots: those break on every design change and catch no bugs.
  Find elements by role, label or visible text, never by CSS class.

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
