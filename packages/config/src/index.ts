import { z } from "zod";

const booleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const serverConfigSchema = z.object({
  DATABASE_URL: z
    .url()
    .default("postgresql://neondb_owner:npg_EgJdqNf1WI3l@ep-calm-bar-aze943wa-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_DEV_PRETTY_LOGS: booleanEnvironmentValueSchema.default(true),
  API_DOCS_ENABLED: booleanEnvironmentValueSchema.default(true),
  // Only needed when the docs are served from a different origin than the API,
  // or when a proxy mounts the API under a path prefix. Left unset, the
  // documented server is the origin the document itself was fetched from.
  API_PUBLIC_URL: z.url().optional(),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().startsWith("/").default("/api/v1"),
  VITE_COURSE_MEDIA_BASE_URL: z.url().optional(),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/api/v1"),
});

export function loadServerConfig(
  environment: Record<string, string | undefined>,
) {
  return serverConfigSchema.parse(environment);
}

export function loadWebConfig(environment: Record<string, string | undefined>) {
  return webConfigSchema.parse(environment);
}
