/**
 * Rendered message bodies. Templates stay pure functions of their inputs.
 */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Escapes text before it is interpolated into an HTML body.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The app's colours (the login card's): a navy page, a raised card, light
 * text and the indigo accent. Written out here because mail clients take
 * no stylesheets or variables, only inline styles.
 */
const colors = {
  page: "#0B0D12",
  card: "#151821",
  cardBorder: "#242936",
  panel: "#0F1218",
  panelBorder: "#3B4380",
  text: "#F3F4F6",
  muted: "#9CA3AF",
  faint: "#6B7280",
  accent: "#6E7CFF",
  /** The logo mark's purple (its "P"). */
  mark: "#795CED",
  divider: "#232733",
};

/** The wordmark's typeface, with close system fallbacks where it cannot load. */
const wordmarkFontStack =
  "'Nunito Variable',Nunito,'Segoe UI Rounded','SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

const fontStack =
  "Manrope,'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Space a client fills the inbox preview with after the preheader. */
const PREVIEW_PADDING = "&#847;&zwnj;&nbsp;".repeat(60);

/**
 * The academy's logo when one is set (a public https address, from the
 * academy's settings), else its name drawn the way the app's wordmark is:
 * the first letter in the accent, the rest in the text colour. The logo is
 * shown 32px tall; the file is best at twice that, for sharp phone screens.
 */
function brandMark(academyName: string, logoUrl: string | null): string {
  const name = academyName.trim() || "VeoLMS";
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" height="32" style="display:block;height:32px;width:auto;max-width:240px;border:0;outline:none;text-decoration:none;font-size:24px;line-height:32px;font-weight:700;color:${colors.text}">`;
  }
  // Without a logo: the name in the wordmark's own font (Nunito), its first
  // letter in the mark's purple. Drawn as text, not an inline SVG of the
  // mark: Gmail and Outlook remove SVG from messages, so the letter would
  // be missing there; a hosted logo is how the mark itself is shown.
  const first = escapeHtml(name.charAt(0));
  const rest = escapeHtml(name.slice(1));
  return `<span style="font-family:${wordmarkFontStack};font-size:26px;line-height:32px;font-weight:800;letter-spacing:-0.3px;color:${colors.text}"><span style="color:${colors.mark}">${first}</span>${rest}</span>`;
}

/**
 * The shared shell every message renders in: the navy page, the wordmark,
 * the card the message sits on and a footer line. Built from tables and
 * inline styles, which is what every mail client (Outlook included) lays
 * out the same. The page asks for the dark scheme, so clients that recolour
 * light messages in dark mode leave it alone.
 */
function layout({
  academyName,
  logoUrl,
  title,
  preheader,
  bodyHtml,
  footer,
}: {
  academyName: string;
  logoUrl: string | null;
  title: string;
  /** The line inbox lists show after the subject. */
  preheader: string;
  bodyHtml: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;family=Nunito:wght@800&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${colors.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}${PREVIEW_PADDING}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.page}" style="background-color:${colors.page}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:${fontStack}">
<tr><td style="padding:0 4px 20px">${brandMark(academyName, logoUrl)}</td></tr>
<tr><td bgcolor="${colors.card}" style="background-color:${colors.card};border:1px solid ${colors.cardBorder};border-radius:20px;padding:36px 32px">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:${colors.faint};text-align:center">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.3px;color:${colors.text}">${escapeHtml(text)}</h1>`;
}

function paragraph(html: string, { last = false } = {}): string {
  return `<p style="margin:0 0 ${last ? 0 : 14}px;font-size:15px;line-height:22px;color:${colors.muted}">${html}</p>`;
}

function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px"><tr><td style="height:1px;line-height:1px;font-size:0;background-color:${colors.divider}">&nbsp;</td></tr></table>`;
}

function smallPrint(html: string): string {
  return `<p style="margin:0;font-size:13px;line-height:20px;color:${colors.faint}">${html}</p>`;
}

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

/** A link styled as the app's primary button. `href` must be an https or http URL. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td bgcolor="${colors.accent}" style="background-color:${colors.accent};border-radius:12px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
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

function quotedMessage(message: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr><td style="border-left:3px solid ${colors.panelBorder};padding:4px 0 4px 14px;font-size:15px;line-height:22px;color:${colors.text};white-space:pre-line">${escapeHtml(message)}</td></tr></table>`;
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
