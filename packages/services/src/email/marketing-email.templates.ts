/**
 * A creator's marketing email, made from the blocks they arranged
 * (creator-features/34-email-marketing-plan.md). The same function makes
 * the editor's preview, the test email and every real send, so what the
 * creator sees is what students get.
 *
 * Built like the other emails (email.layout.ts): tables and inline styles.
 */
import {
  fillMarketingVariables,
  MARKETING_COURSE_LINK,
  marketingBlockSchema,
  type MarketingBlock,
} from "@veolms/contracts";

import {
  button,
  colors,
  divider,
  escapeHtml,
  heading,
  layout,
  type EmailContent,
} from "./email.layout.ts";

export interface MarketingEmailInput {
  academyName: string;
  logoUrl?: string | null;
  subject: string;
  preheader: string;
  /** Checked one by one: a half-written block is left out, not an error. */
  blocks: readonly unknown[];
  recipient: { firstName: string | null; fullName: string | null };
  /** The course an automation email is about, if any. */
  course?: { title: string; url: string } | null;
  /**
   * The address a link should point at: a tracked one for a real send,
   * the link itself for a preview. `blockIndex` is the block's place.
   */
  linkFor?: (blockIndex: number, url: string) => string;
  /** A 1×1 image that records the open; none for previews and tests. */
  openPixelUrl?: string | null;
  unsubscribeUrl?: string | null;
  /** "You're getting this because you're a student of ...". */
  reason: string;
}

const SPACER_HEIGHT = { small: 12, medium: 24, large: 40 } as const;

/** Blank lines start a paragraph; **words** are bold. */
function textHtml(text: string): string {
  return text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const html = escapeHtml(part)
        .replace(
          /\*\*(.+?)\*\*/gu,
          '<strong style="color:' + colors.text + '">$1</strong>',
        )
        .replace(/\n/gu, "<br>");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${colors.muted}">${html}</p>`;
    })
    .join("");
}

function readBlocks(blocks: readonly unknown[]): MarketingBlock[] {
  return blocks.flatMap((block) => {
    const parsed = marketingBlockSchema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The block's link with `{course_link}` filled in, or null. */
export function marketingBlockLink(
  block: MarketingBlock,
  courseUrl: string | null,
): string | null {
  const url =
    block.type === "button"
      ? block.url
      : block.type === "image"
        ? block.link
        : null;
  if (!url) return null;
  if (url === MARKETING_COURSE_LINK) return courseUrl;
  return url;
}

export function marketingEmail(input: MarketingEmailInput): EmailContent {
  const values = {
    first_name: input.recipient.firstName,
    full_name: input.recipient.fullName,
    academy_name: input.academyName,
    course_title: input.course?.title ?? null,
  };
  const fill = (text: string) => fillMarketingVariables(text, values);
  const subject = fill(input.subject).trim() || input.academyName;
  const preheader = fill(input.preheader).trim();
  const courseUrl = input.course?.url ?? null;
  const linkFor = input.linkFor ?? ((_index: number, url: string) => url);

  const html: string[] = [];
  const text: string[] = [];
  // Indexes are of the stored list, so a tracked link finds its block again.
  input.blocks.forEach((raw, index) => {
    const [block] = readBlocks([raw]);
    if (!block) return;
    switch (block.type) {
      case "heading": {
        const value = fill(block.text);
        html.push(heading(value));
        text.push(value.toUpperCase(), "");
        break;
      }
      case "text": {
        const value = fill(block.text);
        html.push(textHtml(value));
        text.push(value.replace(/\*\*(.+?)\*\*/gu, "$1"), "");
        break;
      }
      case "button": {
        const url = marketingBlockLink(block, courseUrl);
        if (!url) break;
        const label = fill(block.label);
        html.push(button(linkFor(index, url), label));
        text.push(`${label}: ${linkFor(index, url)}`, "");
        break;
      }
      case "image": {
        const alt = escapeHtml(fill(block.alt));
        const image = `<img src="${escapeHtml(block.url)}" alt="${alt}" width="416" style="display:block;width:100%;max-width:416px;height:auto;border:0;border-radius:12px">`;
        const url = marketingBlockLink(block, courseUrl);
        html.push(
          `<div style="margin:8px 0 18px">${
            url
              ? `<a href="${escapeHtml(linkFor(index, url))}" style="text-decoration:none">${image}</a>`
              : image
          }</div>`,
        );
        if (url)
          text.push(`${block.alt || "Image"}: ${linkFor(index, url)}`, "");
        break;
      }
      case "divider":
        html.push(divider());
        text.push("—", "");
        break;
      case "spacer":
        html.push(
          `<div style="height:${SPACER_HEIGHT[block.size]}px;line-height:${SPACER_HEIGHT[block.size]}px;font-size:0">&nbsp;</div>`,
        );
        break;
    }
  });

  const unsubscribe = input.unsubscribeUrl
    ? `<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${colors.muted};text-decoration:underline">Unsubscribe</a>`
    : "";
  const pixel = input.openPixelUrl
    ? `<img src="${escapeHtml(input.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0">`
    : "";

  return {
    subject,
    text: [
      ...text,
      input.reason,
      input.unsubscribeUrl ? `Unsubscribe: ${input.unsubscribeUrl}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim(),
    html: layout({
      academyName: input.academyName,
      logoUrl: input.logoUrl ?? null,
      title: subject,
      preheader,
      bodyHtml:
        (html.length
          ? html.join("")
          : `<p style="margin:0;font-size:15px;line-height:22px;color:${colors.faint}">Add blocks to see your email here.</p>`) +
        pixel,
      footer: `${escapeHtml(input.reason)}${unsubscribe}`,
    }),
  };
}
