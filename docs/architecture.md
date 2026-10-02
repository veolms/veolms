# Architecture

VeoLMS currently has four application boundaries:

- **Web** is a React Router application that reads public course data through the API and builds to static files.
- **API** is the Fastify service that owns public HTTP endpoints and accesses PostgreSQL through Kysely.
