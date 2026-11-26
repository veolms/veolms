/**
 * The built-in certificate: ProCodrr's navy design (finalised 26 Nov 2026).
 *
 * Deep navy page with a gold-and-lavender frame and a glowing wave; on the
 * left "Certificate of Completion", the learner's name, the course and a
 * footer with the certificate ID, the date and where to check it; on the
 * right the ProCodrr seal (laurels, ribbons) and Anurag Singh's signature.
 *
 * Everything is vector (pdfkit): the glows are layered strokes and
 * gradients with transparency, never images, so the page is sharp at any
 * size and small. Only the signature is a picture (a white PNG).
 */

/** What the design needs from the template's files. */
export interface BuiltinDesignAssets {
  /** The ProCodrr logo's paths: [0] the P's bowl, [1] its stem. */
  logoPaths: { d: string; fill: string }[];
  signature: { data: Buffer; width: number; height: number };
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

const NAVY = "#0A0F33";
const LAVENDER = "#B9B4FF";
const MUTED = "#C8CBE8";
const GOLD = "#D9B45A";

/** Left edge of the text column, and how wide it may run (to the seal). */
const LEFT = 65;
const COLUMN = 500;

/**
 * No ligatures: "fi" drawn as one glyph reads as "f" when the PDF is
 * searched or copied ("Certifcate"). Measured the same way it is drawn.
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

/** "2026-11-26" → "26 NOV 2026". */
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

function background(doc: Doc) {
  const base = doc.linearGradient(0, 0, W, H);
  base.stop(0, "#121A52").stop(0.45, NAVY).stop(1, "#060920");
  doc.rect(0, 0, W, H).fill(base);
  // Soft light behind the title, and the seal's purple haze.
  const haze = doc.radialGradient(250, 150, 0, 250, 150, 420);
  haze.stop(0, "#2A3290", 0.45).stop(1, "#2A3290", 0);
  doc.rect(0, 0, W, H).fill(haze);
  const sealHaze = doc.radialGradient(672, 175, 0, 672, 175, 210);
  sealHaze.stop(0, "#6D4BFF", 0.32).stop(1, "#6D4BFF", 0);
  doc.rect(0, 0, W, H).fill(sealHaze);
}

function frame(doc: Doc) {
  const outer = doc.linearGradient(0, 0, W, H);
  outer.stop(0, GOLD).stop(0.5, "#9F8CFF").stop(1, GOLD);
  doc
    .save()
    .lineWidth(1.3)
    .roundedRect(13.5, 14.5, W - 27, H - 29, 10)
    .stroke(outer)
    .restore();
  doc
    .save()
    .lineWidth(0.6)
    .strokeOpacity(0.45)
    .roundedRect(20, 21, W - 40, H - 42, 7)
    .stroke("#9AA0E8")
    .restore();
}

/** The wave across the lower half: a bright core in layered glow. */
function wave(doc: Doc) {
  const path = () =>
    doc
      .moveTo(22, 425)
      .bezierCurveTo(140, 470, 300, 488, 470, 450)
      .bezierCurveTo(600, 420, 720, 380, 822, 388);
  const glow = doc.radialGradient(300, 470, 0, 300, 470, 300);
  glow.stop(0, "#5B4BFF", 0.22).stop(1, "#5B4BFF", 0);
  doc.rect(0, 0, W, H).fill(glow);
  for (const [width, opacity, color] of [
    [22, 0.05, "#6D5BFF"],
    [14, 0.08, "#6D5BFF"],
    [8, 0.14, "#7F6BFF"],
    [4, 0.28, "#8F85FF"],
    [1.8, 0.7, "#AFB8FF"],
    [0.7, 1, "#EEF0FF"],
  ] as const) {
    doc.save().lineWidth(width).strokeOpacity(opacity).lineCap("round");
    path();
    doc.stroke(color).restore();
  }
}

/** A star-shaped glint of light. */
function glint(doc: Doc, x: number, y: number, size: number) {
  const halo = doc.radialGradient(x, y, 0, x, y, size * 2.2);
  halo.stop(0, "#FFFFFF", 0.8).stop(0.3, "#B7A9FF", 0.35).stop(1, "#B7A9FF", 0);
  doc.circle(x, y, size * 2.2).fill(halo);
  doc
    .polygon(
      [x, y - size],
      [x + size * 0.12, y - size * 0.12],
      [x + size, y],
      [x + size * 0.12, y + size * 0.12],
      [x, y + size],
      [x - size * 0.12, y + size * 0.12],
      [x - size, y],
      [x - size * 0.12, y - size * 0.12],
    )
    .fill("#FFFFFF");
}

/**
 * A laurel branch curving up one side of the P, from the bottom of the
 * face: a gold stem with pairs of light leaves along it.
 */
function laurel(doc: Doc, cx: number, cy: number, side: 1 | -1) {
  const radius = 54;
  // Angles on the page (0° = right, 90° = down): from the bottom up the side.
  const from = side === -1 ? 112 : 68;
  const to = side === -1 ? 205 : -25;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  };
  doc.save().lineWidth(1.1).strokeColor(GOLD).lineCap("round");
  const steps = 30;
  for (let i = 0; i <= steps; i += 1) {
    const [x, y] = at(from + ((to - from) * i) / steps);
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.stroke().restore();
  const leafFill = doc.linearGradient(cx - 60, cy - 60, cx + 60, cy + 60);
  leafFill.stop(0, "#FFFFFF").stop(1, "#B3A6FF");
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const deg = from + ((to - from) * (i + 0.6)) / count;
    const [x, y] = at(deg);
    const [nx, ny] = at(deg + (to > from ? 1 : -1));
    // The direction the branch grows, in degrees on the page.
    const growth = (Math.atan2(ny - y, nx - x) * 180) / Math.PI;
    const size = 9.5 - i * 0.6;
    for (const tilt of [-42, 42]) {
      doc
        .save()
        .translate(x, y)
        .rotate(growth + tilt)
        .translate(size * 0.95, 0)
        .ellipse(0, 0, size, size * 0.38)
        .fill(leafFill)
        .restore();
    }
  }
  // A leaf at the tip.
  const [tx, ty] = at(to);
  const [px, py] = at(to - (to > from ? 1 : -1));
  const tip = (Math.atan2(ty - py, tx - px) * 180) / Math.PI;
  doc
    .save()
    .translate(tx, ty)
    .rotate(tip)
    .translate(5, 0)
    .ellipse(0, 0, 6, 2.4)
    .fill(leafFill)
    .restore();
}

