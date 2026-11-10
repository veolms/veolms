/**
 * Rendered message bodies. Templates stay pure functions of their inputs.
 */

import {
  button,
  colors,
  divider,
  fontStack,
  escapeHtml,
  heading,
  layout,
  paragraph,
  quotedMessage,
  smallPrint,
  type EmailContent,
} from "./email.layout.ts";

export { escapeHtml, type EmailContent } from "./email.layout.ts";

/**
 * Sent in place of a sign-in code when the address belongs to a deactivated
 * account. The sign-in screen answers the same for every address, so this
 * message, which only the owner of the address reads, is how they learn
 * why no code arrived and where to turn.
 */
export function deactivatedAccountSignInEmail({
  academyName,
  logoUrl = null,
}: {
  academyName: string;
  /** The academy's logo (see `brandMark`); its name stands in without one. */
  logoUrl?: string | null;
}): EmailContent {
  const intro = `Someone asked to sign in to ${academyName} with this email address.`;
  const reason =
    "The account for this address is deactivated, so no sign-in code was sent.";
  const recovery = `To use the account again, contact the ${academyName} team and ask for it to be reactivated.`;
  const title = `Your ${academyName} account is deactivated`;

  return {
    subject: title,
    text:
      `${intro}

${reason}

${recovery}

` + "If this was not you, no action is needed.",
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: "No sign-in code was sent. Here is why.",
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        paragraph(escapeHtml(reason)),
        paragraph(escapeHtml(recovery), { last: true }),
        divider(),
        smallPrint("If this was not you, no action is needed."),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because a sign-in was requested for this address.`,
    }),
  };
}

/**
 * Sent to the account's previous email address (and for a new number, to
 * its email) once the learner changed it, so the real owner hears of a
 * change they did not make. Neither value is spelled out in full.
 */
export function contactChangedEmail({
  academyName,
  logoUrl = null,
  channel,
  newValueMasked,
}: {
  academyName: string;
  logoUrl?: string | null;
  channel: "email" | "phone";
  /** The new value, partly hidden ("n*****@getgtm.ai", "+91 •••••• 3210"). */
  newValueMasked: string;
}): EmailContent {
  const what = channel === "email" ? "email address" : "mobile number";
  const title = `Your ${academyName} ${what} was changed`;
  const intro = `The ${what} on your ${academyName} account was changed to ${newValueMasked}. Other devices were signed out.`;
  const notYou = `If you did not make this change, contact the ${academyName} team straight away.`;

  return {
    subject: title,
    text: `${intro}\n\n${notYou}\n\nIf this was you, no action is needed.`,
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: intro,
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        paragraph(escapeHtml(notYou), { last: true }),
        divider(),
        smallPrint("If this was you, no action is needed."),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because your account's ${what} was changed.`,
    }),
  };
}

export interface OtpVerificationInput {
  code: string;
  expiresInMinutes: number;
  academyName: string;
  /** The academy's logo (see `brandMark`); its name stands in without one. */
  logoUrl?: string | null;
}

/**
 * The one-time passcode message used by both login and registration.
 *
 * Gmail (and Apple Mail, Outlook) offer a "Copy code" button on messages
 * they recognise as a verification code. There is no markup that asks for
 * it; they read the message. So the code is in the subject and the inbox
 * preview, the text version opens with "Your … verification code is
 * <code>", and in the HTML the six digits are one run of plain text under a
 * "Verification code" label, never an image or a box per digit, which those
 * readers do not recognise.
 */
