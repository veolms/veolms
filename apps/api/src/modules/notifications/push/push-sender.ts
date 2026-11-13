import { PUSH_ACTION_DATA_KEYS } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import type { FcmClient, FcmOutcome } from "./fcm.client.ts";
import type { PushActionTokenService } from "./push-action-tokens.service.ts";
import type { PushApp, PushAppRegistry } from "./push-apps.ts";
import * as deliveryRepository from "./push-deliveries.repository.ts";
import * as deviceRepository from "./push-devices.repository.ts";
import {
  buildFcmMessage,
  buildWebPushMessage,
  pushPayloadSchema,
  type PushPayload,
  type PushTargetField,
} from "./push-message.ts";
import type { WebPushClient } from "./web-push.client.ts";

/**
 * Sends queued pushes (push_deliveries) to each of the user's installs:
 * phones through Firebase, browsers through their own push service (Web
 * Push). Browsers get chat messages only; the bell has its own stream.
 *
 * Per install, Firebase's answer decides: delivered → done; dead (app
 * removed, FID expired, other Firebase project) → the install is deleted;
 * temporary trouble → that install alone is retried with backoff; our key
 * refused → the app is paused for a few minutes and nothing is used up.
 * A push is never sent after its expiry, and never twice to one install.
 */

/** Consecutive failures after which an install is dropped. */
export const DEVICE_FAILURE_LIMIT = 10;
/** Firebase forgets installs after 270 days without the app. */
const STALE_DEVICE_MS = 270 * 24 * 60 * 60 * 1000;
const AUTH_PAUSE_MS = 5 * 60 * 1000;
const MAINTENANCE_EVERY_MS = 60 * 60 * 1000;
const SIGNED_OUT_SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;

export interface RevokedSessionLookup {
  /** Of `sessionIds`, those signed out (expired ones are not). */
  listRevokedSessionIds(sessionIds: readonly string[]): Promise<string[]>;
}

export interface PushSendResult {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  devicesRemoved: number;
}

export interface PushSender {
  /** Browsers are sent to too (web push is on and has its keys). */
  readonly sendsToBrowsers: boolean;
  process(): Promise<PushSendResult>;
  /** Hourly upkeep: stale and signed-out installs, old queue rows. */
  maintain(
    retentionDays: number,
  ): Promise<{ devicesRemoved: number; deliveriesRemoved: number }>;
}

type DeviceRow = deviceRepository.PushDeviceRow;

async function inBatches<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function retryDelayMs(
  attemptCount: number,
  scheduleSeconds: readonly number[],
): number {
  const index = Math.min(
    Math.max(attemptCount - 1, 0),
    scheduleSeconds.length - 1,
  );
  return (scheduleSeconds[index] ?? 60) * 1000;
}

