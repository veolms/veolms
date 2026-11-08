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
