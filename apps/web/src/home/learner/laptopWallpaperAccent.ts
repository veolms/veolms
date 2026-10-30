/**
 * The colour a picture is answered in on the laptop's screen: what the
 * day's progress and the words over the wallpaper are drawn in (see
 * `LearnerGoalScreen`). The wallpapers that come with the app each have one
 * picked for them; a learner's own picture has its colour taken from it
 * here.
 *
 * The picture is read at a few hundred pixels, which is all a dominant
 * colour needs. Each pixel votes for its hue, and counts for more the more
 * colour it has and the nearer it is to a middle lightness: the glow of a
 * sunset outweighs the dark room around it, and grey, black and white
 * hardly count at all. The winning hue is then given a fixed, light tone,
 * the same for every picture, so that it reads on the dark sheet whatever
 * the picture's own tones are.
 */

const SAMPLE_WIDTH = 40;
const SAMPLE_HEIGHT = 26;
/** Hues are gathered in bands this many degrees wide. */
const BAND_DEGREES = 15;
const BANDS = 360 / BAND_DEGREES;
/** The tone every picked colour is given. */
const ACCENT_LIGHTNESS = 76;

/** What a stored accent has to look like to be used. */
const ACCENT_PATTERN = /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/u;

export const isWallpaperAccent = (value: unknown): value is string =>
  typeof value === "string" && ACCENT_PATTERN.test(value);

/**
 * The accent for a picture given as its pixels (RGBA, as a canvas hands
 * them over). Null for a picture with no colour to speak of.
 */
export function pickWallpaperAccent(pixels: Uint8ClampedArray): string | null {
  const weights = new Float64Array(BANDS);
  const hueX = new Float64Array(BANDS);
  const hueY = new Float64Array(BANDS);
  const saturations = new Float64Array(BANDS);
  let total = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const red = pixels[index]! / 255;
    const green = pixels[index + 1]! / 255;
    const blue = pixels[index + 2]! / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const spread = max - min;
    if (spread < 0.04) continue;
    const lightness = (max + min) / 2;
    const saturation = spread / (1 - Math.abs(2 * lightness - 1));
    const hue =
      (max === red
        ? ((green - blue) / spread + 6) % 6
        : max === green
          ? (blue - red) / spread + 2
          : (red - green) / spread + 4) * 60;
    const weight =
      saturation * spread * Math.max(0, 1 - Math.abs(lightness - 0.55) * 1.7);
    if (weight <= 0) continue;
    const band = Math.min(BANDS - 1, Math.floor(hue / BAND_DEGREES));
    const angle = (hue * Math.PI) / 180;
    weights[band]! += weight;
    hueX[band]! += Math.cos(angle) * weight;
    hueY[band]! += Math.sin(angle) * weight;
    saturations[band]! += saturation * weight;
    total += weight;
  }
  // Next to no colour anywhere: a black and white photograph.
  if (total < (pixels.length / 4) * 0.004) return null;

  // The band that wins is the one with the most weight in it and its two
  // neighbours, so a colour that straddles two bands is not split in half.
  let best = 0;
  let bestWeight = -1;
  for (let band = 0; band < BANDS; band += 1) {
    const around =
      weights[band]! +
      weights[(band + 1) % BANDS]! +
      weights[(band + BANDS - 1) % BANDS]!;
    if (around > bestWeight) {
      bestWeight = around;
      best = band;
    }
  }
  let x = 0;
  let y = 0;
  let saturation = 0;
  let weight = 0;
  for (const band of [(best + BANDS - 1) % BANDS, best, (best + 1) % BANDS]) {
    x += hueX[band]!;
    y += hueY[band]!;
    saturation += saturations[band]!;
    weight += weights[band]!;
  }
  if (weight <= 0) return null;
  const hue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  const strength = Math.round(
    Math.min(96, Math.max(68, (saturation / weight) * 100)),
  );
  return `hsl(${hue} ${strength}% ${ACCENT_LIGHTNESS}%)`;
}

/** The accent for a picture given as its address (a data URL here). */
export function readWallpaperAccent(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        resolve(
          pickWallpaperAccent(
            context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data,
          ),
        );
      } catch {
        // A canvas that may not be read (a picture from another site).
        resolve(null);
      }
    };
    image.src = src;
  });
}
