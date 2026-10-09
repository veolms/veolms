import crypto from "node:crypto";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type {
  CreatorPaymentConfig,
  SaveCreatorPaymentConfigRequest,
  PaymentGateway,
  PaymentProvider,
} from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import { RazorpayPaymentGateway } from "@veolms/services";
import * as creatorGatewayRepo from "./creator-gateway.repository.ts";
import { encryptSecret, decryptSecret } from "./crypto.helper.ts";

export interface CreatorGatewayService {
  saveCreatorConfig(
    creatorId: string,
    request: SaveCreatorPaymentConfigRequest,
  ): Promise<CreatorPaymentConfig>;
  getCreatorConfig(
    creatorId: string,
    provider?: PaymentProvider,
  ): Promise<CreatorPaymentConfig | null>;
  resolveGatewayForCreator(creatorId?: string | null): Promise<PaymentGateway>;
}

/**
 * A key id as it is shown back to the person who saved it: enough to tell
 * which key is connected (`rzp_live****1a2B`), not the key itself.
 */
function maskKeyId(keyId: string): string {
  if (keyId.length <= 12) return "****";
  return `${keyId.slice(0, 8)}****${keyId.slice(-4)}`;
}

export function createCreatorGatewayService({
  database,
  config,
  fallbackGateway,
}: {
  database: Executor;
  config: ServerConfig;
  fallbackGateway: PaymentGateway;
}): CreatorGatewayService {
  async function saveCreatorConfig(
    creatorId: string,
    request: SaveCreatorPaymentConfigRequest,
  ): Promise<CreatorPaymentConfig> {
    const encryptedKeyId = encryptSecret(request.keyId);
    const encryptedKeySecret = encryptSecret(request.keySecret);
    const encryptedWebhookSecret = request.webhookSecret
      ? encryptSecret(request.webhookSecret)
      : null;

    const row = await creatorGatewayRepo.upsertCreatorPaymentConfig(database, {
      id: crypto.randomUUID(),
      creator_id: creatorId,
      provider: request.provider,
      encrypted_key_id: encryptedKeyId,
      encrypted_key_secret: encryptedKeySecret,
      encrypted_webhook_secret: encryptedWebhookSecret,
      is_active: true,
    });

    return {
      id: row.id,
      provider: row.provider as PaymentProvider,
      keyId: maskKeyId(request.keyId),
      hasWebhookSecret: !!row.encrypted_webhook_secret,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function getCreatorConfig(
    creatorId: string,
    provider: PaymentProvider = "razorpay",
  ): Promise<CreatorPaymentConfig | null> {
    const row = await creatorGatewayRepo.findCreatorPaymentConfig(
      database,
      creatorId,
      provider,
    );
    if (!row) return null;

    let maskedKeyId = "****";
    try {
      maskedKeyId = maskKeyId(decryptSecret(row.encrypted_key_id));
    } catch {
      // safe fallback if key derivation changes
    }

    return {
      id: row.id,
      provider: row.provider as PaymentProvider,
      keyId: maskedKeyId,
      hasWebhookSecret: !!row.encrypted_webhook_secret,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function resolveGatewayForCreator(
    creatorId?: string | null,
  ): Promise<PaymentGateway> {
    if (!creatorId) {
      return fallbackGateway;
    }

    const row = await creatorGatewayRepo.findCreatorPaymentConfig(
      database,
      creatorId,
      "razorpay",
    );

    if (!row || !row.is_active) {
      return fallbackGateway;
    }

    try {
      const keyId = decryptSecret(row.encrypted_key_id);
      const keySecret = decryptSecret(row.encrypted_key_secret);
      const webhookSecret = row.encrypted_webhook_secret
        ? decryptSecret(row.encrypted_webhook_secret)
        : undefined;

      return new RazorpayPaymentGateway({
        keyId,
        keySecret,
        webhookSecret,
      });
    } catch {
      return fallbackGateway;
    }
  }

  return {
    saveCreatorConfig,
    getCreatorConfig,
    resolveGatewayForCreator,
  };
}
