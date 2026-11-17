/**
 * A creator's marketing email, made from the blocks they arranged
 * (creator-features/34-email-marketing-plan.md), in the theme they chose.
 * The same function makes the editor's preview, the test email and every
 * real send, so what the creator sees is what students get.
 *
 * Built like the other emails (email.layout.ts): tables and inline styles.
 */
import {
  DEFAULT_MARKETING_DESIGN,
  fillMarketingVariables,
  MARKETING_COURSE_LINK,
  MARKETING_TEXT_LINK_PATTERN,
  MARKETING_TEXT_LINKS_MAX,
  marketingBlockSchema,
  marketingLinkNumber,
  marketingTextLinks,
  readMarketingLinkNumber,
  isSafeMarketingUrl,
  type MarketingAlign,
  type MarketingBlock,
  type MarketingDesign,
} from "@veolms/contracts";

import { escapeHtml, layout, type EmailContent } from "./email.layout.ts";
import {
  MARKETING_FONT_STACKS,
  marketingPalette,
  readableOn,
  type MarketingThemeColors,
} from "./marketing-email.themes.ts";

export interface MarketingEmailInput {
  academyName: string;
  logoUrl?: string | null;
  subject: string;
  preheader: string;
  /** Checked one by one: a half-written block is left out, not an error. */
  blocks: readonly unknown[];
  /** The email's look; the default (the app's dark theme) when left out. */
  design?: MarketingDesign;
  recipient: { firstName: string | null; fullName: string | null };
  /** The course an automation email is about, if any. */
  course?: { title: string; url: string } | null;
  /**
   * The address a link should point at: a tracked one for a real send,
   * the link itself for a preview. `linkNumber` names the link (see
   * `marketingLinkNumber`).
   */
  linkFor?: (linkNumber: number, url: string) => string;
  /** A 1×1 image that records the open; none for previews and tests. */
  openPixelUrl?: string | null;
  unsubscribeUrl?: string | null;
  /** "You're getting this because you're a student of ...". */
  reason: string;
}

const SPACER_HEIGHT = { small: 12, medium: 24, large: 40 } as const;
const HEADING_SIZE = {
  large: { font: 24, line: 30 },
  medium: { font: 20, line: 26 },
  small: { font: 17, line: 23 },
} as const;
const IMAGE_WIDTH = { full: 416, medium: 300, small: 200 } as const;

function readBlocks(blocks: readonly unknown[]): MarketingBlock[] {
  return blocks.flatMap((block) => {
    const parsed = marketingBlockSchema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}

function courseLinkOr(url: string, courseUrl: string | null): string | null {
  return url === MARKETING_COURSE_LINK ? courseUrl : url;
}

/** The block's own link with `{course_link}` filled in, or null. */
export function marketingBlockLink(
  block: MarketingBlock,
  courseUrl: string | null,
): string | null {
  const url =
    block.type === "button" || block.type === "card"
      ? block.url
      : block.type === "image"
        ? block.link
        : null;
  if (!url) return null;
  return courseLinkOr(url, courseUrl);
}

/**
 * The address behind a tracked link number: a block's own link, or one of
 * the links written in a text block. Null when there is none.
 */
export function marketingLinkAt(
  blocks: readonly MarketingBlock[],
  linkNumber: number,
  courseUrl: string | null,
): string | null {
  const { blockIndex, textLink } = readMarketingLinkNumber(linkNumber);
  const block = blocks[blockIndex];
  if (!block) return null;
  if (textLink === null) return marketingBlockLink(block, courseUrl);
  if (block.type !== "text") return null;
  return marketingTextLinks(block.text)[textLink] ?? null;
}

/** Blank lines start a paragraph; **words** are bold; [words](url) link. */
function textHtml(
  text: string,
  align: MarketingAlign,
  palette: MarketingThemeColors,
  linkAt: (link: number, url: string) => string,
): string {
  let link = 0;
  return text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces: string[] = [];
      let last = 0;
      for (const match of part.matchAll(MARKETING_TEXT_LINK_PATTERN)) {
        const [whole, label, url] = match as unknown as [
          string,
          string,
          string,
        ];
        const at = match.index ?? 0;
        pieces.push(formatInline(part.slice(last, at), palette));
        if (link < MARKETING_TEXT_LINKS_MAX && isSafeMarketingUrl(url)) {
          pieces.push(
            `<a href="${escapeHtml(linkAt(link, url))}" style="color:${palette.accent};text-decoration:underline;font-weight:600">${formatInline(label, palette)}</a>`,
          );
          link += 1;
        } else {
          pieces.push(formatInline(label, palette));
        }
        last = at + whole.length;
      }
      pieces.push(formatInline(part.slice(last), palette));
      return `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${palette.muted};text-align:${align}">${pieces.join("")}</p>`;
    })
    .join("");
}

