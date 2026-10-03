import fastifySwagger, { type SwaggerTransformObject } from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { ServerConfig } from "@veolms/config";
import type { FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { OpenAPIV3_1 } from "openapi-types";

export const DOCS_ROUTE_PREFIX = "/docs";

export const OPENAPI_TAGS = [
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
  {
    name: "Course Bin",
    description: "Administrator-only recovery and retention management for deleted courses.",
  },
];

export function documentedServers(
  config: Pick<ServerConfig, "API_PUBLIC_URL">,
): OpenAPIV3_1.ServerObject[] {
  if (config.API_PUBLIC_URL) {
    return [
      {
        url: config.API_PUBLIC_URL.replace(/\/+$/u, ""),
        description: "Public API endpoint",
      },
    ];
  }
  return [{ url: "/", description: "The origin serving this document" }];
}

export function pruneUnreferencedComponents(document: OpenAPIV3_1.Document): OpenAPIV3_1.Document {
  const schemas = document.components?.schemas;
  if (!schemas) return document;

  const referenced = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
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
      schemas: Object.fromEntries(Object.entries(schemas).filter(([name]) => referenced.has(name))),
    },
  };
}

export const transformObject: SwaggerTransformObject = (documentObject) =>
  pruneUnreferencedComponents(jsonSchemaTransformObject(documentObject) as OpenAPIV3_1.Document);

export async function registerOpenApi(
  app: FastifyInstance,
  config: Pick<ServerConfig, "API_PUBLIC_URL" | "API_DOCS_ENABLED">,
): Promise<void> {
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
      servers: documentedServers(config),
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
