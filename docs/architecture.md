# Architecture

VeoLMS currently has four application boundaries:

- **Web** is a React Router application that reads public course data through the API and builds to static files.
- **API** is the Fastify service that owns public HTTP endpoints and accesses PostgreSQL through Kysely.
- **Fleet Manager** is the control plane responsible for ephemeral worker provisioning, dynamic monitoring, direct heartbeats, and job reconciliation ([docs](./fleet/index.md)).
- **Media Worker** is the autonomous media processing worker engine that executes FFmpeg multi-rendition HLS transcoding and streams progress and heartbeats directly to PostgreSQL ([docs](./media-worker/index.md)).

For full operational command references, see [`docs/fleet-commands-and-operations.md`](./fleet-commands-and-operations.md).
For cloud infrastructure provisioning and CI/CD deployment, see [`docs/video-fleet-infrastructure-and-cicd-guide.md`](./video-fleet-infrastructure-and-cicd-guide.md).
