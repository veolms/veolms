import { formatMoney } from "@veolms/contracts";
import {
  discussionMentionEmail,
  discussionReplyEmail,
  escapeHtml,
  type EmailContent,
} from "@veolms/services/email";

import { config } from "../../config.ts";
import { clampText } from "../../lib/text.ts";

/** Limits of `notificationSchema` in @veolms/contracts. */
export const NOTIFICATION_TITLE_MAX = 255;
export const NOTIFICATION_BODY_MAX = 2000;
import type {
  NotificationTemplateData,
  NotificationTemplateKey,
} from "./notifications.types.ts";

/** The academy as its emails show it: its name, and its logo when set. */
export interface NotificationEmailBrand {
  name: string;
  logoUrl: string | null;
}

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

function optionalString(
  data: NotificationTemplateData,
  key: string,
): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function absoluteUrl(path: string | null): string | null {
  return path ? new URL(path, config.WEB_URL).toString() : null;
}

// Every email says where its notifications are controlled; none did, so
// the only way to stop them was to find the settings page unprompted.
function settingsPageUrl(): string {
  return new URL("/settings/notifications", config.WEB_URL).toString();
}

/**
 * The lecture link of a discussion email, marked as opened from an email:
 * the page then says so above the highlighted comment, with a way to clear
 * the highlight.
 */
function discussionEmailUrl(deepLink: string | null): string | null {
  const url = absoluteUrl(deepLink);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.searchParams.get("focus") === "comment") {
    parsed.searchParams.set("via", "email");
  }
  return parsed.toString();
}

