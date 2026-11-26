import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CERTIFICATE_DESIGN_MIN_IMAGE_SIDE,
  DEFAULT_CERTIFICATE_LAYOUT,
  type CertificateDesignContentType,
  type CertificateDesignLayout,
  type CertificateFont,
  type CertificateTextField,
} from "@veolms/contracts";
import * as fontkit from "fontkit";
import { PDFDocument as LibDocument } from "pdf-lib";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Draws a course certificate as one vector A4-landscape PDF page with
 * pdfkit: the template's fixed design (background, gold chain border, logo,
 * headline, ribbon, labels, signature) and the certificate's own details
 * (name, course line, date, code, verify QR code and address).
 *
 * pdfkit rather than pdf-lib: pdf-lib (last release 2021) dropped letters
 * from these fonts when subsetting them; pdfkit draws them correctly
 * (tested 26 Nov 2026). Nothing here is
 * stored: a PDF is drawn again for each download, from the certificate's
 * snapshot. The same snapshot always gives the same page.
 *
 * Fonts are bundled with the template (SIL OFL, licences next to them);
 * system fonts are never used.
 */

/** Bump `version` when a change would alter certificates already issued. */
export const CERTIFICATE_TEMPLATE = {
  key: "procodrr-classic",
  version: 1,
} as const;

export interface CertificateRenderInput {
  recipientName: string;
  courseTitle: string;
  /** YYYY-MM-DD, the issue date in the academy's time zone. */
  issuedOn: string;
  issuedAt: Date;
  /** The code as printed, "XXXX-XXXX-XXXX-XXXX". */
  displayCode: string;
  /** Full address the QR code opens. */
  verifyUrl: string;
  /** The address as printed under the QR code, without "https://". */
  verifyUrlShort: string;
}

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;

const FONT_FILES = [
  "Arimo-400.ttf",
  "Lobster-400.ttf",
  "Montserrat-500.ttf",
  "Montserrat-600.ttf",
  "Oswald-700.ttf",
] as const;
type FontFile = (typeof FONT_FILES)[number];

const BODY_FONT: FontFile = "Arimo-400.ttf";
/**
 * The name is written in the first of these that has every letter. Names
 * are in English (the claim refuses other alphabets); Arimo covers a rare
 * accented letter Lobster lacks.
 */
const NAME_FONTS: readonly FontFile[] = ["Lobster-400.ttf", "Arimo-400.ttf"];

interface LoadedTemplate {
  fonts: Map<FontFile, Buffer>;
  glyphs: Map<FontFile, fontkit.Font>;
  background: Buffer;
  signature: { data: Buffer; width: number; height: number };
  logoPaths: { d: string; fill: string }[];
}

let loaded: LoadedTemplate | null = null;

function templateFile(...parts: string[]): string {
  return fileURLToPath(
    new URL(
      `../templates/${CERTIFICATE_TEMPLATE.key}/${parts.join("/")}`,
      import.meta.url,
    ),
  );
}

/** Reads the template's files once per process (or worker thread). */
function loadTemplate(): LoadedTemplate {
  if (loaded) return loaded;
  const fonts = new Map<FontFile, Buffer>();
  const glyphs = new Map<FontFile, fontkit.Font>();
  for (const file of FONT_FILES) {
    const data = fs.readFileSync(templateFile("fonts", file));
    fonts.set(file, data);
    glyphs.set(file, fontkit.create(data) as fontkit.Font);
  }
  const signature = fs.readFileSync(templateFile("assets", "signature.png"));
  const logo = fs.readFileSync(
    templateFile("assets", "procodrr-logo-dark.svg"),
    "utf8",
  );
  loaded = {
    fonts,
    glyphs,
    background: fs.readFileSync(templateFile("assets", "marble-bg.jpg")),
    // A PNG's width and height are the first fields of its IHDR chunk.
    signature: {
      data: signature,
      width: signature.readUInt32BE(16),
      height: signature.readUInt32BE(20),
    },
    logoPaths: [
      ...logo.matchAll(
        /<path d="([^"]+)"[^>]*?fill="(#[0-9A-Fa-f]{6}|black)"/gu,
      ),
    ].map((match) => ({
      d: match[1]!,
      fill: match[2] === "black" ? "#2E2E2E" : match[2]!,
    })),
  };
  return loaded;
}

function fontCovers(template: LoadedTemplate, file: FontFile, text: string) {
  const font = template.glyphs.get(file)!;
  for (const character of text) {
    if (/\s/u.test(character)) continue;
    if (!font.hasGlyphForCodePoint(character.codePointAt(0)!)) return false;
  }
  return true;
}

