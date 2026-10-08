import { useEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { guestHeroImage } from "./guestHeroImage";
import { heroPictureOrigin, measureHeroPicture } from "./heroPictureGeometry";

/**
 * The size the laptop's screen content is laid out at before it is fitted
 * onto the laptop. It has the shape of the laptop's glass, which the content
 * fills almost to the lid's edge: about 3:2.
 */
export const HERO_LAPTOP_SCREEN_WIDTH = 800;
export const HERO_LAPTOP_SCREEN_HEIGHT = 530;

type Point = readonly [number, number];

/**
 * The four corners of the laptop's screen in the wide picture's pixels: top
 * left, top right, bottom left, bottom right.
 *
 * They are not read off the picture by eye. The lid's four edges were each
 * fitted with a straight line from the pixels (its rim is straight to within
 * half a pixel), and the screen is those lines moved in by the same ten
 * pixels, so the bezel is one thickness all the way round: along each side
 * from end to end, and from side to side. That leaves no chin under the
 * screen; the laptop's name, which was printed there, is painted out of the
 * picture files.
 *
 * The same glass is painted black in every hero picture file, so the laptop
 * reads as switched off until its content is in place. A picture that is
 * regenerated needs that done again.
 */
const screenInWidePicture: readonly [Point, Point, Point, Point] = [
  [1344.5, 177.9],
  [1841.5, 174.8],
  [1298.1, 488.8],
  [1807.2, 518.3],
];
/**
 * The strip of bezel under the screen, in the same pixels: left, top, right,
 * bottom. It is where the laptop's power is held.
 */
const powerSpotInWidePicture = [1500, 502, 1576, 514] as const;
/** The power spot never gets smaller than this, however small the picture. */
const MIN_POWER_SPOT_WIDTH_PX = 44;
const MIN_POWER_SPOT_HEIGHT_PX = 28;

export interface HeroLaptopPowerSpot {
  left: number;
  top: number;
  width: number;
  height: number;
  /** How far down the spot its light sits: the middle of the bezel strip. */
  lightTop: number;
}

/** The phone crop is the same picture, starting this many pixels in. */
const PHONE_CROP_LEFT = 880;

type Matrix3 = readonly number[];

function adjugate(m: Matrix3): Matrix3 {
  return [
    m[4]! * m[8]! - m[5]! * m[7]!,
    m[2]! * m[7]! - m[1]! * m[8]!,
    m[1]! * m[5]! - m[2]! * m[4]!,
    m[5]! * m[6]! - m[3]! * m[8]!,
    m[0]! * m[8]! - m[2]! * m[6]!,
    m[2]! * m[3]! - m[0]! * m[5]!,
    m[3]! * m[7]! - m[4]! * m[6]!,
    m[1]! * m[6]! - m[0]! * m[7]!,
    m[0]! * m[4]! - m[1]! * m[3]!,
  ];
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const result: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += a[3 * row + k]! * b[3 * k + column]!;
      }
      result.push(sum);
    }
  }
  return result;
}

/** The projection that carries the unit basis onto four given points. */
function basisToPoints([p1, p2, p3, p4]: readonly Point[]): Matrix3 {
  const m = [p1![0], p2![0], p3![0], p1![1], p2![1], p3![1], 1, 1, 1];
  const a = adjugate(m);
  const v = [0, 1, 2].map(
    (row) => a[3 * row]! * p4![0] + a[3 * row + 1]! * p4![1] + a[3 * row + 2]!,
  );
  return multiply(m, [v[0]!, 0, 0, 0, v[1]!, 0, 0, 0, v[2]!]);
}

/**
 * The CSS transform that lays a `width` by `height` box, anchored at its top
 * left corner, onto four points (top left, top right, bottom left, bottom
 * right). A flat rectangle seen at an angle is a projection of the upright
 * one, and four corner pairs pin that projection down exactly.
 */
function projectOnto(
  width: number,
  height: number,
  corners: readonly Point[],
): string {
  const from = basisToPoints([
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]);
  const t = multiply(basisToPoints(corners), adjugate(from)).map(
    (value, _index, all) => value / all[8]!,
  );
  return `matrix3d(${[
    t[0],
    t[3],
    0,
    t[6],
    t[1],
    t[4],
    0,
    t[7],
    0,
    0,
    1,
    0,
    t[2],
    t[5],
    0,
    1,
  ].join(",")})`;
}

/**
 * Where the laptop is in the hero picture, following the picture as the hero
 * changes size: the transform that fits the screen's content onto the
 * laptop, and the spot under the display its power is held at. Both are
 * missing until the picture has been measured.
 */
export function useHeroLaptopScreen(
  imageRef: RefObject<HTMLImageElement | null>,
) {
  const [transform, setTransform] = useState<string>();
  const [powerSpot, setPowerSpot] = useState<HeroLaptopPowerSpot>();

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return undefined;
    const hero = image.closest("section");
    const phoneQuery = window.matchMedia(guestHeroImage.phone.media);

    const place = () => {
      const { crop, scale, offsetX, offsetY } = measureHeroPicture(
        image,
        phoneQuery.matches,
      );
      const origin = heroPictureOrigin(image);
      const cropLeft = crop === "phone" ? PHONE_CROP_LEFT : 0;
      setTransform(
        projectOnto(
          HERO_LAPTOP_SCREEN_WIDTH,
          HERO_LAPTOP_SCREEN_HEIGHT,
          screenInWidePicture.map(([x, y]): Point => [
            origin.left + offsetX + (x - cropLeft) * scale,
            origin.top + offsetY + y * scale,
          ]),
        ),
      );

      // The power spot starts at the screen's bottom edge and reaches down
      // over the hinge, so that as little of the screen as possible lies
      // under it; its light stays on the middle of the bezel strip.
      const [left, top, right, bottom] = powerSpotInWidePicture;
      const width = Math.max((right - left) * scale, MIN_POWER_SPOT_WIDTH_PX);
      const stripHeight = (bottom - top) * scale;
      setPowerSpot({
        left:
          origin.left +
          offsetX +
          ((left + right) / 2 - cropLeft) * scale -
          width / 2,
        top: origin.top + offsetY + top * scale,
        width,
        height: Math.max(stripHeight, MIN_POWER_SPOT_HEIGHT_PX),
        lightTop: stripHeight / 2,
      });
    };

    place();
    // While the hero is being resized (the sidebar opening, or dragged) the
    // picture is laid out anew on every frame, and the laptop's screen has
    // to be on it in that same frame. A state update made from an observer
    // is normally rendered a moment later, which left the screen trailing
    // the laptop; rendering it at once keeps the two together.
    const measure = () => flushSync(place);
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    // On phones the picture moves, without changing size, whenever the copy
    // above it changes height.
    if (hero) observer.observe(hero);
    phoneQuery.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      phoneQuery.removeEventListener("change", measure);
    };
  }, [imageRef]);

  return { transform, powerSpot };
}
