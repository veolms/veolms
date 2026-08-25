# @veolms/api

Fastify API for VEOLMS. Interactive docs are served at
<http://127.0.0.1:4000/api/docs>, with the raw document at `/api/docs/json` and
`/api/docs/yaml`.

## Adding an endpoint

Create a route plugin under [src/modules](src/modules) that default-exports a
`RoutePlugin`.
That is the whole procedure — the file is registered automatically and its
OpenAPI entry is generated from the same schemas that validate traffic, so there
is no separate documentation step and nothing to regenerate.

```ts
import { z } from "zod";

import { jsonResponse } from "../lib/responses.ts";
import { errorResponse } from "../lib/errors.ts";
import type { RoutePlugin } from "../lib/route-plugin.ts";

// A minimal schema for the example so this snippet is copy-pasteable.
const lessonSchema = z.object({
  id: z.uuid().meta({ description: "Stable identifier for the lesson." }),
  title: z.string().min(1).meta({ description: "Lesson title." }),
  content: z.string().optional().meta({ description: "Lesson body (HTML or markdown)." }),
});

// Optionally register the schema so it becomes a reusable component in the
// generated OpenAPI document. Not required for local/inline schemas.
if ((z as any).globalRegistry && typeof (z as any).globalRegistry.add === "function") {
  (z as any).globalRegistry.add(lessonSchema, {
    id: "Lesson",
    description: "A lesson returned by GET /lessons/:id",
  });
}

const lessonRoutes: RoutePlugin = async (app) => {
  app.get(
    "/lessons/:id",
    {
      schema: {
        operationId: "getLesson",
        tags: ["Lessons"],
        summary: "Get a lesson by id",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("The lesson.", lessonSchema),
          404: errorResponse("No lesson has that id."),
        },
      },
    },
    // Simple handler that returns a value matching `lessonSchema`. A real
    // implementation would look up the lesson from the database and return it,
    // or reply with a 404 using the shared error shape.
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Example success response — matches lessonSchema so the serializer
      // accepts it and the OpenAPI example is valid.
      return {
        id,
        title: "Example lesson",
        content: "This is a short example lesson body.",
      };
    },
  );
};

export default lessonRoutes;
```

Notes:

- Paths are relative to the `/api/v1` prefix that
  [src/app.ts](src/app.ts) applies.
- `request.params`, `request.query` and `request.body` are typed from the Zod
  schemas, and responses are serialised through them — returning a field a route
  did not declare is an error rather than a silent leak.
- New `tags` values should be added to `OPENAPI_TAGS` in
  [src/openapi.ts](src/openapi.ts) so the group gets a description.
- Files whose name starts with `_` are not loaded, for route-local helpers.
- Contracts shared with the web app live in `@veolms/contracts`. Registering one
  in `z.globalRegistry` (see
  [packages/contracts/src/course.ts](../../packages/contracts/src/course.ts))
  publishes it as a reusable `components.schemas` entry instead of an inline
  copy.

## Running

```bash
pnpm dev:api
```

Set `API_DOCS_ENABLED=false` to keep the API running without exposing Swagger UI.
`/api/docs/json` goes away with it.

The document's `servers` entry is the relative `/`, resolved against the origin
the document was fetched from, so the docs stay callable behind a reverse proxy
or TLS terminator without knowing its hostname. `API_HOST` and `API_PORT` are
deliberately not used here — they are bind parameters, and `0.0.0.0` is not an
address a reader can call. Set `API_PUBLIC_URL` only when a relative base cannot
describe the deployment: docs on a different origin than the API, or a proxy that
mounts the API beneath a path prefix.
