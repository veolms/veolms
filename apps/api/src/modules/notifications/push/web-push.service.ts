import crypto from "node:crypto";

import type {
  RegisterWebPushSubscription,
  WebPushConfig,
  WebPushTestResult,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import * as deviceRepository from "./push-devices.repository.ts";
import {
  isAllowedPushEndpoint,
  type WebPushClient,
} from "./web-push.client.ts";
import type { WebPushSetup } from "./web-push.setup.ts";

/** Browser rows: application_id and fid prefix. */
export const WEB_PUSH_APPLICATION_ID = "web";
const WEB_FID_PREFIX = "web:";
/** A visit that changes nothing is written at most this often. */
const SEEN_REFRESH_MS = 24 * 60 * 60 * 1000;

/** One row per browser: "web:" + the endpoint's SHA-256 (base64url). */
export function webPushFid(endpoint: string): string {
  return `${WEB_FID_PREFIX}${crypto
    .createHash("sha256")
    .update(endpoint)
    .digest("base64url")}`;
}

export function isWebPushFid(fid: string): boolean {
  return fid.startsWith(WEB_FID_PREFIX);
}

export interface WebPushService {
  config(): WebPushConfig;
  register(
    userId: string,
    sessionId: string | null,
    input: RegisterWebPushSubscription,
  ): Promise<{ registered: true; enabled: boolean }>;
  remove(userId: string, endpoint: string): Promise<{ removed: boolean }>;
  /** Sends a test notification to this browser, now (not queued). */
  test(userId: string, endpoint: string): Promise<WebPushTestResult>;
}

/**
 * Browsers subscribing to chat pushes. A subscription belongs to the
 * account and login that last saved it (signing that login out stops its
 * pushes, as for phones), and to one browser: saving it again from another
 * account moves it there.
 */
export function createWebPushService({
  database,
  setup,
  pushEnabled,
  client,
  maxDevicesPerUser,
  now = () => new Date(),
}: {
  database: Kysely<Database>;
  setup: WebPushSetup;
  /** PUSH_ENABLED: the switch for every push. */
  pushEnabled: boolean;
  client: WebPushClient | null;
  maxDevicesPerUser: number;
  now?: () => Date;
}): WebPushService {
  const enabled = pushEnabled && setup.vapid !== null;

  function config(): WebPushConfig {
    return { enabled, publicKey: enabled ? setup.vapid!.publicKey : null };
  }

  async function register(
    userId: string,
    sessionId: string | null,
    input: RegisterWebPushSubscription,
  ) {
    if (!enabled) {
      throw new AppError(
        409,
        "WEB_PUSH_DISABLED",
        "Browser notifications are turned off on this server.",
      );
    }
    if (!isAllowedPushEndpoint(input.endpoint, setup.allowedHosts)) {
      throw new AppError(
        400,
        "WEB_PUSH_ENDPOINT_REFUSED",
        "This browser's push service is not supported.",
      );
    }
    const at = now();
    const fid = webPushFid(input.endpoint);
    const web = {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    };
    const wanted: deviceRepository.PushDeviceInput = {
      userId,
      fid,
      applicationId: WEB_PUSH_APPLICATION_ID,
      platform: "web",
      appVersion: null,
      deviceLabel: input.deviceLabel ?? null,
      sessionId,
      pushAllowed: true,
      web,
    };

    await database.transaction().execute(async (trx) => {
      if (input.previousEndpoint && input.previousEndpoint !== input.endpoint) {
        await deviceRepository.deleteUserDevice(
          trx,
          userId,
          webPushFid(input.previousEndpoint),
        );
      }
      const existing = await deviceRepository.findDeviceByFid(trx, fid);
      const unchanged =
        existing !== undefined &&
        existing.user_id === userId &&
        existing.session_id === sessionId &&
        existing.web_p256dh === web.p256dh &&
        existing.web_auth === web.auth &&
        existing.device_label === wanted.deviceLabel &&
        existing.failure_count === 0 &&
        at.getTime() - existing.last_seen_at.getTime() < SEEN_REFRESH_MS;
      if (unchanged) return;
      await deviceRepository.upsertDevice(trx, wanted, at);
      await deviceRepository.trimUserDevices(trx, userId, maxDevicesPerUser);
    });
    return { registered: true as const, enabled };
  }

  async function remove(userId: string, endpoint: string) {
    return {
      removed: await deviceRepository.deleteUserDevice(
        database,
        userId,
        webPushFid(endpoint),
      ),
    };
  }

  async function test(
    userId: string,
    endpoint: string,
  ): Promise<WebPushTestResult> {
    if (!enabled || !client) {
      return {
        sent: false,
        problem: "Browser notifications are turned off on this server.",
      };
    }
    const device = await deviceRepository.findDeviceByFid(
      database,
      webPushFid(endpoint),
    );
    if (
      !device ||
      device.user_id !== userId ||
      !device.web_endpoint ||
      !device.web_p256dh ||
      !device.web_auth
    ) {
      return {
        sent: false,
        problem: "This browser isn't subscribed. Turn notifications on first.",
      };
    }
    const outcome = await client.send(
      {
        endpoint: device.web_endpoint,
        p256dh: device.web_p256dh,
        auth: device.web_auth,
      },
      JSON.stringify({
        v: 1,
        kind: "test",
        title: "Notifications work",
        body: "New messages will show up like this, even with the tab closed.",
        tag: "test",
        url: "/chat",
      }),
      { ttlSeconds: 60, urgency: "high" },
    );
    if (outcome.ok) return { sent: true, problem: null };
    if (outcome.kind === "dead") {
      await deviceRepository.deleteDevices(database, [device.id]);
      return {
        sent: false,
        problem:
          "This browser's subscription has expired. Turn notifications off and on again.",
      };
    }
    return {
      sent: false,
      problem:
        "The browser's push service didn't take it. Try again in a minute.",
    };
  }

  return { config, register, remove, test };
}
