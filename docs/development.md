# Development

## Install dependencies

```bash
pnpm install
```

## Database options

VeoLMS requires PostgreSQL 18. Choose either Docker or a native PostgreSQL installation. The application, migrations, seed command, and resulting schema work identically in both cases; only `DATABASE_URL` and how PostgreSQL is started differ.

### Option A: Docker Compose (recommended)

Docker provides a reproducible, isolated PostgreSQL 18 environment and requires no host-level database configuration.

```bash
pnpm compose:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Compose runs `postgres:18-alpine`, publishes PostgreSQL on host port `5433`, and stores its data in the persistent `veolms-postgres-18-data` named volume. The default validated connection URL is:

```text
postgresql://veolms:veolms@localhost:5433/veolms
```

Run `pnpm compose:down` to stop PostgreSQL. The named volume preserves local data.

### Option B: Native PostgreSQL 18

Use a native installation when Docker Desktop consumes too much memory or when PostgreSQL 18 is already installed. Install PostgreSQL 18 from the [official PostgreSQL downloads](https://www.postgresql.org/download/) and ensure its service is running.

Create the local role and database through `psql`, pgAdmin, or an equivalent administration tool. With `psql`:

```sql
CREATE ROLE veolms WITH LOGIN PASSWORD 'veolms';
CREATE DATABASE veolms OWNER veolms;
```

Copy `.env.example` to `.env` and point `DATABASE_URL` at the native server. Native installations commonly use port `5432`:

```env
DATABASE_URL=postgresql://veolms:veolms@localhost:5432/veolms
```

Do not run `pnpm compose:up` for this option. Once the native server and database are ready, use the same application commands:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The migration creates the schema and the idempotent seed inserts the three initial published courses. `pnpm db:reset` rolls migrations back and reapplies them, removing existing course data; run `pnpm db:seed` afterward.

## Platform resource notes

- **Linux:** Docker Engine uses the host Linux kernel, so it does not need a separate Linux virtual machine and generally has the lowest virtualization overhead.
- **Windows:** Docker Desktop runs Linux containers through WSL2. The shared WSL2 utility VM appears in Task Manager as `VmmemWSL` and can retain Linux kernel and filesystem cache memory even after containers stop. Stopping containers is not the same as stopping Docker Desktop. On a memory-constrained Windows computer, a native PostgreSQL installation is often the lighter option. See the [Docker WSL2 documentation](https://docs.docker.com/desktop/features/wsl/).
- **macOS:** Docker Desktop also requires a Linux virtual machine because macOS does not provide a Linux kernel. Docker Resource Saver can stop that VM while idle, but Docker still has more overhead than a native PostgreSQL installation. See the [Docker Resource Saver documentation](https://docs.docker.com/desktop/use-desktop/resource-saver/).

To fully release Docker and WSL memory on Windows after stopping the Compose services:

```powershell
pnpm compose:down
docker desktop stop
wsl --shutdown
```

`wsl --shutdown` stops every running WSL distribution, so do not use it while other WSL work must remain active.

## Run the applications

The Web application currently runs independently of the API and database. Start only the frontend with:

```bash
pnpm dev:web
```

It is available at `http://localhost:3000`. Set `WEB_PORT` in `.env` to override the frontend port. Use `pnpm dev` only when developing the Web and API applications together; the fleet manager and media worker remain inactive shells.

API logs are formatted for readability in development by default. Set `API_DEV_PRETTY_LOGS=false` in `.env` to keep the original JSON log format. This setting is development-only; production logs always remain structured JSON.

## API documentation

Interactive OpenAPI documentation is served at `http://localhost:4000/api/docs`, with the raw document at `/api/docs/json` and `/api/docs/yaml`. It is generated from the Zod schemas each route uses to validate and serialise traffic, so it cannot drift from the running code and there is nothing to regenerate. Set `API_DOCS_ENABLED=false` in `.env` to run the API without exposing it.

Adding a file to `apps/api/src/routes` is all it takes for an endpoint and its documentation to exist — see [apps/api/README.md](../apps/api/README.md).

The document lists `/` as its server, which resolves against whatever origin served the page, so "Try it out" works unchanged through a reverse proxy or TLS terminator. Set `API_PUBLIC_URL` only when a relative base cannot describe the deployment — docs served from a different origin than the API, or a proxy that mounts the API beneath a path prefix.

## Static Web build

The static Web build does not require PostgreSQL or the API. Build and preview it with:

```bash
pnpm build:web
pnpm --filter @veolms/web preview
```

React Router writes the deployable client-only application to `apps/web/build/client`. `VITE_COURSE_MEDIA_BASE_URL` is optional; when it is unset, course media uses relative `/course-videos/...` URLs.

## Development UI deployment

Every push to `development` runs `.github/workflows/deploy-development-ui.yml`. The workflow type-checks and tests the Web application, builds it, synchronises `apps/web/build/client` to S3 while preserving the separately managed `course-videos/` prefix, uploads `index.html` last with a no-cache policy, and waits for a CloudFront `/*` invalidation to finish. It can also be started manually from GitHub Actions.

The workflow uses the GitHub `development` environment and exchanges GitHub's OIDC token for short-lived AWS credentials. Configure these GitHub Actions variables on that environment:

- `AWS_DEPLOY_ROLE_ARN`
- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_CLOUDFRONT_DISTRIBUTION_ID`
- `VITE_COURSE_MEDIA_BASE_URL` (optional)

Do not add long-lived AWS access keys as GitHub secrets. Restrict the role's trust policy to the repository's immutable `development` environment subject, `repo:veolms@301170291/veolms@1320067532:environment:development`. Its permissions should be limited to listing the deployment bucket, putting and deleting objects in that bucket, and creating and reading invalidations for the development CloudFront distribution.

## Development API deployment

Every push to `development` also runs `.github/workflows/deploy-development-api.yml`. It validates the API and database migrations, connects to the existing Linux server over SSH, updates the server checkout to the exact Git commit that triggered the workflow, installs the frozen lockfile, applies pending migrations, type-checks the API, restarts the systemd service, and checks the API liveness endpoint.

The server must have Node.js 24, pnpm 11, Git, PostgreSQL access, `curl`, and a systemd unit for the API. Keep the production `.env` on the server in the repository's expected location; the workflow never transfers or replaces it. The deploy user needs read/write access to the application directory and passwordless permission to restart only the API service, for example:

```sudoers
veolms-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart veolms-api.service
```

Configure these values on the GitHub `development` environment:

- Variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` (optional; defaults to `22`), `DEPLOY_APP_DIR`, `DEPLOY_SERVICE_NAME`, and `API_HEALTHCHECK_URL` (for example, `http://127.0.0.1:4000/api/v1/health`).
- Secrets: `DEPLOY_SSH_PRIVATE_KEY` and `DEPLOY_KNOWN_HOSTS`.

The server checkout's `origin` must point to the repository and the deploy key must be able to fetch the `development` branch. `DEPLOY_KNOWN_HOSTS` should contain the server's verified `known_hosts` entry; do not use `ssh-keyscan` inside the workflow or disable host-key checking.
