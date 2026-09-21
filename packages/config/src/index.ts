import { z } from "zod";

const booleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const notificationRetryScheduleSchema = z
  .string()
  .default("60,300,1800,7200")
  .transform((value, context) => {
    const parsed = value.split(",").map((part) => Number(part.trim()));
    if (
      parsed.length === 0 ||
      parsed.some((item) => !Number.isInteger(item) || item <= 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Expected a comma-separated list of positive integers.",
      });
      return z.NEVER;
    }
    return parsed;
  });

const cdnUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    if (value !== "/" && /^\/(?!\/)[^\s?#]*$/u.test(value)) return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "CDN URL must be an absolute HTTP(S) URL or a root-relative path such as /cdn")
  .transform((value) => value.replace(/\/+$/u, "") || "/");

const folderListSchema = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim().replace(/^\/+|\/+$/gu, ""))
        .filter(Boolean),
    );

const serverConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_DEV_PRETTY_LOGS: booleanEnvironmentValueSchema.default(true),
  API_DOCS_ENABLED: booleanEnvironmentValueSchema.default(true),
  API_PUBLIC_URL: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((val) => {
      const trimmed = val.trim().toLowerCase();
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      const num = Number(trimmed);
      if (Number.isFinite(num) && Number.isInteger(num) && num > 0) {
        return num;
      }
      if (trimmed.includes(",")) {
        return trimmed.split(",").map((s) => s.trim());
      }
      return val.trim();
    }),

  // Auth Configs
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .default("default_session_secret_at_least_32_chars_long"),
  SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters")
    .default("default_mfa_encryption_key_at_least_32_chars_long"),
  WEB_URL: z.url().default("http://localhost:3000"),
  SETUP_TOKEN: z.string().default("veo_setup_token_123"),

  // WebAuthn Passkeys Config
  RP_ID: z.string().optional(),
  RP_NAME: z.string().default("VeoLMS"),
  WEBAUTHN_ORIGINS: z.string().optional(),

  // TOTP Configuration
  TOTP_STEP_SECONDS: z.coerce.number().int().min(1).default(30),
  TOTP_BACKWARD_STEPS: z.coerce.number().int().min(0).default(1),
  TOTP_FORWARD_STEPS: z.coerce.number().int().min(0).default(0),

  /**
   * Enables the `mock_<email>` OAuth short-circuit, which skips both the
   * provider round-trip and the state/CSRF check. Requires `NODE_ENV` to be
   * `development` as well, so it can never be switched on in a deployed
   * environment by setting a single variable.
   */
  OAUTH_ALLOW_MOCK_CODES: booleanEnvironmentValueSchema.default(false),

  // OAuth Keys
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email Delivery
  EMAIL_FROM: z.string().min(1).default("noreply@veolms.org"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /**
   * Selects how outbound mail leaves the process. `console` renders the message
   * to the logger and dispatches nothing, which is what local development wants
   * when no mail server is reachable. Left unset, `resolveEmailTransport`
   * derives a sensible value from `NODE_ENV` and `SMTP_HOST`.
   */
  EMAIL_TRANSPORT: z.enum(["smtp", "console"]).optional(),

  // Notification outbox and email worker
  NOTIFICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  NOTIFICATION_LEASE_SECONDS: z.coerce.number().int().min(30).default(300),
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  NOTIFICATION_EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  NOTIFICATION_RETRY_SECONDS: notificationRetryScheduleSchema,
  NOTIFICATION_OUTBOX_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .default(30),

  // SMS Delivery
  SMS_PROVIDER: z
    .enum(["auto", "msg91", "vonage", "twilio", "console"])
    .default("auto"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_API_URL: z.string().default("https://control.msg91.com/api/v5/flow"),
  SMS_PRIMARY_URL: z.string().default("https://api.nexmo.com/v1/messages"),
  SMS_PRIMARY_KEY: z.string().optional(),
  SMS_PRIMARY_SECRET: z.string().optional(),
  SMS_BACKUP_URL: z.string().optional(),
  SMS_BACKUP_SID: z.string().optional(),
  SMS_BACKUP_TOKEN: z.string().optional(),
  SMS_BACKUP_FROM: z.string().default("+1234567890"),

  // Storage Configs
  STORAGE_ENDPOINT: z.string().optional(),
  // Public URL prefix. It may be a full Worker/custom-domain URL or the
  // same-origin route mounted by the web server, for example /cdn.
  CDN_URL: cdnUrlSchema.default("/cdn"),
  CDN_SIGNING_SECRET: z
    .string()
    .min(32, "CDN_SIGNING_SECRET must be at least 32 characters")
    .default("default_cdn_signing_secret_at_least_32_chars_long"),
  CDN_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(900),
  CDN_HLS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(900),
  CDN_PUBLIC_FOLDERS: folderListSchema(
    "public,thumbnails,course-hls,course-videos",
  ),
  CDN_PRIVATE_FOLDERS: folderListSchema("protected,media,transcoded"),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().min(1).default("veolms"),
  STORAGE_FORCE_PATH_STYLE: booleanEnvironmentValueSchema.default(false),

  // Fleet Manager & Video Processing Dispatch
  FLEET_MANAGER_TRIGGER_URL: z.string().url().optional(),
  FLEET_MANAGER_LAMBDA_NAME: z.string().optional(),
  PROBE_LAMBDA_NAME: z.string().optional(),
  FLEET_MANAGER_LAMBDA_REGION: z.string().optional(),
  FLEET_MANAGER_HEARTBEAT_SECONDS: z.coerce.number().int().min(1).default(10),
  FLEET_MANAGER_ACCESS_KEY_ID: z.string().optional(),
  FLEET_MANAGER_SECRET_ACCESS_KEY: z.string().optional(),

  // Razorpay Gateway
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().default("http://localhost:4000/api/v1"),
  VITE_COURSE_MEDIA_BASE_URL: cdnUrlSchema.optional(),
  VITE_CDN_URL: cdnUrlSchema.default("/cdn"),
  CDN_URL: cdnUrlSchema.default("/cdn"),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/api/v1"),
});

