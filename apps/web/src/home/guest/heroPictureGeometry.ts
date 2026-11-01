import { guestHeroImage } from "./guestHeroImage";

export type HeroPictureCrop = "phone" | "wide";

function readObjectPosition(image: HTMLImageElement) {
  const [x = "50%", y = "50%"] =
    getComputedStyle(image).objectPosition.split(" ");
  const fraction = (value: string) =>
    value.endsWith("%") ? Number.parseFloat(value) / 100 : 0.5;
  return { x: fraction(x), y: fraction(y) };
}

/**
 * How the hero picture is laid into its box right now. The picture covers
 * the box (`object-fit: cover`) at a breakpoint-dependent position, so where
 * any point of the scene lands depends on the box's size; CSS cannot follow
 * that, so it is measured.
 *
 * A point of the picture at (x, y) in its own pixels is drawn at
 * (`offsetX + x * scale`, `offsetY + y * scale`) inside the box.
 */
export function measureHeroPicture(image: HTMLImageElement, phone: boolean) {
  const crop: HeroPictureCrop = phone ? "phone" : "wide";
  const picture = guestHeroImage[crop];
  const boxWidth = image.clientWidth;
  const boxHeight = image.clientHeight;
  const scale = Math.max(boxWidth / picture.width, boxHeight / picture.height);
  const position = readObjectPosition(image);
  return {
    crop,
    picture,
    boxWidth,
    boxHeight,
    scale,
    offsetX: (boxWidth - picture.width * scale) * position.x,
    offsetY: (boxHeight - picture.height * scale) * position.y,
  };
}

/**
 * Where the picture's box sits inside the hero. On a phone the picture is
 * not positioned against the hero itself, so this is read from the page.
 */
export function heroPictureOrigin(image: HTMLImageElement) {
  const imageBox = image.getBoundingClientRect();
  const heroBox = (image.closest("section") ?? image).getBoundingClientRect();
  return {
    left: imageBox.left - heroBox.left,
    top: imageBox.top - heroBox.top,
  };
}
