/**
 * Told to every admin of an academy when its payment account changes
 * (Platform → Payments): someone who takes over an admin's session could
 * otherwise send the academy's sales to their own account unnoticed.
 */
import {
  escapeHtml,
  heading,
  layout,
  paragraph,
  smallPrint,
  type EmailContent,
} from "./email.layout.ts";

export interface PaymentAccountChangedEmailInput {
  academyName: string;
  logoUrl?: string | null;
  /** "connected", "replaced", "removed", "new webhook secret". */
  change: "connected" | "replaced" | "removed" | "webhook_secret";
  gatewayName: string;
  changedBy: string;
  /** "16 Nov 2026, 5:04 pm IST". */
  when: string;
  settingsUrl: string;
}

const WHAT: Record<PaymentAccountChangedEmailInput["change"], string> = {
  connected: "connected a payment account",
  replaced: "replaced the payment account keys",
  removed: "removed the payment account",
  webhook_secret: "made a new webhook secret",
};

export function paymentAccountChangedEmail(
  input: PaymentAccountChangedEmailInput,
): EmailContent {
  const what = WHAT[input.change];
  const subject = `${input.academyName}: ${input.changedBy} ${what}`;
  const summary = `${input.changedBy} ${what} (${input.gatewayName}) on ${input.when}.`;
  const advice =
    "If you expected this, there is nothing to do. If not, sign in now, check Platform → Payments, and create new keys in your Razorpay dashboard.";
  return {
    subject,
    text: [
      summary,
      "",
      advice,
      "",
      `Payment settings: ${input.settingsUrl}`,
    ].join("\n"),
    html: layout({
      academyName: input.academyName,
      logoUrl: input.logoUrl ?? null,
      title: subject,
      preheader: summary,
      bodyHtml: [
        heading("Your payment account changed"),
        paragraph(escapeHtml(summary)),
        paragraph(escapeHtml(advice)),
        paragraph(
          `<a href="${escapeHtml(input.settingsUrl)}" style="font-weight:700">Open payment settings</a>`,
          { last: true },
        ),
      ].join(""),
      footer: smallPrint(
        "Sent to every admin of the academy. This notice can't be switched off.",
      ),
    }),
  };
}
