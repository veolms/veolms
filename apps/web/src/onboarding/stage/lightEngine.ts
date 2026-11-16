/**
 * The light of the sign-up stage ("First Light",
 * creator-features/33-creator-onboarding-design.md): a few thousand points
 * drawn on one canvas, which drift as a night sky, turn as a galaxy, form a
 * globe with orbits, write words, and fall as confetti.
 *
 * A port of the design's prototype, kept to its numbers so the motion is
 * the same. It only draws: the screens tell it which shape to take. It
 * reads its colours from the stage's theme tokens (`--text`, `--accent`,
 * `--canvas`), stops drawing while the tab is hidden, and with reduced
 * motion puts every point straight in its final place.
 */

type Rgb = [number, number, number];

export interface StagePoint {
  x: number;
  y: number;
  col?: Rgb;
}

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
  s: number;
  a: number;
  ta: number;
  k: number;
  ph: number;
  free: boolean;
  cr: number;
  cg: number;
  cb: number;
  tcol: Rgb | null;
  mix: number;
  delay: number;
  fa: number;
  gr: number;
  ga: number;
  arm: number;
  sx: number;
  sy: number;
  sz: number;
  orb: number;
  ou: number;
}

interface Sphere {
  cx: number;
  cy: number;
  R: number;
  ang: number;
  pulse: number;
  spin: number;
  orbits: number;
  oRot: number;
}

interface FormOptions {
  alpha?: number;
  mix?: number;
  freeMix?: number;
}

/** Each digit's orbit is tilted its own way. */
const ORBIT_TILTS: readonly [number, number][] = [
  0, 1.047, 2.094, 0.524, 1.571, 2.618,
].map((a) => [Math.cos(a), Math.sin(a)] as [number, number]);

const FONT_STACK = '800 SIZEpx Manrope, "Segoe UI", sans-serif';

