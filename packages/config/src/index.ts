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

/**
 * Seconds before another one-time code can be sent to the same email address
 * or mobile number. One setting on purpose: the API enforces it and the login
 * form counts it down, and the two must not disagree.
 */
const otpResendCooldownSecondsSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(3600)
  .default(60);

/**
 * "IN:razorpay,*:dodo": the gateway a checkout opens, by the buyer's
 * country. Parsed into pairs in the order written; "*" is any country.
 */
const paymentGatewayByCountrySchema = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value, context) => {
      const pairs: Array<{ country: string; provider: string }> = [];
      for (const part of value.split(",")) {
        if (!part.trim()) continue;
        const match = /^\s*(\*|[A-Za-z]{2})\s*:\s*([a-z][a-z0-9_]*)\s*$/u.exec(
          part,
        );
        if (!match) {
          context.addIssue({
            code: "custom",
            message: `Expected country:gateway pairs such as "IN:razorpay,*:dodo"; "${part.trim()}" is not one.`,
          });
          return z.NEVER;
        }
        pairs.push({ country: match[1]!.toUpperCase(), provider: match[2]! });
      }
      return pairs;
    });

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
  /**
   * Development aid: every API call waits this many milliseconds before it
   * is handled, to see how the app behaves on a slow connection. Ignored
   * when `NODE_ENV` is `production`.
   */
  API_RESPONSE_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
  API_PUBLIC_URL: z.string().optional(),
  /**
   * Whether the course overview carries every lesson's description. The
   * lesson page reads the open lesson's description from its own endpoint
   * and only falls back to the overview's. Set to false once no browser is
   * still running a web build from before that endpoint: each lesson then
   * goes out with a null description, and the overview shrinks by the size
   * of all of them. The editor is not affected, nor is a visitor's overview,
   * the public curriculum lesson pages are built from.
   */
  COURSE_OVERVIEW_LESSON_DESCRIPTIONS:
    booleanEnvironmentValueSchema.default(true),
  COURSE_STATIC_REFRESH_GITHUB_TOKEN: z.string().optional(),
  COURSE_STATIC_REFRESH_REPOSITORY: z.string().optional(),
  COURSE_STATIC_REFRESH_REF: z.string().min(1).default("development"),
  COURSE_STATIC_REFRESH_WORKFLOW: z
    .string()
    .min(1)
    .default("refresh-cloudflare-course-pages.yml"),
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
  /**
   * How much a learner may upload to discussions and notes in any 24 hours,
   * in megabytes. One file is capped at 50 MB separately. 0 means no limit.
   */
  DISCUSSION_UPLOAD_DAILY_QUOTA_MB: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(500),
  /**
   * The same allowance for accounts with any role beyond student
   * (instructors, administrators), who post teaching material. 0 means no
   * limit.
   */
  DISCUSSION_UPLOAD_DAILY_QUOTA_STAFF_MB: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(5000),
  /**
   * Days an upload that was never attached to a post is kept before the
   * retention job may remove it.
   */
  DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(7),
  /**
   * How often, in hours, the API itself removes those uploads (the same
   * work as `purge:discussion-uploads -- --apply`). 0, the default, leaves
   * it off: nothing is removed unless an operator turns this on or runs the
   * script. At most a week.
   */
  DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS: z.coerce
    .number()
    .int()
    .min(0)
    .max(168)
    .default(0),
  /**
   * TTL (ms) for what is cached per signed-in user: the sign-in itself, the
   * roles behind permission checks, the side navigation. Revocation, role
   * and MFA changes clear them in every process at once (the cache bus);
   * this bounds only a change the bus did not carry (a lost message, a
   * write outside the API that does not publish). 0 disables them.
   */
  SESSION_AUTH_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60_000)
    .default(30_000),
  /**
   * TTL for the process-local cache of a course as every visitor sees it
   * (the signed-out overview, the public curriculum and its version), in
   * ms. A change made through the API clears that course at once in the
   * process that made it; other instances, and writes from the CLI or a
   * background job, are seen when the entry expires. At most 30 s so a
   * signed thumbnail URL in a cached answer (valid for at least 60 s, see
   * CDN_TOKEN_TTL_SECONDS) is never handed out expired. 0 disables it.
   */
  COURSE_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(30_000)
    .default(30_000),
  /**
   * Master switch for every process-local cache built on api-core's
   * `createCache`. Off, every read goes to the database: for diagnosing a
   * suspected stale answer without a deploy.
   */
  CACHE_ENABLED: booleanEnvironmentValueSchema.default(true),
  /**
   * Tells the other API processes when cached data changes (Postgres
   * LISTEN/NOTIFY, one extra connection per process), so a write made in one
   * process is not served stale by another until its TTL runs out. Needs a
   * direct connection: LISTEN does not work through a transaction-mode
   * pooler. Off, other processes see a change when their entry expires.
   */
  CACHE_BUS_ENABLED: booleanEnvironmentValueSchema.default(true),
  /**
   * Runs the notification outbox/email processor inside the API process.
   * Nothing in the repository schedules the standalone worker scripts, so
   * without this, notifications and emails are only delivered if ops runs
   * `notifications:watch` by hand. SKIP LOCKED claiming + lease fencing
   * make it safe alongside any number of replicas or a dedicated worker;
   * set to false when a dedicated worker process is preferred.
   */
  NOTIFICATION_INLINE_WORKER: booleanEnvironmentValueSchema.default(true),
  NOTIFICATION_INLINE_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(300)
    .default(5),
  /**
   * Interval for the one-line ops gauge (pool saturation, webhook/outbox
   * queue depths, email backlog) in the API log. 0 disables it.
   */
  OPS_HEARTBEAT_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters")
    .default("default_mfa_encryption_key_at_least_32_chars_long"),
  WEB_URL: z.url().default("http://localhost:3000"),
  SETUP_TOKEN: z.string().default("veo_setup_token_123"),

  // WebAuthn Passkeys Config
  RP_ID: z.string().optional(),
  /**
   * The academy's name, as passkey prompts, authenticator apps, text
   * messages and notices show it, and as emails show it until the academy
   * has its own name (set during setup, changed in the admin settings).
   */
  ACADEMY_NAME: z.string().trim().optional(),
  /**
   * The former name of ACADEMY_NAME ("relying party name", the passkey
   * standard's term). Still read when ACADEMY_NAME is not set.
   * @deprecated Set ACADEMY_NAME.
   */
  RP_NAME: z.string().trim().optional(),
  WEBAUTHN_ORIGINS: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),

  // TOTP Configuration
  TOTP_STEP_SECONDS: z.coerce.number().int().min(1).default(30),
  TOTP_BACKWARD_STEPS: z.coerce.number().int().min(0).default(1),
  TOTP_FORWARD_STEPS: z.coerce.number().int().min(0).default(0),

  // One-time passcodes
  OTP_RESEND_COOLDOWN_SECONDS: otpResendCooldownSecondsSchema,
  /**
   * How long a sign-in or verification code can be used, in minutes. Quoted
   * in the code's email and text, and told to the web with each send so the
   * sign-in screen knows when the code in the inbox stops working.
   */
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  /**
   * Whether a learner must have verified a mobile number before buying or
   * enrolling in a course. Sign-up asks only for an email, so the number is
   * asked for at the first enrolment. Needs a working SMS provider; off by
   * default for an academy without one.
   */
  REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT:
    booleanEnvironmentValueSchema.default(false),
  /**
   * Codes one network address may request in any ten minutes, across every
   * destination. Counted in the database, so it holds across API instances.
   * Many learners can share one address (a campus, an office); raise it for
   * such an audience. 0 turns the limit off.
   */
  OTP_IP_WINDOW_LIMIT: z.coerce.number().int().min(0).max(100_000).default(50),
  /**
   * Different addresses and numbers with no account that one network
   * address may send a sign-up code to in a day. Bounds using the platform
   * to send mail or texts to strangers. 0 turns the limit off.
   */
  OTP_IP_DAILY_SIGNUP_LIMIT: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(200),

  /**
   * Shared test accounts that sign in with a fixed code instead of an emailed
   * one, as comma-separated `email:code` pairs (for example
   * "tester1@example.com:482913,tester2@example.com:771204"). Anyone who
   * knows a pair can sign in as that account, so list only addresses kept
   * for testing. Unset disables the feature.
   */
  TEST_LOGIN_ACCOUNTS: z
    .string()
    .optional()
    .transform((value, context) => {
      const accounts = new Map<string, string>();
      const pairs = (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      for (const pair of pairs) {
        const separator = pair.lastIndexOf(":");
        const email = pair.slice(0, separator).trim().toLowerCase();
        const code = pair.slice(separator + 1).trim();
        if (
          separator < 1 ||
          !z.email().safeParse(email).success ||
          !/^\d{6}$/u.test(code) ||
          accounts.has(email)
        ) {
          context.addIssue({
            code: "custom",
            message:
              'Expected comma-separated "email:code" pairs with a six-digit code and no repeated email, such as "tester1@example.com:482913".',
          });
          return z.NEVER;
        }
        accounts.set(email, code);
      }
      return accounts;
    }),

  /**
   * Local development only: every sign-in, email and phone verification
   * code is this six-digit code (for example "123456"), and none is emailed
   * or texted; the send limits do not apply either. Any account, staff
   * included, signs in with it, so it is honoured only when `NODE_ENV` is
   * `development` and the API refuses to start in production with it set.
   * Unset (the default) sends real codes as usual.
   */
  LOCAL_FIXED_OTP: z
    .string()
    .regex(/^\d{6}$/u, "Expected a six-digit code, such as 123456.")
    .optional(),

  /**
   * Enables the `mock_<email>` OAuth short-circuit, which skips both the
   * provider round-trip and the state/CSRF check. Requires `NODE_ENV` to be
   * `development` as well, so it can never be switched on in a deployed
   * environment by setting a single variable.
   */
  OAUTH_ALLOW_MOCK_CODES: booleanEnvironmentValueSchema.default(false),

  /**
   * When enabled (true), MFA enforcement, step-up challenges, and mandatory
   * MFA enrollment are skipped for every staff account: admins, instructors
   * and all team roles, custom ones included. Students are unaffected. For
   * development and testing; keep it false in production.
   */
  SKIP_ADMIN_MFA: booleanEnvironmentValueSchema.default(false),

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
  /**
   * Emails notifications that go to everyone in a course (a course published,
   * a quiz assigned). Off, they still appear in-app but send no email: one
   * such event mails thousands of people at once, and a burst like that gets
   * the sending domain rate-limited by Gmail, delaying sign-in codes too.
   */
  NOTIFICATION_COURSE_WIDE_EMAIL: booleanEnvironmentValueSchema.default(true),

  // SMS Delivery
  /**
   * Country calling codes one-time codes may be sent to, comma separated
   * (for example "+91" or "+91,+1"). Unset allows every country. SMS is paid
   * per message and some destinations are premium-rate, so set this to the
   * countries the academy actually serves.
   */
  SMS_ALLOWED_COUNTRY_CODES: z
    .string()
    .optional()
    .transform((value, context) => {
      const codes = (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (codes.some((code) => !/^\+[1-9]\d{0,3}$/u.test(code))) {
        context.addIssue({
          code: "custom",
          message:
            'Expected a comma-separated list of country calling codes such as "+91,+1".',
        });
        return z.NEVER;
      }
      return codes;
    }),
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
  // 1. "mediaconvert" (inbuilt): Direct AWS MediaConvert SDK client
  // 2. "direct": Processed directly on API server (stubbed for future extension)
  // 3. "distributed": External worker VM / Lambda / Fleet Manager trigger
  VIDEO_DISPATCH_STRATEGY: z
    .enum([
      "mediaconvert",
      "inbuilt",
      "direct",
      "api-server",
      "distributed",
      "worker-vm",
      "lambda",
      "fleet",
    ])
    .default("mediaconvert"),

  /**
   * "Import from YouTube" in the lesson editor. Off by default: the API
   * then downloads with yt-dlp, runs ffmpeg (and, with the cloud DRM
   * plugin, Shaka Packager) on this host, so an operator turns it on where
   * there is disk and CPU for it.
   */
  YOUTUBE_IMPORT_ENABLED: booleanEnvironmentValueSchema.default(false),
  /** Imports one API instance works on at once. */
  YOUTUBE_IMPORT_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  /** Disk-backed scratch folder; defaults to the CLI's (VEOLMS_IMPORT_TMP, /var/lib/veolms/import, …). */
  YOUTUBE_IMPORT_SCRATCH_DIR: z.string().optional(),
  /** The most scratch space all imports on one instance may hold, in GiB. */
  YOUTUBE_IMPORT_MAX_SCRATCH_GB: z.coerce.number().min(1).max(500).default(20),
  /** An import does not start when less than this is free on the scratch disk, in GiB. */
  YOUTUBE_IMPORT_MIN_FREE_DISK_GB: z.coerce.number().min(0).max(500).default(8),
  /** Heights to keep from YouTube's ladder, highest first. */
  YOUTUBE_IMPORT_QUALITIES: z
    .string()
    .default("1080,720,480,360")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim().replace(/p$/i, ""))
        .filter((item) => /^\d{3,4}$/.test(item)),
    ),
  /** A yt-dlp binary to use instead of the managed ~/.veolms/bin copy. */
  YTDLP_PATH: z.string().optional(),
  /**
   * Netscape-format cookies for yt-dlp, for hosts YouTube asks to "confirm
   * you're not a bot". Keep it outside the repository, readable only by the
   * API's user.
   */
  YTDLP_COOKIES_FILE: z.string().optional(),
  /** An ffmpeg binary; otherwise ~/.veolms/bin, PATH, or a downloaded static build. */
  FFMPEG_PATH: z.string().optional(),

  // AWS MediaConvert Configuration
  MEDIACONVERT_ENDPOINT: z.string().optional(),
  MEDIACONVERT_REGION: z.string().optional(),
  MEDIACONVERT_ROLE_ARN: z.string().optional(),
  MEDIACONVERT_QUEUE_ARN: z.string().optional(),
  MEDIACONVERT_ACCESS_KEY_ID: z.string().optional(),
  MEDIACONVERT_SECRET_ACCESS_KEY: z.string().optional(),
  MEDIACONVERT_WEBHOOK_URL: z.string().url().optional(),
  MEDIACONVERT_WEBHOOK_SECRET: z.string().optional(),
  /**
   * AWS MediaConvert job template name.
   * When set, the dispatcher uses this pre-created template instead of building
   * inline output settings. The template must exist in the same AWS account and
   * region, e.g. "DASH_ADAPTIVE_LADDER".
   */
  MEDIACONVERT_JOB_TEMPLATE: z.string().optional(),
  /**
   * ClearKey DRM master key (hex). When set alongside DRM_MASTER_KEY_VERSION
   * the dispatcher injects drmKeySystem / drmMasterKeyVersion into the job's
   * UserMetadata so the webhook handler and license server can resolve the key.
   * The raw key is kept server-side only; it is never sent to AWS.
   */
  DRM_MASTER_KEY: z.string().optional(),
  /**
   * Monotonic version tag for DRM_MASTER_KEY. Embedded in UserMetadata so the
   * ClearKey license driver can look up the correct key version.
   */
  DRM_MASTER_KEY_VERSION: z.string().optional(),

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

  // Dodo Payments, a merchant of record that takes cards from abroad. Off
  // while its API key is unset. The webhook key is the endpoint's secret
  // (whsec_…) from the Dodo dashboard. Test and live mode have separate
  // keys; the mode must match the key.
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_KEY: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z
    .enum(["test_mode", "live_mode"])
    .default("test_mode"),
  // Dodo, as the seller, charges the buyer's tax (GST, VAT, sales tax).
  // false: added on top of the course price at checkout, paid by the buyer.
  // true: taken out of the course price, so less of it reaches us.
  DODO_PAYMENTS_TAX_INCLUSIVE: booleanEnvironmentValueSchema.default(false),

  // Cashfree Payments, an Indian gateway that also takes cards and PayPal
  // from abroad (once Cashfree turns international payments on). Off while
  // its keys are unset. Its webhooks are signed with the secret key, so it
  // has no webhook secret of its own. Sandbox and production have separate
  // keys; the environment must match them.
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  // Which gateway a new checkout opens. PAYMENT_GATEWAY_BY_COUNTRY lists
  // country:gateway pairs, ISO country codes, "*" for every other country:
  // by default buyers in India pay through Razorpay and everyone else
  // through Dodo Payments. A pair naming a gateway that is not set up is
  // skipped. A buyer whose country is not known gets PAYMENT_GATEWAY_DEFAULT.
  PAYMENT_GATEWAY_DEFAULT: z.string().trim().min(1).default("razorpay"),
  PAYMENT_GATEWAY_BY_COUNTRY:
    paymentGatewayByCountrySchema("IN:razorpay,*:dodo"),
  // The request header that carries the buyer's country, as Cloudflare
  // sends it in front of the API.
  PAYMENT_COUNTRY_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .default("cf-ipcountry"),
  // Development only: the country a checkout is taken to come from when
  // the request says none (there is no Cloudflare in front of a local API).
  // Set it to US to get the international gateway on localhost.
  PAYMENT_TEST_COUNTRY: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u, "Expected a two-letter country code, such as US.")
    .transform((value) => value.toUpperCase())
    .optional(),

  // An extra payment taken by the gateway (a second payment for a paid
  // order, or a late payment for something the buyer already has) is sent
  // back to the buyer automatically. Set to false to only list such
  // payments for staff, who then refund them by hand.
  AUTO_REFUND_EXTRA_PAYMENTS: booleanEnvironmentValueSchema.default(true),
  // How many days a bank transfer a buyer reported keeps the gateway closed
  // for that purchase while staff have not answered it. After that the buyer
  // can pay another way; the request still waits for staff.
  MANUAL_PAYMENT_BLOCK_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().default("http://localhost:4000/v1"),
  VITE_COURSE_MEDIA_BASE_URL: cdnUrlSchema.optional(),
  VITE_CDN_URL: cdnUrlSchema.default("/cdn"),
  CDN_URL: cdnUrlSchema.default("/cdn"),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/v1"),
  OTP_RESEND_COOLDOWN_SECONDS: otpResendCooldownSecondsSchema,
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

