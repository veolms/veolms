# Local Fleet Testing

The local fleet has two Docker-backed modes. Both use the repository's
`s3-bucket/` directory as the worker input/output mount and require Docker.
Normal development stays lightweight: `docker compose up -d` starts only
PostgreSQL. Fleet services live in `compose.fleet.yaml` and only start through
the Fleet commands below. The Fleet Compose file does **not** start PostgreSQL:
set the existing `DATABASE_URL` to the database the manager and workers use.
The Fleet commands read `apps/fleet-manager/.env` directly.

## Files and lifecycle

| File / command                   | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `compose.yaml`                   | Normal development services: PostgreSQL only.                                          |
| `compose.fleet.yaml`             | Optional serverful Fleet Manager and LocalStack services.                              |
| `pnpm fleet:provider`            | Interactive CLI to select active provider (docker, aws, local).                        |
| `pnpm fleet:infra`               | Prompts for config, verifies storage & network, builds images, offers to start daemon. |
| `pnpm fleet:infra --update`      | Automatically rebuilds bundles and updates Docker container images after code edits.   |
| `pnpm fleet:cli run daemon`      | Runs Fleet Manager in-process to poll and orchestrate Docker workers.                  |
| `pnpm fleet:destroy`             | Teardown CLI: choose between stopping running containers or complete teardown.         |
| `pnpm fleet:destroy --stop-only` | Gracefully stops running worker and manager containers; preserves data and images.     |

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
pnpm fleet:provider # select Docker interactively
pnpm fleet:infra    # configures env, migrates database, builds worker & manager images
pnpm fleet:cli run daemon  # starts fleet manager (or run containerized via docker compose)
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
