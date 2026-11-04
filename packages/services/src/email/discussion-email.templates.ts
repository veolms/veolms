/**
 * The emails sent when someone mentions a learner in a lecture's discussion,
 * or replies to their comment. Each shows the comment itself, where it is
 * (the lecture and the course), and one button that opens the lecture with
 * that comment highlighted.
 *
 * Built like the other emails (email.layout.ts): tables and inline styles,
 * no web fonts that the text depends on, so Gmail, Outlook and phone mail
 * apps lay them out the same.
 */
import {
  button,
  colors,
  escapeHtml,
  heading,
  layout,
  smallPrint,
  type EmailContent,
} from "./email.layout.ts";

interface DiscussionEmailBase {
  academyName: string;
  /** The academy's logo (see `brandMark`); its name stands in without one. */
  logoUrl?: string | null;
  actorName: string;
  lessonTitle?: string | null;
  courseTitle?: string | null;
  /** When the comment or reply was posted, as shown ("Nov 2, 2026"). */
  timeLabel?: string | null;
  /** The lecture page that highlights the comment (an absolute URL). */
  actionUrl: string | null;
  /** The notification settings page (an absolute URL). */
  settingsUrl: string;
}

export interface DiscussionMentionEmailInput extends DiscussionEmailBase {
  /** The comment (or reply) the learner was mentioned in. */
  commentText: string;
}

export interface DiscussionReplyEmailInput extends DiscussionEmailBase {
  replyText: string;
  /** The comment that was replied to. */
  originalText?: string | null;
  /** "author": it was the learner's own comment. "follower": one they follow. */
  recipientRole: "author" | "follower";
}

/** About two lines of the card's width: the comment replied to is a reminder. */
const ORIGINAL_SNIPPET_MAX = 100;

const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;

function trimTo(text: string, max: number): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Escaped text with each @mention set in the accent, as the app shows it. */
function withMentions(text: string): string {
  return escapeHtml(text).replace(
    MENTION_PATTERN,
    (_match, before: string, username: string) =>
      `${before}<span style="color:${colors.accent};font-weight:700">@${username}</span>`,
  );
}

