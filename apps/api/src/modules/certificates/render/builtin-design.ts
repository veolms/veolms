/**
 * The built-in certificate: ProCodrr's navy design (finalised 26 Nov 2026).
 *
 * The page is the finalised design itself (`assets/navy-sheet.jpg`: the
 * owner's picture with its sample details removed). pdfkit draws only the
 * certificate's own details on it, where the design shows them: the
 * learner's name, the course and its line, Anurag Singh's signature (a
 * high-resolution white PNG), and the footer: the issue date, the QR code
 * that opens the certificate's page, "Verify Certificate" with the
 * academy's /verify address, and the certificate ID.
 */

import QRCode from "qrcode";

/** What the design needs from the template's files. */
export interface BuiltinDesignAssets {
  /** The design without its details (A4 landscape proportions). */
  sheet: Buffer;
  /** Anurag Singh's signature, white, on the design behind it (JPEG). */
  signature: { data: Buffer; width: number; height: number };
  /** The ProCodrr badge (seal, laurels, ribbons) on the design behind it. */
  badge: { data: Buffer; width: number; height: number };
  /** Whether `font` has every letter of `text` (names are checked). */
  covers: (font: string, text: string) => boolean;
}

export interface BuiltinDesignDetails {
  recipientName: string;
  courseTitle: string;
  /** YYYY-MM-DD. */
  issuedOn: string;
  displayCode: string;
  /** The certificate's page, which the QR code opens. */
  verifyUrl: string;
  /** That address without "https://"; its host names the /verify page. */
  verifyUrlShort: string;
  /** The line under the course title, or none. */
  courseNote?: string | null;
}

type Doc = PDFKit.PDFDocument;

const W = 841.89;
const H = 595.28;

const SERIF = "DMSerifDisplay-400.ttf";
const SANS = "Montserrat-500.ttf";
const SANS_BOLD = "Montserrat-600.ttf";
/** For the rare letter the display serif lacks. */
const FALLBACK = "Arimo-400.ttf";

/** Where the design's text column starts, and how far it may run (to the seal). */
const LEFT = 65;
const COLUMN = 500;

/**
 * No ligatures: "fi" drawn as one glyph reads as "f" when the PDF is
 * searched or copied. Measured the same way it is drawn.
 */
