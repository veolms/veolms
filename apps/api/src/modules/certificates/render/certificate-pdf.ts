import fs from "node:fs";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";
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
  const signatureWidth = 124;
  const signatureHeight =
    (signatureWidth * template.signature.height) / template.signature.width;
  doc.image(template.signature.data, 76, ruleY - 6 - signatureHeight, {
    width: signatureWidth,
  });
  doc.save().lineWidth(1.9).strokeColor("#C9CCD1").dash(5, { space: 1.6 });
  for (const [a, b] of [signatureRule, dateRule]) {
    doc.moveTo(a, ruleY).lineTo(b, ruleY).stroke();
  }
  doc.undash().restore();
  doc.font(BODY_FONT).fontSize(9.6).fillColor("#6B6B6B");
  centered(doc, "Signature", (signatureRule[0] + signatureRule[1]) / 2, 544.5);
  centered(doc, "Date", (dateRule[0] + dateRule[1]) / 2, 544.5);
}

async function drawDetails(
  doc: Doc,
  template: LoadedTemplate,
  input: CertificateRenderInput,
) {
  const W = PAGE_WIDTH;

  // Code, top right.
  doc.font(BODY_FONT).fontSize(7.6).fillColor("#6B6B6B");
  const codeWidth = doc.widthOfString(input.displayCode, {
    characterSpacing: 0.2,
  });
  doc.text(input.displayCode, 800 - codeWidth, 66, {
    baseline: "alphabetic",
    lineBreak: false,
    characterSpacing: 0.2,
  });

  // Name: shrinks from 40 pt to 22 pt to fit, then takes two lines.
  const name = input.recipientName;
  const nameFont = nameFontFor(template, name) ?? BODY_FONT;
  const maxNameWidth = 520;
  doc.font(nameFont);
  let size = 40;
  for (; size > 22; size -= 1) {
    doc.fontSize(size);
    if (doc.widthOfString(name) <= maxNameWidth) break;
  }
  doc.fontSize(size);
  const nameLines =
    doc.widthOfString(name) <= maxNameWidth
      ? [name]
      : wrapWords(doc, name, maxNameWidth).slice(0, 2);
  const nameBaseline = 360;
  const lineHeight = size * 1.05;
  let widest = 0;
  doc.fillColor("#B8861F");
  nameLines.forEach((line, index) => {
    const baseline = nameBaseline - lineHeight * (nameLines.length - 1 - index);
    widest = Math.max(widest, centered(doc, line, W / 2, baseline));
  });
  const underline = Math.max(260, widest + 20);
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor("#C9A24A")
    .dash(2, { space: 1.6 })
    .moveTo(W / 2 - underline / 2, nameBaseline + 6)
    .lineTo(W / 2 + underline / 2, nameBaseline + 6)
    .stroke()
    .undash()
    .restore();

  // Course line: wraps to three lines, then shrinks.
  const sentence = `Congratulations! You've successfully completed ${input.courseTitle
    .trim()
    .replace(/[.\s]+$/u, "")}.`;
  doc.font(BODY_FONT).fillColor("#0B0B0B");
  let lines: string[] = [];
  let bodySize = 10.2;
  for (; bodySize >= 8.6; bodySize -= 0.4) {
    doc.fontSize(bodySize);
    lines = wrapWords(doc, sentence, 300);
    if (lines.length <= 3) break;
  }
  lines.forEach((line, index) =>
    centered(doc, line, W / 2, 392 + index * bodySize * 1.16),
  );

  doc.font(BODY_FONT).fontSize(11).fillColor("#0B0B0B");
  centered(doc, formatIssuedOn(input.issuedOn), (627.6 + 779.9) / 2, 522);

  // Verify QR code and address, bottom centre.
  const qr = QRCode.create(input.verifyUrl, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  const qrSize = 46;
  const cell = qrSize / modules;
  const left = W / 2 - qrSize / 2;
  const top = 466;
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
  doc.fill("#2B2B2B");
  doc.font(BODY_FONT).fontSize(6.4).fillColor("#6B6B6B");
  centered(doc, `Verify at ${input.verifyUrlShort}`, W / 2, 524);
}

export async function renderCertificatePdf(
  input: CertificateRenderInput,
): Promise<Buffer> {
  const template = loadTemplate();
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: 0,
    compress: true,
    info: {
      Title: `Certificate of Completion — ${input.recipientName}`,
      Subject: input.courseTitle,
      Keywords: `certificate ${input.displayCode}`,
      Creator: "VeoLMS",
      Producer: "VeoLMS certificates",
      // The same certificate gives the same file.
      CreationDate: input.issuedAt,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const [file, data] of template.fonts) doc.registerFont(file, data);
  drawDesign(doc, template);
  await drawDetails(doc, template, input);
  doc.end();
  return await finished;
}
