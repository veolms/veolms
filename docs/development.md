# Development setup

This guide sets up a local development copy. Run commands from the repository root unless stated otherwise.

## Prerequisites

- Git
- Node.js 24 and pnpm 11.18.0 (the version in `package.json`)
- Docker Engine or Docker Desktop with Compose, running locally; or PostgreSQL 18 installed locally
- Google Chrome for browser tests

Check `git --version`, `node --version`, `pnpm --version`, and `docker compose version`. Install missing tools using their official instructions. If pnpm is unavailable, install the version above using the [pnpm installation guide](https://pnpm.io/installation).

## Clone and configure

```bash
git clone --branch dev https://github.com/veolms/veolms.git
cd veolms
cp .env.example .env
pnpm install --frozen-lockfile
```

In PowerShell, use `Copy-Item .env.example .env` instead of `cp`. If you already have a checkout or `.env`, use it instead of cloning again or overwriting your configuration. The example credentials and secrets are for local development only. Never commit `.env`, and use unique secrets for any deployed environment. Optional integrations such as OAuth, object storage, and payment providers require their own credentials; consult the comments in `.env.example` when working on them.

## Start PostgreSQL

With Docker running:

```bash
docker compose up -d --wait postgres
```

The default local database is `veolms` on port `5433`, matching `.env.example`. Compose stores data in a persistent named volume. If port 5433 is occupied, change both `POSTGRES_PORT` and the port in `DATABASE_URL` in `.env` before starting Compose.

Alternatively, use [native PostgreSQL 18](#native-postgresql-18). Do not start the Compose database for this option.

## Initialize and run

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000>; the API is at <http://localhost:4000> and its documentation is at <http://localhost:4000/docs>. The local seed creates a demo academy and the administrator `admin@veolms.org`. Sign in with the email code shown in the API console. See the [seed guide](seed.md) for the SQL dump, sample data, options, and media configuration.

Stop the app with Ctrl+C. To stop the Docker database while preserving its data:

```bash
docker compose down
```

Avoid `docker compose down -v` and `pnpm db:reset` unless you intend to remove local data. If startup fails, check that Docker is running, the database is healthy (`docker compose ps`), the configured port is free, and `.env` matches your database. See the platform and application notes below for more details.

## Useful commands

```bash
pnpm dev:web       # Start the frontend
pnpm dev:api       # Start the API
pnpm lint          # Check code quality
pnpm typecheck     # Check TypeScript types
pnpm test:all      # Run API, flow, and browser tests
```

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:api
```

Before pushing to `dev`, run `pnpm test:all`. Flow tests require Docker PostgreSQL; browser tests also require Google Chrome. They rebuild separate test databases. See the [flow tests](../apps/api/test/flows/README.md) and [browser tests](../apps/web/tests/journeys/README.md) for details. See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution and test rules.

### Native PostgreSQL 18

Install and start [PostgreSQL 18](https://www.postgresql.org/download/). Create a local role and database with `psql` or an equivalent tool:

```sql
CREATE ROLE veolms WITH LOGIN PASSWORD 'veolms';
CREATE DATABASE veolms OWNER veolms;
```

Copy `.env.example` to `.env` if needed and set `DATABASE_URL=postgresql://veolms:veolms@localhost:5432/veolms` to match your server. Then install dependencies and run `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev` as described above.

## Platform resource notes

- **Linux:** Docker Engine uses the host Linux kernel, so it does not need a separate Linux virtual machine and generally has the lowest virtualization overhead.
- **Windows:** Docker Desktop runs Linux containers through WSL2. The shared WSL2 utility VM appears in Task Manager as `VmmemWSL` and can retain Linux kernel and filesystem cache memory even after containers stop. Stopping containers is not the same as stopping Docker Desktop. On a memory-constrained Windows computer, a native PostgreSQL installation is often the lighter option. See the [Docker WSL2 documentation](https://docs.docker.com/desktop/features/wsl/).
- **macOS:** Docker Desktop also requires a Linux virtual machine because macOS does not provide a Linux kernel. Docker Resource Saver can stop that VM while idle, but Docker still has more overhead than a native PostgreSQL installation. See the [Docker Resource Saver documentation](https://docs.docker.com/desktop/use-desktop/resource-saver/).

To fully release Docker and WSL memory on Windows after stopping the Compose services:

```powershell
docker compose down
docker desktop stop
wsl --shutdown
```

`wsl --shutdown` stops every running WSL distribution, so do not use it while other WSL work must remain active.

## Run the applications

To start only the frontend, run:

```bash
pnpm dev:web
```

It is available at `http://localhost:3000`. Set `WEB_PORT` in `.env` to override the frontend port. Use `pnpm dev` only when developing the Web and API applications together;
API logs are formatted for readability in development by default. Set `API_DEV_PRETTY_LOGS=false` in `.env` to keep the original JSON log format. This setting is development-only; production logs always remain structured JSON.

## API documentation

Interactive OpenAPI documentation is served at `http://localhost:4000/docs`, with the raw document at `/docs/json` and `/docs/yaml`. It is generated from the Zod schemas each route uses to validate and serialise traffic, so it cannot drift from the running code and there is nothing to regenerate. Set `API_DOCS_ENABLED=false` in `.env` to run the API without exposing it.

Adding a file to `apps/api/src/routes` is all it takes for an endpoint and its documentation to exist — see [apps/api/README.md](../apps/api/README.md).

The document lists `/` as its server, which resolves against whatever origin served the page, so "Try it out" works unchanged through a reverse proxy or TLS terminator. Set `API_PUBLIC_URL` only when a relative base cannot describe the deployment — docs served from a different origin than the API, or a proxy that mounts the API beneath a path prefix.

## Static Web build

The static Web build does not require PostgreSQL or the API. A normal build
prerenders every learning lecture. Preview builds the same output before it
starts the local server:

```bash
pnpm build:web
pnpm --filter @veolms/web preview
```

For a faster test build that prerenders only the first section of each course,
pass `--first-section` to either command:

```bash
pnpm build:web -- --first-section
pnpm --filter @veolms/web preview -- --first-section
```

To skip lesson pages entirely and prerender only the application pages (home,
courses, course overviews, settings, auth), pass `--no-lessons` instead:

```bash
pnpm build:web -- --no-lessons
pnpm --filter @veolms/web preview -- --no-lessons
```

React Router writes the deployable client-only application to `apps/web/build/client`. `VITE_CDN_URL` is the browser-facing CDN value and accepts either a full CDN/Worker domain (for example `https://media.veolms.org`) or a same-origin path such as `/cdn`. `VITE_COURSE_MEDIA_BASE_URL`, when set, overrides `VITE_CDN_URL` for the built-in course HLS/video and thumbnail assets. This is useful when local development reads those assets from a public R2 origin. `CDN_URL` is the corresponding API/Worker value; keep both values equal for API-delivered protected media. The Vite development server uses `VITE_CDN_URL` (falling back to `CDN_URL`) to provide the `/cdn/*` proxy when it is an absolute URL. With `/cdn` in deployment, the host must route `/cdn/*` to the Worker; media bytes never pass through the API.

## Direct media CDN Worker

The Cloudflare Worker lives in the single source file
`scripts/cdn-worker.js`. `wrangler.cdn.jsonc` is the deployment configuration
that binds the private R2 bucket to `env.MEDIA_BUCKET`.

Set `CDN_SIGNING_SECRET` to the same value in the API environment and Worker
secret, then deploy with:

```bash
pnpm dlx wrangler@4 secret put CDN_SIGNING_SECRET --config wrangler.cdn.jsonc
pnpm dlx wrangler@4 deploy --dry-run --config wrangler.cdn.jsonc
pnpm dlx wrangler@4 deploy --config wrangler.cdn.jsonc
```

Keep the R2 bucket private. Configure the Worker route as `/cdn/*` when
`CDN_URL=/cdn`, or attach a custom domain and set `CDN_URL` to that full
domain. `.m3u8` files are public, while non-manifest objects in
`CDN_PUBLIC_FOLDERS` are served without a token and
`CDN_PRIVATE_FOLDERS` require the short-lived `veo_token` issued by the API.
`CDN_TOKEN_TTL_SECONDS` controls normal protected-media URLs and
`CDN_HLS_TOKEN_TTL_SECONDS` controls protected HLS segment URLs.
New direct uploads use `public/...` or `protected/...` keys. Course thumbnail
assets use a flat per-asset layout:

```text
public/thumbnails/<mediaId>/original.<extension>
public/thumbnails/<mediaId>/full.webp
public/thumbnails/<mediaId>/<width>.webp
```

Protected thumbnails use the same layout below `protected/`. Existing legacy
`thumbnails/...`, `media/...`, and `transcoded/...` keys remain supported by
the Worker defaults. Newly generated HLS output uses
`public/transcoded/<mediaId>/` or `protected/transcoded/<mediaId>/`; the
manifest is `master.m3u8` inside that prefix.
Profile avatars use CDN-served flat per-user keys:

```text
public/avatars/<userId>/original.<extension>
public/avatars/<userId>/<width>.webp
```

The API stores the 160px CDN URL and returns the 45px, 96px, and 160px source
set. The CDN/image-transform Worker creates missing WebP variants. Manual
avatar uploads use `POST /auth/me/avatar/presign`, a browser `PUT` to the
returned storage URL, and `POST /auth/me/avatar/complete`. Authenticated
discussion attachments use `protected/discussion-uploads/<fileName>`.

## Web deployment

Cloudflare Workers Builds builds and deploys the web app on dev.veolms.org from
the `dev` branch, with `wrangler.jsonc`, on every push. No GitHub workflow
builds or deploys it. A failed build shows only as the "Workers Builds: dev"
check on the commit (its log is in the Cloudflare dashboard) and leaves the
site on the previous version.

## Development API deployment

Every push to `development` also runs `.github/workflows/deploy-development-api.yml`. It validates the API and database migrations, connects to the existing Linux server over SSH, updates the server checkout to the exact Git commit that triggered the workflow, installs the frozen lockfile, applies pending migrations, type-checks the API, restarts the systemd service, and checks the API liveness endpoint.

The server must have Node.js 24, pnpm 11, Git, PostgreSQL access, `curl`, and a systemd unit for the API. Keep the production `.env` on the server in the repository's expected location; the workflow never transfers or replaces it. The deploy user needs read/write access to the application directory and passwordless permission to restart only the API service, for example:

```sudoers
veolms-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart veolms-api.service
```

Configure these values on the GitHub `development` environment:

- Variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` (optional; defaults to `22`), `DEPLOY_APP_DIR`, `DEPLOY_SERVICE_NAME`, and `API_HEALTHCHECK_URL` (for example, `http://127.0.0.1:4000/v1/health`).
- Secrets: `DEPLOY_SSH_PRIVATE_KEY` and `DEPLOY_KNOWN_HOSTS`.

The server checkout's `origin` must point to the repository and the deploy key must be able to fetch the `development` branch. `DEPLOY_KNOWN_HOSTS` should contain the server's verified `known_hosts` entry; do not use `ssh-keyscan` inside the workflow or disable host-key checking.
