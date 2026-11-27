/**
 * The built-in certificate: ProCodrr's navy design (finalised 26-27 Nov
 * 2026).
 *
 * The background is artwork only (`assets/navy-sheet.jpg`: navy, frame,
 * wave; no text). Everything written on the certificate is drawn here with
 * the template's fonts:
 * - fixed text: "Certificate of Completion" and its gold rule, "AWARDED
 *   TO", "In recognition of successful completion of", the signature's
 *   gold rule, "ANURAG SINGH" and "Founder & Instructor";
 * - the certificate's details: the learner's name, the course and its
 *   line, and the footer (issue date, QR code, "Verify Certificate", the
 *   /verify address, the certificate ID).
 *
 * The background, the badge and the signature can each be replaced by one
 * uploaded in Platform > Certificates. Without uploads the defaults are
 * drawn as JPEG tiles laid on the default background (no transparency to
 * embed, so the PDF stays small); on an uploaded background the defaults'
 * transparent PNGs are used instead.
 */

import QRCode from "qrcode";

export interface CertificateImage {
  data: Buffer;
  width: number;
  height: number;
}

/** What the design needs from the template's files. */
export interface BuiltinDesignAssets {
  /** The default background: artwork only, A4 landscape proportions. */
  sheet: Buffer;
  /** The default badge laid on the default background (JPEG tile). */
  badgeTile: CertificateImage;
  /** The default badge on transparency (for uploaded backgrounds). */
  badge: CertificateImage;
  /** Anurag Singh's signature laid on the default background (JPEG tile). */
  signatureTile: CertificateImage;
  /** Anurag Singh's signature, white on transparency. */
  signature: CertificateImage;
  /** Whether `font` has every letter of `text` (names are checked). */
  covers: (font: string, text: string) => boolean;
}

