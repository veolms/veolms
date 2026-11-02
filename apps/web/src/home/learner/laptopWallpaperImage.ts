/**
 * Turns a picture the learner picked into the laptop's wallpaper: cut to
 * the screen's shape (where the learner placed it, or from its middle), no
 * larger than the screen is drawn on
 * a dense display, and small enough to keep in the browser (see
 * `laptopWallpaper.ts`). The picture never leaves the browser.
 */

/** Twice the laptop screen's layout size (see `HeroLaptopScreen`). */
const WALLPAPER_WIDTH = 1600;
const WALLPAPER_HEIGHT = 1060;
/** The laptop screen's shape, width over height. */
export const LAPTOP_WALLPAPER_ASPECT = WALLPAPER_WIDTH / WALLPAPER_HEIGHT;

/** A part of the picture, in its own pixels. */
export interface LaptopWallpaperCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What is read at all; a phone's photograph is well under this. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/**
 * The most the kept picture may take, as the text it is stored as. Browsers
 * give a site about five million characters in all, shared with everything
 * else the app keeps.
 */
const MAX_STORED_CHARACTERS = 700_000;
/** Tried in turn until the picture is small enough. */
const QUALITIES = [0.82, 0.72, 0.6, 0.48] as const;

export class LaptopWallpaperImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const address = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(address);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(address);
      reject(new LaptopWallpaperImageError("That picture could not be read."));
    };
    image.src = address;
  });
}

/** Refuses a file that is not a picture, or one too large to read. */
export function checkLaptopWallpaperFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new LaptopWallpaperImageError("Choose a picture (JPG, PNG or WebP).");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new LaptopWallpaperImageError(
      "That picture is too large. Choose one under 25 MB.",
    );
  }
}

/**
 * The picture as a data URL, ready for `saveOwnLaptopWallpaper`: the part
 * `crop` names, or the middle of the picture in the screen's shape.
 */
export async function prepareLaptopWallpaper(
  file: File,
  crop?: LaptopWallpaperCrop,
): Promise<string> {
  checkLaptopWallpaperFile(file);

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new LaptopWallpaperImageError("That picture could not be read.");
  }

  // Fill the screen's shape from the chosen part, or from the middle of the
  // picture; a picture smaller than the screen is not enlarged past its own
  // pixels.
  const shape = LAPTOP_WALLPAPER_ASPECT;
  const cropWidth = crop
    ? Math.min(crop.width, image.naturalWidth)
    : Math.min(image.naturalWidth, image.naturalHeight * shape);
  const cropHeight = cropWidth / shape;
  const cropX = crop
    ? Math.min(Math.max(0, crop.x), image.naturalWidth - cropWidth)
    : (image.naturalWidth - cropWidth) / 2;
  const cropY = crop
    ? Math.min(
        Math.max(0, crop.y),
        Math.max(0, image.naturalHeight - cropHeight),
      )
    : (image.naturalHeight - cropHeight) / 2;
  const width = Math.round(Math.min(WALLPAPER_WIDTH, cropWidth));
  const height = Math.round(width / shape);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new LaptopWallpaperImageError(
      "This browser could not prepare the picture.",
    );
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height,
  );

  for (const quality of QUALITIES) {
    // A browser that cannot write WebP answers with a PNG, which is far
    // too large for a photograph; JPEG is asked for instead.
    const webp = canvas.toDataURL("image/webp", quality);
    const dataUrl = webp.startsWith("data:image/webp")
      ? webp
      : canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_STORED_CHARACTERS) return dataUrl;
  }
  throw new LaptopWallpaperImageError(
    "That picture is too detailed to keep here. Try a simpler one.",
  );
}
