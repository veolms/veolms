/**
 * The environment every flow test runs under. Set before any module reads
 * `process.env` (the API's config is read once, when it is first imported),
 * so a file imports this first and everything else after it.
 *
 * The flow tests own a database of their own and rebuild it on every run;
 * they never point at the database the API is developed against.
 */

const DEFAULT_FLOW_DATABASE_URL =
  "postgresql://veolms:veolms@localhost:5433/veolms_flow_test";

export const FLOW_DATABASE_URL =
  process.env.FLOW_TEST_DATABASE_URL ?? DEFAULT_FLOW_DATABASE_URL;

/**
 * A guard against a mistyped FLOW_TEST_DATABASE_URL: the run drops and
 * recreates this database, so it must be one named for these tests.
 */
export function assertFlowDatabaseName(databaseUrl: string): string {
  const name = new URL(databaseUrl).pathname.replace(/^\//u, "");
  if (!/test/iu.test(name)) {
    throw new Error(
      `The flow tests drop and recreate their database, so its name must contain "test" (got "${name}").`,
    );
  }
  return name;
}

assertFlowDatabaseName(FLOW_DATABASE_URL);

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: FLOW_DATABASE_URL,
  // Codes are captured from the email the API sends (see flow-app.ts).
  EMAIL_TRANSPORT: "console",
  SMS_PROVIDER: "console",
  // Staff sign in with their code alone; two-factor is tested elsewhere.
  SKIP_ADMIN_MFA: "true",
  // The video link is built from this; nothing is ever fetched from it.
  CDN_URL: "https://cdn.flow.test",
  // Unreachable on purpose: a test that reached storage would fail loudly.
  STORAGE_ENDPOINT: "http://127.0.0.1:9",
  STORAGE_ACCESS_KEY_ID: "flow-test",
  STORAGE_SECRET_ACCESS_KEY: "flow-test",
  STORAGE_BUCKET: "veolms-flow-test",
  SESSION_SECRET: "flow_test_session_secret_at_least_32_chars",
  CDN_SIGNING_SECRET: "flow_test_cdn_signing_secret_at_least_32_chars",
  MFA_ENCRYPTION_KEY: "flow_test_mfa_encryption_key_at_least_32_chars",
  SETUP_TOKEN: "flow_test_setup_token_at_least_32_chars_long",
  API_DEV_PRETTY_LOGS: "false",
  API_DOCS_ENABLED: "false",
  NOTIFICATION_INLINE_WORKER: "false",
  OPS_HEARTBEAT_SECONDS: "0",
  DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS: "0",
  YOUTUBE_IMPORT_ENABLED: "false",
  OTP_RESEND_COOLDOWN_SECONDS: "1",
  // The API refuses to start without a gateway; flow-app.ts swaps in a
  // fake one before any of these is used.
  RAZORPAY_KEY_ID: "rzp_test_flow",
  RAZORPAY_KEY_SECRET: "rzp_test_flow_secret",
  RAZORPAY_WEBHOOK_SECRET: "rzp_test_flow_webhook_secret",
  PAYMENT_GATEWAY_DEFAULT: "razorpay",
});
// Values a developer's shell may hold that would change what is tested.
delete process.env.LOCAL_FIXED_OTP;
delete process.env.TEST_LOGIN_ACCOUNTS;
delete process.env.PAYMENT_GATEWAY_BY_COUNTRY;
delete process.env.PAYMENT_TEST_COUNTRY;
