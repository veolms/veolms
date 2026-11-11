import type { RegisterPushDevice } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import type { PushAppRegistry } from "./push-apps.ts";
import * as deviceRepository from "./push-devices.repository.ts";
import { isWebPushFid } from "./web-push.service.ts";

/** A refresh that changes nothing is written at most this often. */
const SEEN_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface PushDeviceService {
  register(
    userId: string,
    sessionId: string | null,
    input: RegisterPushDevice,
  ): Promise<{ registered: true; pushEnabled: boolean }>;
  unregister(userId: string, fid: string): Promise<{ removed: boolean }>;
}

export function createPushDeviceService({
  database,
  apps,
  pushEnabled,
  maxDevicesPerUser,
  now = () => new Date(),
}: {
  database: Kysely<Database>;
  apps: PushAppRegistry;
  pushEnabled: boolean;
  maxDevicesPerUser: number;
  now?: () => Date;
}): PushDeviceService {
  async function register(
    userId: string,
    sessionId: string | null,
    input: RegisterPushDevice,
  ) {
    const app = apps.get(input.applicationId);
    // "web:" ids are browsers (web-push.service.ts), never an app install.
    if (!app || isWebPushFid(input.fid)) {
      throw new AppError(
        400,
        "PUSH_APP_UNKNOWN",
        "This app cannot receive notifications from this server.",
      );
    }

    const at = now();
    const wanted: deviceRepository.PushDeviceInput = {
      userId,
      fid: input.fid,
      applicationId: input.applicationId,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
      deviceLabel: input.deviceLabel ?? null,
      sessionId,
      pushAllowed: input.pushAllowed,
    };

    await database.transaction().execute(async (trx) => {
      // The app saw its FID change: the old install will never receive
      // again, so it goes now instead of after a failed send.
      if (input.previousFid && input.previousFid !== input.fid) {
        await deviceRepository.deleteUserDevice(trx, userId, input.previousFid);
      }

      const existing = await deviceRepository.findDeviceByFid(trx, input.fid);
      const unchanged =
        existing !== undefined &&
        existing.user_id === wanted.userId &&
        existing.application_id === wanted.applicationId &&
        existing.platform === wanted.platform &&
        existing.app_version === wanted.appVersion &&
        existing.device_label === wanted.deviceLabel &&
        existing.session_id === wanted.sessionId &&
        existing.push_allowed === wanted.pushAllowed &&
        existing.failure_count === 0 &&
        at.getTime() - existing.last_seen_at.getTime() < SEEN_REFRESH_MS;
      if (unchanged) return;

      await deviceRepository.upsertDevice(trx, wanted, at);
      await deviceRepository.trimUserDevices(trx, userId, maxDevicesPerUser);
    });

    return {
      registered: true as const,
      pushEnabled: pushEnabled && app.serviceAccount !== null,
    };
  }

  async function unregister(userId: string, fid: string) {
    return {
      removed: await deviceRepository.deleteUserDevice(database, userId, fid),
    };
  }

  return { register, unregister };
}