function seal(doc: Doc, assets: BuiltinDesignAssets) {
  const cx = 672;
  const cy = 162;
  // Ribbons first, behind the medal.
  const ribbon = doc.linearGradient(cx - 60, cy + 60, cx + 60, cy + 180);
  ribbon.stop(0, "#7B5CFF").stop(1, "#4B2FD6");
  const edge = (points: [number, number][]) => {
    doc.polygon(...points).fill(ribbon);
    doc
      .save()
      .lineWidth(1.4)
      .polygon(...points)
      .stroke(GOLD)
      .restore();
  };
  edge([
    [cx - 58, cy + 70],
    [cx - 28, cy + 82],
    [cx - 46, cy + 162],
    [cx - 60, cy + 146],
    [cx - 80, cy + 160],
  ]);
  edge([
    [cx + 58, cy + 70],
    [cx + 28, cy + 82],
    [cx + 46, cy + 162],
    [cx + 60, cy + 146],
    [cx + 80, cy + 160],
  ]);
  edge([
    [cx - 32, cy + 78],
    [cx + 32, cy + 78],
    [cx + 32, cy + 178],
    [cx, cy + 156],
    [cx - 32, cy + 178],
  ]);

  // Glow around the medal.
  const glow = doc.radialGradient(cx, cy, 70, cx, cy, 128);
  glow.stop(0, "#8A6BFF", 0.55).stop(1, "#8A6BFF", 0);
  doc.circle(cx, cy, 128).fill(glow);

  // Gold rim, a lavender ring, a fine ticked ring, then the dark face.
  const rim = doc.linearGradient(cx - 95, cy - 95, cx + 95, cy + 95);
  rim
    .stop(0, "#F6DE9A")
    .stop(0.35, "#B8862E")
    .stop(0.6, "#F2D58A")
    .stop(1, "#9C6E1E");
  doc.circle(cx, cy, 96).fill(rim);
  const ring = doc.linearGradient(cx, cy - 92, cx, cy + 92);
  ring.stop(0, "#C9B8FF").stop(1, "#6B4DFF");
  doc.circle(cx, cy, 91).fill(ring);
  doc.circle(cx, cy, 86).fill("#0D1340");
  doc.save().lineWidth(0.5).strokeColor("#7E86D8").strokeOpacity(0.7);
  for (let i = 0; i < 180; i += 1) {
    const a = (i * Math.PI) / 90;
    doc
      .moveTo(cx + 79 * Math.cos(a), cy + 79 * Math.sin(a))
      .lineTo(cx + 84 * Math.cos(a), cy + 84 * Math.sin(a));
  }
  doc.stroke().restore();
  const face = doc.radialGradient(cx, cy - 20, 0, cx, cy, 78);
  face.stop(0, "#1C2470").stop(1, "#0B1036");
  doc.circle(cx, cy, 77).fill(face);
  doc.save().lineWidth(0.8).circle(cx, cy, 77).stroke(GOLD).restore();

  // "ProCodrr" and the P mark.
  doc.font(SANS_BOLD).fontSize(12).fillColor("#FFFFFF");
  const word = "ProCodrr";
  text(doc, word, cx - doc.widthOfString(word, PLAIN) / 2, cy - 44);
  const [bowl, stem] = assets.logoPaths;
  if (bowl && stem) {
    const scale = 0.4;
    const markX = cx - (110 * scale) / 2;
    const markY = cy - 26;
    const bowlFill = doc.linearGradient(markX, markY, markX + 44, markY + 40);
    bowlFill.stop(0, "#F472D0").stop(1, "#8B5CF6");
    const stemFill = doc.linearGradient(markX, markY + 10, markX, markY + 62);
    stemFill.stop(0, "#38BDF8").stop(1, "#6366F1");
    doc.save().translate(markX, markY).scale(scale);
    doc.path(stem.d).fill(stemFill);
    doc.path(bowl.d).fill(bowlFill);
    doc.restore();
  }
  laurel(doc, cx, cy + 2, -1);
  laurel(doc, cx, cy + 2, 1);

  glint(doc, cx + 70, cy - 64, 9);
  glint(doc, cx - 80, cy + 30, 4);
}

