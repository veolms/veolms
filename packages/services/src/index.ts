import type { ServerConfig } from "@veolms/config";
import type { PaymentGateway } from "@veolms/contracts";
import { S3StorageService } from "@veolms/storage";
import type { FastifyBaseLogger } from "fastify";

import {
  createEmailService,
  type EmailService,
  type EmailTransportConfig,
} from "./email/index.ts";
import {
  createSmsService,
  type SmsService,
  type SmsTransportConfig,
} from "./sms/index.ts";
import {
  createVideoDispatchService,
  type VideoDispatchService,
} from "./video/index.ts";
import { createPaymentGateway } from "./payment/index.ts";
import {
  createCourseStaticPageRefreshService,
  type CourseStaticPageRefreshService,
} from "./course-static-pages/index.ts";

export * from "./email/index.ts";
export * from "./sms/index.ts";
export * from "./payment/index.ts";
export * from "./video/index.ts";
export * from "./course-static-pages/index.ts";
export * from "./cdn/index.ts";
export * from "./utils/secure-compare.ts";

/** Every outbound-integration service, injected into routes as one unit. */
export interface AppServices {
  email: EmailService;
  sms: SmsService;
  storage: S3StorageService;
  videoDispatch: VideoDispatchService;
  paymentGateway: PaymentGateway;
  config: ServerConfig;
  courseStaticPages?: CourseStaticPageRefreshService;
}

export interface CreateServicesOptions {
  config: ServerConfig;
  logger: FastifyBaseLogger;
}

function resolveSmsTransport(config: ServerConfig): "http" | "console" {
  if (config.SMS_PROVIDER === "console") {
    return "console";
  }
  const hasMsg91 = Boolean(config.MSG91_AUTH_KEY && config.MSG91_TEMPLATE_ID);
  const hasPrimary = Boolean(
    config.SMS_PRIMARY_KEY && config.SMS_PRIMARY_SECRET,
  );
  const hasBackup = Boolean(config.SMS_BACKUP_SID && config.SMS_BACKUP_TOKEN);
  return hasMsg91 || hasPrimary || hasBackup ? "http" : "console";
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

  if (config.NODE_ENV === "production") {
    if (config.EMAIL_TRANSPORT === "console") {
      logger.warn(
        "EMAIL_TRANSPORT is 'console' in production; no email will be delivered",
      );
    }
    if (smsTransport === "console") {
      logger.warn(
        "No SMS gateway credentials configured (MSG91, Vonage, or Twilio); no SMS will be delivered",
      );
    }
  }

  const emailConfig: EmailTransportConfig = {
    transport: config.EMAIL_TRANSPORT,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.EMAIL_FROM,
  };

  const smsConfig: SmsTransportConfig = {
    provider: config.SMS_PROVIDER,
    transport: smsTransport,
    senderId: config.RP_NAME,
    msg91: {
      authKey: config.MSG91_AUTH_KEY,
      templateId: config.MSG91_TEMPLATE_ID,
      apiUrl: config.MSG91_API_URL,
    },
    primaryUrl: config.SMS_PRIMARY_URL,
    primaryKey: config.SMS_PRIMARY_KEY,
    primarySecret: config.SMS_PRIMARY_SECRET,
    backupUrl: config.SMS_BACKUP_URL,
    backupSid: config.SMS_BACKUP_SID,
    backupToken: config.SMS_BACKUP_TOKEN,
    backupFrom: config.SMS_BACKUP_FROM,
  };

  return {
    email: createEmailService({
      logger,
      config: emailConfig,
    }),
    sms: createSmsService({
      logger,
      config: smsConfig,
    }),
    storage: new S3StorageService({
      endpoint: config.STORAGE_ENDPOINT,
      publicBaseUrl: config.CDN_URL,
      cdnSigningSecret: config.CDN_SIGNING_SECRET,
      cdnTokenTtlSeconds: config.CDN_TOKEN_TTL_SECONDS,
      cdnHlsTokenTtlSeconds: config.CDN_HLS_TOKEN_TTL_SECONDS,
      cdnPublicFolders: config.CDN_PUBLIC_FOLDERS,
      requireVisibilityPrefix: true,
      region: config.STORAGE_REGION,
      accessKeyId: config.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
      bucket: config.STORAGE_BUCKET,
      forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
    }),
    videoDispatch: createVideoDispatchService({
      strategy: config.VIDEO_DISPATCH_STRATEGY,
      config,
      logger,
      triggerUrl: config.FLEET_MANAGER_TRIGGER_URL,
      lambdaName: config.PROBE_LAMBDA_NAME || config.FLEET_MANAGER_LAMBDA_NAME,
    }),
    config,
    paymentGateway: createPaymentGateway(config),
    courseStaticPages: createCourseStaticPageRefreshService({
      githubToken: config.COURSE_STATIC_REFRESH_GITHUB_TOKEN,
      repository: config.COURSE_STATIC_REFRESH_REPOSITORY,
      ref: config.COURSE_STATIC_REFRESH_REF,
      workflow: config.COURSE_STATIC_REFRESH_WORKFLOW,
      logger,
    }),
  };
}
