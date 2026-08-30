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

  // Auth Configs
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .default("default_session_secret_at_least_32_chars_long"),
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters")
    .default("default_mfa_encryption_key_at_least_32_chars_long"),
  WEB_URL: z.url().default("http://localhost:3000"),
  SETUP_TOKEN: z.string().default("veo_setup_token_123"),

  // WebAuthn Passkeys Config
  RP_ID: z.string().default("localhost"),
  RP_NAME: z.string().default("VeoLMS"),

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
  SMS_PRIMARY_URL: z.string().default("https://api.nexmo.com/v1/messages"),
  SMS_PRIMARY_KEY: z.string().optional(),
  SMS_PRIMARY_SECRET: z.string().optional(),
  SMS_BACKUP_URL: z.string().optional(),
  SMS_BACKUP_SID: z.string().optional(),
  SMS_BACKUP_TOKEN: z.string().optional(),
  SMS_BACKUP_FROM: z.string().default("+1234567890"),

  // Storage Configs
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().min(1).default("veolms"),
  STORAGE_FORCE_PATH_STYLE: booleanEnvironmentValueSchema.default(false),

  // Fleet Manager & Video Processing Dispatch
  FLEET_MANAGER_TRIGGER_URL: z.string().url().optional(),
  FLEET_MANAGER_LAMBDA_NAME: z.string().optional(),
  FLEET_MANAGER_LAMBDA_REGION: z.string().optional(),
  FLEET_MANAGER_HEARTBEAT_SECONDS: z.coerce.number().int().min(1).default(10),

  // Razorpay Gateway
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().default("http://localhost:4000/api/v1"),
  VITE_COURSE_MEDIA_BASE_URL: z.url().optional(),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/api/v1"),
});

const INSECURE_DEFAULTS: Record<string, string> = {
  SESSION_SECRET: "default_session_secret_at_least_32_chars_long",
  MFA_ENCRYPTION_KEY: "default_mfa_encryption_key_at_least_32_chars_long",
  SETUP_TOKEN: "veo_setup_token_123",
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

export type ServerConfig = ParsedServerConfig & {
  EMAIL_TRANSPORT: "smtp" | "console";
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

  return { ...parsed, EMAIL_TRANSPORT: resolveEmailTransport(parsed) };
}

export function loadWebConfig(environment: Record<string, string | undefined>) {
  return webConfigSchema.parse(environment);
}
