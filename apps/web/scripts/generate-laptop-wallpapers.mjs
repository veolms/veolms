// Draws the wallpapers the laptop on the learner's home can show, and writes
// them to src/assets/home/wallpapers as WebP.
//
//   node scripts/generate-laptop-wallpapers.mjs [name ...] [--preview <dir>]
//
// They are drawn here rather than taken from a picture library so that the
// project owns them outright: nothing in them is anyone else's work. Each is
// a canvas drawing made from a fixed seed, so running this again gives the
// same files. With --preview it also writes a PNG of each to that folder.
//
// The laptop's screen is laid out at 800 by 530 (see HeroLaptopScreen); the
// files are twice that, for a sharp picture on a dense display.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const WIDTH = 1600;
const HEIGHT = 1060;
const WEBP_QUALITY = 0.8;

const outputDirectory = fileURLToPath(
  new URL("../src/assets/home/wallpapers/", import.meta.url),
);
const cliArguments = process.argv.slice(2);
const previewAt = cliArguments.indexOf("--preview");
const previewDirectory =
  previewAt >= 0 ? cliArguments[previewAt + 1] : undefined;
const wanted = cliArguments.filter(
  (argument, index) =>
    !argument.startsWith("--") && (previewAt < 0 || index !== previewAt + 1),
);

