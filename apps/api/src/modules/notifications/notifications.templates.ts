import { formatMoney, googleCalendarUrl } from "@veolms/contracts";
import {
  discussionMentionEmail,
  discussionReplyEmail,
  escapeHtml,
  purchaseConfirmedEmail,
  type EmailContent,
  type PurchaseEmailItem,
} from "@veolms/services/email";

import { siteSettings } from "@veolms/config";
import { config } from "../../config.ts";
import { clampText } from "../../lib/text.ts";

/** Limits of `notificationSchema` in @veolms/contracts. */
export const NOTIFICATION_TITLE_MAX = 255;
export const NOTIFICATION_BODY_MAX = 2000;
import type {
  NotificationTemplateData,
  NotificationTemplateKey,
  PurchaseItemTemplateData,
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
  return path ? new URL(path, siteSettings(config).webUrl).toString() : null;
}

// Every email says where its notifications are controlled; none did, so
// the only way to stop them was to find the settings page unprompted.
function settingsPageUrl(): string {
  return new URL(
    "/settings/notifications",
    siteSettings(config).webUrl,
  ).toString();
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

/** "Wed, 12 Nov 2026, 7:00 PM IST", in the session's own time zone. */
function workshopWhenLabel(data: NotificationTemplateData): string | null {
  const startsAt = optionalString(data, "startsAt");
  const timeZone = optionalString(data, "timeZone") ?? "Asia/Kolkata";
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toUTCString();
  }
}

/**
 * The purchase email with what to open next for each item and the
 * creator's welcome (`purchaseItems`, set by the payment.completed
 * handler). Null when the order's items were not looked up: the plain
 * receipt goes out instead.
 */