export function otpVerificationEmail({
  code,
  expiresInMinutes,
  academyName,
  logoUrl = null,
}: OtpVerificationInput): EmailContent {
  const validity = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
  const safeCode = escapeHtml(code);

  // The digits are spread apart for reading. The same space after the last
  // one is given back on the left, so the code stays centred.
  const codePanel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 16px">
<tr><td align="center" bgcolor="${colors.panel}" style="background-color:${colors.panel};border:1px solid ${colors.panelBorder};border-radius:14px;padding:22px 16px">
<div style="font-size:12px;line-height:16px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${colors.muted};margin:0 0 10px">Verification code</div>
<div style="font-family:${fontStack};font-size:38px;line-height:44px;font-weight:800;letter-spacing:10px;padding-left:10px;color:${colors.text};font-variant-numeric:tabular-nums">${safeCode}</div>
</td></tr>
</table>`;

  return {
    subject: `${code} is your ${academyName} verification code`,
    text:
      `Your ${academyName} verification code is ${code}\n\n` +
      `Enter it on the sign-in screen to continue. It expires in ${validity}.\n\n` +
      `Didn't ask for this code? You can ignore this email. No one can sign in without it, so never share it with anyone.`,
    html: layout({
      academyName,
      logoUrl,
      title: `${academyName} verification code`,
      preheader: `Your verification code is ${code}. It expires in ${validity}.`,
      bodyHtml: [
        heading("Your verification code"),
        paragraph(
          `Enter this code on the ${escapeHtml(academyName)} sign-in screen to continue.`,
          { last: true },
        ),
        codePanel,
        `<p style="margin:0;font-size:13px;line-height:20px;color:${colors.muted};text-align:center">Expires in <strong style="color:${colors.text};font-weight:600">${escapeHtml(validity)}</strong></p>`,
        divider(),
        smallPrint(
          `<strong style="color:${colors.muted};font-weight:600">Didn&#39;t ask for this code?</strong> You can ignore this email. No one can sign in without it, so never share it with anyone, ${escapeHtml(academyName)} staff included.`,
        ),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because a sign-in code was requested for this address.`,
    }),
  };
}

function roleList(roleNames: readonly string[]): string {
  return roleNames.length === 0 ? "a team role" : roleNames.join(", ");
}

export interface TeamMemberAddedInput {
  academyName: string;
  logoUrl?: string | null;
  /** Who made the change, when known. */
  addedByName: string | null;
  roleNames: readonly string[];
  /** Where the person continues: the app's sign-in or workspace page. */
  openUrl: string;
}

/**
 * Sent when an existing account is put on the team. Nothing to accept: the
 * roles already apply, and the next sign-in asks for two-factor setup.
 */
export function teamMemberAddedEmail({
  academyName,
  logoUrl = null,
  addedByName,
  roleNames,
  openUrl,
}: TeamMemberAddedInput): EmailContent {
  const title = `You've been added to the ${academyName} team`;
  const who = addedByName ? `${addedByName} added you` : "You were added";
  const intro = `${who} to the ${academyName} team as ${roleList(roleNames)}.`;
  const next =
    "Your new access applies the next time you open the academy. Team members sign in with two-factor verification, so you may be asked to set it up.";

  return {
    subject: title,
    text: `${intro}\n\n${next}\n\nOpen ${academyName}: ${openUrl}\n\nIf you did not expect this, contact the ${academyName} team.`,
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: intro,
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        paragraph(escapeHtml(next), { last: true }),
        button(openUrl, `Open ${academyName}`),
        divider(),
        smallPrint(
          `If you did not expect this, contact the ${escapeHtml(academyName)} team.`,
        ),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because your account was added to its team.`,
    }),
  };
}

export interface TeamInvitationInput {
  academyName: string;
  logoUrl?: string | null;
  invitedByName: string | null;
  roleNames: readonly string[];
  /** The inviter's own words, shown as typed. */
  message: string | null;
  acceptUrl: string;
  expiresInDays: number;
}

/** An invitation to join the team; the link opens the Accept page. */
export function teamInvitationEmail({
  academyName,
  logoUrl = null,
  invitedByName,
  roleNames,
  message,
  acceptUrl,
  expiresInDays,
}: TeamInvitationInput): EmailContent {
  const title = `Join the ${academyName} team`;
  const who = invitedByName
    ? `${invitedByName} invited you`
    : "You have been invited";
  const intro = `${who} to join the ${academyName} team as ${roleList(roleNames)}.`;
  const validity = `This invitation expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}. Sign in with this email address to accept it.`;

  return {
    subject: invitedByName
      ? `${invitedByName} invited you to the ${academyName} team`
      : title,
    text:
      `${intro}\n\n` +
      (message ? `"${message}"\n\n` : "") +
      `Accept the invitation: ${acceptUrl}\n\n${validity}\n\n` +
      "If you did not expect this, you can ignore this email.",
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: intro,
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        message ? quotedMessage(message) : "",
        button(acceptUrl, "Accept invitation"),
        paragraph(escapeHtml(validity), { last: true }),
        divider(),
        smallPrint("If you did not expect this, you can ignore this email."),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because someone on its team invited this address.`,
    }),
  };
}