const INSECURE_DEFAULTS: Record<string, string> = {
  SESSION_SECRET: "default_session_secret_at_least_32_chars_long",
  MFA_ENCRYPTION_KEY: "default_mfa_encryption_key_at_least_32_chars_long",
  SETUP_TOKEN: "veo_setup_token_123",
  CDN_SIGNING_SECRET: "default_cdn_signing_secret_at_least_32_chars_long",
};

type ParsedServerConfig = z.output<typeof serverConfigSchema>;

/** Config keys still holding the shipped placeholder secret. */
function findInsecureDefaults(parsed: ParsedServerConfig): string[] {
  return Object.entries(INSECURE_DEFAULTS)
    .filter(
      ([key, defaultValue]) =>
        parsed[key as keyof ParsedServerConfig] === defaultValue,
    )
    .map(([key]) => key);
}

/**
 * Config keys with no safe default that must be explicitly set once
 * deployed. Unlike INSECURE_DEFAULTS these have no fallback value at all
 * (`.optional()` in the schema) — left unset, callers have historically
 * papered over the gap with an ad-hoc placeholder instead of failing loudly.
 * Payment credentials belong here: a missing key must never silently
 * degrade into fake credentials that fail confusingly at the gateway.
 */
const REQUIRED_IN_PRODUCTION: Array<keyof ParsedServerConfig> = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

function findMissingRequiredInProduction(parsed: ParsedServerConfig): string[] {
  return REQUIRED_IN_PRODUCTION.filter((key) => !parsed[key]);
}

/**
 * Falls back to `console` only when nothing is listening for mail anyway: a
 * non-production process still pointing at the default localhost SMTP host.
 * Any explicitly configured host means the operator wants real delivery, so a
 * development environment with real credentials (e.g. SES) still sends.
 */
function resolveEmailTransport(parsed: ParsedServerConfig): "smtp" | "console" {
  if (parsed.EMAIL_TRANSPORT) {
    return parsed.EMAIL_TRANSPORT;
  }

  const usingDefaultHost = parsed.SMTP_HOST === "localhost";
  return parsed.NODE_ENV !== "production" && usingDefaultHost
    ? "console"
    : "smtp";
}

