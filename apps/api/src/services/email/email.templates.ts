/**
 * Rendered message bodies. Templates stay pure functions of their inputs so
 * they can be asserted on directly, without standing up a transport.
 */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Escapes text before it is interpolated into an HTML body. Present values are
 * all system-generated today, but templates are the one place user-supplied
 * strings (display names, academy names) will eventually land.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Wraps body markup in the shared shell so every message renders alike. */
function layout(heading: string, bodyHtml: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
    'max-width:480px;margin:0 auto;padding:24px;color:#111827">',
    `<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    bodyHtml,
    '<p style="font-size:12px;color:#6b7280;margin-top:24px">',
    "If you did not request this email you can safely ignore it.",
    "</p></div>",
  ].join("");
}

export interface OtpVerificationInput {
  code: string;
  expiresInMinutes: number;
  academyName: string;
}

/**
 * The one-time passcode message used by both login and registration. The
 * validity window is passed in rather than hardcoded so the copy can never
 * drift from the expiry the API actually enforces.
 */
export function otpVerificationEmail({
  code,
  expiresInMinutes,
  academyName,
}: OtpVerificationInput): EmailContent {
  const validity = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;

  return {
    subject: `${academyName} verification code`,
    text:
      `Your ${academyName} verification code is: ${code}\n\n` +
      `This code is valid for ${validity}.\n\n` +
      `If you did not request this code you can safely ignore this email.`,
    html: layout(
      `Your ${academyName} verification code`,
      [
        '<p style="font-size:14px;margin:0 0 16px">Use this code to continue signing in:</p>',
        '<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px">',
        escapeHtml(code),
        "</p>",
        `<p style="font-size:14px;margin:0">This code expires in ${escapeHtml(validity)}.</p>`,
      ].join(""),
    ),
  };
}