/** "On <lecture> · <course>", or whichever of the two is known. */
function placeLine({
  lessonTitle,
  courseTitle,
}: Pick<DiscussionEmailBase, "lessonTitle" | "courseTitle">): string | null {
  const parts = [lessonTitle?.trim(), courseTitle?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? `On ${parts.join(" · ")}` : null;
}

function tag(label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td bgcolor="#1E2240" style="background-color:#1E2240;border:1px solid ${colors.panelBorder};border-radius:999px;padding:4px 10px;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${colors.accent}">${escapeHtml(label)}</td></tr></table>`;
}

function placeHtml(line: string | null): string {
  return line
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:20px;color:${colors.muted}">${escapeHtml(line)}</p>`
    : `<div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>`;
}

/** The writer's initial on a round chip: no remote image to block or break. */
function avatar(name: string, size: number): string {
  const initial = escapeHtml((name.trim().charAt(0) || "?").toUpperCase());
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${colors.mark}" style="width:${size}px;height:${size}px;background-color:${colors.mark};border-radius:999px;font-size:${Math.round(size * 0.44)}px;line-height:${size}px;font-weight:700;color:#FFFFFF;text-align:center">${initial}</td></tr></table>`;
}

/**
 * A comment as the lecture page shows it: the writer, when, and the text.
 * `emphasis` is the one the email is about (outlined in the accent);
 * otherwise it is muted, a reminder of what was replied to.
 */
function commentCard({
  name,
  meta,
  bodyHtml,
  emphasis,
}: {
  name: string;
  meta: string | null;
  bodyHtml: string;
  emphasis: boolean;
}): string {
  const border = emphasis ? colors.accent : colors.cardBorder;
  const background = emphasis ? "#191D33" : colors.panel;
  const textColor = emphasis ? colors.text : colors.muted;
  const metaHtml = meta
    ? `<span style="font-size:12px;line-height:18px;color:${colors.faint}">&nbsp;·&nbsp;${escapeHtml(meta)}</span>`
    : "";
  // The comment replied to is labelled, not signed: it is the reader's own,
  // or one they follow, and an initial would say nothing more.
  const header = emphasis
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" valign="top" style="width:32px;padding-right:10px">${avatar(name, 32)}</td>
<td valign="middle" style="font-size:14px;line-height:20px;font-weight:700;color:${colors.text}">${escapeHtml(name)}${metaHtml}</td>
</tr></table>`
    : `<p style="margin:0;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${colors.faint}">${escapeHtml(name)}</p>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="background-color:${background};border:1px solid ${border};border-radius:14px"><tr><td style="padding:14px 16px">
${header}
<p style="margin:10px 0 0;font-size:15px;line-height:22px;color:${textColor};white-space:pre-line;word-break:break-word">${bodyHtml}</p>
</td></tr></table>`;
}

/** The short line that joins the comment replied to and the reply. */
function connector(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="31" style="width:31px;font-size:0;line-height:0">&nbsp;</td><td width="2" height="16" bgcolor="${colors.panelBorder}" style="width:2px;height:16px;background-color:${colors.panelBorder};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

function actionHtml(
  actionUrl: string | null,
  label: string,
  helper: string,
): string {
  if (!actionUrl) return "";
  return `${button(actionUrl, `${label} →`)}${smallPrint(escapeHtml(helper))}`;
}

function footerHtml(reason: string, settingsUrl: string): string {
  return `${escapeHtml(reason)}<br><a href="${escapeHtml(settingsUrl)}" style="color:${colors.muted};text-decoration:underline">Notification settings</a>`;
}

function textFooter(reason: string, settingsUrl: string): string {
  return `${reason}\nNotification settings: ${settingsUrl}`;
}

export function discussionMentionEmail(
  input: DiscussionMentionEmailInput,
): EmailContent {
  const { academyName, actorName, actionUrl, settingsUrl } = input;
  const title = `${actorName} mentioned you in a discussion`;
  const place = placeLine(input);
  const helper = "Opens the lecture and scrolls to this comment, highlighted.";
  const reason = `You're getting this because ${actorName} mentioned you on ${academyName}.`;
  const comment = input.commentText.trim();

  const text = [
    title,
    place,
    "",
    `${actorName}: ${comment}`,
    "",
    actionUrl ? `View comment: ${actionUrl}` : null,
    actionUrl ? helper : null,
    "",
    textFooter(reason, settingsUrl),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject: title,
    text,
    html: layout({
      academyName,
      logoUrl: input.logoUrl ?? null,
      title,
      preheader: trimTo(`${actorName}: ${comment}`, 120),
      bodyHtml: [
        tag("New mention"),
        heading(title),
        placeHtml(place),
        commentCard({
          name: actorName,
          meta: input.timeLabel ?? null,
          bodyHtml: withMentions(comment),
          emphasis: true,
        }),
        actionHtml(actionUrl, "View comment", helper),
      ].join(""),
      footer: footerHtml(reason, settingsUrl),
    }),
  };
}

export function discussionReplyEmail(
  input: DiscussionReplyEmailInput,
): EmailContent {
  const { academyName, actorName, actionUrl, settingsUrl } = input;
  const ownComment = input.recipientRole === "author";
  const title = ownComment
    ? `${actorName} replied to your comment`
    : `${actorName} replied in a discussion you follow`;
  const place = placeLine(input);
  const helper = ownComment
    ? "Opens the lecture with your comment expanded and this reply highlighted."
    : "Opens the lecture with the comment expanded and this reply highlighted.";
  const reason = ownComment
    ? `You're getting this because ${actorName} replied to your comment on ${academyName}.`
    : `You're getting this because you follow this discussion on ${academyName}.`;
  const reply = input.replyText.trim();
  const original = input.originalText?.trim()
    ? trimTo(input.originalText, ORIGINAL_SNIPPET_MAX)
    : null;

  const text = [
    title,
    place,
    "",
    original ? `${ownComment ? "Your comment" : "Comment"}: ${original}` : null,
    `${actorName}: ${reply}`,
    "",
    actionUrl ? `View reply: ${actionUrl}` : null,
    actionUrl ? helper : null,
    "",
    textFooter(reason, settingsUrl),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const originalHtml = original
    ? `${commentCard({
        name: ownComment ? "Your comment" : "Comment",
        meta: null,
        bodyHtml: escapeHtml(original),
        emphasis: false,
      })}${connector()}`
    : "";

  return {
    subject: title,
    text,
    html: layout({
      academyName,
      logoUrl: input.logoUrl ?? null,
      title,
      preheader: trimTo(`${actorName}: ${reply}`, 120),
      bodyHtml: [
        tag("New reply"),
        heading(title),
        placeHtml(place),
        originalHtml,
        commentCard({
          name: actorName,
          meta: input.timeLabel ?? null,
          bodyHtml: withMentions(reply),
          emphasis: true,
        }),
        actionHtml(actionUrl, "View reply", helper),
      ].join(""),
      footer: footerHtml(reason, settingsUrl),
    }),
  };
}
