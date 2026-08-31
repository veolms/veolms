# Architecture

VeoLMS currently has four application boundaries:

- **Web** is a React Router application that reads public course data through the API and builds to static files.
- **API** is the Fastify service that owns public HTTP endpoints and accesses PostgreSQL through Kysely.
- **Fleet Manager** is the control plane responsible for ephemeral worker provisioning, dynamic monitoring, direct heartbeats, and job reconciliation ([docs](./fleet-manager-and-video-transcoding.md)).
- **Media Worker** is the autonomous media processing worker engine that executes FFmpeg multi-rendition HLS transcoding and streams progress and heartbeats directly to PostgreSQL.

For full architectural and operational details of the video transcoding infrastructure, see [`docs/fleet-manager-and-video-transcoding.md`](./fleet-manager-and-video-transcoding.md).