function formatInline(text: string, palette: MarketingThemeColors): string {
  return escapeHtml(text)
    .replace(
      /\*\*(.+?)\*\*/gu,
      `<strong style="color:${palette.text}">$1</strong>`,
    )
    .replace(/\n/gu, "<br>");
}

function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gu, "$1")
    .replace(MARKETING_TEXT_LINK_PATTERN, "$1 ($2)");
}

/** A table that sits its content left, centre or right (Outlook too). */
function aligned(align: MarketingAlign, inner: string, margin: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin}"><tr><td align="${align}">${inner}</td></tr></table>`;
}

function buttonHtml(
  href: string,
  label: string,
  palette: MarketingThemeColors,
  options: {
    color: string | null;
    style: "filled" | "outline";
    fullWidth: boolean;
  },
): string {
  const color = options.color ?? palette.accent;
  const filled = options.style === "filled";
  const width = options.fullWidth ? ' width="100%"' : "";
  const textColor = filled ? readableOn(color) : color;
  const cell = filled
    ? `bgcolor="${color}" style="background-color:${color};border-radius:12px;text-align:center"`
    : `style="border:2px solid ${color};border-radius:12px;text-align:center"`;
  return `<table role="presentation"${width} cellpadding="0" cellspacing="0" border="0"><tr><td ${cell}><a href="${escapeHtml(href)}" style="display:${options.fullWidth ? "block" : "inline-block"};padding:${filled ? "13px 22px" : "11px 20px"};font-size:15px;line-height:20px;font-weight:700;color:${textColor};text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

export function marketingEmail(input: MarketingEmailInput): EmailContent {
  const design = input.design ?? DEFAULT_MARKETING_DESIGN;
  const palette = marketingPalette(design);
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
  const linkFor = input.linkFor ?? ((_number: number, url: string) => url);

  const html: string[] = [];
  const text: string[] = [];
  // Indexes are of the stored list, so a tracked link finds its block again.
  input.blocks.forEach((raw, index) => {
    const [block] = readBlocks([raw]);
    if (!block) return;
    const own = (url: string) => linkFor(marketingLinkNumber(index), url);
    switch (block.type) {
      case "heading": {
        const value = fill(block.text);
        const size = HEADING_SIZE[block.size];
        html.push(
          `<h${block.size === "large" ? 1 : 2} style="margin:0 0 8px;font-size:${size.font}px;line-height:${size.line}px;font-weight:700;letter-spacing:-0.3px;color:${palette.text};text-align:${block.align}">${escapeHtml(value)}</h${block.size === "large" ? 1 : 2}>`,
        );
        text.push(value.toUpperCase(), "");
        break;
      }
      case "text": {
        const value = fill(block.text);
        html.push(
          textHtml(value, block.align, palette, (link, url) =>
            linkFor(marketingLinkNumber(index, link), url),
          ),
        );
        text.push(plainText(value), "");
        break;
      }
      case "button": {
        const url = marketingBlockLink(block, courseUrl);
        if (!url) break;
        const label = fill(block.label);
        html.push(
          aligned(
            block.fullWidth ? "center" : block.align,
            buttonHtml(own(url), label, palette, block),
            "24px 0 8px",
          ),
        );
        text.push(`${label}: ${own(url)}`, "");
        break;
      }
      case "image": {
        const alt = escapeHtml(fill(block.alt));
        const width = IMAGE_WIDTH[block.size];
        const image = `<img src="${escapeHtml(block.url)}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:12px">`;
        const url = marketingBlockLink(block, courseUrl);
        html.push(
          aligned(
            block.align,
            url
              ? `<a href="${escapeHtml(own(url))}" style="text-decoration:none;display:block;max-width:${width}px">${image}</a>`
              : image,
            "8px 0 18px",
          ),
        );
        if (url) text.push(`${block.alt || "Image"}: ${own(url)}`, "");
        break;
      }
      case "divider":
        html.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px"><tr><td style="height:1px;line-height:1px;font-size:0;background-color:${palette.divider}">&nbsp;</td></tr></table>`,
        );
        text.push("—", "");
        break;
      case "spacer":
        html.push(
          `<div style="height:${SPACER_HEIGHT[block.size]}px;line-height:${SPACER_HEIGHT[block.size]}px;font-size:0">&nbsp;</div>`,
        );
        break;
      case "coupon": {
        const title = fill(block.title);
        const note = fill(block.note);
        html.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 18px"><tr><td bgcolor="${palette.soft}" style="background-color:${palette.soft};border:2px dashed ${palette.accent};border-radius:16px;padding:20px 16px;text-align:center">${
            title
              ? `<p style="margin:0 0 8px;font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${palette.muted}">${escapeHtml(title)}</p>`
              : ""
          }<p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:26px;line-height:34px;font-weight:800;letter-spacing:2px;color:${palette.accent}">${escapeHtml(block.code)}</p>${
            note
              ? `<p style="margin:8px 0 0;font-size:13px;line-height:19px;color:${palette.muted}">${escapeHtml(note)}</p>`
              : ""
          }</td></tr></table>`,
        );
        text.push([title, block.code, note].filter(Boolean).join(" — "), "");
        break;
      }
      case "card": {
        const url = marketingBlockLink(block, courseUrl);
        const title = fill(block.title);
        const meta = fill(block.meta);
        const body = fill(block.text);
        const label = fill(block.buttonLabel);
        const href = url ? own(url) : null;
        const image = block.imageUrl
          ? `<tr><td style="padding:0">${
              href
                ? `<a href="${escapeHtml(href)}" style="text-decoration:none">`
                : ""
            }<img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(title)}" width="416" style="display:block;width:100%;max-width:416px;height:auto;border:0;border-radius:15px 15px 0 0">${href ? "</a>" : ""}</td></tr>`
          : "";
        html.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px;border:1px solid ${palette.cardBorder};border-radius:16px;border-collapse:separate">${image}<tr><td style="padding:18px 18px 20px">${
            meta
              ? `<p style="margin:0 0 6px;font-size:12px;line-height:17px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:${palette.accent}">${escapeHtml(meta)}</p>`
              : ""
          }<p style="margin:0 0 6px;font-size:18px;line-height:24px;font-weight:700;color:${palette.text}">${escapeHtml(title)}</p>${
            body
              ? `<p style="margin:0 0 14px;font-size:14px;line-height:21px;color:${palette.muted}">${formatInline(body, palette)}</p>`
              : ""
          }${
            href
              ? buttonHtml(href, label, palette, {
                  color: null,
                  style: "filled",
                  fullWidth: false,
                })
              : ""
          }</td></tr></table>`,
        );
        text.push(
          [meta, title, body].filter(Boolean).join("\n"),
          href ? `${label}: ${href}` : "",
          "",
        );
        break;
      }
      case "quote": {
        const quote = fill(block.text);
        const name = fill(block.name);
        html.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px"><tr><td bgcolor="${palette.soft}" style="background-color:${palette.soft};border-left:4px solid ${palette.accent};border-radius:0 12px 12px 0;padding:16px 18px"><p style="margin:0;font-size:16px;line-height:25px;font-style:italic;color:${palette.text}">“${formatInline(quote, palette)}”</p>${
            name
              ? `<p style="margin:10px 0 0;font-size:13px;line-height:18px;font-weight:600;color:${palette.muted}">— ${escapeHtml(name)}</p>`
              : ""
          }</td></tr></table>`,
        );
        text.push(`"${quote}"${name ? ` — ${name}` : ""}`, "");
        break;
      }
    }
  });

  const unsubscribe = input.unsubscribeUrl
    ? `<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${palette.muted};text-decoration:underline">Unsubscribe</a>`
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
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
    html: layout({
      academyName: input.academyName,
      logoUrl: input.logoUrl ?? null,
      title: subject,
      preheader,
      bodyHtml:
        (html.length
          ? html.join("")
          : `<p style="margin:0;font-size:15px;line-height:22px;color:${palette.faint}">Add blocks to see your email here.</p>`) +
        pixel,
      footer: `${escapeHtml(input.reason)}${unsubscribe}`,
      palette,
      fontFamily: MARKETING_FONT_STACKS[design.font],
      headerAlign: design.headerAlign,
      scheme: palette.scheme,
    }),
  };
}
