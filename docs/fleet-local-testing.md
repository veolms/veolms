# Local Fleet Testing

The local fleet has two Docker-backed modes. Both use the repository's
`s3-bucket/` directory as the worker input/output mount and require Docker.
Normal development stays lightweight: `docker compose up -d` starts only
PostgreSQL. Fleet services live in `compose.fleet.yaml` and only start through
the Fleet commands below. The Fleet Compose file does **not** start PostgreSQL:
set the existing `DATABASE_URL` to the database the manager and workers use.
The Fleet commands read `apps/fleet-manager/.env` directly.

## Files and lifecycle

| File / command                                            | Purpose                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `compose.yaml`                                            | Normal development services: PostgreSQL only.                                   |
| `compose.fleet.yaml`                                      | Optional serverful Fleet Manager and LocalStack services.                       |
| `pnpm fleet:images:build`                                 | Builds the one-file worker and manager images. Run after relevant code changes. |
| `pnpm fleet:local:up` / `pnpm fleet:local:down`           | Starts or stops only the serverful Fleet profile.                               |
| `pnpm fleet:localstack:prepare`                           | Builds the worker image and Lambda bundle after relevant changes.               |
| `pnpm fleet:localstack:up` / `pnpm fleet:localstack:down` | Starts or stops only the LocalStack profile.                                    |

The manager image contains `fleet-manager.cjs`; the worker image contains
`media-worker.js`. Docker does not copy the complete repository or install
workspace dependencies during image startup.

`pnpm fleet:provider --provider=docker` detects the Docker socket group and
writes `DOCKER_SOCKET_GID` for you. On Linux, this is the group id reported by
`stat -c '%g' /var/run/docker.sock`; Docker Desktop maps the mounted socket to
group `0`. The Compose manager runs as the non-root `node` user and receives
only that socket group.

## Serverful daemon

```bash
# First run `pnpm fleet:provider docker` (or select Docker interactively). It
# removes obsolete worker-specific aliases and keeps the existing DATABASE_URL
# in apps/fleet-manager/.env. Edit that one key when necessary.

pnpm fleet:images:build # once, and again only after Fleet/worker code changes
pnpm fleet:db:migrate
pnpm fleet:local:up
pnpm fleet:cli queue raw/video.mp4 --qualities=240p
pnpm fleet:cli workers
```

`fleet-manager` runs continuously in Compose. Every claimed job starts a
`veolms-media-worker:local` container with `WORKER_MAX_JOBS=1`; it exits after
the job and the manager removes it. Input and HLS output are in `s3-bucket/`.
Both images copy only their prebuilt JavaScript bundle, not the full workspace
or `node_modules`.

### Database records written by a worker

Before FFmpeg starts, the worker probes (or reuses) the source metadata and
persists `width`, `height`, and the rounded `duration_seconds` on the
`media_assets` row referenced by `video_jobs.video_id`. After a successful HLS
transcode, it records the portable storage key
`<output_prefix>/master.m3u8` in `video_outputs.master_playlist_path` in the
same completion transaction. Repeated attempts update the existing output row
for that media asset instead of creating duplicate rows.

For a PostgreSQL server running on the Docker host, use
`host.docker.internal` in both URLs (for example,
`postgresql://veolms:veolms@host.docker.internal:5433/veolms`). The provider
adds the host-gateway mapping to every worker. No PostgreSQL container is
created by the Fleet commands.

To test a public URL:

```bash
pnpm fleet:cli queue 'https://example.com/video.mp4' \
  --qualities=240p --prefix=output/local-test/
pnpm fleet:cli test watch --job <job-id>
```

## LocalStack serverless

```bash
# `pnpm fleet:provider docker` has already configured the Docker provider and
# keeps the existing DATABASE_URL in apps/fleet-manager/.env.

pnpm fleet:localstack:prepare # once, and again only after Fleet/worker changes
pnpm fleet:db:migrate
pnpm fleet:localstack:up
```

Only when using LocalStack EC2 emulation, also run:

```bash
LOCALSTACK_EC2_ENABLED=true pnpm fleet:localstack:ami
```

The setup creates a LocalStack Lambda named `veolms-fleet-manager`. By default
it uses the Docker Engine socket mounted into the Lambda runtime to create the
one-job worker container directly. This is the Community-compatible path and
does **not** require LocalStack EC2 support. The shared `s3-bucket/` host path
is still mounted read/write into every worker.

### LocalStack support status

The Community-compatible mode is **Lambda → Docker Engine socket → worker
container**. It requires Docker socket mounts to be permitted on the host. It
does not simulate EC2, and it is the recommended local serverless route.

The optional **Lambda → LocalStack EC2 API → Docker-backed instance** route is
only available when the installed LocalStack tier supports EC2 Docker
emulation. Enable it with `LOCALSTACK_EC2_ENABLED=true`.

If your LocalStack tier supports Docker-backed EC2, set
`LOCALSTACK_EC2_ENABLED=true` before starting the profile. The Lambda then uses
the AWS provider and LocalStack EC2 API; the custom AMI includes the bundled
worker, Node, and FFmpeg.

Invoke it with the LocalStack endpoint and test credentials, for example:

```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1 \
AWS_ENDPOINT_URL=http://localhost:4566 \
aws lambda invoke --function-name veolms-fleet-manager \
  --payload '{"action":"claim"}' --cli-binary-format raw-in-base64-out /tmp/fleet.json
```

## Fault scenarios

Set `FLEET_TEST_MODE=true` (the Compose profiles do this). Once a worker is
created, trigger one of the guarded local-only scenarios:

```bash
pnpm fleet:cli test fault interrupt --worker <worker-id>
pnpm fleet:cli test fault heartbeat-loss --worker <worker-id>
pnpm fleet:cli test fault progress-stall --worker <worker-id>
pnpm fleet:cli test fault worker-failure --worker <worker-id>
pnpm fleet:cli test fault storage-failure --worker <worker-id>
pnpm fleet:cli test watch --job <job-id>
```

`interrupt` records its requested/applied audit events while leaving worker and
job state unchanged before termination. The normal fleet reconciliation and
retry path then remains visible in the job timeline.