function resolveWebAuthnOrigins(parsed: ParsedServerConfig): string[] {
  const origins = new Set<string>();

  try {
    origins.add(new URL(parsed.WEB_URL).origin);
  } catch {
    origins.add(parsed.WEB_URL);
  }

  if (parsed.WEBAUTHN_ORIGINS) {
    for (const origin of parsed.WEBAUTHN_ORIGINS.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) {
        try {
          origins.add(new URL(trimmed).origin);
        } catch {
          origins.add(trimmed);
        }
      }
    }
  }

  if (parsed.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:4173");
    origins.add("http://127.0.0.1:4173");
    origins.add("http://localhost:7000");
    origins.add("http://127.0.0.1:7000");
  }

  return Array.from(origins);
}

function resolveWebAuthnRpId(parsed: ParsedServerConfig): string {
  if (parsed.RP_ID && parsed.RP_ID.trim().length > 0) {
    return parsed.RP_ID.trim();
  }
  try {
    return new URL(parsed.WEB_URL).hostname;
  } catch {
    return "localhost";
  }
}

function resolveWebAuthnRpIds(
  resolvedRpId: string,
  origins: string[],
): string[] {
  const rpIds = new Set<string>();
  if (resolvedRpId) {
    rpIds.add(resolvedRpId);
  }
  for (const origin of origins) {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname) {
        rpIds.add(hostname);
      }
    } catch {
      // Ignore malformed URLs
    }
  }
  return Array.from(rpIds);
}

export type ServerConfig = Omit<
  ParsedServerConfig,
  "RP_ID" | "WEBAUTHN_ORIGINS"
> & {
  EMAIL_TRANSPORT: "smtp" | "console";
  RP_ID: string;
  WEBAUTHN_ORIGINS: string[];
  WEBAUTHN_RP_IDS: string[];
};

export function loadServerConfig(
  environment: Record<string, string | undefined>,
): ServerConfig {
  const parsed = serverConfigSchema.parse(environment);
  const offenders = findInsecureDefaults(parsed);
  const missingRequired = findMissingRequiredInProduction(parsed);

  if (parsed.NODE_ENV === "production") {
    if (offenders.length > 0) {
      throw new Error(
        `Refusing to start in production with default value(s) for: ${offenders.join(", ")}. ` +
          `Set real secrets via environment variables.`,
      );
    }
    if (missingRequired.length > 0) {
      throw new Error(
        `Refusing to start in production without required value(s) for: ${missingRequired.join(", ")}. ` +
          `Set these via environment variables — a payment gateway must never boot with missing credentials.`,
      );
    }
  } else if (offenders.length > 0) {
    // Warn in development so misconfigured environments are caught early
    console.warn(
      `\x1b[33m[SECURITY WARNING]\x1b[0m Running with insecure default value(s) for: ${offenders.join(", ")}. ` +
        `Set proper secrets via environment variables before deploying.`,
    );
  }

  const resolvedRpId = resolveWebAuthnRpId(parsed);
  const origins = resolveWebAuthnOrigins(parsed);
  const rpIds = resolveWebAuthnRpIds(resolvedRpId, origins);

  return {
    ...parsed,
    EMAIL_TRANSPORT: resolveEmailTransport(parsed),
    RP_ID: resolvedRpId,
    WEBAUTHN_ORIGINS: origins,
    WEBAUTHN_RP_IDS: rpIds,
  };
}

export function loadWebConfig(environment: Record<string, string | undefined>) {
  return webConfigSchema.parse({
    ...environment,
    // VITE_CDN_URL is the browser-facing setting. Fall back to CDN_URL so
    // existing local/server environments continue to configure the web app.
    VITE_CDN_URL: environment.VITE_CDN_URL || environment.CDN_URL,
  });
}

export {
  resolveProviderName,
  fleetManagerConfigSchema,
  loadFleetManagerConfig,
  type FleetManagerConfig,
} from "./fleet-manager.ts";

export {
  resolveDefaultUploadConcurrency,
  mediaWorkerConfigSchema,
  loadMediaWorkerConfig,
  type DefaultUploadConcurrency,
  type MediaWorkerConfig,
} from "./media-worker.ts";