export interface TeamPreapprovedInput {
  academyName: string;
  logoUrl?: string | null;
  addedByName: string | null;
  roleNames: readonly string[];
  message: string | null;
  signInUrl: string;
  email: string;
  expiresInDays: number;
}

/**
 * Sent when someone is added by email before they have an account (or
 * before they have signed in with it). Nothing to accept: signing in with
 * this address is enough.
 */
export function teamPreapprovedEmail({
  academyName,
  logoUrl = null,
  addedByName,
  roleNames,
  message,
  signInUrl,
  email,
  expiresInDays,
}: TeamPreapprovedInput): EmailContent {
  const title = `You've been added to the ${academyName} team`;
  const who = addedByName ? `${addedByName} added you` : "You were added";
  const intro = `${who} to the ${academyName} team as ${roleList(roleNames)}.`;
  const next = `Sign in with ${email} within ${expiresInDays} day${expiresInDays === 1 ? "" : "s"} and your access is ready. Team members sign in with two-factor verification, so you will be asked to set it up.`;

  return {
    subject: title,
    text:
      `${intro}\n\n` +
      (message ? `"${message}"\n\n` : "") +
      `${next}\n\nSign in: ${signInUrl}\n\nIf you did not expect this, you can ignore this email.`,
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: intro,
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        message ? quotedMessage(message) : "",
        paragraph(escapeHtml(next), { last: true }),
        button(signInUrl, `Sign in to ${academyName}`),
        divider(),
        smallPrint("If you did not expect this, you can ignore this email."),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because someone on its team added this address.`,
    }),
  };
}

export interface StudentAddedInput {
  academyName: string;
  logoUrl?: string | null;
  /** Who added the student, when known. */
  addedByName: string | null;
  /** The address the account was made with: the one to sign in with. */
  email: string;
  /** Titles of the courses opened with the account, if any. */
  courseTitles: readonly string[];
  signInUrl: string;
}

/**
 * Sent when staff create a student account by hand. Nothing to accept or
 * set up: signing in with this address and the code sent to it is enough.
 */
export function studentAddedEmail({
  academyName,
  logoUrl = null,
  addedByName,
  email,
  courseTitles,
  signInUrl,
}: StudentAddedInput): EmailContent {
  const title = `Welcome to ${academyName}`;
  const who = addedByName ? `${addedByName} created` : "We created";
  const intro = `${who} a ${academyName} account for you.`;
  const courses =
    courseTitles.length === 0
      ? null
      : `You have access to ${courseTitles.length === 1 ? "this course" : "these courses"}:`;
  const next = `To sign in, enter ${email} and the code we email you. There is no password to remember.`;

  const courseListHtml = courses
    ? paragraph(escapeHtml(courses)) +
      `<ul style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:24px">${courseTitles
        .map((courseTitle) => `<li>${escapeHtml(courseTitle)}</li>`)
        .join("")}</ul>`
    : "";

  return {
    subject: title,
    text:
      `${intro}\n\n` +
      (courses
        ? `${courses}\n${courseTitles.map((courseTitle) => `- ${courseTitle}`).join("\n")}\n\n`
        : "") +
      `${next}\n\nSign in: ${signInUrl}\n\nIf you did not expect this, you can ignore this email.`,
    html: layout({
      academyName,
      logoUrl,
      title,
      preheader: intro,
      bodyHtml: [
        heading(title),
        paragraph(escapeHtml(intro)),
        courseListHtml,
        paragraph(escapeHtml(next), { last: true }),
        button(signInUrl, `Sign in to ${academyName}`),
        divider(),
        smallPrint("If you did not expect this, you can ignore this email."),
      ].join(""),
      footer: `Sent by ${escapeHtml(academyName)} because an account was created for this address.`,
    }),
  };
}