function parseColor(value: string): Rgb {
  const str = value.trim();
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = parseInt(hex.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = str.match(/[\d.]+/g);
  return parts
    ? [Number(parts[0]), Number(parts[1]), Number(parts[2])]
    : [255, 255, 255];
}

export class LightEngine {
  readonly #canvas: HTMLCanvasElement;
  readonly #host: HTMLElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #off: HTMLCanvasElement;
  readonly #octx: CanvasRenderingContext2D;
  #frame = 0;
  #running = false;
  #observer: ResizeObserver | null = null;
  #onResize: (() => void) | null = null;

  W = 0;
  H = 0;
  dpr = 1;
  ps: Particle[] = [];
  mode: "field" | "form" | "galaxy" | "sphere" = "field";
  base: Rgb = [244, 244, 245];
  accent: Rgb = [244, 244, 245];
  bg: Rgb = [13, 13, 15];
  kMul = 1;
  trails = false;
  flash = 0;
  flashCentre: [number, number] | null = null;
  shock: { x: number; y: number; r: number; a: number } | null = null;
  mx = -1e4;
  my = -1e4;
  gal: { cx: number; cy: number; R: number } | null = null;
  sph: Sphere | null = null;
  confetti = false;
  dark = true;
  /** The intro's single spark, 0 to 1 (0: none). */
  seed = 0;
  reduced = false;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.#canvas = canvas;
    this.#host = host;
    this.#ctx = canvas.getContext("2d")!;
    this.#off = document.createElement("canvas");
    this.#octx = this.#off.getContext("2d", { willReadFrequently: true })!;
  }

  /** Starts drawing and following the stage's size and the pointer. */
  start(onResize: () => void): void {
    this.#onResize = onResize;
    this.resize();
    this.#observer = new ResizeObserver(() => {
      const { W, H } = this;
      this.resize();
      if (W !== this.W || H !== this.H) {
        for (const p of this.ps) {
          p.fx = Math.random() * this.W;
          p.fy = Math.random() * this.H;
        }
        this.#onResize?.();
      }
    });
    this.#observer.observe(this.#host);
    this.#host.addEventListener("pointermove", this.#onPointerMove);
    this.#host.addEventListener("pointerleave", this.#onPointerLeave);
    document.addEventListener("visibilitychange", this.#onVisibility);
    this.#run();
  }

  destroy(): void {
    this.#running = false;
    cancelAnimationFrame(this.#frame);
    this.#observer?.disconnect();
    this.#host.removeEventListener("pointermove", this.#onPointerMove);
    this.#host.removeEventListener("pointerleave", this.#onPointerLeave);
    document.removeEventListener("visibilitychange", this.#onVisibility);
  }

  #run(): void {
    if (this.#running || document.hidden) return;
    this.#running = true;
    const loop = (now: number) => {
      if (!this.#running) return;
      this.step(now);
      this.#frame = requestAnimationFrame(loop);
    };
    this.#frame = requestAnimationFrame(loop);
  }

  // The tab hidden: nothing is drawn, nothing is spent.
  #onVisibility = () => {
    if (document.hidden) {
      this.#running = false;
      cancelAnimationFrame(this.#frame);
    } else {
      this.#run();
    }
  };

  #onPointerMove = (event: PointerEvent) => {
    // Only a mouse pushes the light aside; a finger would scatter it.
    if (event.pointerType !== "mouse") return;
    const rect = this.#host.getBoundingClientRect();
    this.mx = event.clientX - rect.left;
    this.my = event.clientY - rect.top;
  };

  #onPointerLeave = () => {
    this.mx = -1e4;
    this.my = -1e4;
  };

  /** Reads the colours from the stage's current theme. */
  readTokens(): void {
    const styles = getComputedStyle(this.#host);
    this.base = parseColor(styles.getPropertyValue("--text") || "#f4f4f5");
    this.accent = parseColor(styles.getPropertyValue("--accent") || "#f4f4f5");
    this.bg = parseColor(styles.getPropertyValue("--canvas") || "#0d0d0f");
    this.dark = document.documentElement.dataset.theme !== "light";
  }

  resize(): void {
    const rect = this.#host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = rect.width;
    this.H = rect.height;
    this.#canvas.width = Math.round(this.W * this.dpr);
    this.#canvas.height = Math.round(this.H * this.dpr);
    // About 2,000 points on a phone, 4,400 on a wide screen.
    const want = this.W < 520 ? 2000 : this.W < 1000 ? 3200 : 4400;
    if (this.ps.length !== want) this.#initParticles(want);
  }

  #initParticles(n: number): void {
    this.ps = [];
    for (let i = 0; i < n; i++) {
      const fx = Math.random() * this.W;
      const fy = Math.random() * this.H;
      this.ps.push({
        x: this.W / 2,
        y: this.H / 2,
        vx: 0,
        vy: 0,
        tx: fx,
        ty: fy,
        fx,
        fy,
        s: 0.7 + Math.random() * 1.5,
        a: 0,
        ta: 0,
        k: 0.03 + Math.random() * 0.045,
        ph: Math.random() * 6.283,
        free: true,
        cr: 244,
        cg: 244,
        cb: 245,
        tcol: null,
        mix: 0,
        delay: 0,
        fa: 0.08 + Math.random() * 0.32,
        gr: Math.pow(Math.random(), 1.5),
        ga: 0,
        arm: i % 3,
        sx: 0,
        sy: 0,
        sz: 0,
        orb: -1,
        ou: 0,
      });
    }
  }

  // ─── Sampling shapes into points ────────────────────────────────────────

  #pickPoints(
    data: Uint8ClampedArray,
    w: number,
    h: number,
    count: number,
    step: number,
    test: (d: Uint8ClampedArray, i: number) => boolean,
  ): [number, number, number][] {
    const pts: [number, number, number][] = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (test(data, i)) pts.push([x, y, i]);
      }
    }
    for (let i = pts.length - 1; i > 0 && i >= pts.length - count; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pts[i]!;
      pts[i] = pts[j]!;
      pts[j] = t;
    }
    return pts.slice(Math.max(0, pts.length - count));
  }

  /** Points that write `text` across `rect`, on two lines when long. */
  sampleText(
    text: string,
    rect: StageRect,
    opt: { scale?: number; count?: number } = {},
  ): StagePoint[] {
    const octx = this.#octx;
    const pad = Math.max(20, rect.w * 0.06);
    const w = Math.max(2, Math.floor(rect.w));
    const h = Math.max(2, Math.floor(rect.h));
    this.#off.width = w;
    this.#off.height = h;
    octx.clearRect(0, 0, w, h);
    octx.fillStyle = "#fff";
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    const font = (size: number) => FONT_STACK.replace("SIZE", String(size));
    let size = Math.min(h * (opt.scale ?? 0.78), 420);
    octx.font = font(size);
    let lines = [text];
    const width = octx.measureText(text).width;
    if (width > w - pad * 2) size = (size * (w - pad * 2)) / width;
    if (size < h * 0.36 && text.indexOf(" ") > 0) {
      const words = text.split(" ");
      let best = 1;
      let bestDiff = 1e9;
      for (let i = 1; i < words.length; i++) {
        const diff = Math.abs(
          words.slice(0, i).join(" ").length - words.slice(i).join(" ").length,
        );
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
      lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      size = h * 0.4;
      octx.font = font(size);
      const widest = Math.max(...lines.map((l) => octx.measureText(l).width));
      if (widest > w - pad * 2) size = (size * (w - pad * 2)) / widest;
    }
    octx.font = font(size);
    lines.forEach((line, i) =>
      octx.fillText(
        line,
        w / 2,
        h / 2 + (i - (lines.length - 1) / 2) * size * 1.02,
      ),
    );
    const data = octx.getImageData(0, 0, w, h).data;
    const pts = this.#pickPoints(
      data,
      w,
      h,
      opt.count ?? Math.floor(this.ps.length * 0.9),
      size > 140 ? 3 : 2,
      (d, i) => d[i + 3]! > 130,
    );
    return pts.map((p) => ({
      x: rect.x + p[0] + (Math.random() - 0.5) * 1.4,
      y: rect.y + p[1] + (Math.random() - 0.5) * 1.4,
    }));
  }

  /** Points that draw an icon (256×256 path data) across `rect`. */
  sampleIcon(
    paths: readonly string[],
    rect: StageRect,
    opt: { scale?: number } = {},
  ): StagePoint[] {
    const octx = this.#octx;
    const w = Math.max(2, Math.floor(rect.w));
    const h = Math.max(2, Math.floor(rect.h));
    this.#off.width = w;
    this.#off.height = h;
    octx.clearRect(0, 0, w, h);
    const size = Math.min(w, h) * (opt.scale ?? 0.92);
    const scale = size / 256;
    octx.save();
    octx.translate((w - size) / 2, (h - size) / 2);
    octx.scale(scale, scale);
    octx.fillStyle = "#fff";
    for (const d of paths) octx.fill(new Path2D(d));
    octx.restore();
    const data = octx.getImageData(0, 0, w, h).data;
    return this.#pickPoints(
      data,
      w,
      h,
      Math.floor(this.ps.length * 0.85),
      2,
      (d, i) => d[i + 3]! > 130,
    ).map((p) => ({
      x: rect.x + p[0] + (Math.random() - 0.5) * 2.2,
      y: rect.y + p[1] + (Math.random() - 0.5) * 2.2,
    }));
  }

  /** Points on the outlines (or across the fill) of boxes. */
  sampleRects(rects: (StageRect & { fill: boolean })[], total: number) {
    const out: StagePoint[] = [];
    const weights = rects.map((r) =>
      r.fill ? (r.w * r.h) / 60 : ((r.w + r.h) * 2) / 2.2,
    );
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    rects.forEach((r, i) => {
      const n = Math.round((total * weights[i]!) / sum);
      for (let k = 0; k < n; k++) {
        if (r.fill) {
          out.push({
            x: r.x + Math.random() * r.w,
            y: r.y + Math.random() * r.h,
          });
          continue;
        }
        let d = Math.random() * 2 * (r.w + r.h);
        let x: number;
        let y: number;
        if (d < r.w) {
          x = r.x + d;
          y = r.y;
        } else if ((d -= r.w) < r.h) {
          x = r.x + r.w;
          y = r.y + d;
        } else if ((d -= r.h) < r.w) {
          x = r.x + r.w - d;
          y = r.y + r.h;
        } else {
          d -= r.w;
          x = r.x;
          y = r.y + r.h - d;
        }
        out.push({ x, y });
      }
    });
    return out;
  }

  // ─── Shapes ─────────────────────────────────────────────────────────────

  /**
   * Sends points to a shape. Points sorted by x meet targets sorted by x, so
   * changing one letter moves points a short way, not across the screen.
   */
  form(points: StagePoint[], opt: FormOptions = {}): void {
    this.mode = "form";
    this.gal = null;
    this.sph = null;
    const ps = this.ps;
    const n = Math.min(points.length, ps.length);
    const order = ps.map((_, i) => i).sort((a, b) => ps[a]!.x - ps[b]!.x);
    const chosen = new Set<number>();
    const step = ps.length / Math.max(1, n);
    const pick: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = order[Math.min(ps.length - 1, Math.floor(i * step))]!;
      pick.push(idx);
      chosen.add(idx);
    }
    const targets = points.slice(0, n).sort((a, b) => a.x - b.x);
    pick.forEach((idx, i) => {
      const p = ps[idx]!;
      const t = targets[i]!;
      p.free = false;
      p.tx = t.x;
      p.ty = t.y;
      p.ta = opt.alpha ?? 0.95;
      p.tcol = t.col ?? null;
      p.mix = opt.mix ?? p.mix;
    });
    ps.forEach((p, i) => {
      if (chosen.has(i)) return;
      p.free = true;
      p.tcol = null;
      p.mix = opt.freeMix ?? opt.mix ?? 0;
    });
  }

  /** A loose night sky. */
  field(mix = 0): void {
    this.mode = "field";
    this.gal = null;
    this.sph = null;
    for (const p of this.ps) {
      p.free = true;
      p.tcol = null;
      p.mix = mix;
    }
  }

  /** A slowly turning three-armed galaxy across `rect`. */
  galaxy(rect: StageRect, mix = 0): void {
    this.sph = null;
    this.mode = "galaxy";
    const R = Math.min(rect.w * 0.5, rect.h * 1.2, 760);
    this.gal = { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, R };
    this.ps.forEach((p, i) => {
      p.free = i % 5 === 0;
      p.tcol = null;
      p.mix = mix;
      p.ga = p.arm * 2.094 + p.gr * 5.2 + (Math.random() - 0.5) * 0.7;
    });
  }

  /**
   * A globe of evenly spread points, turning and tilted toward the viewer;
   * nearer points are brighter. With orbits, some points are set aside:
   * each digit typed lifts a group into its own tilted orbit.
   */
  sphere(
    cx: number,
    cy: number,
    R: number,
    mix = 0,
    opt: { orbits?: boolean } = {},
  ): void {
    this.mode = "sphere";
    this.gal = null;
    this.sph = {
      cx,
      cy,
      R,
      ang: this.sph?.ang ?? 0,
      pulse: 0,
      spin: 0,
      orbits: 0,
      oRot: 0,
    };
    const n = this.ps.length;
    let j = 0;
    this.ps.forEach((p, i) => {
      p.free = i % 7 === 0;
      p.tcol = null;
      p.mix = mix;
      p.orb = -1;
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      p.sx = Math.cos(th) * r;
      p.sy = y;
      p.sz = Math.sin(th) * r;
      if (opt.orbits && (i % 7 === 1 || i % 7 === 4)) {
        p.orb = j % 6;
        p.ou = Math.random();
        j++;
      }
    });
  }

  /** Lifts the first `n` orbits off the globe, with a pulse. */
  setOrbits(n: number): void {
    if (this.mode !== "sphere" || !this.sph) return;
    this.sph.orbits = n;
    this.sph.pulse = 1;
    this.sph.spin = Math.min(0.05, this.sph.spin + 0.02);
    for (const p of this.ps) {
      if (p.orb >= 0 && p.orb < n) p.mix = 1;
    }
  }

  /** A keystroke: the globe pulses and spins a little faster. */
  nudgeSphere(): void {
    if (!this.sph) return;
    this.sph.pulse = 1;
    this.sph.spin = Math.min(0.05, this.sph.spin + 0.014);
  }

  /** Colour spreads out from a point, nearest points first. */
  ripple(ox: number, oy: number): void {
    const now = performance.now();
    for (const p of this.ps) {
      p.delay = now + Math.hypot(p.x - ox, p.y - oy) * 1.1;
    }
  }

  /** The light streams up and off the top, like a message leaving. */
  sendAway(): void {
    this.trails = true;
    this.mode = "form";
    this.gal = null;
    this.sph = null;
    this.kMul = 0.55;
    for (const p of this.ps) {
      p.free = false;
      p.tcol = null;
      p.mix = 0.6;
      p.ta = 0.9;
      p.tx = p.x + (Math.random() - 0.5) * 140;
      p.ty = -40 - Math.random() * this.H * 0.7;
    }
  }

  /** Every point rushes to one place. */
  collapse(x: number, y: number): void {
    this.trails = true;
    this.kMul = 2.2;
    this.mode = "form";
    this.gal = null;
    this.sph = null;
    for (const p of this.ps) {
      p.free = false;
      p.tx = x + (Math.random() - 0.5) * 6;
      p.ty = y + (Math.random() - 0.5) * 6;
      p.ta = 1;
      p.mix = 1;
      p.tcol = null;
    }
  }

  /** Every point flies out of one place. */
  burst(x: number, y: number, speed: [number, number]): void {
    for (const p of this.ps) {
      const angle = Math.random() * 6.283;
      const sp = speed[0] + Math.random() * speed[1];
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp;
      p.x = x;
      p.y = y;
    }
  }

  /** Every point gathered, unseen, at one place (before the intro). */
  gather(x: number, y: number): void {
    this.mode = "form";
    this.gal = null;
    this.sph = null;
    for (const p of this.ps) {
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      p.a = 0;
      p.free = false;
      p.tx = x;
      p.ty = y;
      p.ta = 0;
      p.mix = 0;
      p.tcol = null;
    }
  }

  /** The points fall from above as confetti. */
  rain(): void {
    for (const p of this.ps) {
      p.free = true;
      p.mix = 1;
      p.fx = Math.random() * this.W;
      p.fy = Math.random() * this.H - this.H;
    }
    this.confetti = true;
    this.kMul = 1;
  }

  /** Back to a quiet stage. */
  calm(): void {
    this.trails = false;
    this.confetti = false;
    this.flash = 0;
    this.shock = null;
    this.kMul = 1;
    this.seed = 0;
  }

  // ─── Drawing ────────────────────────────────────────────────────────────

  step(now: number): void {
    const { W, H, dpr, ps } = this;
    const ctx = this.#ctx;
    const canvas = this.#canvas;
    if (this.trails && this.dark) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(${this.bg[0]},${this.bg[1]},${this.bg[2]},.24)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = this.dark ? "lighter" : "source-over";
    const t = now;
    const g = this.gal;
    const snap = this.reduced;
    const { mx, my } = this;
    const sp = this.mode === "sphere" ? this.sph : null;
    let ca = 1;
    let sa = 0;
    let cb = 1;
    let sb = 0;
    let sR = 0;
    if (sp) {
      if (!snap) {
        sp.ang += 0.0035 + sp.spin;
        sp.oRot += 0.022;
      }
      sp.spin *= 0.96;
      sp.pulse *= 0.9;
      ca = Math.cos(sp.ang);
      sa = Math.sin(sp.ang);
      cb = Math.cos(0.38);
      sb = Math.sin(0.38);
      sR = sp.R * (1 + sp.pulse * 0.07);
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      let tx: number;
      let ty: number;
      let ta: number;
      if (this.confetti && p.free) {
        p.fy += 0.25 + p.s * 0.18;
        p.fx += Math.sin(t * 0.001 + p.ph) * 0.4;
        if (p.fy > H + 10) {
          p.fy = -10;
          p.fx = Math.random() * W;
        }
        tx = p.fx;
        ty = p.fy;
        ta = p.fa * 1.6;
      } else if (sp && p.orb >= 0 && p.orb < sp.orbits) {
        // A point on orbit k: a circle 1.5R wide in its own tilted plane,
        // then tilted with the globe; fading along the comet's tail.
        const Ro = sp.R * 1.5;
        const th = p.ou * 6.283 + sp.oRot * (1 + p.orb * 0.12) + p.orb;
        const x0 = Math.cos(th) * Ro;
        const z0 = Math.sin(th) * Ro;
        const tilt = ORBIT_TILTS[p.orb]!;
        const x1 = x0 * tilt[0];
        const y1 = x0 * tilt[1];
        const y2 = y1 * cb - z0 * sb;
        const z2 = y1 * sb + z0 * cb;
        tx = sp.cx + x1;
        ty = sp.cy + y2;
        ta = (0.28 + 0.72 * p.ou) * (0.6 + (0.4 * (z2 / Ro + 1)) / 2);
      } else if (sp && !p.free) {
        const x1 = p.sx * ca + p.sz * sa;
        const z1 = -p.sx * sa + p.sz * ca;
        const y2 = p.sy * cb - z1 * sb;
        const z2 = p.sy * sb + z1 * cb;
        tx = sp.cx + x1 * sR;
        ty = sp.cy + y2 * sR;
        ta = Math.min(1, (0.08 + (z2 + 1) * 0.42) * (1 + sp.pulse * 0.6));
      } else if (g && !p.free) {
        const r = p.gr * g.R;
        const ang = p.ga + (snap ? 0 : t * 0.00006 * (1 + 90 / (r + 60)));
        tx = g.cx + Math.cos(ang) * r;
        ty = g.cy + Math.sin(ang) * r * 0.5;
        ta = 0.3 + (1 - p.gr) * 0.7;
      } else if (p.free) {
        tx = p.fx + (snap ? 0 : Math.sin(t * 0.00025 + p.ph) * 26);
        ty = p.fy + (snap ? 0 : Math.cos(t * 0.0002 + p.ph * 1.3) * 22);
        ta = p.fa * (snap ? 1 : 0.65 + 0.35 * Math.sin(t * 0.002 + p.ph));
      } else {
        tx = p.tx;
        ty = p.ty;
        ta = p.ta;
      }
      if (snap && !this.trails) {
        p.x = tx;
        p.y = ty;
        p.vx = 0;
        p.vy = 0;
      } else {
        const k = p.k * this.kMul;
        p.vx = (p.vx + (tx - p.x) * k) * 0.86;
        p.vy = (p.vy + (ty - p.y) * k) * 0.86;
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 8100 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 90) * 2.4;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.x += p.vx;
        p.y += p.vy;
      }
      p.a += (ta - p.a) * (snap ? 1 : 0.07);
      if (t >= p.delay) {
        let r: number;
        let gg: number;
        let b: number;
        if (p.tcol) {
          [r, gg, b] = p.tcol;
        } else {
          const m = p.mix;
          r = this.base[0] + (this.accent[0] - this.base[0]) * m;
          gg = this.base[1] + (this.accent[1] - this.base[1]) * m;
          b = this.base[2] + (this.accent[2] - this.base[2]) * m;
        }
        const blend = snap ? 1 : 0.08;
        p.cr += (r - p.cr) * blend;
        p.cg += (gg - p.cg) * blend;
        p.cb += (b - p.cb) * blend;
      }
      if (p.a < 0.01) continue;
      ctx.fillStyle = `rgba(${p.cr | 0},${p.cg | 0},${p.cb | 0},${p.a.toFixed(3)})`;
      const s = p.s * dpr;
      ctx.fillRect(p.x * dpr - s / 2, p.y * dpr - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
    if (this.flash > 0.01) {
      const c = this.flashCentre ?? [W / 2, H / 2];
      const gradient = ctx.createRadialGradient(
        c[0] * dpr,
        c[1] * dpr,
        0,
        c[0] * dpr,
        c[1] * dpr,
        Math.max(W, H) * dpr * 0.8,
      );
      gradient.addColorStop(0, `rgba(255,255,255,${this.flash})`);
      gradient.addColorStop(
        0.25,
        `rgba(${this.accent.join(",")},${this.flash * 0.6})`,
      );
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.flash *= 0.9;
    }
    if (this.shock) {
      const s = this.shock;
      s.r += 16 + s.r * 0.02;
      s.a *= 0.955;
      ctx.strokeStyle = `rgba(${this.accent.join(",")},${s.a})`;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(s.x * dpr, s.y * dpr, s.r * dpr, 0, 6.283);
      ctx.stroke();
      if (s.a < 0.02) this.shock = null;
    }
    if (this.seed > 0) {
      const c = [W / 2, H / 2] as const;
      const r = 6 + Math.sin(t * 0.008) * 3;
      const gradient = ctx.createRadialGradient(
        c[0] * dpr,
        c[1] * dpr,
        0,
        c[0] * dpr,
        c[1] * dpr,
        r * 8 * dpr,
      );
      gradient.addColorStop(0, `rgba(255,255,255,${this.seed})`);
      gradient.addColorStop(
        0.2,
        `rgba(${this.base.join(",")},${this.seed * 0.5})`,
      );
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /** Runs `n` frames at once (checks in a background tab). */
  settle(n = 90): void {
    let t = performance.now();
    for (let i = 0; i < n; i++) this.step((t += 16));
  }
}
