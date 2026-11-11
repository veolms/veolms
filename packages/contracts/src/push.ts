import { z } from "zod";

/**
 * Registering an app install for push (PUT /me/push-devices).
 *
 * `fid` is the Firebase Installation ID; `applicationId` the Android package
 * name or iOS bundle identifier. Send it after login, on every app start and
 * whenever the FID changes (then with `previousFid`).
 */
export const pushPlatformSchema = z.enum(["android", "ios"]);

const fidSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_:.-]+$/u, "Expected a Firebase Installation ID.");

export const registerPushDeviceSchema = z.strictObject({
  fid: fidSchema,
  previousFid: fidSchema.optional(),
  applicationId: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)+$/u,
      "Expected a package name or bundle identifier, such as com.example.app.",
    ),
  platform: pushPlatformSchema,
  appVersion: z.string().trim().min(1).max(50).optional(),
  deviceLabel: z.string().trim().min(1).max(100).optional(),
  /** Whether the phone allows notifications for the app right now. */
  pushAllowed: z.boolean(),
});

export const pushDeviceFidParamsSchema = z.strictObject({
  fid: fidSchema,
});

export const pushDeviceRegisteredSchema = z.strictObject({
  registered: z.literal(true),
  /** False while the server sends no pushes (turned off or not set up). */
  pushEnabled: z.boolean(),
});

export const pushDeviceRemovedSchema = z.strictObject({
  /** False when the install was not registered to this account. */
  removed: z.boolean(),
});

export type PushPlatform = z.infer<typeof pushPlatformSchema>;
export type RegisterPushDevice = z.infer<typeof registerPushDeviceSchema>;

/**
 * Web push: a browser's push subscription (PushSubscription.toJSON()),
 * saved per account and login (PUT /me/web-push/subscription). The site
 * re-sends it on each visit; `previousEndpoint` when the browser replaced
 * its subscription.
 */
const webPushEndpointSchema = z.url().max(2048);
const base64UrlSchema = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/u, "Expected base64url.");

export const webPushConfigSchema = z.strictObject({
  /** False while the server sends no browser pushes. */
  enabled: z.boolean(),
  /** The VAPID public key to subscribe with (applicationServerKey). */
  publicKey: z.string().nullable(),
});

export const registerWebPushSubscriptionSchema = z.strictObject({
  endpoint: webPushEndpointSchema,
  keys: z.strictObject({
    p256dh: base64UrlSchema(80, 200),
    auth: base64UrlSchema(16, 100),
  }),
  previousEndpoint: webPushEndpointSchema.optional(),
  /** "Chrome on Windows": shown nowhere yet; helps support. */
  deviceLabel: z.string().trim().min(1).max(100).optional(),
});

export const webPushSubscriptionEndpointSchema = z.strictObject({
  endpoint: webPushEndpointSchema,
});

export const webPushSubscriptionRegisteredSchema = z.strictObject({
  registered: z.literal(true),
  enabled: z.boolean(),
});

export const webPushTestResultSchema = z.strictObject({
  /** The push service took it; the browser shows it within seconds. */
  sent: z.boolean(),
  /** Why not, in a sentence, when it was not sent. */
  problem: z.string().nullable(),
});

export type WebPushConfig = z.infer<typeof webPushConfigSchema>;
export type RegisterWebPushSubscription = z.infer<
  typeof registerWebPushSubscriptionSchema
>;
export type WebPushTestResult = z.infer<typeof webPushTestResultSchema>;
