import fastifySwagger, { type SwaggerTransformObject } from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { OpenAPIV3_1 } from "openapi-types";

import { config } from "./config.ts";

export const DOCS_ROUTE_PREFIX = "/api/docs";

const OPENAPI_TAGS = [
  {
    name: "Health",
    description: "Liveness probing for deployments and uptime checks.",
  },
  {
    name: "Courses",
    description: "Read-only access to the published course catalogue.",
  },
  {
    name: "Auth",
    description:
      "Session management, registration, password recovery, and multi-factor authentication (TOTP).",
  },
  {
    name: "Course Categories",
    description: "Category management for course creation.",
  },
  {
    name: "Course Authoring",
    description: "Course draft lifecycle and editor endpoints.",
  },
  {
    name: "Course Media",
    description: "Pre-signed uploads and media asset status tracking.",
  },
  {
    name: "Course Curriculum",
    description: "Section, lesson, and resource management.",
  },
  {
    name: "Course Configuration",
    description: "Access rules, pricing, and settings configuration.",
  },
  {
    name: "Course Lifecycle",
    description: "Validation, publishing, unpublishing, and previewing.",
  },
];

/**
 * The `servers` entry clients resolve request URLs against.
 *
 * Defaults to `/`, a relative URL the spec resolves against the location the
 * document was served from — so "Try it out" targets whatever scheme, host and
 * port the reader actually reached the docs on. `API_HOST` and `API_PORT` cannot
 * answer that: they are bind parameters, `0.0.0.0` and `::` are not addresses
 * anyone can call, and a TLS-terminating ingress serves the docs on a scheme,
 * hostname and port the process never sees.
 *
 * Since every documented path already carries the `/api/v1` prefix, `/` is the
 * correct base. Set `API_PUBLIC_URL` for the cases a relative base cannot cover:
 * docs hosted on a different origin than the API, or a proxy that mounts the API
 * beneath a path prefix.
 */
function documentedServers(): OpenAPIV3_1.ServerObject[] {
  if (config.API_PUBLIC_URL) {
    return [
      {
        // A trailing slash would double up against the leading slash on each
        // path, so normalise it away.
        url: config.API_PUBLIC_URL.replace(/\/+$/u, ""),
        description: "Public API endpoint",
      },
    ];
  }

  return [{ url: "/", description: "The origin serving this document" }];
}

/**
 * `jsonSchemaTransformObject` publishes an input *and* an output variant of
 * every schema in `z.globalRegistry` (`Foo` plus `FooInput`), so a contract used
 * in only one direction still emits a component nothing points at. Drop the
 * components the document never references, following `$ref`s transitively so
 * nested contracts survive.
 */
function pruneUnreferencedComponents(
  document: OpenAPIV3_1.Document,
): OpenAPIV3_1.Document {
  const schemas = document.components?.schemas;

  if (!schemas) {
    return document;
  }

  const referenced = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }

      return;
    }

    if (typeof node !== "object" || node === null) {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const name =
        key === "$ref" && typeof value === "string"
          ? value.replace(/^#\/components\/schemas\//u, "")
          : undefined;

      if (name !== undefined && name !== value) {
        if (!referenced.has(name)) {
          referenced.add(name);
          visit(schemas[name]);
        }

        continue;
      }

      visit(value);
    }
  };

  visit(document.paths);

  return {
    ...document,
    components: {
      ...document.components,
      schemas: Object.fromEntries(
        Object.entries(schemas).filter(([name]) => referenced.has(name)),
      ),
    },
  };
}

const transformObject: SwaggerTransformObject = (documentObject) =>
  pruneUnreferencedComponents(
    jsonSchemaTransformObject(documentObject) as OpenAPIV3_1.Document,
  );

/**
 * Wires OpenAPI generation onto the root instance.
 *
 * Must be awaited *before* any route is registered: `@fastify/swagger` discovers
 * routes through an `onRoute` hook, and `app.register()` only runs during boot,
 * so routes added while this registration is still queued are invisible to it —
 * which yields a silently empty document rather than an error.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "VEOLMS API",
        description:
          "Backend API for VEOLMS. Every route declares its schemas with Zod, " +
          "so this document is generated from the code that actually runs.",
        version: "1.0.0",
      },
      servers: documentedServers(),
      tags: OPENAPI_TAGS,
    },
    transform: jsonSchemaTransform,
    transformObject,
  });

  if (!config.API_DOCS_ENABLED) {
    app.log.info("API_DOCS_ENABLED=false; not serving Swagger UI");

    return;
  }

  await app.register(fastifySwaggerUi, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });
}
