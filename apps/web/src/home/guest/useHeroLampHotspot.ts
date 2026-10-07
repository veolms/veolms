import { useEffect, useState, type RefObject } from "react";
import { guestHeroImage } from "./guestHeroImage";

/** The lamp's click target, in pixels from the hero's top-left corner. */
export interface HeroLampHotspot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the lamp shade sits in each crop, as fractions of the picture. */
const lampInPicture = {
  wide: { left: 0.897, right: 0.986, top: 0, bottom: 0.162 },
  // The phone crop cuts through the shade at its right edge.
  phone: { left: 0.922, right: 1, top: 0, bottom: 0.162 },
} as const;

/** Room around the shade, so the target is not pixel-tight. */
const HOTSPOT_MARGIN_PX = 6;
/**
 * The target never gets smaller than this. On wide screens the picture is
 * cropped from the top and the lamp slides partly or wholly out of the frame;
 * the switch stays where the lamp would be, at the hero's top edge.
 */
const MIN_HOTSPOT_WIDTH_PX = 56;
const MIN_HOTSPOT_HEIGHT_PX = 48;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function readObjectPosition(image: HTMLImageElement) {
  const [x = "50%", y = "50%"] =
    getComputedStyle(image).objectPosition.split(" ");
  const fraction = (value: string) =>
    value.endsWith("%") ? Number.parseFloat(value) / 100 : 0.5;
  return { x: fraction(x), y: fraction(y) };
}

/**
 * Places the lamp's click target over the lamp. The picture covers the hero
 * (`object-fit: cover`) at a breakpoint-dependent position, so where the lamp
 * lands depends on the hero's size; CSS cannot follow that, so it is measured.
 * Returns nothing only until the first measurement: after that there is
 * always a target, kept inside the hero even when the lamp is cropped away.
 */
export function useHeroLampHotspot(
  imageRef: RefObject<HTMLImageElement | null>,
) {
  const [style, setStyle] = useState<HeroLampHotspot>();

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return undefined;
    const phoneQuery = window.matchMedia(guestHeroImage.phone.media);

    const measure = () => {
      const crop = phoneQuery.matches ? "phone" : "wide";
      const picture = guestHeroImage[crop];
      const lamp = lampInPicture[crop];
      const boxWidth = image.clientWidth;
      const boxHeight = image.clientHeight;
      const scale = Math.max(
        boxWidth / picture.width,
        boxHeight / picture.height,
      );
      const position = readObjectPosition(image);
      const offsetX = (boxWidth - picture.width * scale) * position.x;
      const offsetY = (boxHeight - picture.height * scale) * position.y;

      // Where the lamp is, held inside the hero.
      let left = clamp(
        offsetX + lamp.left * picture.width * scale - HOTSPOT_MARGIN_PX,
        0,
        boxWidth,
      );
      let right = clamp(
        offsetX + lamp.right * picture.width * scale + HOTSPOT_MARGIN_PX,
        0,
        boxWidth,
      );
      let top = clamp(
        offsetY + lamp.top * picture.height * scale - HOTSPOT_MARGIN_PX,
        0,
        boxHeight,
      );
      let bottom = clamp(
        offsetY + lamp.bottom * picture.height * scale + HOTSPOT_MARGIN_PX,
        0,
        boxHeight,
      );

      // A lamp cropped at an edge leaves a sliver, or nothing. Grow the
      // target back to its minimum from the edge it was cut off at.
      if (right - left < MIN_HOTSPOT_WIDTH_PX) {
        left = Math.max(0, right - MIN_HOTSPOT_WIDTH_PX);
        right = Math.min(boxWidth, left + MIN_HOTSPOT_WIDTH_PX);
      }
      if (bottom - top < MIN_HOTSPOT_HEIGHT_PX) {
        bottom = Math.min(boxHeight, top + MIN_HOTSPOT_HEIGHT_PX);
        top = Math.max(0, bottom - MIN_HOTSPOT_HEIGHT_PX);
      }

      setStyle({
        left: image.offsetLeft + left,
        top: image.offsetTop + top,
        width: right - left,
        height: bottom - top,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    phoneQuery.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      phoneQuery.removeEventListener("change", measure);
    };
  }, [imageRef]);

  return style;
}
