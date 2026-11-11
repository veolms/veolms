import crypto from "node:crypto";

import type {
  DatabaseExecutor,
  PushDeviceTable,
  PushPlatform,
} from "@veolms/database";
import type { Selectable } from "kysely";

export type PushDeviceRow = Selectable<PushDeviceTable>;

export interface PushDeviceInput {
  userId: string;
  fid: string;
  applicationId: string;
  platform: PushPlatform;
  appVersion: string | null;
  deviceLabel: string | null;
  sessionId: string | null;
  pushAllowed: boolean;
  /** Browsers only (platform web): their push subscription. */
  web?: { endpoint: string; p256dh: string; auth: string } | null;
}

export async function findDeviceByFid(
  database: DatabaseExecutor,
  fid: string,
): Promise<PushDeviceRow | undefined> {
  return await database
    .selectFrom("push_devices")
    .selectAll()
    .where("fid", "=", fid)
    .executeTakeFirst();
}

/**
 * One row per FID: a new install is inserted, a known one is taken over by
 * the caller (the latest login owns the phone) and refreshed. Failures are
 * reset, since the app has just proved the install is alive.
 */
export async function upsertDevice(
  database: DatabaseExecutor,
  input: PushDeviceInput,
  now: Date,
): Promise<void> {
  await database
    .insertInto("push_devices")
    .values({
      id: crypto.randomUUID(),
      user_id: input.userId,
      fid: input.fid,
      application_id: input.applicationId,
      platform: input.platform,
      app_version: input.appVersion,
      device_label: input.deviceLabel,
      session_id: input.sessionId,
      push_allowed: input.pushAllowed,
      failure_count: 0,
      last_error: null,
      web_endpoint: input.web?.endpoint ?? null,
      web_p256dh: input.web?.p256dh ?? null,
      web_auth: input.web?.auth ?? null,
      created_at: now,
      last_seen_at: now,
      last_success_at: null,
    })
    .onConflict((conflict) =>
      conflict.column("fid").doUpdateSet({
        user_id: input.userId,
        application_id: input.applicationId,
        platform: input.platform,
        app_version: input.appVersion,
        device_label: input.deviceLabel,
        session_id: input.sessionId,
        push_allowed: input.pushAllowed,
        failure_count: 0,
        last_error: null,
        web_endpoint: input.web?.endpoint ?? null,
        web_p256dh: input.web?.p256dh ?? null,
        web_auth: input.web?.auth ?? null,
        last_seen_at: now,
      }),
    )
    .execute();
}

/** Deletes the install only when it belongs to `userId`. */
export async function deleteUserDevice(
  database: DatabaseExecutor,
  userId: string,
  fid: string,
): Promise<boolean> {
  const result = await database
    .deleteFrom("push_devices")
    .where("user_id", "=", userId)
    .where("fid", "=", fid)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/** Keeps a user's `max` most recently seen installs; returns how many went. */
export async function trimUserDevices(
  database: DatabaseExecutor,
  userId: string,
  max: number,
): Promise<number> {
  const result = await database
    .deleteFrom("push_devices")
    .where("user_id", "=", userId)
    .where(
      "id",
      "in",
      database
        .selectFrom("push_devices")
        .select("id")
        .where("user_id", "=", userId)
        .orderBy("last_seen_at", "desc")
        .orderBy("created_at", "desc")
        .offset(max),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/**
 * Of `userIds`, those with at least one install that allows pushes;
 * browsers count only with `includeWeb` (they get chat messages only).
 */
export async function listUsersWithPushDevices(
  database: DatabaseExecutor,
  userIds: readonly string[],
  options: { includeWeb: boolean } = { includeWeb: false },
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < userIds.length; i += 1000) {
    let query = database
      .selectFrom("push_devices")
      .select("user_id")
      .distinct()
      .where("user_id", "in", userIds.slice(i, i + 1000))
      .where("push_allowed", "=", true);
    if (!options.includeWeb) query = query.where("platform", "<>", "web");
    const rows = await query.execute();
    for (const row of rows) found.add(row.user_id);
  }
  return found;
}

export async function listDevicesForUsers(
  database: DatabaseExecutor,
  userIds: readonly string[],
  options: { includeWeb: boolean } = { includeWeb: false },
): Promise<PushDeviceRow[]> {
  if (userIds.length === 0) return [];
  let query = database
    .selectFrom("push_devices")
    .selectAll()
    .where("user_id", "in", [...new Set(userIds)])
    .where("push_allowed", "=", true);
  if (!options.includeWeb) query = query.where("platform", "<>", "web");
  return await query.execute();
}

export async function markDevicesSucceeded(
  database: DatabaseExecutor,
  deviceIds: readonly string[],
  now: Date,
): Promise<void> {
  if (deviceIds.length === 0) return;
  await database
    .updateTable("push_devices")
    .set({ failure_count: 0, last_error: null, last_success_at: now })
    .where("id", "in", [...deviceIds])
    .execute();
}

/** Counts one more failure; returns the installs now at or past `limit`. */
export async function markDevicesFailed(
  database: DatabaseExecutor,
  failures: readonly { deviceId: string; error: string }[],
  limit: number,
): Promise<string[]> {
  const worn: string[] = [];
  for (const failure of failures) {
    const row = await database
      .updateTable("push_devices")
      .set((eb) => ({
        failure_count: eb("failure_count", "+", 1),
        last_error: failure.error.slice(0, 500),
      }))
      .where("id", "=", failure.deviceId)
      .returning(["id", "failure_count"])
      .executeTakeFirst();
    if (row && row.failure_count >= limit) worn.push(row.id);
  }
  return worn;
}

export async function deleteDevices(
  database: DatabaseExecutor,
  deviceIds: readonly string[],
): Promise<number> {
  if (deviceIds.length === 0) return 0;
  const result = await database
    .deleteFrom("push_devices")
    .where("id", "in", [...deviceIds])
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** Installs the app has not opened since `before` (Firebase drops them at 270 days). */
export async function deleteStaleDevices(
  database: DatabaseExecutor,
  before: Date,
): Promise<number> {
  const result = await database
    .deleteFrom("push_devices")
    .where("last_seen_at", "<", before)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** One page of installs linked to a login, for the signed-out sweep. */
export async function listSessionLinkedDevices(
  database: DatabaseExecutor,
  afterId: string | null,
  limit: number,
): Promise<{ id: string; session_id: string }[]> {
  let query = database
    .selectFrom("push_devices")
    .select(["id", "session_id"])
    .where("session_id", "is not", null);
  if (afterId) query = query.where("id", ">", afterId);
  const rows = await query.orderBy("id").limit(limit).execute();
  return rows.map((row) => ({ id: row.id, session_id: row.session_id! }));
}