function headings(doc: Doc) {
  const title = "Certificate of Completion";
  const titleFill = doc.linearGradient(0, 100, 0, 140);
  titleFill.stop(0, "#FFFFFF").stop(1, "#D6D3FF");
  doc.font(SERIF);
  doc.fontSize(fit(doc, title, 44, 440)).fillColor(titleFill);
  text(doc, title, LEFT, 134);
  const rule = doc.linearGradient(LEFT, 0, LEFT + 136, 0);
  rule.stop(0, GOLD).stop(1, "#F3DC9B");
  doc.rect(LEFT + 1, 151.5, 136, 1.3).fill(rule);
  doc.font(SANS).fontSize(10.5).fillColor(MUTED);
  text(doc, "AWARDED TO", LEFT + 2, 185, 4.2);
  doc.font(SANS).fontSize(13).fillColor("#DADDF2");
  text(doc, "In recognition of successful completion of", LEFT, 290);
}

function signature(doc: Doc, assets: BuiltinDesignAssets) {
  const cx = 688;
  const width = 172;
  const height = (width * assets.signature.height) / assets.signature.width;
  doc.image(assets.signature.data, cx - width / 2, 478 - height, { width });
  const rule = doc.linearGradient(cx - 95, 0, cx + 95, 0);
  rule.stop(0, GOLD, 0.6).stop(0.5, "#F3DC9B").stop(1, GOLD, 0.6);
  doc.rect(cx - 95, 484, 190, 1.1).fill(rule);
  doc.font(SANS_BOLD).fontSize(10).fillColor("#FFFFFF");
  const name = "ANURAG SINGH";
  const nameWidth = doc.widthOfString(name, {
    ...PLAIN,
    characterSpacing: 2.6,
  });
  text(doc, name, cx - nameWidth / 2, 505, 2.6);
  doc.font(SANS).fontSize(9.6).fillColor(MUTED);
  const role = "Founder & Instructor";
  const roleWidth = doc.widthOfString(role, {
    ...PLAIN,
    characterSpacing: 0.8,
  });
  text(doc, role, cx - roleWidth / 2, 523, 0.8);
}

/** The learner's name, the course and the footer line. */
function details(
  doc: Doc,
  assets: BuiltinDesignAssets,
  d: BuiltinDesignDetails,
) {
  const nameFont = assets.covers(SERIF, d.recipientName) ? SERIF : FALLBACK;
  doc.font(nameFont);
  const nameSize = fit(doc, d.recipientName, 62, COLUMN);
  const nameFill = doc.linearGradient(0, 250 - nameSize * 0.75, 0, 252);
  nameFill.stop(0, "#FFFFFF").stop(1, "#C3C0FF");
  doc.fontSize(nameSize).fillColor(nameFill);
  text(doc, d.recipientName, LEFT - 1, 250);

  // The course: one line, as large as fits; two lines when it is long.
  const courseFill = doc.linearGradient(LEFT, 0, LEFT + COLUMN, 0);
  courseFill.stop(0, "#FFFFFF").stop(0.55, "#FFFFFF").stop(1, LAVENDER);
  doc.font(SANS_BOLD);
  const oneLine = fit(doc, d.courseTitle, 27, COLUMN);
  if (oneLine >= 19) {
    doc.fontSize(oneLine).fillColor(courseFill);
    text(doc, d.courseTitle, LEFT, 337);
  } else {
    doc.fontSize(19).fillColor(courseFill);
    const lines = wrap(doc, d.courseTitle, COLUMN).slice(0, 2);
    lines.forEach((line, i) => text(doc, line, LEFT, 330 + i * 24));
  }

  // Footer: ID • date • where to check it.
  doc.font(SANS).fontSize(8.6).fillColor(MUTED);
  let x = LEFT + 1;
  const parts = [d.displayCode, formatShortDate(d.issuedOn), d.verifyUrlShort];
  parts.forEach((part, i) => {
    if (i > 0) {
      doc.circle(x + 9, 520.8, 1.3).fill(MUTED);
      doc.fillColor(MUTED);
      x += 18;
    }
    text(doc, part, x, 524, 1.1);
    x += doc.widthOfString(part, { ...PLAIN, characterSpacing: 1.1 });
  });
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
  background(doc);
  wave(doc);
  frame(doc);
  seal(doc, assets);
  headings(doc);
  signature(doc, assets);
  details(doc, assets, d);
}
