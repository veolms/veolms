import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";

import { createEmailService, type EmailService } from "./email/index.ts";
import { createSmsService, type SmsService } from "./sms/index.ts";
import { S3StorageService } from "@veolms/storage";
import {
  createVideoDispatchService,
  type VideoDispatchService,
} from "./video-dispatch/index.ts";

import type { PaymentGateway } from "@veolms/contracts";
import { createPaymentGateway } from "../modules/commerce/payments/gateways/gateway.factory.ts";

export * from "./email/index.ts";
export * from "./sms/index.ts";
export * from "./video-dispatch/index.ts";

/** Every outbound-integration service, injected into routes as one unit. */
export interface AppServices {
  email: EmailService;
  sms: SmsService;
  storage: S3StorageService;
  videoDispatch: VideoDispatchService;
  paymentGateway: PaymentGateway;
}

export interface CreateServicesOptions {
  config: ServerConfig;
  logger: FastifyBaseLogger;
}

/**
 * With no gateway credentials there is nothing to dispatch through, so the
 * service logs instead of failing every send. Production deployments are warned
 * at boot rather than blocked, since SMS is optional when email is configured.
 */
function resolveSmsTransport(config: ServerConfig): "http" | "console" {
  const hasPrimary = Boolean(
    config.SMS_PRIMARY_KEY && config.SMS_PRIMARY_SECRET,
  );
  const hasBackup = Boolean(config.SMS_BACKUP_SID && config.SMS_BACKUP_TOKEN);
  return hasPrimary || hasBackup ? "http" : "console";
}

/**
 * Composition root for services. Construction is centralised here so routes
 * receive ready-built collaborators and never reach for config themselves.
 */
export function createServices({
  config,
  logger,
}: CreateServicesOptions): AppServices {
  const smsTransport = resolveSmsTransport(config);

  if (
    config.NODE_ENV === "production" &&
    !config.FLEET_MANAGER_TRIGGER_URL &&
    !config.FLEET_MANAGER_LAMBDA_NAME
  ) {
    logger.warn(
      "Neither FLEET_MANAGER_TRIGGER_URL nor FLEET_MANAGER_LAMBDA_NAME is set; Fleet Manager will rely solely on database reconciliation",
    );
  }

  if (config.NODE_ENV === "production") {
    if (config.EMAIL_TRANSPORT === "console") {
      logger.warn(
        "EMAIL_TRANSPORT is 'console' in production; no email will be delivered",
      );
    }
    if (smsTransport === "console") {
      logger.warn(
        "No SMS gateway credentials configured; no SMS will be delivered",
      );
    }
  }

  return {
    email: createEmailService({
      logger,
      config: {
        transport: config.EMAIL_TRANSPORT,
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
        from: config.EMAIL_FROM,
      },
    }),
    sms: createSmsService({
      logger,
      config: {
        transport: smsTransport,
        senderId: config.RP_NAME,
        primaryUrl: config.SMS_PRIMARY_URL,
        primaryKey: config.SMS_PRIMARY_KEY,
        primarySecret: config.SMS_PRIMARY_SECRET,
        backupUrl: config.SMS_BACKUP_URL,
        backupSid: config.SMS_BACKUP_SID,
        backupToken: config.SMS_BACKUP_TOKEN,
        backupFrom: config.SMS_BACKUP_FROM,
      },
    }),
    storage: new S3StorageService({
      endpoint: config.STORAGE_ENDPOINT,
      region: config.STORAGE_REGION,
      accessKeyId: config.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
      bucket: config.STORAGE_BUCKET,
      forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
    }),
    videoDispatch: createVideoDispatchService({
      triggerUrl: config.FLEET_MANAGER_TRIGGER_URL,
      lambdaName: config.FLEET_MANAGER_LAMBDA_NAME,
      logger,
    }),
    paymentGateway: createPaymentGateway(config),
  };
}