/** Images uploaded in Platform > Certificates; each replaces the default. */
export interface BuiltinDesignUploads {
  background?: CertificateImage | null;
  badge?: CertificateImage | null;
  signature?: CertificateImage | null;
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

/** Where the badge goes (the default badge's tile fills it exactly). */
const BADGE_BOX = { x: 556.24, y: 58.64, w: 240.32, h: 300.3 };
/** Where the signature goes: centred on x 690, its bottom on y 498. */
const SIGNATURE_BOX = { x: 604, y: 446, w: 172, h: 52 };

const GOLD_RULE: [string, number][] = [
  ["#C9A24E", 0.75],
  ["#F3DC9B", 1],
  ["#C9A24E", 0.75],
];

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

function widthOf(doc: Doc, value: string, characterSpacing = 0) {
  return doc.widthOfString(value, { ...PLAIN, characterSpacing });
}

/** The largest size, up to `size`, at which `value` fits `maxWidth`. */
function fit(doc: Doc, value: string, size: number, maxWidth: number) {
  doc.fontSize(size);
  const width = widthOf(doc, value);
  return width > maxWidth ? (size * maxWidth) / width : size;
}

/**
 * Writes `value` at `size`, letter-spaced so it runs exactly `width`
 * (the design's spacing); `centre` centres it on x instead of starting there.
 */
function spaced(
  doc: Doc,
  value: string,
  x: number,
  baseline: number,
  size: number,
  width: number,
  centre = false,
) {
  doc.fontSize(size);
  const spacing = Math.max(
    0,
    (width - widthOf(doc, value)) / Math.max(1, value.length - 1),
  );
  const drawn = widthOf(doc, value, spacing) - spacing;
  text(doc, value, centre ? x - drawn / 2 : x, baseline, spacing);
}

function wrap(doc: Doc, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/u).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (!current || widthOf(doc, next) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function goldRule(doc: Doc, x0: number, x1: number, y: number, height: number) {
  const fill = doc.linearGradient(x0, 0, x1, 0);
  GOLD_RULE.forEach(([color, opacity], i) =>
    fill.stop(i / (GOLD_RULE.length - 1), color, opacity),
  );
  doc.rect(x0, y, x1 - x0, height).fill(fill);
}

/** Draws the whole built-in certificate onto an A4-landscape page. */
export function drawBuiltinCertificate(
  doc: Doc,
  assets: BuiltinDesignAssets,
  d: BuiltinDesignDetails,
  uploads: BuiltinDesignUploads = {},
) {
  const ownBackground = uploads.background ?? null;
  if (ownBackground) {
    doc.image(ownBackground.data, 0, 0, {
      cover: [W, H],
      align: "center",
      valign: "center",
    });
  } else {
    doc.image(assets.sheet, 0, 0, { width: W, height: H });
  }

  // The badge in the seal's place.
  if (uploads.badge || ownBackground) {
    const badge = uploads.badge ?? assets.badge;
    doc.image(badge.data, BADGE_BOX.x, BADGE_BOX.y, {
      fit: [BADGE_BOX.w, BADGE_BOX.h],
      align: "center",
      valign: "center",
    });
  } else {
    doc.image(assets.badgeTile.data, BADGE_BOX.x, BADGE_BOX.y, {
      width: BADGE_BOX.w,
    });
  }

  heading(doc);
  details(doc, assets, d);
  signature(doc, assets, uploads, ownBackground !== null);
  footer(doc, d);
}

/** "Certificate of Completion", its gold rule, and "AWARDED TO". */
function heading(doc: Doc) {
  const title = "Certificate of Completion";
  doc.font(SERIF);
  const size = fit(doc, title, 60, 435);
  const fill = doc.linearGradient(0, 134 - size * 0.72, 0, 136);
  fill.stop(0, "#FFFFFF").stop(1, "#CFCBF7");
  doc.fontSize(size).fillColor(fill);
  text(doc, title, LEFT, 134);
  goldRule(doc, LEFT + 0.6, LEFT + 137, 151.6, 1.5);
  doc.font(SANS).fillColor("#D9DCF2");
  spaced(doc, "AWARDED TO", LEFT + 2.2, 184.6, 10.4, 126.5);
}

/** The name, "In recognition of…", the course and its line. */
function details(
  doc: Doc,
  assets: BuiltinDesignAssets,
  d: BuiltinDesignDetails,
) {
  // The name: large serif, white fading to lavender.
  const nameFont = assets.covers(SERIF, d.recipientName) ? SERIF : FALLBACK;
  doc.font(nameFont);
  const nameSize = fit(doc, d.recipientName, 68, COLUMN);
  const nameFill = doc.linearGradient(0, 253 - nameSize * 0.72, 0, 255);
  nameFill.stop(0, "#FFFFFF").stop(1, "#BCC6FF");
  doc.fontSize(nameSize).fillColor(nameFill);
  text(doc, d.recipientName, LEFT, 253);

  doc.font(SANS).fillColor("#DADDF2");
  const lead = "In recognition of successful completion of";
  doc.fontSize(fit(doc, lead, 20, 327.5));
  text(doc, lead, LEFT, 289);

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
}

/**
 * The signature over its gold rule, "ANURAG SINGH" and "Founder &
 * Instructor".
 */
function signature(
  doc: Doc,
  assets: BuiltinDesignAssets,
  uploads: BuiltinDesignUploads,
  ownBackground: boolean,
) {
  if (uploads.signature || ownBackground) {
    const image = uploads.signature ?? assets.signature;
    doc.image(image.data, SIGNATURE_BOX.x, SIGNATURE_BOX.y, {
      fit: [SIGNATURE_BOX.w, SIGNATURE_BOX.h],
      align: "center",
      valign: "bottom",
    });
  } else {
    const tile = assets.signatureTile;
    const height = (SIGNATURE_BOX.w * tile.height) / tile.width;
    doc.image(tile.data, SIGNATURE_BOX.x, 498 - height, {
      width: SIGNATURE_BOX.w,
    });
  }
  goldRule(doc, 593, 782, 506, 1.2);
  doc.font(SANS_BOLD).fillColor("#FFFFFF");
  spaced(doc, "ANURAG SINGH", 688, 527.3, 10, 128.7, true);
  doc.font(SANS).fillColor("#C9CCE8");
  spaced(doc, "Founder & Instructor", 688, ROLE_BASELINE, 9.6, 135.5, true);
}

/** The baseline "Founder & Instructor" sits on, under the signature. */
const ROLE_BASELINE = 544.7;
const MUTED = "#C9CCE8";

/**
 * The footer, left to right: the issue date; a fine divider; the QR code
 * (opens the certificate's page); "Verify Certificate", the /verify
 * address and the certificate ID. The ID line sits on the signature
 * title's baseline and the QR code ends there, as in the design.
 */
function footer(doc: Doc, d: BuiltinDesignDetails) {
  doc.font(SANS).fontSize(8.6).fillColor(MUTED);
  text(doc, "ISSUED ON", LEFT + 1, 509, 2.4);
  doc.font(SANS_BOLD).fontSize(18.5).fillColor("#FFFFFF");
  text(doc, formatShortDate(d.issuedOn), LEFT, 536);

  doc
    .save()
    .lineWidth(0.7)
    .strokeOpacity(0.45)
    .moveTo(223, 500)
    .lineTo(223, 543)
    .stroke("#C9CCE8")
    .restore();

  const size = 50;
  const qrLeft = 252;
  const qrTop = ROLE_BASELINE + 3.5 - size;
  qrCode(doc, d.verifyUrl, qrLeft, qrTop, size);

  const x = qrLeft + size + 16;
  doc.font(SANS_BOLD).fontSize(15).fillColor("#FFFFFF");
  text(doc, "Verify Certificate", x, 509.5);
  const headingWidth = doc.widthOfString("Verify Certificate");
  linkIcon(doc, x + 5, 522.4);
  const host = d.verifyUrlShort.split("/")[0] ?? d.verifyUrlShort;
  const address = `${host}/verify`;
  doc.font(SANS_BOLD).fontSize(10.4).fillColor("#E6E8F8");
  text(doc, address, x + 16, 526.6, 0.2);
  const addressWidth =
    16 + doc.widthOfString(address, { characterSpacing: 0.2 });
  const id = `CERTIFICATE ID: ${d.displayCode}`;
  doc.font(SANS).fontSize(8.3).fillColor(MUTED);
  text(doc, id, x, ROLE_BASELINE, 1);
  const idWidth = doc.widthOfString(id, { characterSpacing: 1 });

  // Clicking the QR code or the verify block opens the certificate's page
  // (the address the QR code holds), in PDF viewers that follow links.
  doc.link(qrLeft, qrTop, size, size, d.verifyUrl);
  const blockTop = 496;
  doc.link(
    x - 2,
    blockTop,
    Math.max(headingWidth, addressWidth, idWidth) + 4,
    ROLE_BASELINE + 3.5 - blockTop,
    d.verifyUrl,
  );
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