function nameFontFor(template: LoadedTemplate, name: string): FontFile | null {
  return NAME_FONTS.find((file) => fontCovers(template, file, name)) ?? null;
}

/**
 * Whether the template has a font for every letter of a name. The claim is
 * refused before anything is issued when it has not, rather than printing
 * empty boxes.
 */
export function canPrintName(name: string): boolean {
  return nameFontFor(loadTemplate(), name) !== null;
}

type Doc = PDFKit.PDFDocument;

function wrapWords(doc: Doc, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (!current || doc.widthOfString(next) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Writes `text` centred on `centerX` with its baseline at `baseline`. */
function centered(
  doc: Doc,
  text: string,
  centerX: number,
  baseline: number,
  characterSpacing = 0,
): number {
  const width = doc.widthOfString(text, { characterSpacing });
  doc.text(text, centerX - width / 2, baseline, {
    baseline: "alphabetic",
    lineBreak: false,
    characterSpacing,
  });
  return width;
}

function formatIssuedOn(issuedOn: string): string {
  const [year, month, day] = issuedOn.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function drawDesign(doc: Doc, template: LoadedTemplate) {
  const W = PAGE_WIDTH;
  const H = PAGE_HEIGHT;
  doc.image(template.background, 0, 0, { width: W, height: H });

  // Gold chain border: two sine strands per edge, crossing every ~15.6 pt.
  const border = { left: 17, right: W - 17, top: 35.5, bottom: H - 36.5 };
  const amplitude = 5.2;
  const eyeLength = 15.6;
  doc.save().lineWidth(0.95).strokeColor("#C59A2E").lineCap("round");
  const edges: [number, number, number, number][] = [
    [border.left, border.top, border.right, border.top],
    [border.right, border.top, border.right, border.bottom],
    [border.right, border.bottom, border.left, border.bottom],
    [border.left, border.bottom, border.left, border.top],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const eyes = Math.round(length / eyeLength);
    const eye = length / eyes;
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    for (const side of [1, -1]) {
      const steps = eyes * 14;
      for (let step = 0; step <= steps; step += 1) {
        const t = (step / steps) * length;
        const offset = side * amplitude * Math.sin((Math.PI * t) / eye);
        const x = x0 + ux * t - uy * offset;
        const y = y0 + uy * t + ux * offset;
        if (step === 0) doc.moveTo(x, y);
        else doc.lineTo(x, y);
      }
      doc.stroke();
    }
  }
  for (const [x, y, dx, dy] of [
    [border.left, border.top, -1, -1],
    [border.right, border.top, 1, -1],
    [border.right, border.bottom, 1, 1],
    [border.left, border.bottom, -1, 1],
  ] as const) {
    doc.circle(x + dx * 3.2, y + dy * 3.2, 4.2).stroke();
  }
  doc.restore();

  // Logo, drawn from the web app's vector logo, and its tagline.
  const logoWidth = 124;
  doc
    .save()
    .translate(W / 2 - logoWidth / 2 - 2, 47)
    .scale(logoWidth / 660);
  for (const path of template.logoPaths) doc.path(path.d).fill(path.fill);
  doc.restore();
  doc.font("Montserrat-600.ttf").fontSize(6.6).fillColor("#2B2B2B");
  const taglineWidth = centered(doc, "CODE LIKE A PRO", W / 2, 90, 0.35);
  doc.save().lineWidth(0.7).strokeColor("#2B2B2B");
  doc
    .moveTo(W / 2 - taglineWidth / 2 - 30, 87.6)
    .lineTo(W / 2 - taglineWidth / 2 - 6, 87.6)
    .stroke();
  doc
    .moveTo(W / 2 + taglineWidth / 2 + 6, 87.6)
    .lineTo(W / 2 + taglineWidth / 2 + 30, 87.6)
    .stroke();
  doc.restore();

  doc.font("Oswald-700.ttf").fontSize(100);
  doc
    .fontSize((258 / doc.widthOfString("CERTIFICATE")) * 100)
    .fillColor("#0B0B0B");
  centered(doc, "CERTIFICATE", W / 2, 218.5);

  // Ribbon: tails behind the band, their folds, then the band.
  const x0 = 327.8;
  const x1 = 513.5;
  const y0 = 233.6;
  const y1 = 254;
  const drop = 14;
  const tail = 50;
  doc
    .polygon(
      [x0 + 33, y0 + 7],
      [x0 + 33 - tail - 2, y0 + 7],
      [x0 - 10, y0 + 17],
      [x0 + 33 - tail - 6, y1 + drop],
      [x0 + 33, y1 + drop],
    )
    .fill("#A77A16");
  doc
    .polygon(
      [x1 - 33, y0 + 7],
      [x1 - 33 + tail + 2, y0 + 7],
      [x1 + 10, y0 + 17],
      [x1 - 33 + tail + 6, y1 + drop],
      [x1 - 33, y1 + drop],
    )
    .fill("#A77A16");
  doc
    .polygon([x0 + 33, y1], [x0 + 33, y1 + drop], [x0 + 21, y1])
    .fill("#7E5A0E");
  doc
    .polygon([x1 - 33, y1], [x1 - 33, y1 + drop], [x1 - 21, y1])
    .fill("#7E5A0E");
  const sheen = doc.linearGradient(0, y0, 0, y1);
  sheen.stop(0, "#C99D30").stop(1, "#B4851B");
  doc.rect(x0, y0, x1 - x0, y1 - y0).fill(sheen);
  doc.font("Montserrat-500.ttf").fontSize(10.4).fillColor("#FFFFFF");
  centered(doc, "FOR COMPLETION", W / 2 + 1.3, 247.6, 2.6);

  doc.font(BODY_FONT).fontSize(11.2).fillColor("#5F6368");
  centered(doc, "THE CERTIFICATE IS PROUDLY PRESENTED TO", W / 2, 308, 0.45);

  // Signature (left) and date (right) blocks.
  const ruleY = 529.3;
  const signatureRule = [61.5, 214.4] as const;
  const dateRule = [627.6, 779.9] as const;
  // The signature itself is a layout field (drawFields): the academy's
  // uploaded one, or the bundled one on this design.
  doc.save().lineWidth(1.9).strokeColor("#C9CCD1").dash(5, { space: 1.6 });
  for (const [a, b] of [signatureRule, dateRule]) {
    doc.moveTo(a, ruleY).lineTo(b, ruleY).stroke();
  }
  doc.undash().restore();
  doc.font(BODY_FONT).fontSize(9.6).fillColor("#6B6B6B");
  centered(doc, "Signature", (signatureRule[0] + signatureRule[1]) / 2, 544.5);
  centered(doc, "Date", (dateRule[0] + dateRule[1]) / 2, 544.5);
}

/** The pdfkit font each layout font uses. */
const LAYOUT_FONTS: Record<CertificateFont, FontFile> = {
  lobster: "Lobster-400.ttf",
  arimo: "Arimo-400.ttf",
  oswald: "Oswald-700.ttf",
  montserrat: "Montserrat-600.ttf",
};

/**
 * What a certificate is drawn on: the built-in design, or a sheet staff
 * uploaded (its file's bytes, page size in points and layout).
 */
export type CertificateRenderDesign =
  | { kind: "builtin" }
  | {
      kind: "upload";
      contentType: CertificateDesignContentType;
      bytes: Uint8Array;
      pageWidth: number;
      pageHeight: number;
      layout: CertificateDesignLayout;
    };

/** Writes one line at a layout field's anchor; returns its width. */
function placeLine(
  doc: Doc,
  text: string,
  x: number,
  baseline: number,
  align: CertificateTextField["align"],
): number {
  const width = doc.widthOfString(text);
  const left =
    align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  doc.text(text, left, baseline, { baseline: "alphabetic", lineBreak: false });
  return width;
}

/** The largest size from `size` down to `minSize` that fits `width`. */
function fitSize(
  doc: Doc,
  text: string,
  size: number,
  minSize: number,
  width: number,
): number {
  let current = size;
  doc.fontSize(current);
  while (current > minSize && doc.widthOfString(text) > width) {
    current = Math.max(minSize, current - Math.max(0.2, size * 0.025));
    doc.fontSize(current);
  }
  return current;
}

function fieldFont(
  template: LoadedTemplate,
  font: CertificateFont,
  text: string,
): FontFile {
  const file = LAYOUT_FONTS[font];
  // A letter the chosen font lacks (a rare accent) is never an empty box.
  return fontCovers(template, file, text) ? file : BODY_FONT;
}

/**
 * The certificate's own details, where `layout` places them on a page of
 * `width` × `height` points. Sizes in the layout are for an A4 landscape
 * page and scale with the page's width.
 */
function drawFields(
  doc: Doc,
  template: LoadedTemplate,
  input: CertificateRenderInput,
  layout: CertificateDesignLayout,
  width: number,
  height: number,
  signature: SignatureImage | null,
) {
  const scale = width / PAGE_WIDTH;

  const single = (field: CertificateTextField, text: string) => {
    if (!field.enabled || !text) return;
    const size = field.size * scale;
    doc.font(fieldFont(template, field.font, text)).fillColor(field.color);
    fitSize(doc, text, size, size * 0.6, field.width * width);
    placeLine(doc, text, field.x * width, field.y * height, field.align);
  };

  single(layout.code, input.displayCode);

  // Name: shrinks to 55% of its size to fit, then takes two lines (the
  // last one on the baseline).
  const nameField = layout.name;
  if (nameField.enabled) {
    const name = input.recipientName;
    const size = nameField.size * scale;
    const maxWidth = nameField.width * width;
    doc
      .font(fieldFont(template, nameField.font, name))
      .fillColor(nameField.color);
    const fitted = fitSize(doc, name, size, size * 0.55, maxWidth);
    const lines =
      doc.widthOfString(name) <= maxWidth
        ? [name]
        : wrapWords(doc, name, maxWidth).slice(0, 2);
    const baseline = nameField.y * height;
    const lineHeight = fitted * 1.05;
    let widest = 0;
    lines.forEach((line, index) => {
      widest = Math.max(
        widest,
        placeLine(
          doc,
          line,
          nameField.x * width,
          baseline - lineHeight * (lines.length - 1 - index),
          nameField.align,
        ),
      );
    });
    if (nameField.underline) {
      const length = Math.max(260 * scale, widest + 20 * scale);
      const x = nameField.x * width;
      const left =
        nameField.align === "center"
          ? x - length / 2
          : nameField.align === "right"
            ? x - length
            : x;
      doc
        .save()
        .lineWidth(0.8 * scale)
        .strokeColor("#C9A24A")
        .dash(2 * scale, { space: 1.6 * scale })
        .moveTo(left, baseline + 6 * scale)
        .lineTo(left + length, baseline + 6 * scale)
        .stroke()
        .undash()
        .restore();
    }
  }

  // Course line: wraps to three lines downward from its baseline, then
  // shrinks.
  const courseField = layout.course;
  if (courseField.enabled) {
    const title = input.courseTitle.trim().replace(/[.\s]+$/u, "");
    const sentence = courseField.text.replaceAll("{course}", title);
    const size = courseField.size * scale;
    const maxWidth = courseField.width * width;
    doc
      .font(fieldFont(template, courseField.font, sentence))
      .fillColor(courseField.color);
    let current = size;
    let lines: string[] = [];
    for (; current >= size * 0.84; current -= size * 0.04) {
      doc.fontSize(current);
      lines = wrapWords(doc, sentence, maxWidth);
      if (lines.length <= 3) break;
    }
    lines
      .slice(0, 4)
      .forEach((line, index) =>
        placeLine(
          doc,
          line,
          courseField.x * width,
          courseField.y * height + index * current * 1.16,
          courseField.align,
        ),
      );
  }

  single(layout.date, formatIssuedOn(input.issuedOn));

  if (layout.qr.enabled) {
    const qr = QRCode.create(input.verifyUrl, { errorCorrectionLevel: "M" });
    const modules = qr.modules.size;
    const side = layout.qr.size * width;
    const cell = side / modules;
    const left = layout.qr.x * width - side / 2;
    const top = layout.qr.y * height;
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (qr.modules.get(row, column)) {
          doc.rect(
            left + column * cell,
            top + row * cell,
            cell + 0.02,
            cell + 0.02,
          );
        }
      }
    }
    doc.fill(layout.qr.color);
  }
  single(layout.verifyText, `Verify at ${input.verifyUrlShort}`);

  // Signature: centred on x, its bottom edge on y.
  const place = layout.signature;
  if (place?.enabled && signature) {
    const drawnWidth = place.width * width;
    const drawnHeight = (drawnWidth * signature.height) / signature.width;
    doc.image(
      signature.data,
      place.x * width - drawnWidth / 2,
      place.y * height - drawnHeight,
      { width: drawnWidth, height: drawnHeight },
    );
  }
}

interface SignatureImage {
  data: Buffer;
  width: number;
  height: number;
}

/** An uploaded signature's pixels and size, or null if it is not a PNG/JPEG. */
function signatureImage(bytes: Uint8Array | null | undefined) {
  if (!bytes || bytes.length < 24) return null;
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPng = data[0] === 0x89 && data[1] === 0x50;
  const isJpeg = data[0] === 0xff && data[1] === 0xd8;
  if (!isPng && !isJpeg) return null;
  const size = imageSize(bytes, isPng ? "image/png" : "image/jpeg");
  return size && size.width > 0 && size.height > 0
    ? { data: Buffer.from(data), ...size }
    : null;
}

/**
 * Checks an uploaded signature can be printed: a PNG or JPEG at least
 * `minWidth` pixels wide that pdfkit can draw.
 */
export async function inspectSignature(
  bytes: Uint8Array,
  minWidth: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const image = signatureImage(bytes);
  if (!image)
    return { ok: false, reason: "The signature must be a PNG or JPEG." };
  if (image.width < minWidth) {
    return {
      ok: false,
      reason: `The signature is too small to print sharply. Use one at least ${minWidth} pixels wide.`,
    };
  }
  try {
    await renderCertificatePdf(SAMPLE_CERTIFICATE, { kind: "builtin" }, bytes);
  } catch {
    return {
      ok: false,
      reason:
        "This image could not be drawn. Save it again as a standard PNG (transparent background) or JPEG.",
    };
  }
  return { ok: true };
}

function pdfInfo(input: CertificateRenderInput) {
  return {
    Title: `Certificate of Completion — ${input.recipientName}`,
    Subject: input.courseTitle,
    Keywords: `certificate ${input.displayCode}`,
    Creator: "VeoLMS",
    Producer: "VeoLMS certificates",
    // The same certificate gives the same file.
    CreationDate: input.issuedAt,
  };
}

/** Runs `draw` on a new pdfkit page and returns the PDF's bytes. */
async function pdfkitPage(
  width: number,
  height: number,
  info: PDFKit.DocumentInfo,
  draw: (doc: Doc, template: LoadedTemplate) => void,
): Promise<Buffer> {
  const template = loadTemplate();
  const doc = new PDFDocument({
    size: [width, height],
    margin: 0,
    compress: true,
    info,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const [file, data] of template.fonts) doc.registerFont(file, data);
  draw(doc, template);
  doc.end();
  return await finished;
}

/**
 * Draws a certificate on `design`:
 * - built-in: the whole page with pdfkit;
 * - an uploaded image: the image fills the page, the details on top;
 * - an uploaded PDF: its first page is kept as it is (vector, its own
 *   fonts) and a pdfkit page with the details is laid over it with
 *   pdf-lib. pdf-lib only copies the two pages' contents here; it never
 *   lays out text, which is what it got wrong.
 */
export async function renderCertificatePdf(
  input: CertificateRenderInput,
  design: CertificateRenderDesign = { kind: "builtin" },
  /** The academy's uploaded signature (PNG/JPEG), if any. */
  signature?: Uint8Array | null,
): Promise<Buffer> {
  const info = pdfInfo(input);
  const uploaded = signatureImage(signature);
  if (design.kind === "builtin") {
    return await pdfkitPage(PAGE_WIDTH, PAGE_HEIGHT, info, (doc, template) => {
      drawDesign(doc, template);
      drawFields(
        doc,
        template,
        input,
        DEFAULT_CERTIFICATE_LAYOUT,
        PAGE_WIDTH,
        PAGE_HEIGHT,
        // Without an uploaded signature, the design's own.
        uploaded ?? template.signature,
      );
    });
  }
  const { pageWidth: width, pageHeight: height } = design;
  if (design.contentType !== "application/pdf") {
    return await pdfkitPage(width, height, info, (doc, template) => {
      doc.image(Buffer.from(design.bytes), 0, 0, { width, height });
      drawFields(doc, template, input, design.layout, width, height, uploaded);
    });
  }
  const overlay = await pdfkitPage(width, height, info, (doc, template) =>
    drawFields(doc, template, input, design.layout, width, height, uploaded),
  );
  const out = await LibDocument.create();
  const [base] = await out.embedPdf(design.bytes, [0]);
  const [details] = await out.embedPdf(overlay, [0]);
  const page = out.addPage([width, height]);
  page.drawPage(base!, { x: 0, y: 0, width, height });
  page.drawPage(details!, { x: 0, y: 0, width, height });
  out.setTitle(info.Title);
  out.setSubject(info.Subject);
  out.setKeywords([info.Keywords]);
  out.setCreator(info.Creator);
  out.setProducer(info.Producer);
  out.setCreationDate(input.issuedAt);
  out.setModificationDate(input.issuedAt);
  return Buffer.from(await out.save({ useObjectStreams: true }));
}

/** Width and height of a PNG (IHDR) or a JPEG (its first frame header). */
function imageSize(
  bytes: Uint8Array,
  contentType: "image/png" | "image/jpeg",
): { width: number; height: number } | null {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === "image/png") {
    if (data.length < 24 || data.readUInt32BE(12) !== 0x49484452) return null;
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    const length = data.readUInt16BE(offset + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** Made-up details for previews and the upload check. */
export const SAMPLE_CERTIFICATE: CertificateRenderInput = {
  recipientName: "Aarav Sharma",
  courseTitle: "The Complete JavaScript Course",
  issuedOn: "2026-11-26",
  issuedAt: new Date("2026-11-26T10:00:00Z"),
  displayCode: "7P5S-1588-Z9M0-4ASG",
  verifyUrl: "https://example.com/certificate/7P5S1588Z9M04ASG",
  verifyUrlShort: "example.com/certificate/7P5S-1588-Z9M0-4ASG",
};

/**
 * Checks an uploaded sheet can carry certificates and answers its page
 * size in points, or why it cannot (shown to the uploader).
 * - A PDF: not password-protected, at least one page (the first is used),
 *   not rotated.
 * - An image: readable, at least 1600 px on its long side so it prints
 *   sharply. It becomes a page 842 pt on its long side.
 * The sheet is then drawn once with sample details, so a file that cannot
 * be drawn is refused at upload, not found out at a learner's download.
 */
export async function inspectCertificateDesign(
  bytes: Uint8Array,
  contentType: CertificateDesignContentType,
): Promise<
  | { ok: true; pageWidth: number; pageHeight: number }
  | { ok: false; reason: string }
> {
  let pageWidth: number;
  let pageHeight: number;
  if (contentType === "application/pdf") {
    let source: LibDocument;
    try {
      source = await LibDocument.load(bytes, { updateMetadata: false });
    } catch (error) {
      const encrypted =
        error instanceof Error && /encrypt/iu.test(error.message);
      return {
        ok: false,
        reason: encrypted
          ? "This PDF is password-protected. Save it without a password and upload that."
          : "This PDF could not be read. Export it again from your design tool.",
      };
    }
    // pdf-lib opens some damaged files without complaint and fails on the
    // first page it is asked for: that is a file that cannot be read too.
    let size: { width: number; height: number };
    let rotated: boolean;
    try {
      if (source.getPageCount() < 1) {
        return { ok: false, reason: "This PDF has no pages." };
      }
      const first = source.getPage(0);
      rotated = first.getRotation().angle % 360 !== 0;
      size = first.getSize();
    } catch {
      return {
        ok: false,
        reason:
          "This PDF could not be read. Export it again from your design tool.",
      };
    }
    if (rotated) {
      return {
        ok: false,
        reason: "The PDF's first page is rotated. Export it without rotation.",
      };
    }
    if (!(size.width >= 100 && size.height >= 100)) {
      return { ok: false, reason: "The PDF's first page is too small." };
    }
    ({ width: pageWidth, height: pageHeight } = size);
  } else {
    const size = imageSize(bytes, contentType);
    if (!size || size.width < 1 || size.height < 1) {
      return { ok: false, reason: "This image could not be read." };
    }
    if (Math.max(size.width, size.height) < CERTIFICATE_DESIGN_MIN_IMAGE_SIDE) {
      return {
        ok: false,
        reason: `The image is too small to print sharply. Use one at least ${CERTIFICATE_DESIGN_MIN_IMAGE_SIDE} pixels wide, or a PDF.`,
      };
    }
    if (size.width >= size.height) {
      pageWidth = PAGE_WIDTH;
      pageHeight = (PAGE_WIDTH * size.height) / size.width;
    } else {
      pageHeight = PAGE_WIDTH;
      pageWidth = (PAGE_WIDTH * size.width) / size.height;
    }
  }
  pageWidth = Math.round(pageWidth * 100) / 100;
  pageHeight = Math.round(pageHeight * 100) / 100;
  try {
    await renderCertificatePdf(SAMPLE_CERTIFICATE, {
      kind: "upload",
      contentType,
      bytes,
      pageWidth,
      pageHeight,
      layout: DEFAULT_CERTIFICATE_LAYOUT,
    });
  } catch {
    return {
      ok: false,
      reason:
        "A certificate could not be drawn on this file. Export it again (PDF, PNG or JPEG) and upload that.",
    };
  }
  return { ok: true, pageWidth, pageHeight };
}
