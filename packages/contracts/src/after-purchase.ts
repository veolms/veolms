import { z } from "zod";

/**
 * What a buyer reads right after paying for a course or a workshop, on the
 * order page and in the confirmation email: a short welcome from the
 * creator and one optional button (say, "Join our WhatsApp group").
 * `{first_name}` in the message is replaced with the buyer's first name.
 */
export const AFTER_PURCHASE_MESSAGE_MAX = 1000;
export const AFTER_PURCHASE_LINK_LABEL_MAX = 40;
export const AFTER_PURCHASE_FIRST_NAME = "{first_name}";

/** Only https links: a buyer taps it on a page we vouch for. */
export function isSafeWelcomeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** As stored and shown to the creator. */
export const afterPurchaseWelcomeSchema = z.strictObject({
  message: z.string().nullable(),
  linkLabel: z.string().nullable(),
  linkUrl: z.string().nullable(),
});
export type AfterPurchaseWelcome = z.infer<typeof afterPurchaseWelcomeSchema>;

export const EMPTY_AFTER_PURCHASE_WELCOME: AfterPurchaseWelcome = {
  message: null,
  linkLabel: null,
  linkUrl: null,
};

/** Trimmed; an empty value is no value. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

/** What the creator saves. A button needs both its words and its link. */
export const afterPurchaseWelcomeInputSchema = z
  .strictObject({
    message: optionalText(AFTER_PURCHASE_MESSAGE_MAX),
    linkLabel: optionalText(AFTER_PURCHASE_LINK_LABEL_MAX),
    linkUrl: optionalText(2048).refine(
      (value) => value === null || isSafeWelcomeLink(value),
      { message: "Use a link that starts with https://" },
    ),
  })
  .superRefine((value, context) => {
    if (value.linkUrl && !value.linkLabel) {
      context.addIssue({
        code: "custom",
        path: ["linkLabel"],
        message: "Give the button some words",
      });
    }
    if (value.linkLabel && !value.linkUrl) {
      context.addIssue({
        code: "custom",
        path: ["linkUrl"],
        message: "Add the link the button opens",
      });
    }
  });
export type AfterPurchaseWelcomeInput = z.input<
  typeof afterPurchaseWelcomeInputSchema
>;

/** The message with `{first_name}` filled in (blank name: "there"). */
export function fillWelcomeMessage(message: string, firstName: string): string {
  const name = firstName.trim() || "there";
  return message.split(AFTER_PURCHASE_FIRST_NAME).join(name);
}