const PLAIN = {
  features: { liga: false },
} as unknown as PDFKit.Mixins.TextOptions;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-26" → "26 Nov 2026", as the design writes it. */
export function formatShortDate(issuedOn: string): string {
  const [year, month, day] = issuedOn.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

function text(
  doc: Doc,
  value: string,
  x: number,
  baseline: number,
  characterSpacing = 0,
) {
  doc.text(value, x, baseline, {
    ...PLAIN,
    baseline: "alphabetic",
    lineBreak: false,
    characterSpacing,
  });
}

/** The largest size, up to `size`, at which `value` fits `maxWidth`. */
function fit(doc: Doc, value: string, size: number, maxWidth: number) {
  doc.fontSize(size);
  const width = doc.widthOfString(value, PLAIN);
  return width > maxWidth ? (size * maxWidth) / width : size;
}

function wrap(doc: Doc, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/u).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (!current || doc.widthOfString(next, PLAIN) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draws the whole built-in certificate onto an A4-landscape page. */
export function drawBuiltinCertificate(
  doc: Doc,
  assets: BuiltinDesignAssets,
  d: BuiltinDesignDetails,
) {
  doc.image(assets.sheet, 0, 0, { width: W, height: H });
  // The badge where the design's seal was; its glow runs past the medal.
  doc.image(assets.badge.data, 519, 64, { width: 296.87 });

  // The name: large serif, white fading to lavender, as in the design.
  const nameFont = assets.covers(SERIF, d.recipientName) ? SERIF : FALLBACK;
  doc.font(nameFont);
  const nameSize = fit(doc, d.recipientName, 68, COLUMN);
  const nameFill = doc.linearGradient(0, 253 - nameSize * 0.72, 0, 255);
  nameFill.stop(0, "#FFFFFF").stop(1, "#BCC6FF");
  doc.fontSize(nameSize).fillColor(nameFill);
  text(doc, d.recipientName, LEFT, 253);

  // The course: bold, white turning lavender at its end; on two lines
  // when it is too long for one at a readable size.
  const courseFill = doc.linearGradient(LEFT, 0, LEFT + COLUMN, 0);
  courseFill.stop(0, "#FFFFFF").stop(0.6, "#FFFFFF").stop(1, "#C9B8FF");
  doc.font(SANS_BOLD);
  const oneLine = fit(doc, d.courseTitle, 30, COLUMN);
  // Where the line under the course goes: below the title's last line.
  let noteBaseline = 364;
  if (oneLine >= 21) {
    doc.fontSize(oneLine).fillColor(courseFill);
    text(doc, d.courseTitle, LEFT, 337.5);
  } else {
    // Two lines, as large as lets the whole title fit in two.
    let size = 21;
    let lines = wrap(doc.fontSize(size), d.courseTitle, COLUMN);
    while (lines.length > 2 && size > 12) {
      size -= 0.5;
      lines = wrap(doc.fontSize(size), d.courseTitle, COLUMN);
    }
    doc.fillColor(courseFill);
    lines.forEach((line, i) => text(doc, line, LEFT, 332 + i * size * 1.24));
    noteBaseline = 332 + (lines.length - 1) * size * 1.24 + 22;
  }

  // The course's line: "270+ hours of comprehensive coursework."
  if (d.courseNote) {
    doc.font(SANS).fillColor("#D3D6F0");
    doc.fontSize(fit(doc, d.courseNote, 12.4, COLUMN));
    text(doc, d.courseNote, LEFT + 2, noteBaseline, 0.5);
  }

  signature(doc, assets);
  footer(doc, d);
}

/** Anurag Singh's signature, centred over the gold rule. */
function signature(doc: Doc, assets: BuiltinDesignAssets) {
  const width = 172;
  const height = (width * assets.signature.height) / assets.signature.width;
  doc.image(assets.signature.data, 690 - width / 2, 488 - height, { width });
}

/** The baseline "Founder & Instructor" sits on, under the signature. */
const ROLE_BASELINE = 534.7;
const MUTED = "#C9CCE8";

/**
 * The footer, left to right: the issue date; a fine divider; the QR code
 * (opens the certificate's page); "Verify Certificate", the /verify
 * address and the certificate ID. The ID line sits on the signature
 * title's baseline and the QR code ends there, as in the design.
 */
function footer(doc: Doc, d: BuiltinDesignDetails) {
  doc.font(SANS).fontSize(8.6).fillColor(MUTED);
  text(doc, "ISSUED ON", LEFT + 1, 499, 2.4);
  doc.font(SANS_BOLD).fontSize(18.5).fillColor("#FFFFFF");
  text(doc, formatShortDate(d.issuedOn), LEFT, 526);

  doc
    .save()
    .lineWidth(0.7)
    .strokeOpacity(0.45)
    .moveTo(223, 490)
    .lineTo(223, 533)
    .stroke("#C9CCE8")
    .restore();

  const size = 50;
  const qrLeft = 252;
  const qrTop = ROLE_BASELINE + 3.5 - size;
  qrCode(doc, d.verifyUrl, qrLeft, qrTop, size);

  const x = qrLeft + size + 16;
  doc.font(SANS_BOLD).fontSize(15).fillColor("#FFFFFF");
  text(doc, "Verify Certificate", x, 499.5);
  linkIcon(doc, x + 5, 512.4);
  const host = d.verifyUrlShort.split("/")[0] ?? d.verifyUrlShort;
  doc.font(SANS_BOLD).fontSize(10.4).fillColor("#E6E8F8");
  text(doc, `${host}/verify`, x + 16, 516.6, 0.2);
  doc.font(SANS).fontSize(8.3).fillColor(MUTED);
  text(doc, `CERTIFICATE ID: ${d.displayCode}`, x, ROLE_BASELINE, 1);
}

/** The QR code on a white rounded tile, dark modules for easy scanning. */
function qrCode(
  doc: Doc,
  url: string,
  left: number,
  top: number,
  size: number,
) {
  const pad = 4.2;
  doc.roundedRect(left, top, size, size, 5.5).fill("#FFFFFF");
  const code = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = code.modules.size;
  const cell = (size - pad * 2) / n;
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      if (code.modules.get(row, column)) {
        doc.rect(
          left + pad + column * cell,
          top + pad + row * cell,
          cell + 0.02,
          cell + 0.02,
        );
      }
    }
  }
  doc.fill("#0B1036");
}

/** A small chain-link icon centred on (cx, cy). */
function linkIcon(doc: Doc, cx: number, cy: number) {
  doc
    .save()
    .translate(cx, cy)
    .rotate(-45)
    .lineWidth(1.25)
    .strokeColor("#E6E8F8");
  doc.roundedRect(-6.2, -2.4, 6.6, 4.8, 2.4).stroke();
  doc.roundedRect(-0.4, -2.4, 6.6, 4.8, 2.4).stroke();
  doc.restore();
}