/** "Nov 2, 2026", for when a comment was posted, or null when unknown. */
function postedDateLabel(data: NotificationTemplateData): string | null {
  const value = optionalString(data, "occurredAt");
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function emailContent(
  subject: string,
  body: string,
  deepLink: string | null,
  brand: NotificationEmailBrand,
): EmailContent {
  const actionUrl = absoluteUrl(deepLink);
  const actionLabel = `Open ${brand.name}`;
  const action = actionUrl ? `\n\n${actionLabel}: ${actionUrl}` : "";
  const actionHtml = actionUrl
    ? `<p style="margin-top: 20px;"><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel)}</a></p>`
    : "";
  const settingsUrl = settingsPageUrl();
  const footer = `\n\nManage which emails you receive: ${settingsUrl}`;
  const footerHtml = `<p style="margin-top: 28px; font-size: 12px; color: #777;">You can choose which emails you receive in your <a href="${escapeHtml(settingsUrl)}" style="color: #777;">notification settings</a>.</p>`;
  return {
    subject,
    text: `${body}${action}${footer}`,
    html: `<div style="font-family: sans-serif; line-height: 1.5; color: #222;"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(body)}</p>${actionHtml}${footerHtml}</div>`,
  };
}

/** "hide" → "hidden": the notice read "Your thread was hide". */
function moderationActionPhrase(action: string): string {
  const phrases: Record<string, string> = {
    hide: "hidden",
    delete: "deleted",
    lock: "locked",
    make_private: "made private",
  };
  return phrases[action] ?? action;
}

/**
 * The mention and reply emails show the comment itself, where it is, and a
 * button that opens the lecture with it highlighted.
 */
function discussionEmail(
  templateKey: "user.mentioned" | "discussion.reply_created",
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand,
): EmailContent {
  const common = {
    academyName: brand.name,
    logoUrl: brand.logoUrl,
    actorName: stringValue(data, "actorName"),
    lessonTitle: optionalString(data, "lessonTitle"),
    courseTitle: optionalString(data, "courseTitle"),
    timeLabel: postedDateLabel(data),
    actionUrl: discussionEmailUrl(deepLink),
    settingsUrl: settingsPageUrl(),
  };
  if (templateKey === "user.mentioned") {
    return discussionMentionEmail({
      ...common,
      commentText: stringValue(data, "context"),
    });
  }
  return discussionReplyEmail({
    ...common,
    replyText: stringValue(data, "replySnippet"),
    originalText: optionalString(data, "originalSnippet"),
    recipientRole:
      optionalString(data, "recipientRole") === "follower"
        ? "follower"
        : "author",
  });
}

export function renderNotificationTemplate(
  templateKey: NotificationTemplateKey,
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand = {
    name: config.ACADEMY_NAME,
    logoUrl: null,
  },
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
      // payment.completed carries the stored order total, in minor units
      // like every transacted amount.
      const total = formatMoney(numberValue(data, "totalAmount"), {
        currency: stringValue(data, "currency"),
      });
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
        body: `${formatMoney(numberValue(data, "amount"), { currency: stringValue(data, "currency") })} was refunded for order ${stringValue(data, "orderNumber")}.`,
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
        body: `A new passkey was added to your ${config.ACADEMY_NAME} account.`,
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
        body: `Your ${config.ACADEMY_NAME} account has been deactivated and all active sessions were signed out. If you did not request this change, contact support immediately.`,
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
    case "discussion.reply_created": {
      // Says who replied. Older events (without `recipientRole`) keep their
      // title, which named the discussion.
      const role = optionalString(data, "recipientRole");
      const actorName = stringValue(data, "actorName");
      inApp = {
        title:
          role === "author"
            ? `${actorName} replied to your comment`
            : role === "follower"
              ? `${actorName} replied in a discussion you follow`
              : `New reply on ${stringValue(data, "threadTitle")}`,
        body: `${actorName}: ${stringValue(data, "replySnippet")}`,
      };
      break;
    }
    case "discussion.answer_accepted":
      inApp = {
        title: "Your answer was accepted!",
        body: `${stringValue(data, "actorName")} accepted your answer on "${stringValue(data, "threadTitle")}".`,
      };
      break;
    case "moderation.content_moderated":
      inApp = {
        title: "Content moderation update",
        body: `Your ${stringValue(data, "contentType")} was ${moderationActionPhrase(stringValue(data, "action"))}${data.reason ? `: ${stringValue(data, "reason")}` : "."}`,
      };
      break;
    case "moderation.user_suspended":
      inApp = {
        title: "Discussion participation suspended",
        body: `Your participation for ${stringValue(data, "scope")} has been suspended. Reason: ${stringValue(data, "reason")}`,
      };
      break;
    case "moderation.user_unsuspended":
      inApp = {
        title: "Discussion suspension lifted",
        body: "Your participation suspension has been lifted.",
      };
      break;
    case "moderation.report_resolved":
      inApp = {
        title: "Update on your report",
        body: `Your report regarding a ${stringValue(data, "targetType")} has been ${stringValue(data, "status")}${data.actionTaken ? ` (action: ${stringValue(data, "actionTaken")})` : "."}`,
      };
      break;
    case "chat.mentioned":
      inApp = {
        title: `${stringValue(data, "actorName")} mentioned you in ${stringValue(data, "roomTitle")}`,
        body: stringValue(data, "snippet"),
      };
      break;
    case "chat.platform_restriction": {
      const restriction = stringValue(data, "restriction");
      const action =
        restriction === "ban"
          ? "removed"
          : restriction === "no_direct"
            ? "turned off private chats for"
            : "muted";
      inApp = {
        title: `${stringValue(data, "actorName")} ${action} ${stringValue(data, "targetName")} in all chats`,
        body: `Reason: ${stringValue(data, "reason")}. Review or lift it in chat restrictions.`,
      };
      break;
    }
    case "support.reply_posted":
      inApp = {
        title: `Reply to your ${stringValue(data, "ticketKind") === "feedback" ? "feedback" : "report"} #${stringValue(data, "ticketNumber")}`,
        body: stringValue(data, "replySnippet"),
      };
      break;
    case "support.assigned":
      inApp = {
        title: `${stringValue(data, "assignedByName")} assigned ${stringValue(data, "ticketKind") === "feedback" ? "feedback" : "report"} #${stringValue(data, "ticketNumber")} to you`,
        body: stringValue(data, "ticketTitle"),
      };
      break;
    case "quiz.attempt_passed":
      inApp = {
        title: "Quiz Passed! 🎉",
        body: `You scored ${numberValue(data, "scorePercentage")}% on "${stringValue(data, "quizTitle")}" in ${stringValue(data, "courseTitle")}.`,
      };
      break;
    case "quiz.attempt_failed_final":
      inApp = {
        title: "Quiz Attempt Limit Reached",
        body: `You scored ${numberValue(data, "scorePercentage")}% on "${stringValue(data, "quizTitle")}". All ${numberValue(data, "maxAttempts")} attempts have been used.`,
      };
      break;
    case "quiz.assigned":
      inApp = {
        title: "New Quiz Available",
        body: `"${stringValue(data, "quizTitle")}" has been assigned to ${stringValue(data, "lessonTitle")} in ${stringValue(data, "courseTitle")}.`,
      };
      break;
    case "learning.goal_completed":
      inApp = {
        title: "Daily goal completed",
        body: `You hit your ${stringValue(data, "goalLabel")} learning goal today. Nice work!`,
      };
      break;
    case "learning.reminder": {
      const streakDays = numberValue(data, "streakDays");
      inApp =
        streakDays > 0
          ? {
              title: "Keep your streak alive",
              body: `You haven't learned today — your ${streakDays}-day streak is on the line. A quick session hits your ${stringValue(data, "goalLabel")} goal.`,
            }
          : {
              title: "Time to learn",
              body: `A quick session today keeps you on track for your ${stringValue(data, "goalLabel")} learning goal.`,
            };
      break;
    }
    case "learning.streak_milestone": {
      const streakDays = numberValue(data, "streakDays");
      inApp = {
        title: `${streakDays}-day learning streak!`,
        body: `You've learned ${streakDays} days in a row. Keep it going!`,
      };
      break;
    }
  }

  // Templates embed user-written text (a 255-character thread title, a list
  // of item titles), so the rendered strings can exceed what the
  // notification response schema allows — and one such row made every page
  // of that user's feed return 500.
  inApp = {
    title: clampText(inApp.title, NOTIFICATION_TITLE_MAX),
    body: clampText(inApp.body, NOTIFICATION_BODY_MAX),
  };

  return {
    inApp,
    email:
      templateKey === "user.mentioned" ||
      templateKey === "discussion.reply_created"
        ? discussionEmail(templateKey, data, deepLink, brand)
        : emailContent(inApp.title, inApp.body, deepLink, brand),
  };
}