function purchaseEmail(
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand,
): EmailContent | null {
  const raw = optionalString(data, "purchaseItems");
  if (!raw) return null;
  let parsed: PurchaseItemTemplateData[];
  try {
    parsed = JSON.parse(raw) as PurchaseItemTemplateData[];
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const items: PurchaseEmailItem[] = parsed.map((item) => {
    const actionPath =
      item.kind === "course" && item.courseKey
        ? `/learn/${encodeURIComponent(item.courseKey)}`
        : item.kind === "workshop" && item.workshopSlug
          ? `/workshops/${item.workshopSlug}`
          : null;
    return {
      title: item.title,
      actionLabel:
        item.kind === "course"
          ? "Start learning"
          : item.kind === "workshop"
            ? "View workshop"
            : null,
      actionUrl: absoluteUrl(actionPath),
      whenLabel: item.startsAt
        ? workshopWhenLabel({
            startsAt: item.startsAt,
            ...(item.timeZone ? { timeZone: item.timeZone } : {}),
          })
        : null,
      welcomeMessage: item.welcomeMessage ?? null,
      welcomeLink:
        item.welcomeLinkLabel && item.welcomeLinkUrl
          ? { label: item.welcomeLinkLabel, url: item.welcomeLinkUrl }
          : null,
    };
  });
  const totalAmount = numberValue(data, "totalAmount");
  return purchaseConfirmedEmail({
    academyName: brand.name,
    logoUrl: brand.logoUrl,
    firstName: optionalString(data, "firstName") ?? "",
    orderNumber: stringValue(data, "orderNumber"),
    totalLabel:
      totalAmount > 0
        ? formatMoney(totalAmount, { currency: stringValue(data, "currency") })
        : null,
    orderUrl: absoluteUrl(deepLink),
    items,
    settingsUrl: settingsPageUrl(),
  });
}

/**
 * The registration email: when it is, where to open it, and one-click
 * "Add to Google Calendar". The .ics file is on the workshop page, where
 * the download can check that the reader is the registrant.
 */
function workshopRegisteredEmail(
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand,
): EmailContent {
  const title = stringValue(data, "workshopTitle");
  const when = workshopWhenLabel(data);
  const startsAt = optionalString(data, "startsAt");
  const endsAt = optionalString(data, "endsAt");
  const sessionCount = numberValue(data, "sessionCount");
  const pageUrl = absoluteUrl(deepLink);
  const calendarUrl =
    startsAt && endsAt
      ? googleCalendarUrl({
          title,
          startsAt,
          endsAt,
          ...(pageUrl
            ? { details: `Join from ${pageUrl}`, location: pageUrl }
            : {}),
        })
      : null;
  const subject = `You're registered: ${title}`;
  const lines = [
    `You're registered for ${title}.`,
    when
      ? sessionCount > 1
        ? `First session: ${when} (${sessionCount} sessions in all).`
        : `When: ${when}.`
      : null,
    "The Join button appears on the workshop page 15 minutes before the start. We'll remind you a day before and an hour before.",
  ].filter((line): line is string => Boolean(line));
  const settingsUrl = settingsPageUrl();
  const text = [
    ...lines,
    pageUrl ? `\nOpen the workshop: ${pageUrl}` : null,
    calendarUrl ? `Add to Google Calendar: ${calendarUrl}` : null,
    `\nManage which emails you receive: ${settingsUrl}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const html = `<div style="font-family: sans-serif; line-height: 1.5; color: #222;"><h2>${escapeHtml(subject)}</h2>${lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}${
    pageUrl
      ? `<p style="margin-top: 20px;"><a href="${escapeHtml(pageUrl)}">Open the workshop</a></p>`
      : ""
  }${
    calendarUrl
      ? `<p><a href="${escapeHtml(calendarUrl)}">Add to Google Calendar</a></p>`
      : ""
  }<p style="margin-top: 28px; font-size: 12px; color: #777;">You can choose which emails you receive in your <a href="${escapeHtml(settingsUrl)}" style="color: #777;">notification settings</a>.</p></div>`;
  return { subject, text, html };
}

/** The three reminders: a day before, an hour before, and when it starts. */
function workshopReminderEmail(
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand,
): EmailContent {
  const title = stringValue(data, "workshopTitle");
  const sessionTitle = optionalString(data, "sessionTitle");
  const when = workshopWhenLabel(data);
  const window = optionalString(data, "window");
  const pageUrl = absoluteUrl(deepLink);
  const what = sessionTitle ? `${title} — ${sessionTitle}` : title;
  const subject =
    window === "now"
      ? `Live now: ${title}`
      : window === "hour"
        ? `Starting in an hour: ${title}`
        : `Tomorrow: ${title}`;
  const lines = [
    window === "now"
      ? `${what} has started. Open the workshop page and press Join.`
      : window === "hour"
        ? `${what} starts in about an hour${when ? ` (${when})` : ""}. The Join button appears on the workshop page 15 minutes before the start.`
        : `${what} is tomorrow${when ? `: ${when}` : ""}.`,
  ];
  const settingsUrl = settingsPageUrl();
  const text = [
    ...lines,
    pageUrl ? `\nOpen the workshop: ${pageUrl}` : null,
    `\nManage which emails you receive: ${settingsUrl}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const html = `<div style="font-family: sans-serif; line-height: 1.5; color: #222;"><h2>${escapeHtml(subject)}</h2>${lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}${
    pageUrl
      ? `<p style="margin-top: 20px;"><a href="${escapeHtml(pageUrl)}">${window === "now" ? "Join now" : "Open the workshop"}</a></p>`
      : ""
  }<p style="margin-top: 28px; font-size: 12px; color: #777;">You can choose which emails you receive in your <a href="${escapeHtml(settingsUrl)}" style="color: #777;">notification settings</a>.</p></div>`;
  void brand;
  return { subject, text, html };
}

export function renderNotificationTemplate(
  templateKey: NotificationTemplateKey,
  data: NotificationTemplateData,
  deepLink: string | null,
  brand: NotificationEmailBrand = {
    name: siteSettings(config).name,
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
        body: `A new passkey was added to your ${siteSettings(config).name} account.`,
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
        body: `Your ${siteSettings(config).name} account has been deactivated and all active sessions were signed out. If you did not request this change, contact support immediately.`,
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
    case "access.validity_extended": {
      const until = stringValue(data, "validUntil");
      inApp = {
        title: `Your access to ${stringValue(data, "courseTitle")} was extended`,
        body: until
          ? `You can keep learning until ${until}.`
          : "You now have lifetime access to it.",
      };
      break;
    }
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
    case "workshop.registered": {
      const workshopTitle = stringValue(data, "workshopTitle");
      const when = workshopWhenLabel(data);
      inApp = {
        title: "You're registered",
        body: when
          ? `${workshopTitle} · ${when}. We'll remind you before it starts.`
          : `${workshopTitle}. We'll remind you before it starts.`,
      };
      break;
    }
    case "workshop.reminder": {
      const workshopTitle = stringValue(data, "workshopTitle");
      const when = workshopWhenLabel(data);
      const window = optionalString(data, "window");
      inApp =
        window === "now"
          ? {
              title: "Live now",
              body: `${workshopTitle} has started. Open the workshop page and press Join.`,
            }
          : window === "hour"
            ? {
                title: "Starting in an hour",
                body: when
                  ? `${workshopTitle} starts at ${when}. The Join button appears 15 minutes before.`
                  : `${workshopTitle} starts in about an hour.`,
              }
            : {
                title: "Tomorrow: your workshop",
                body: when
                  ? `${workshopTitle} is on ${when}.`
                  : `${workshopTitle} is tomorrow.`,
              };
      break;
    }
    case "workshop.recording_ready": {
      const workshopTitle = stringValue(data, "workshopTitle");
      const sessionTitle = optionalString(data, "sessionTitle");
      inApp = {
        title: "Recording is ready",
        body: sessionTitle
          ? `${workshopTitle} — ${sessionTitle}: watch the recording on the workshop page.`
          : `${workshopTitle}: watch the recording on the workshop page.`,
      };
      break;
    }
    case "workshop.announced": {
      const workshopTitle = stringValue(data, "workshopTitle");
      const when = workshopWhenLabel(data);
      const viaCourse = optionalString(data, "audience") === "course";
      const courseTitle = optionalString(data, "courseTitle");
      inApp = {
        title: "New workshop",
        body: [
          when ? `${workshopTitle} · ${when}.` : `${workshopTitle}.`,
          viaCourse
            ? `It is included with ${courseTitle || "your course"}; the Join button appears on its page.`
            : optionalString(data, "free") === "yes"
              ? "Free for you; the Join button appears on its page."
              : "Get a seat on its page.",
        ].join(" "),
      };
      break;
    }
    case "workshop.updated": {
      const workshopTitle = stringValue(data, "workshopTitle");
      const change = optionalString(data, "change");
      if (change === "cancelled") {
        const reason = optionalString(data, "reason");
        const refunding = optionalString(data, "refunding") === "yes";
        inApp = {
          title: "Workshop cancelled",
          body: [
            reason
              ? `${workshopTitle} was cancelled: ${reason}`
              : `${workshopTitle} was cancelled.`,
            refunding ? "Your payment is being refunded." : null,
          ]
            .filter(Boolean)
            .join(" "),
        };
      } else {
        const when = workshopWhenLabel(data);
        inApp = {
          title: "Workshop time changed",
          body: when
            ? `${workshopTitle} now starts ${when}. Your calendar entry may need updating.`
            : `${workshopTitle} has a new schedule. See the workshop page.`,
        };
      }
      break;
    }
    case "email.unsubscribed": {
      const name = stringValue(data, "name");
      const email = optionalString(data, "email");
      inApp = {
        title: "A learner unsubscribed",
        body: `${name}${email ? ` (${email})` : ""} unsubscribed from "${stringValue(data, "groupLabel")}" emails. They will not get these emails again; in-app notices continue.`,
      };
      break;
    }
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
        : templateKey === "workshop.registered"
          ? workshopRegisteredEmail(data, deepLink, brand)
          : templateKey === "workshop.reminder"
            ? workshopReminderEmail(data, deepLink, brand)
            : ((templateKey === "purchase.completed"
                ? purchaseEmail(data, deepLink, brand)
                : null) ??
              emailContent(inApp.title, inApp.body, deepLink, brand)),
  };
}
