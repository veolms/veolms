/**
 * The built-in certificate: ProCodrr's navy design (finalised 26 Nov 2026).
 *
 * The page is the finalised design itself (`assets/navy-sheet.jpg`: the
 * owner's picture with its sample details removed). pdfkit draws only the
 * certificate's own details on it, where the design shows them: the
 * learner's name, the course, and the footer line (certificate ID, date,
 * where to check it).
 */

/** What the design needs from the template's files. */
export interface BuiltinDesignAssets {
  /** The design without its details (A4 landscape proportions). */
  sheet: Buffer;
  /** Whether `font` has every letter of `text` (names are checked). */
  covers: (font: string, text: string) => boolean;
}

export interface BuiltinDesignDetails {
  recipientName: string;
  courseTitle: string;
  /** YYYY-MM-DD. */
  issuedOn: string;
  displayCode: string;
  verifyUrlShort: string;
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
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** "2026-11-26" → "26 NOV 2026", as the design writes it. */
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
  }

  // Footer: ID • date • where to check it.
  const muted = "#C9CCE8";
  doc.font(SANS).fontSize(8.8).fillColor(muted);
  let x = LEFT;
  [d.displayCode, formatShortDate(d.issuedOn), d.verifyUrlShort].forEach(
    (part, i) => {
      if (i > 0) {
        doc.circle(x + 10, 525.4, 1.3).fill(muted);
        doc.fillColor(muted);
        x += 20;
      }
      text(doc, part, x, 528.5, 1.4);
      x += doc.widthOfString(part, { ...PLAIN, characterSpacing: 1.4 });
    },
  );
}