export function createPushSender({
  database,
  apps,
  fcm,
  web = null,
  logger,
  sessions,
  actionTokens,
  config,
  now = () => new Date(),
}: {
  database: Kysely<Database>;
  apps: PushAppRegistry;
  fcm: FcmClient;
  /** Browser pushes; null while web push is off or has no keys. */
  web?: WebPushClient | null;
  logger: FastifyBaseLogger;
  sessions?: RevokedSessionLookup;
  /** Reply / mark-as-read tokens in chat pushes to phones. */
  actionTokens?: Pick<PushActionTokenService, "issueForChatPush" | "deleteOld">;
  config: {
    batchSize: number;
    leaseSeconds: number;
    maxAttempts: number;
    concurrency: number;
    targetField: PushTargetField;
    retryScheduleSeconds: readonly number[];
  };
  now?: () => Date;
}): PushSender {
  const log = logger.child({ job: "push-sender" });
  /** applicationId → paused until (ms). Per process; short-lived. */
  const pausedApps = new Map<string, number>();
  let lastMaintenance = 0;
  let lastSignedOutSweep = 0;

  function pauseApp(
    app: PushApp | undefined,
    applicationId: string,
    reason: string,
  ) {
    const until = Date.now() + AUTH_PAUSE_MS;
    const already = (pausedApps.get(applicationId) ?? 0) > Date.now();
    pausedApps.set(applicationId, until);
    if (!already) {
      log.error(
        { applicationId, reason, keyProblem: app?.problem ?? null },
        "Push paused for this app: its Firebase or VAPID key was refused or is missing",
      );
    }
  }

  function isPaused(applicationId: string): boolean {
    return (pausedApps.get(applicationId) ?? 0) > Date.now();
  }

  /** Deletes installs whose login was signed out; returns those kept. */
  async function dropSignedOut(devices: DeviceRow[]): Promise<{
    kept: DeviceRow[];
    removed: number;
  }> {
    if (!sessions) return { kept: devices, removed: 0 };
    const sessionIds = [
      ...new Set(
        devices
          .map((device) => device.session_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (sessionIds.length === 0) return { kept: devices, removed: 0 };
    const revoked = new Set(await sessions.listRevokedSessionIds(sessionIds));
    if (revoked.size === 0) return { kept: devices, removed: 0 };
    const gone = devices.filter(
      (device) => device.session_id !== null && revoked.has(device.session_id),
    );
    const removed = await deviceRepository.deleteDevices(
      database,
      gone.map((device) => device.id),
    );
    return {
      kept: devices.filter((device) => !gone.includes(device)),
      removed,
    };
  }

  /**
   * A chat push to an Android phone carries its own push action token
   * (reply / mark as read from the notification), issued now, for this
   * phone and its login. Without one (no login on record, push actions
   * off, an error) the push goes out without, and the app shows no buttons.
   * A message request gets none: accepting a stranger from the notification
   * shade is too easy, so it only opens the chat.
   */
  async function withActionToken(
    payload: PushPayload,
    device: DeviceRow,
  ): Promise<PushPayload> {
    if (
      !actionTokens ||
      payload.kind !== "chat_message" ||
      payload.data.isRequest === "true" ||
      device.platform !== "android" ||
      !device.session_id
    ) {
      return payload;
    }
    const roomId = payload.data.roomId;
    const seq = Number(payload.data.seq);
    if (!roomId || !Number.isSafeInteger(seq)) return payload;
    const issued = await actionTokens
      .issueForChatPush({
        userId: device.user_id,
        deviceId: device.id,
        sessionId: device.session_id,
        roomId,
        seq,
      })
      .catch((error: unknown) => {
        log.warn({ err: error }, "Could not issue a push action token");
        return null;
      });
    if (!issued) return payload;
    return {
      ...payload,
      data: {
        ...payload.data,
        [PUSH_ACTION_DATA_KEYS.token]: issued.token,
        [PUSH_ACTION_DATA_KEYS.expiresAt]: issued.expiresAt.toISOString(),
      },
    };
  }

  async function sendToBrowser(task: {
    delivery: deliveryRepository.ClaimedPushDelivery;
    payload: PushPayload;
    device: DeviceRow;
  }): Promise<FcmOutcome> {
    const { device } = task;
    if (!web || isPaused(device.application_id)) {
      return { ok: false, kind: "auth", error: "Web push paused." };
    }
    if (!device.web_endpoint || !device.web_p256dh || !device.web_auth) {
      return { ok: false, kind: "dead", error: "No subscription saved." };
    }
    const message = buildWebPushMessage({
      payload: task.payload,
      expiresAt: task.delivery.expires_at,
      now: now(),
    });
    return await web.send(
      {
        endpoint: device.web_endpoint,
        p256dh: device.web_p256dh,
        auth: device.web_auth,
      },
      message.json,
      {
        ttlSeconds: message.ttlSeconds,
        urgency: message.urgency,
        topic: message.topic,
      },
    );
  }

  async function process(): Promise<PushSendResult> {
    const result: PushSendResult = {
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      devicesRemoved: 0,
    };
    const claimTime = now();
    const leaseUntil = new Date(
      claimTime.getTime() + config.leaseSeconds * 1000,
    );
    const claimed = await deliveryRepository.claimPushDeliveries(database, {
      limit: config.batchSize,
      now: claimTime,
      leaseUntil,
      maxAttempts: config.maxAttempts,
    });
    if (claimed.length === 0) return result;

    const loaded = await deviceRepository.listDevicesForUsers(
      database,
      claimed.map((delivery) => delivery.user_id),
      { includeWeb: web !== null },
    );
    const { kept: devices, removed } = await dropSignedOut(loaded);
    result.devicesRemoved += removed;
    const devicesByUser = new Map<string, DeviceRow[]>();
    for (const device of devices) {
      const list = devicesByUser.get(device.user_id) ?? [];
      list.push(device);
      devicesByUser.set(device.user_id, list);
    }

    type Task = {
      delivery: deliveryRepository.ClaimedPushDelivery;
      payload: PushPayload;
      device: DeviceRow;
      app: PushApp | undefined;
    };
    const tasks: Task[] = [];
    const plans = new Map<
      string,
      { delivery: deliveryRepository.ClaimedPushDelivery; targets: DeviceRow[] }
    >();

    for (const delivery of claimed) {
      const finish = (
        status: "sent" | "failed" | "skipped",
        error: string | null,
      ) =>
        deliveryRepository.finishPushDelivery(database, {
          deliveryId: delivery.id,
          status,
          pendingDeviceIds: delivery.pending_device_ids,
          error,
          now: now(),
          lockedUntil: leaseUntil,
        });

      if (delivery.expires_at.getTime() <= claimTime.getTime()) {
        await finish("skipped", "Expired before it could be sent.");
        result.skipped += 1;
        continue;
      }
      const parsed = pushPayloadSchema.safeParse(delivery.payload);
      if (!parsed.success) {
        await finish("failed", `Invalid push payload: ${parsed.error.message}`);
        result.failed += 1;
        continue;
      }
      const pending = delivery.pending_device_ids
        ? new Set(delivery.pending_device_ids)
        : null;
      const targets = (devicesByUser.get(delivery.user_id) ?? []).filter(
        (device) =>
          (pending === null || pending.has(device.id)) &&
          (device.platform !== "web" || delivery.source === "chat") &&
          // "Chat read" clears what the Android app drew itself.
          (parsed.data.kind !== "chat_read" || device.platform === "android"),
      );
      if (targets.length === 0) {
        // Never started: the user has no install now. Started: the
        // installs still owed it are gone, so it is done.
        if (pending === null) {
          await finish("skipped", "No install can receive it.");
          result.skipped += 1;
        } else {
          await finish("sent", null);
          result.sent += 1;
        }
        continue;
      }
      plans.set(delivery.id, { delivery, targets });
      for (const device of targets) {
        tasks.push({
          delivery,
          payload: parsed.data,
          device,
          app: apps.get(device.application_id),
        });
      }
    }

    const outcomes = await inBatches(
      tasks,
      config.concurrency,
      async (task): Promise<FcmOutcome> => {
        if (task.device.platform === "web") {
          return await sendToBrowser(task);
        }
        const account = task.app?.serviceAccount;
        if (!account || isPaused(task.device.application_id)) {
          return {
            ok: false,
            kind: "auth",
            error: task.app
              ? (task.app.problem ?? "Push paused for this app.")
              : `App ${task.device.application_id} is not configured for push.`,
          };
        }
        return await fcm.send(
          account,
          buildFcmMessage({
            payload: await withActionToken(task.payload, task.device),
            fid: task.device.fid,
            platform: task.device.platform,
            targetField: config.targetField,
            expiresAt: task.delivery.expires_at,
            now: now(),
          }),
        );
      },
    );

    // What each install's answer means for the install itself.
    const succeeded = new Set<string>();
    const dead = new Set<string>();
    const transient: { deviceId: string; error: string }[] = [];
    const byDelivery = new Map<string, { task: Task; outcome: FcmOutcome }[]>();
    tasks.forEach((task, index) => {
      const outcome = outcomes[index]!;
      const list = byDelivery.get(task.delivery.id) ?? [];
      list.push({ task, outcome });
      byDelivery.set(task.delivery.id, list);
      if (outcome.ok) {
        succeeded.add(task.device.id);
      } else if (outcome.kind === "dead") {
        dead.add(task.device.id);
      } else if (outcome.kind === "retry") {
        transient.push({ deviceId: task.device.id, error: outcome.error });
      } else if (outcome.kind === "auth") {
        pauseApp(task.app, task.device.application_id, outcome.error);
      }
    });

    const at = now();
    await deviceRepository.markDevicesSucceeded(database, [...succeeded], at);
    const worn = await deviceRepository.markDevicesFailed(
      database,
      // One count per install per round, however many pushes it missed.
      [...new Map(transient.map((t) => [t.deviceId, t])).values()],
      DEVICE_FAILURE_LIMIT,
    );
    for (const id of worn) dead.add(id);
    result.devicesRemoved += await deviceRepository.deleteDevices(database, [
      ...dead,
    ]);

    for (const [deliveryId, entries] of byDelivery) {
      const { delivery } = plans.get(deliveryId)!;
      const remaining = entries.filter(
        ({ task, outcome }) =>
          !outcome.ok &&
          outcome.kind !== "dead" &&
          outcome.kind !== "bad_message" &&
          !dead.has(task.device.id),
      );
      const badMessage = entries.find(
        ({ outcome }) => !outcome.ok && outcome.kind === "bad_message",
      );
      const remainingIds = remaining.map(({ task }) => task.device.id);
      const lastError = remaining
        .map(({ outcome }) => (outcome.ok ? "" : outcome.error))
        .find(Boolean);

      if (badMessage && !badMessage.outcome.ok) {
        log.error(
          { deliveryId, error: badMessage.outcome.error },
          "Push refused by Firebase as invalid; not retried",
        );
      }
      if (remaining.length === 0) {
        const anyDelivered = entries.some(({ outcome }) => outcome.ok);
        const status = badMessage && !anyDelivered ? "failed" : "sent";
        await deliveryRepository.finishPushDelivery(database, {
          deliveryId,
          status,
          pendingDeviceIds: [],
          error:
            badMessage && !badMessage.outcome.ok
              ? badMessage.outcome.error
              : null,
          now: at,
          lockedUntil: leaseUntil,
        });
        if (status === "sent") result.sent += 1;
        else result.failed += 1;
        continue;
      }

      const onlyPaused = remaining.every(
        ({ outcome }) => !outcome.ok && outcome.kind === "auth",
      );
      const retryAfter = Math.max(
        0,
        ...remaining.map(({ outcome }) =>
          !outcome.ok && outcome.kind === "retry"
            ? (outcome.retryAfterMs ?? 0)
            : 0,
        ),
      );
      const delay = onlyPaused
        ? AUTH_PAUSE_MS
        : Math.max(
            retryAfter,
            retryDelayMs(delivery.attempt_count, config.retryScheduleSeconds),
          );
      const nextAttemptAt = new Date(at.getTime() + delay);
      const outOfAttempts =
        !onlyPaused && delivery.attempt_count >= config.maxAttempts;
      const tooLate = nextAttemptAt.getTime() >= delivery.expires_at.getTime();

      if (outOfAttempts || tooLate) {
        await deliveryRepository.finishPushDelivery(database, {
          deliveryId,
          status: "failed",
          pendingDeviceIds: remainingIds,
          error: tooLate
            ? `Expired while retrying: ${lastError ?? ""}`
            : (lastError ?? "Out of attempts."),
          now: at,
          lockedUntil: leaseUntil,
        });
        result.failed += 1;
        continue;
      }
      await deliveryRepository.retryPushDelivery(database, {
        deliveryId,
        pendingDeviceIds: remainingIds,
        nextAttemptAt,
        error: lastError ?? "Retrying.",
        refundAttempt: onlyPaused,
        now: at,
        lockedUntil: leaseUntil,
      });
      result.retried += 1;
    }

    return result;
  }

  async function maintain(retentionDays: number) {
    const at = now();
    if (at.getTime() - lastMaintenance < MAINTENANCE_EVERY_MS) {
      return { devicesRemoved: 0, deliveriesRemoved: 0 };
    }
    lastMaintenance = at.getTime();

    let devicesRemoved = await deviceRepository.deleteStaleDevices(
      database,
      new Date(at.getTime() - STALE_DEVICE_MS),
    );
    const deliveriesRemoved = await deliveryRepository.cleanupPushDeliveries(
      database,
      new Date(at.getTime() - retentionDays * 24 * 60 * 60 * 1000),
    );
    const tokensRemoved = actionTokens
      ? await actionTokens.deleteOld().catch((error: unknown) => {
          log.warn({ err: error }, "Could not delete old push action tokens");
          return 0;
        })
      : 0;

    // Installs whose login was signed out but that got no push since (the
    // send-time check catches the rest): before old sessions are purged
    // and the link is lost.
    if (
      sessions &&
      at.getTime() - lastSignedOutSweep >= SIGNED_OUT_SWEEP_EVERY_MS
    ) {
      lastSignedOutSweep = at.getTime();
      let afterId: string | null = null;
      for (;;) {
        const page = await deviceRepository.listSessionLinkedDevices(
          database,
          afterId,
          1000,
        );
        if (page.length === 0) break;
        const revoked = new Set(
          await sessions.listRevokedSessionIds([
            ...new Set(page.map((row) => row.session_id)),
          ]),
        );
        devicesRemoved += await deviceRepository.deleteDevices(
          database,
          page
            .filter((row) => revoked.has(row.session_id))
            .map((row) => row.id),
        );
        afterId = page.at(-1)!.id;
        if (page.length < 1000) break;
      }
    }

    if (devicesRemoved > 0 || deliveriesRemoved > 0 || tokensRemoved > 0) {
      log.info(
        { devicesRemoved, deliveriesRemoved, tokensRemoved },
        "Push upkeep done",
      );
    }
    return { devicesRemoved, deliveriesRemoved };
  }

  return { sendsToBrowsers: web !== null, process, maintain };
}
