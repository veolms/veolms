/**
 * The shared pieces every email is built from: the colours, the page
 * layout, the wordmark and the text blocks. Plain tables and inline styles,
 * which every mail client (Outlook included) lays out the same.
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
export const colors = {
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

export const fontStack =
  "Manrope,'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Space a client fills the inbox preview with after the preheader. */
const PREVIEW_PADDING = "&#847;&zwnj;&nbsp;".repeat(60);

/**
 * The academy's logo when one is set (a public https address, from the
 * academy's settings), else its name drawn the way the app's wordmark is:
 * the first letter in the accent, the rest in the text colour. The logo is
 * shown 32px tall; the file is best at twice that, for sharp phone screens.
 */
export function brandMark(academyName: string, logoUrl: string | null): string {
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
export function layout({
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

export function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.3px;color:${colors.text}">${escapeHtml(text)}</h1>`;
}

export function paragraph(html: string, { last = false } = {}): string {
  return `<p style="margin:0 0 ${last ? 0 : 14}px;font-size:15px;line-height:22px;color:${colors.muted}">${html}</p>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px"><tr><td style="height:1px;line-height:1px;font-size:0;background-color:${colors.divider}">&nbsp;</td></tr></table>`;
}

export function smallPrint(html: string): string {
  return `<p style="margin:0;font-size:13px;line-height:20px;color:${colors.faint}">${html}</p>`;
}

/** A link styled as the app's primary button. `href` must be an https or http URL. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td bgcolor="${colors.accent}" style="background-color:${colors.accent};border-radius:12px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

export function quotedMessage(message: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr><td style="border-left:3px solid ${colors.panelBorder};padding:4px 0 4px 14px;font-size:15px;line-height:22px;color:${colors.text};white-space:pre-line">${escapeHtml(message)}</td></tr></table>`;
}
