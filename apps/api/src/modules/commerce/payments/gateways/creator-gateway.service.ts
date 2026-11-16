import crypto from "node:crypto";

import { siteSettings } from "@veolms/config";
import type {
  AcademyPaymentGateway,
  ConnectPaymentGatewayResponse,
  ConnectRazorpayRequest,
  PaymentGateways,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import {
  paymentAccountChangedEmail,
  type EmailService,
} from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../../../config.ts";
import { AppError } from "../../../../lib/errors.ts";
import { createAcademyBrandService } from "../../../academy/academy-brand.service.ts";
import { listPlatformPermissionHolderIds } from "../../../authorization/authorization.repository.ts";
import { forgetAcademyGateways } from "./academy-gateways.ts";
import * as repository from "./creator-gateway.repository.ts";
import { decryptSecret, encryptSecret } from "./crypto.helper.ts";

/**
 * The academy's own payment account (Platform → Payments,
 * creator-features/36-academy-payment-gateway-plan.md): connect Razorpay
 * with its Key ID and Key Secret, checked with Razorpay first; a webhook
 * secret made here; replace, renew or remove. Secrets are encrypted before
 * they are stored and never sent back. Every change is emailed to all the
 * academy's admins.
 */

/** The Razorpay events our webhook handles (razorpay.gateway.ts). */
export const RAZORPAY_WEBHOOK_EVENTS = [
  "payment.captured",
  "payment.failed",
  "order.paid",
  "refund.created",
  "refund.processed",
  "refund.failed",
] as const;

export type KeyCheck = "ok" | "rejected" | "unreachable";

/** Asks Razorpay whether the keys work: one read, no money moves. */
export async function checkRazorpayKeys(
  keyId: string,
  keySecret: string,
): Promise<KeyCheck> {
  try {
    const response = await fetch(
      "https://api.razorpay.com/v1/payments?count=1",
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.ok) return "ok";
    if (response.status === 401 || response.status === 403) return "rejected";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}

let keyCheckOverride:
  ((keyId: string, keySecret: string) => Promise<KeyCheck>) | null = null;

/** For tests: answers the key check instead of Razorpay (null restores it). */
export function setRazorpayKeyCheckForTests(
  check: ((keyId: string, keySecret: string) => Promise<KeyCheck>) | null,
): void {
  keyCheckOverride = check;
}

const MFA_KEY_PLACEHOLDER = "default_mfa_encryption_key_at_least_32_chars_long";

/** A local install may use the placeholder key; anywhere else it is refused. */
function encryptionKeyIsSafe(): boolean {
  if (config.MFA_ENCRYPTION_KEY !== MFA_KEY_PLACEHOLDER) return true;
  try {
    const host = new URL(siteSettings(config).webUrl).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function maskKeyId(keyId: string): string {
  if (keyId.length <= 12) return "****";
  return `${keyId.slice(0, 8)}****${keyId.slice(-4)}`;
}

function modeOf(keyId: string): "test" | "live" | null {
  if (keyId.startsWith("rzp_live_")) return "live";
  if (keyId.startsWith("rzp_test_")) return "test";
  return null;
}

function webhookUrl(): string {
  const base =
    config.EMAIL_API_URL ??
    `${siteSettings(config).webUrl.replace(/\/+$/u, "")}/api`;
  return `${base.replace(/\/+$/u, "")}/v1/webhooks/razorpay`;
}

function newWebhookSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function createCreatorGatewayService({
  database,
  paymentGateways,
  email,
  logger,
  checkKeys = (keyId: string, keySecret: string) =>
    (keyCheckOverride ?? checkRazorpayKeys)(keyId, keySecret),
}: {
  database: Kysely<Database>;
  /** To tell whether this install takes payments with its own keys. */
  paymentGateways: PaymentGateways;
  email: EmailService;
  logger: FastifyBaseLogger;
  checkKeys?: (keyId: string, keySecret: string) => Promise<KeyCheck>;
}) {
  async function status(): Promise<AcademyPaymentGateway> {
    const row = await repository.findAcademyGatewayStatus(database, "razorpay");
    let keyId: string | null = null;
    if (row) {
      try {
        keyId = decryptSecret(row.encrypted_key_id);
      } catch {
        keyId = null;
      }
    }
    return {
      provider: "razorpay",
      connected: Boolean(row),
      mode: keyId ? modeOf(keyId) : null,
      keyId: keyId ? maskKeyId(keyId) : row ? "****" : null,
      hasWebhookSecret: Boolean(row?.encrypted_webhook_secret),
      connectedBy: row?.connected_by ?? null,
      connectedAt: row ? row.created_at.toISOString() : null,
      updatedAt: row ? row.updated_at.toISOString() : null,
      webhookUrl: webhookUrl(),
      webhookEvents: [...RAZORPAY_WEBHOOK_EVENTS],
      // With nothing connected, the gateways in force are the server's own
      // (single-academy install) or none (an academy of a shared install).
      usingServerKeys:
        !row && Boolean(safeGet(() => paymentGateways.get("razorpay"))),
    };
  }

  function safeGet<T>(read: () => T): T | undefined {
    try {
      return read();
    } catch {
      return undefined;
    }
  }

  async function notifyAdmins(
    change: "connected" | "replaced" | "removed" | "webhook_secret",
    changedById: string,
  ) {
    try {
      const [brand, adminIds, changer] = await Promise.all([
        createAcademyBrandService({ database }).getBrand(),
        listPlatformPermissionHolderIds(database, "payment.gateway.manage"),
        database
          .selectFrom("users")
          .select("display_name")
          .where("id", "=", changedById)
          .executeTakeFirst(),
      ]);
      if (adminIds.length === 0) return;
      const admins = await database
        .selectFrom("users")
        .select(["email"])
        .where("id", "in", adminIds)
        .where("is_deleted", "=", false)
        .where("email", "is not", null)
        .execute();
      const content = paymentAccountChangedEmail({
        academyName: brand.name,
        logoUrl: brand.logoUrl,
        change,
        gatewayName: "Razorpay",
        changedBy: changer?.display_name?.trim() || "A team member",
        when:
          new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date()) + " IST",
        settingsUrl: `${siteSettings(config).webUrl.replace(/\/+$/u, "")}/platform/payments`,
      });
      for (const admin of admins) {
        const result = await email.send(admin.email!, content);
        if (result.status === "failed") {
          logger.warn({ err: result.error }, "Payment account notice not sent");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Payment account notice failed");
    }
  }

  async function connectRazorpay(
    userId: string,
    request: ConnectRazorpayRequest,
  ): Promise<ConnectPaymentGatewayResponse> {
    if (!encryptionKeyIsSafe()) {
      throw new AppError(
        503,
        "PAYMENT_KEYS_CANNOT_BE_STORED",
        "Payment keys can't be stored safely on this server yet (its encryption key is not set). Ask the platform team.",
      );
    }
    const check = await checkKeys(request.keyId, request.keySecret);
    if (check === "rejected") {
      throw new AppError(
        400,
        "PAYMENT_KEYS_REJECTED",
        "Razorpay didn't accept these keys. Copy the Key ID and Key Secret again from Razorpay → Account & Settings → API Keys.",
      );
    }
    if (check === "unreachable") {
      throw new AppError(
        502,
        "PAYMENT_GATEWAY_UNREACHABLE",
        "We couldn't reach Razorpay to check the keys. Nothing was saved; try again in a minute.",
      );
    }
    const replacing = Boolean(
      await repository.findAcademyGatewayRow(database, "razorpay"),
    );
    const webhookSecret = newWebhookSecret();
    await database.transaction().execute((trx) =>
      repository.saveAcademyGateway(trx, {
        provider: "razorpay",
        connectedBy: userId,
        encryptedKeyId: encryptSecret(request.keyId),
        encryptedKeySecret: encryptSecret(request.keySecret),
        encryptedWebhookSecret: encryptSecret(webhookSecret),
      }),
    );
    forgetAcademyGateways();
    void notifyAdmins(replacing ? "replaced" : "connected", userId);
    return { gateway: await status(), webhookSecret };
  }

  async function renewWebhookSecret(
    userId: string,
  ): Promise<ConnectPaymentGatewayResponse> {
    if (!encryptionKeyIsSafe()) {
      throw new AppError(
        503,
        "PAYMENT_KEYS_CANNOT_BE_STORED",
        "Payment keys can't be stored safely on this server yet (its encryption key is not set). Ask the platform team.",
      );
    }
    const webhookSecret = newWebhookSecret();
    const updated = await repository.setAcademyWebhookSecret(
      database,
      "razorpay",
      encryptSecret(webhookSecret),
    );
    if (!updated) {
      throw new AppError(
        404,
        "PAYMENT_GATEWAY_NOT_CONNECTED",
        "Connect Razorpay first.",
      );
    }
    forgetAcademyGateways();
    void notifyAdmins("webhook_secret", userId);
    return { gateway: await status(), webhookSecret };
  }

  async function disconnect(userId: string): Promise<AcademyPaymentGateway> {
    const removed = await repository.deleteAcademyGateway(database, "razorpay");
    if (!removed) {
      throw new AppError(
        404,
        "PAYMENT_GATEWAY_NOT_CONNECTED",
        "No Razorpay account is connected.",
      );
    }
    forgetAcademyGateways();
    void notifyAdmins("removed", userId);
    return await status();
  }

  return { status, connectRazorpay, renewWebhookSecret, disconnect };
}

export type CreatorGatewayService = ReturnType<
  typeof createCreatorGatewayService
>;