/** Runs in the page. Everything it needs is inside it. */
function draw({ name, width, height, quality }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  // A small seeded generator (mulberry32), so a wallpaper is the same on
  // every run.
  const seeded = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const fill = (style) => {
    context.fillStyle = style;
    context.fillRect(0, 0, width, height);
  };
  const linear = (x0, y0, x1, y1, stops) => {
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([at, colour]) => gradient.addColorStop(at, colour));
    return gradient;
  };
  const glow = (x, y, radius, colour) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  };
  /** Darkens the corners, as a screen photographed at an angle does. */
  const vignette = (strength) => {
    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.35,
      width / 2,
      height / 2,
      width * 0.75,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  };

  /**
   * A ribbon of silk: many fine lines that follow one curve and fan out and
   * close up again along it, so it reads as a sheet seen edge on, twisting.
   */
  const ribbon = ({
    lines,
    centre,
    waves,
    fan,
    colours,
    alpha,
    lineWidth = 1.4,
    blur = 0,
  }) => {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineWidth = lineWidth;
    if (blur) context.filter = `blur(${blur}px)`;
    for (let index = 0; index < lines; index += 1) {
      const t = index / (lines - 1);
      const offset = t - 0.5;
      context.beginPath();
      for (let x = -40; x <= width + 40; x += 8) {
        const u = x / width;
        let y = centre(u) * height;
        for (const [amplitude, frequency, phase, drift] of waves) {
          y +=
            amplitude *
            height *
            Math.sin(u * frequency * Math.PI * 2 + phase + offset * drift);
        }
        y += offset * fan(u) * height;
        if (x === -40) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      const edge = 1 - Math.abs(offset) * 2;
      context.globalAlpha = alpha * (0.35 + 0.65 * edge);
      context.strokeStyle = linear(0, 0, width, 0, colours);
      context.stroke();
    }
    context.restore();
  };

  /** A smooth height field made of a few broad hills. */
  const heightField = (random, hills) => {
    const bumps = Array.from({ length: hills }, () => ({
      x: random() * width,
      y: random() * height,
      radius: (0.1 + random() * 0.2) * width,
      height: 0.5 + random(),
    }));
    return (x, y) => {
      let value = 0;
      for (const bump of bumps) {
        const dx = (x - bump.x) / bump.radius;
        const dy = (y - bump.y) / bump.radius;
        value += bump.height * Math.exp(-(dx * dx + dy * dy));
      }
      return value;
    };
  };

  /**
   * Contour lines of a height field, found square by square. `from` and
   * `to` are shares of the field's own range, lowest ground to highest.
   */
  const contours = (field, { levels, from, to, cell, style }) => {
    const columns = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    const values = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        values[row * columns + column] = field(column * cell, row * cell);
      }
    }
    let lowest = Infinity;
    let highest = -Infinity;
    for (const value of values) {
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
    const cross = (a, b, level) => (level - a) / (b - a);
    for (let step = 0; step < levels; step += 1) {
      const share = from + ((to - from) * step) / (levels - 1);
      const level = lowest + (highest - lowest) * share;
      const look = style(step, level);
      context.beginPath();
      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const a = values[row * columns + column];
          const b = values[row * columns + column + 1];
          const c = values[(row + 1) * columns + column + 1];
          const d = values[(row + 1) * columns + column];
          const x = column * cell;
          const y = row * cell;
          const points = [];
          if (a > level !== b > level)
            points.push([x + cross(a, b, level) * cell, y]);
          if (b > level !== c > level)
            points.push([x + cell, y + cross(b, c, level) * cell]);
          if (d > level !== c > level)
            points.push([x + cross(d, c, level) * cell, y + cell]);
          if (a > level !== d > level)
            points.push([x, y + cross(a, d, level) * cell]);
          for (let index = 0; index + 1 < points.length; index += 2) {
            context.moveTo(points[index][0], points[index][1]);
            context.lineTo(points[index + 1][0], points[index + 1][1]);
          }
        }
      }
      context.globalAlpha = look.alpha;
      context.lineWidth = look.lineWidth;
      context.strokeStyle = look.colour;
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const stars = (random, count, colour) => {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = colour;
    for (let index = 0; index < count; index += 1) {
      const size = 0.6 + random() * random() * 2.4;
      context.globalAlpha = 0.25 + random() * 0.6;
      context.beginPath();
      context.arc(
        random() * width,
        random() * random() * height * 0.8,
        size,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  };

  /** A ridge of hills against the sky, filled down to the bottom edge. */
  const ridge = (random, { base, roughness, colours }) => {
    const waves = Array.from({ length: 5 }, (_, index) => [
      (roughness / (index + 1)) * (0.6 + random() * 0.8),
      (index + 1) * (0.7 + random() * 0.9),
      random() * Math.PI * 2,
    ]);
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width; x += 6) {
      const u = x / width;
      let y = base;
      for (const [amplitude, frequency, phase] of waves) {
        y += amplitude * Math.sin(u * frequency * Math.PI * 2 + phase);
      }
      context.lineTo(x, y * height);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = linear(0, base * height - 80, 0, height, colours);
    context.fill();
  };

  if (name === "silk") {
    fill(
      linear(0, 0, width, height, [
        [0, "#040817"],
        [0.5, "#081238"],
        [1, "#0b0f33"],
      ]),
    );
    glow(width * 0.16, height * 0.92, width * 0.6, "rgba(37,99,235,0.42)");
    glow(width * 0.9, height * 0.18, width * 0.55, "rgba(124,58,237,0.34)");
    glow(width * 0.55, height * 0.55, width * 0.4, "rgba(56,189,248,0.12)");
    const blues = [
      [0, "rgba(56,130,255,0.9)"],
      [0.5, "rgba(96,165,250,1)"],
      [1, "rgba(139,92,246,0.9)"],
    ];
    const violets = [
      [0, "rgba(99,102,241,0.9)"],
      [0.55, "rgba(168,85,247,1)"],
      [1, "rgba(59,130,246,0.85)"],
    ];
    const sheets = [
      {
        lines: 120,
        centre: (u) => 0.74 - 0.3 * u,
        waves: [
          [0.13, 0.9, 0.4, 1.8],
          [0.04, 2.2, 1.9, -2.6],
        ],
        fan: (u) => 0.34 * Math.sin(u * Math.PI * 1.5 + 0.5),
        colours: blues,
        alpha: 0.2,
      },
      {
        lines: 100,
        centre: (u) => 0.3 + 0.34 * u,
        waves: [
          [0.1, 1.1, 2.6, 2.2],
          [0.035, 2.6, 0.3, 3.1],
        ],
        fan: (u) => 0.28 * Math.cos(u * Math.PI * 1.7 + 0.2),
        colours: violets,
        alpha: 0.17,
      },
      {
        lines: 70,
        centre: (u) => 0.93 - 0.1 * u,
        waves: [[0.07, 1.4, 4.4, 1.5]],
        fan: (u) => 0.16 * Math.sin(u * Math.PI * 2.2 + 1.2),
        colours: blues,
        alpha: 0.14,
      },
    ];
    // Each sheet once out of focus, for its glow, and once sharp.
    for (const sheet of sheets) {
      ribbon({ ...sheet, lines: 26, lineWidth: 7, blur: 14, alpha: 0.11 });
    }
    for (const sheet of sheets) ribbon(sheet);
    vignette(0.5);
  }

  if (name === "contours") {
    const random = seeded(7421);
    fill(
      linear(0, 0, width, height, [
        [0, "#030613"],
        [0.55, "#07103a"],
        [1, "#0a0b2e"],
      ]),
    );
    glow(width * 0.2, height * 0.75, width * 0.6, "rgba(29,78,216,0.5)");
    glow(width * 0.86, height * 0.3, width * 0.5, "rgba(109,40,217,0.36)");
    const field = heightField(random, 16);
    context.globalCompositeOperation = "lighter";
    context.lineJoin = "round";
    contours(field, {
      levels: 34,
      from: 0.05,
      to: 0.95,
      cell: 6,
      style: (step) => ({
        // Every sixth line is drawn heavier, as on a map.
        alpha: step % 6 === 0 ? 0.62 : 0.26,
        lineWidth: step % 6 === 0 ? 2.2 : 1.1,
        colour: step % 6 === 0 ? "#7dd3fc" : "#4f7df9",
      }),
    });
    context.save();
    context.filter = "blur(10px)";
    contours(field, {
      levels: 6,
      from: 0.05,
      to: 0.95,
      cell: 10,
      style: () => ({ alpha: 0.4, lineWidth: 7, colour: "#3b82f6" }),
    });
    context.restore();
    ribbon({
      lines: 40,
      centre: (u) => 0.82 - 0.42 * u,
      waves: [
        [0.12, 1, 0.9, 1.4],
        [0.03, 2.4, 2.2, -2],
      ],
      fan: (u) => 0.1 * Math.sin(u * Math.PI * 1.6 + 0.4),
      colours: [
        [0, "rgba(59,130,246,0.9)"],
        [0.6, "rgba(125,211,252,1)"],
        [1, "rgba(129,140,248,0.9)"],
      ],
      alpha: 0.2,
      lineWidth: 1.6,
    });
    vignette(0.55);
  }

  if (name === "dusk") {
    const random = seeded(90210);
    fill(
      linear(0, 0, 0, height, [
        [0, "#0d0a26"],
        [0.38, "#2b1650"],
        [0.62, "#8a2f66"],
        [0.8, "#e0683f"],
        [1, "#f6b25a"],
      ]),
    );
    stars(random, 150, "#ffe9d2");
    glow(width * 0.64, height * 0.7, width * 0.36, "rgba(255,196,120,0.62)");
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "rgba(255,226,180,0.95)";
    context.beginPath();
    context.arc(width * 0.64, height * 0.71, height * 0.085, 0, Math.PI * 2);
    context.fill();
    ridge(random, {
      base: 0.7,
      roughness: 0.03,
      colours: [
        [0, "#7a2c5c"],
        [1, "#3b1640"],
      ],
    });
    ridge(random, {
      base: 0.79,
      roughness: 0.036,
      colours: [
        [0, "#48194a"],
        [1, "#200d2e"],
      ],
    });
    ridge(random, {
      base: 0.89,
      roughness: 0.03,
      colours: [
        [0, "#231032"],
        [1, "#0b0616"],
      ],
    });
    vignette(0.42);
  }

  if (name === "aurora") {
    const random = seeded(31337);
    fill(
      linear(0, 0, 0, height, [
        [0, "#020812"],
        [0.6, "#04161f"],
        [1, "#071f25"],
      ]),
    );
    stars(random, 260, "#e6fff6");
    glow(width * 0.3, height * 0.45, width * 0.55, "rgba(16,185,129,0.26)");
    glow(width * 0.78, height * 0.3, width * 0.45, "rgba(34,211,238,0.2)");
    const greens = [
      [0, "rgba(16,185,129,0.85)"],
      [0.5, "rgba(52,211,153,1)"],
      [1, "rgba(34,211,238,0.9)"],
    ];
    const curtains = [
      {
        lines: 110,
        centre: (u) => 0.4 + 0.08 * Math.sin(u * 5),
        waves: [
          [0.09, 1.2, 0.8, 2.4],
          [0.03, 3.1, 2, -3],
        ],
        fan: (u) => 0.42 * (0.55 + 0.45 * Math.sin(u * Math.PI * 2.4 + 0.6)),
        colours: greens,
        alpha: 0.15,
      },
      {
        lines: 80,
        centre: (u) => 0.3 + 0.12 * u,
        waves: [[0.07, 1.7, 3.2, 1.8]],
        fan: (u) => 0.3 * (0.5 + 0.5 * Math.cos(u * Math.PI * 2 + 1)),
        colours: [
          [0, "rgba(45,212,191,0.8)"],
          [0.6, "rgba(167,139,250,0.9)"],
          [1, "rgba(52,211,153,0.8)"],
        ],
        alpha: 0.12,
      },
    ];
    for (const curtain of curtains) {
      ribbon({ ...curtain, lines: 24, lineWidth: 9, blur: 18, alpha: 0.1 });
    }
    for (const curtain of curtains) ribbon(curtain);
    context.globalCompositeOperation = "source-over";
    ridge(random, {
      base: 0.86,
      roughness: 0.035,
      colours: [
        [0, "#06141a"],
        [1, "#02080b"],
      ],
    });
    vignette(0.4);
  }

  return {
    webp: canvas.toDataURL("image/webp", quality),
    png: canvas.toDataURL("image/png"),
  };
}

const NAMES = ["silk", "contours", "dusk", "aurora"];
const names = wanted.length ? wanted : NAMES;

mkdirSync(outputDirectory, { recursive: true });
if (previewDirectory) mkdirSync(previewDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
for (const name of names) {
  if (!NAMES.includes(name)) throw new Error(`No wallpaper called "${name}".`);
  const { webp, png } = await page.evaluate(draw, {
    name,
    width: WIDTH,
    height: HEIGHT,
    quality: WEBP_QUALITY,
  });
  const file = Buffer.from(webp.split(",")[1], "base64");
  writeFileSync(`${outputDirectory}${name}.webp`, file);
  if (previewDirectory) {
    writeFileSync(
      `${previewDirectory}/${name}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
  }
  console.log(`${name}.webp  ${(file.length / 1024).toFixed(0)}KB`);
}
await browser.close();
