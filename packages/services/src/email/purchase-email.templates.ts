/**
 * The email a buyer gets once a payment is confirmed: "You're in", one
 * button per thing bought (start the course, open the workshop), the
 * creator's welcome for it, the order's total, and a link to the order
 * page. The invoice PDF rides along as an attachment (added by the sender).
 *
 * Built like the other emails (email.layout.ts): tables and inline styles,
 * so Gmail, Outlook and phone mail apps lay it out the same.
 */
import {
  button,
  colors,
  divider,
  escapeHtml,
  heading,
  layout,
  paragraph,
  quotedMessage,
  smallPrint,
  type EmailContent,
} from "./email.layout.ts";

export interface PurchaseEmailItem {
  title: string;
  /** "Start learning", "View workshop"; null when there is nothing to open. */
  actionLabel: string | null;
  actionUrl: string | null;
  /** "Sat, 22 Nov · 7:00 PM IST", for a workshop's next session. */
  whenLabel?: string | null;
  /** The creator's welcome, the buyer's name already filled in. */
  welcomeMessage?: string | null;
  welcomeLink?: { label: string; url: string } | null;
}

export interface PurchaseConfirmedEmailInput {
  academyName: string;
  logoUrl?: string | null;
  firstName: string;
  orderNumber: string;
  /** "₹999", or null for an order that cost nothing. */
  totalLabel: string | null;
  /** The order page, with the receipt and the invoice. */
  orderUrl: string | null;
  items: PurchaseEmailItem[];
  settingsUrl: string;
}

function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function secondaryLink(href: string, label: string): string {
  return `<p style="margin:0 0 6px;font-size:14px;line-height:20px"><a href="${escapeHtml(href)}" style="color:${colors.accent};font-weight:700;text-decoration:none">${escapeHtml(label)} &rarr;</a></p>`;
}

export function purchaseConfirmedEmail(
  input: PurchaseConfirmedEmailInput,
): EmailContent {
  const { academyName, firstName, orderNumber, totalLabel, items } = input;
  const greeting = firstName.trim()
    ? `${firstName.trim()}, you're in!`
    : "You're in!";
  const one = items.length === 1 ? items[0] : null;
  const subject = one
    ? `You're in: ${one.title}`
    : `You're in: your order ${orderNumber}`;
  const summary = totalLabel
    ? `Your payment of ${totalLabel} was successful (order ${orderNumber}).`
    : `You're enrolled (order ${orderNumber}).`;
  const orderUrl = safeHref(input.orderUrl);
  const reason = `You're getting this because you bought from ${academyName}.`;

  const text = [
    greeting,
    summary,
    "",
    ...items.flatMap((item) => {
      const actionUrl = safeHref(item.actionUrl);
      const linkUrl = safeHref(item.welcomeLink?.url);
      return [
        item.title,
        item.whenLabel ? `When: ${item.whenLabel}` : null,
        item.welcomeMessage ? item.welcomeMessage : null,
        item.actionLabel && actionUrl
          ? `${item.actionLabel}: ${actionUrl}`
          : null,
        item.welcomeLink && linkUrl
          ? `${item.welcomeLink.label}: ${linkUrl}`
          : null,
        "",
      ];
    }),
    orderUrl ? `Your order and receipt: ${orderUrl}` : null,
    // Only a paid order has an invoice to attach.
    totalLabel ? "The invoice is attached to this email." : null,
    "",
    `${reason}\nNotification settings: ${input.settingsUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const itemsHtml = items
    .map((item, index) => {
      const actionUrl = safeHref(item.actionUrl);
      const linkUrl = safeHref(item.welcomeLink?.url);
      return [
        index > 0 ? divider() : "",
        `<p style="margin:0 0 4px;font-size:17px;line-height:24px;font-weight:700;color:${colors.text}">${escapeHtml(item.title)}</p>`,
        item.whenLabel ? smallPrint(escapeHtml(item.whenLabel)) : "",
        item.welcomeMessage ? quotedMessage(item.welcomeMessage) : "",
        item.actionLabel && actionUrl
          ? button(actionUrl, item.actionLabel)
          : "",
        item.welcomeLink && linkUrl
          ? secondaryLink(linkUrl, item.welcomeLink.label)
          : "",
      ].join("");
    })
    .join("");

  return {
    subject,
    text,
    html: layout({
      academyName,
      logoUrl: input.logoUrl ?? null,
      title: subject,
      preheader: summary,
      bodyHtml: [
        heading(greeting),
        paragraph(escapeHtml(summary)),
        itemsHtml,
        divider(),
        orderUrl ? secondaryLink(orderUrl, "Your order and receipt") : "",
        totalLabel ? smallPrint("The invoice is attached to this email.") : "",
      ].join(""),
      footer: `${escapeHtml(reason)}<br><a href="${escapeHtml(input.settingsUrl)}" style="color:${colors.muted};text-decoration:underline">Notification settings</a>`,
    }),
  };
}
