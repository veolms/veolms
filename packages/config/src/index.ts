import { z } from "zod";

const booleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

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
  WEB_URL: z.string().url().default("http://localhost:3000"),
  SETUP_TOKEN: z.string().default("veo_setup_token_123"),

  // WebAuthn Passkeys Config
  RP_ID: z.string().default("localhost"),
  RP_NAME: z.string().default("VeoLMS"),

  // TOTP Configuration
  TOTP_STEP_SECONDS: z.coerce.number().int().min(1).default(30),
  TOTP_BACKWARD_STEPS: z.coerce.number().int().min(0).default(1),
  TOTP_FORWARD_STEPS: z.coerce.number().int().min(0).default(0),

  // OAuth Keys
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email Delivery
  EMAIL_FROM: z.string().default("noreply@academy.com"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // SMS Delivery
  SMS_PRIMARY_URL: z.string().default("https://api.nexmo.com/v1/messages"),
  SMS_PRIMARY_KEY: z.string().optional(),
  SMS_PRIMARY_SECRET: z.string().optional(),
  SMS_BACKUP_URL: z.string().optional(),
  SMS_BACKUP_SID: z.string().optional(),
  SMS_BACKUP_TOKEN: z.string().optional(),
  SMS_BACKUP_FROM: z.string().default("+1234567890"),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().startsWith("/").default("/api/v1"),
  VITE_COURSE_MEDIA_BASE_URL: z.url().optional(),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/api/v1"),
});

const INSECURE_DEFAULTS: Record<string, string> = {
  SESSION_SECRET: "default_session_secret_at_least_32_chars_long",
  MFA_ENCRYPTION_KEY: "default_mfa_encryption_key_at_least_32_chars_long",
  SETUP_TOKEN: "veo_setup_token_123",
};

export function loadServerConfig(environment: Record<string, string | undefined>) {
  const parsed = serverConfigSchema.parse(environment);

  if (parsed.NODE_ENV === "production") {
    const offenders = Object.entries(INSECURE_DEFAULTS)
      .filter(([key, defaultValue]) => (parsed as any)[key] === defaultValue)
      .map(([key]) => key);

    if (offenders.length > 0) {
      throw new Error(
        `Refusing to start in production with default value(s) for: ${offenders.join(", ")}. ` +
        `Set real secrets via environment variables.`,
      );
    }
  }

  return parsed;
}

export function loadWebConfig(environment: Record<string, string | undefined>) {
  return webConfigSchema.parse(environment);
}
