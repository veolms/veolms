import { escapeHtml } from "../../services/email/email.templates.ts";
import type { EmailContent } from "../../services/email/email.templates.ts";
import { config } from "../../config.ts";
import type {
  NotificationTemplateData,
  NotificationTemplateKey,
} from "./notifications.types.ts";

export interface RenderedNotificationTemplate {
  inApp: { title: string; body: string };
  email: EmailContent;
}

function stringValue(data: NotificationTemplateData, key: string): string {
  const value = data[key];
  if (typeof value !== "string") {
    throw new Error(`Notification template data is missing string "${key}".`);
  }
  return value;
}

function numberValue(data: NotificationTemplateData, key: string): number {
  const value = data[key];
  if (typeof value !== "number") {
    throw new Error(`Notification template data is missing number "${key}".`);
  }
  return value;
}

function stringListValue(
  data: NotificationTemplateData,
  key: string,
): readonly string[] {
  const value = data[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Notification template data is missing string list "${key}".`,
    );
  }
  return value;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function emailContent(
  subject: string,
  body: string,
  deepLink: string | null,
): EmailContent {
  const actionUrl = deepLink
    ? new URL(deepLink, config.WEB_URL).toString()
    : null;
  const action = actionUrl ? `\n\nOpen VeoLMS: ${actionUrl}` : "";
  const actionHtml = actionUrl
    ? `<p style="margin-top: 20px;"><a href="${escapeHtml(actionUrl)}">Open VeoLMS</a></p>`
    : "";
  return {
    subject,
    text: `${body}${action}`,
    html: `<div style="font-family: sans-serif; line-height: 1.5; color: #222;"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(body)}</p>${actionHtml}</div>`,
  };
}

export function renderNotificationTemplate(
  templateKey: NotificationTemplateKey,
  data: NotificationTemplateData,
  deepLink: string | null,
): RenderedNotificationTemplate {
  let inApp: RenderedNotificationTemplate["inApp"];

  switch (templateKey) {
    case "course.published": {
      const courseTitle = stringValue(data, "courseTitle");
      inApp = {
        title: "New course available",
        body: `${courseTitle} is now available.`,
      };
      break;
    }
    case "purchase.completed": {
      const orderNumber = stringValue(data, "orderNumber");
      const total = formatMoney(
        numberValue(data, "totalAmount"),
        stringValue(data, "currency"),
      );
      const itemTitles = stringListValue(data, "itemTitles");
      inApp = {
        title: "Purchase completed",
        body: `Order ${orderNumber} for ${itemTitles.join(", ")} was completed (${total}).`,
      };
      break;
    }
    case "payment.failed":
      inApp = {
        title: "Payment failed",
        body: `Payment for order ${stringValue(data, "orderNumber")} failed: ${stringValue(data, "reason")}`,
      };
      break;
    case "refund.completed":
      inApp = {
        title: "Refund completed",
        body: `${formatMoney(numberValue(data, "amount"), stringValue(data, "currency"))} was refunded for order ${stringValue(data, "orderNumber")}.`,
      };
      break;
    case "video.processing_completed":
      inApp = {
        title: "Video processing completed",
        body: `${stringValue(data, "filename")} is ready to use.`,
      };
      break;
    case "video.processing_failed":
      inApp = {
        title: "Video processing failed",
        body: `${stringValue(data, "filename")} could not be processed. ${stringValue(data, "error")}`,
      };
      break;
    case "auth.mfa_enabled":
      inApp = {
        title: "Multi-factor authentication enabled",
        body: "Multi-factor authentication was enabled for your account.",
      };
      break;
    case "auth.passkey_added":
      inApp = {
        title: "Passkey added",
        body: "A new passkey was added to your VeoLMS account.",
      };
      break;
    case "auth.session_revoked":
      inApp = {
        title: "Session revoked",
        body: "A signed-in session was revoked from your account.",
      };
      break;
    case "auth.account_deactivated":
      inApp = {
        title: "Account deactivated",
        body: "Your VeoLMS account has been deactivated and all active sessions were signed out. If you did not request this change, contact support immediately.",
      };
      break;
    case "user.mentioned":
      inApp = {
        title: `${stringValue(data, "actorName")} mentioned you`,
        body: stringValue(data, "context"),
      };
      break;
    case "certificate.generated":
      inApp = {
        title: "Certificate ready",
        body: `Your certificate for ${stringValue(data, "courseTitle")} is ready.`,
      };
      break;
  }

  return {
    inApp,
    email: emailContent(inApp.title, inApp.body, deepLink),
  };
}