function resolveCorsOrigins(parsed: ParsedServerConfig): string[] {
  const origins = new Set(resolveWebAuthnOrigins(parsed));

  if (parsed.CORS_ORIGINS) {
    for (const origin of parsed.CORS_ORIGINS.split(",")) {
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

  return Array.from(origins);
}

export type ServerConfig = Omit<
  ParsedServerConfig,
  "RP_ID" | "WEBAUTHN_ORIGINS" | "CORS_ORIGINS" | "ACADEMY_NAME" | "RP_NAME"
> & {
  ACADEMY_NAME: string;
  EMAIL_TRANSPORT: "smtp" | "console";
  RP_ID: string;
  WEBAUTHN_ORIGINS: string[];
  WEBAUTHN_RP_IDS: string[];
  CORS_ORIGINS: string[];
};

export function loadServerConfig(
  environment: Record<string, string | undefined>,
): ServerConfig {
  const parsed = serverConfigSchema.parse(environment);
  const offenders = findInsecureDefaults(parsed);
  const missingRequired = findMissingRequiredInProduction(parsed);

  if (parsed.NODE_ENV === "production") {
    if (parsed.LOCAL_FIXED_OTP) {
      throw new Error(
        "Refusing to start in production with LOCAL_FIXED_OTP set: it lets anyone sign in to any account. " +
          "Remove it from the environment.",
      );
    }
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
    if (parsed.TRUST_PROXY === true) {
      // Not refused: a deployment may rely on it. With "true", the client
      // address is whatever the X-Forwarded-For header claims, and every
      // per-address limit (sign-in codes, sign-in attempts) keys on it.
      console.warn(
        "[SECURITY WARNING] TRUST_PROXY=true trusts any X-Forwarded-For value a client sends. " +
          "Set it to the number of proxies in front of the API, or to their addresses, so per-address limits cannot be sidestepped.",
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
  const corsOrigins = resolveCorsOrigins(parsed);

  const { RP_NAME: legacyAcademyName, ...current } = parsed;
  return {
    ...current,
    ACADEMY_NAME: parsed.ACADEMY_NAME || legacyAcademyName || "VeoLMS",
    EMAIL_TRANSPORT: resolveEmailTransport(parsed),
    RP_ID: resolvedRpId,
    WEBAUTHN_ORIGINS: origins,
    WEBAUTHN_RP_IDS: rpIds,
    CORS_ORIGINS: corsOrigins,
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
