import crypto from "node:crypto";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type {
  CreatorPaymentConfig,
  SaveCreatorPaymentConfigRequest,
  PaymentGateway,
} from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import * as creatorGatewayRepo from "./creator-gateway.repository.ts";
import { encryptSecret, decryptSecret } from "./crypto.helper.ts";
import { RazorpayPaymentGateway } from "./razorpay/razorpay.gateway.ts";

export interface CreatorGatewayService {
  saveCreatorConfig(
    creatorId: string,
    request: SaveCreatorPaymentConfigRequest,
  ): Promise<CreatorPaymentConfig>;
  getCreatorConfig(
    creatorId: string,
    provider?: string,
  ): Promise<CreatorPaymentConfig | null>;
  resolveGatewayForCreator(
    creatorId?: string | null,
  ): Promise<PaymentGateway>;
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
      creatorId: row.creator_id,
      provider: row.provider as any,
      keyId: request.keyId,
      hasWebhookSecret: !!row.encrypted_webhook_secret,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function getCreatorConfig(
    creatorId: string,
    provider = "razorpay",
  ): Promise<CreatorPaymentConfig | null> {
    const row = await creatorGatewayRepo.findCreatorPaymentConfig(
      database,
      creatorId,
      provider as any,
    );
    if (!row) return null;

    let decryptedKeyId = "******";
    try {
      decryptedKeyId = decryptSecret(row.encrypted_key_id);
    } catch {
      // safe fallback if key derivation changes
    }

    return {
      id: row.id,
      creatorId: row.creator_id,
      provider: row.provider as any,
      keyId: decryptedKeyId,
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
