import {
  ALL_CACHE_TAG,
  currentCacheScope,
  invalidateCache,
  registerCache,
  scopedCacheTag,
  type CacheStats,
} from "@veolms/api-core";
import type { PaymentGateways } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import {
  RazorpayPaymentGateway,
  setAcademyGatewaysSource,
  singleGateway,
} from "@veolms/services";

import * as repository from "./creator-gateway.repository.ts";
import { decryptPaymentSecret as decryptSecret } from "./payment-keys-crypto.ts";

/**
 * The academy's own gateway account (Platform → Payments), ready to use
 * (creator-features/36-academy-payment-gateway-plan.md).
 *
 * The payment code asks for gateways without waiting (see
 * `setAcademyGatewaysSource` in @veolms/services), so each academy's keys
 * are read and decrypted ahead of use: before a request's handler runs and
 * inside each payment background item (`loadAcademyGateways`). They are
 * kept in this process's memory for 10 minutes, and dropped in every
 * process the moment an admin connects, replaces or removes them.
 *
 * Kept here rather than in a cache from `createCache`, which stores nothing
 * while caching is switched off: payments must use the right account either
 * way. Each academy (cache scope) has its own entry.
 */

const TTL_MS = 10 * 60_000;
export const ACADEMY_GATEWAYS_TAG = "payments:gateways";
const NO_SCOPE = "";

interface Entry {
  /** Null: the academy has connected no gateway. */
  gateways: PaymentGateways | null;
  loadedAt: number;
}

const entries = new Map<string, Entry>();
const loading = new Map<string, Promise<void>>();
let hits = 0;
let misses = 0;
let loads = 0;
let loadFailures = 0;
let invalidatedEntries = 0;

function scopeKey(): string {
  return currentCacheScope() ?? NO_SCOPE;
}

function fresh(entry: Entry | undefined): entry is Entry {
  return entry !== undefined && Date.now() - entry.loadedAt < TTL_MS;
}

registerCache({
  name: "payments.academy-gateways",
  invalidate(tags) {
    if (tags.has(ALL_CACHE_TAG) || tags.has(ACADEMY_GATEWAYS_TAG)) {
      invalidatedEntries += entries.size;
      entries.clear();
      return;
    }
    for (const key of [...entries.keys()]) {
      if (
        key !== NO_SCOPE &&
        (tags.has(scopedCacheTag(key, ACADEMY_GATEWAYS_TAG)) ||
          tags.has(scopedCacheTag(key, ALL_CACHE_TAG)))
      ) {
        entries.delete(key);
        invalidatedEntries += 1;
      }
    }
  },
  clear() {
    entries.clear();
  },
  stats(): CacheStats {
    return {
      name: "payments.academy-gateways",
      entries: entries.size,
      bytes: 0,
      maxBytes: 0,
      hits,
      misses,
      loads,
      loadFailures,
      discardedLoads: 0,
      invalidatedEntries,
      evictions: 0,
    };
  },
});

/** The academy's gateways from its stored keys, or null when none. */
async function readGateways(
  database: DatabaseExecutor,
): Promise<PaymentGateways | null> {
  const row = await repository.findAcademyGatewayRow(database, "razorpay");
  if (!row) return null;
  const gateway = new RazorpayPaymentGateway({
    keyId: decryptSecret(row.encrypted_key_id),
    keySecret: decryptSecret(row.encrypted_key_secret),
    ...(row.encrypted_webhook_secret
      ? { webhookSecret: decryptSecret(row.encrypted_webhook_secret) }
      : {}),
  });
  return singleGateway(gateway);
}

/**
 * Makes sure the current academy's gateways are in memory. Cheap when they
 * are; one query when not. A failure leaves nothing stored, so the
 * academy's payments are refused (cloud) or use the server's own keys
 * (single-academy installs) until the next try.
 */
export async function loadAcademyGateways(
  database: DatabaseExecutor,
): Promise<void> {
  const key = scopeKey();
  if (fresh(entries.get(key))) {
    hits += 1;
    return;
  }
  misses += 1;
  const pending = loading.get(key);
  if (pending) return await pending;
  const load = (async () => {
    try {
      const gateways = await readGateways(database);
      entries.set(key, { gateways, loadedAt: Date.now() });
      loads += 1;
    } catch (error) {
      loadFailures += 1;
      throw error;
    } finally {
      loading.delete(key);
    }
  })();
  loading.set(key, load);
  await load;
}

/** After keys are connected, replaced or removed (every process). */
export function forgetAcademyGateways(): void {
  invalidateCache([ACADEMY_GATEWAYS_TAG]);
}

/**
 * The current academy's own gateways, if it connected any and they are
 * loaded. An entry past its 10 minutes is still used until it is read
 * again: keys rarely change, and a change drops it at once.
 */
export function currentAcademyGateways(): PaymentGateways | undefined {
  return entries.get(scopeKey())?.gateways ?? undefined;
}

/** Points the payment code at the academy's own account (once per process). */
export function installAcademyGateways(): void {
  setAcademyGatewaysSource(currentAcademyGateways);
}

let boundDatabase: DatabaseExecutor | null = null;

/**
 * Gives the store its database and points the payment code at it. Called
 * by the gateway routes when they are registered, so it happens in every
 * app built on core's routes (this API and the cloud's).
 */
export function bindAcademyGateways(database: DatabaseExecutor): void {
  boundDatabase = database;
  installAcademyGateways();
}

/** Requests that can take, check or refund a payment. */
const PAYMENT_PATHS = [
  "/v1/checkout",
  "/v1/orders",
  "/v1/payments",
  "/v1/manual-payments",
  "/v1/refund-requests",
  "/v1/refunds",
  "/v1/webhooks",
  "/v1/workshops",
  "/v1/students",
];

/**
 * Loads the academy's keys before such a request's handler runs (after the
 * academy is known). A failure is logged: the request then runs as if no
 * keys were connected, which a multi-academy install refuses.
 */
export function registerAcademyGatewaysHook(app: {
  addHook: (
    name: "preHandler",
    hook: (request: {
      url: string;
      log: { error: (obj: unknown, msg: string) => void };
    }) => Promise<void>,
  ) => unknown;
}): void {
  app.addHook("preHandler", async (request) => {
    if (!boundDatabase) return;
    const path = (request.url.split("?")[0] ?? "").replace(/^\/api(?=\/)/u, "");
    if (
      !PAYMENT_PATHS.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    ) {
      return;
    }
    try {
      await loadAcademyGateways(boundDatabase);
    } catch (error) {
      request.log.error(
        { err: error },
        "The academy's payment keys could not be loaded",
      );
    }
  });
}

/**
 * Runs one payment background item with its academy's keys loaded (the
 * item already runs inside its academy, see `runBackgroundItem`).
 */
export async function withAcademyGateways<T>(
  run: () => Promise<T>,
): Promise<T> {
  if (boundDatabase) {
    try {
      await loadAcademyGateways(boundDatabase);
    } catch {
      // As for a request: the item then runs as if no keys were connected.
    }
  }
  return await run();
}
