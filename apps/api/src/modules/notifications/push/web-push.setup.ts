import type { ServerConfig } from "@veolms/config";

import {
  parseAllowedPushHosts,
  readVapidKeys,
  type WebPushVapid,
} from "./web-push.client.ts";

export type WebPushConfig = Pick<
  ServerConfig,
  | "WEB_PUSH_ENABLED"
  | "WEB_PUSH_VAPID_PUBLIC_KEY"
  | "WEB_PUSH_VAPID_PRIVATE_KEY"
  | "WEB_PUSH_SUBJECT"
  | "WEB_PUSH_ALLOWED_HOSTS"
  | "WEB_URL"
>;

export interface WebPushSetup {
  /** null: web push is off (switched off, no keys, or unusable keys). */
  vapid: WebPushVapid | null;
  /** Why the keys are unusable, if they are. */
  problem: string | null;
  allowedHosts: string[];
}

let cached: { key: string; setup: WebPushSetup } | null = null;

/**
 * Web push as configured (WEB_PUSH_*): read once per process and config.
 * PUSH_ENABLED, the switch for every push, is the caller's to check.
 */
export function webPushSetup(config: WebPushConfig): WebPushSetup {
  const key = JSON.stringify([
    config.WEB_PUSH_ENABLED,
    config.WEB_PUSH_VAPID_PUBLIC_KEY,
    config.WEB_PUSH_VAPID_PRIVATE_KEY,
    config.WEB_PUSH_SUBJECT,
    config.WEB_PUSH_ALLOWED_HOSTS,
    config.WEB_URL,
  ]);
  if (cached?.key === key) return cached.setup;
  const allowedHosts = parseAllowedPushHosts(config.WEB_PUSH_ALLOWED_HOSTS);
  const read = config.WEB_PUSH_ENABLED
    ? readVapidKeys({
        publicKey: config.WEB_PUSH_VAPID_PUBLIC_KEY,
        privateKey: config.WEB_PUSH_VAPID_PRIVATE_KEY,
        subject: config.WEB_PUSH_SUBJECT || config.WEB_URL,
      })
    : { vapid: null, problem: null };
  const setup = { vapid: read.vapid, problem: read.problem, allowedHosts };
  cached = { key, setup };
  return setup;
}
