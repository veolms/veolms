import { useId, useLayoutEffect, useState, useSyncExternalStore } from "react";
import widths from "../assets/octopus/widths.json";

/**
 * The brand's octopus, in the eight drawings there are of it: three ways of
 * something going wrong and five of something not being found. Each is a
 * black line drawing filled white, and comes for a light surface and for a
 * dark one (there the lines that have no fill beside them, a lead or a
 * question mark, are white, so they can be seen). Each is in three sizes.
 *
 * Only addresses are gathered here; a file is downloaded when it is shown.
 */
const files = import.meta.glob<string>("../assets/octopus/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

const pictures = {
  "went-wrong": [
    "went-wrong-unplugged",
    "went-wrong-frayed",
    "went-wrong-spark",
  ],
  "not-found": [
    "not-found-box",
    "not-found-map",
    "not-found-browser",
    "not-found-folder",
    "not-found-file",
  ],
} as const;

export type OctopusKind = keyof typeof pictures;
type PictureName = (typeof pictures)[OctopusKind][number];

/**
 * A drawing is sized by its height, and placed by its box. Where the octopus
 * does not fill the one or stand in the middle of the other, the drawing is
 * adjusted so that the octopus itself is the same size in every drawing and
 * is what stands in the middle. Measured on the files:
 *
 * - "spark": the lead runs out to the left and the octopus's head is two
 *   thirds of the way across (0.667 of the width), so it is moved left.
 * - "frayed": the lead hangs from above and takes the top of the picture,
 *   which leaves the octopus 343 of the 480 rows where the other two have
 *   465. It is drawn 1.35 times as large, growing upwards from its foot so
 *   that what is under it keeps its place, and moved right a little, its
 *   head being at 0.455 of the width.
 */
const fittedToOctopus: Partial<Record<PictureName, string>> = {
  "went-wrong-spark": "-translate-x-[16.6%]",
  "went-wrong-frayed": "origin-bottom translate-x-[6%] scale-[1.35]",
};

/** The heights the files are made in; the first is what `width` is for. */
const HEIGHTS = [160, 320, 480] as const;

/**
 * Which drawing of each kind this visit shows first: picked once when the
 * page loads, so a reload may bring another. Two of the same kind on screen
 * at once (a lesson that failed, beside its course content that failed too)
 * do not show the same drawing; see `usePickedPicture`.
 */
const picked: Record<OctopusKind, number> = {
  "went-wrong": Math.floor(Math.random() * pictures["went-wrong"].length),
  "not-found": Math.floor(Math.random() * pictures["not-found"].length),
};

const subscribeToNothing = () => () => {};

/** The drawings of each kind on screen now, by the illustration showing it. */
const shownNow: Record<OctopusKind, Map<string, number>> = {
  "went-wrong": new Map(),
  "not-found": new Map(),
};

/**
 * The drawing to show. A page built ahead of time has to say the same thing
 * the browser first does, so both start from the first drawing and the
 * browser then moves to its pick. An illustration that finds its pick
 * already on screen takes one of the others at random, before it is painted.
 */
function usePickedPicture(kind: OctopusKind): PictureName {
  const id = useId();
  const visitPick = useSyncExternalStore(
    subscribeToNothing,
    () => picked[kind],
    () => 0,
  );
  const [index, setIndex] = useState(visitPick);
  useLayoutEffect(() => {
    const onScreen = new Set(shownNow[kind].values());
    let next = visitPick;
    if (onScreen.has(next)) {
      const others = pictures[kind]
        .map((_, candidate) => candidate)
        .filter((candidate) => !onScreen.has(candidate));
      if (others.length > 0) {
        next = others[Math.floor(Math.random() * others.length)] ?? next;
      }
    }
    shownNow[kind].set(id, next);
    setIndex(next);
    return () => {
      shownNow[kind].delete(id);
    };
  }, [id, kind, visitPick]);
  return pictures[kind][index] ?? pictures[kind][0];
}

/**
 * Where a drawing's lead leaves the top of its picture, as shares of the
 * picture's width: the middle of the lead and how thick it is. The lead goes
 * straight up there, so it can be carried on above the picture as a plain
 * line (see `wireToTop`). Measured on the file: 8.5 of 379 pixels wide,
 * centred on pixel 318.
 */
const leadFromAbove: Partial<
  Record<PictureName, { at: number; thick: number }>
> = {
  "went-wrong-frayed": { at: 83.9, thick: 2.25 },
};

/** Whether a drawing is in the page at all, by the page's theme. */
const shownClasses = {
  always: "block",
  "dark-theme": "block [:root[data-theme=light]_&]:hidden",
  "light-theme": "hidden [:root[data-theme=light]_&]:block",
} as const;

function OctopusImage({
  name,
  tone,
  shown,
  wireToTop,
  className,
}: {
  name: PictureName;
  tone: "on-dark" | "on-light";
  shown: keyof typeof shownClasses;
  wireToTop: boolean;
  className?: string;
}) {
  const [small, medium, large] = HEIGHTS.map(
    (height) => files[`../assets/octopus/${name}-${tone}-${height}.webp`],
  );
  // A drawing is downloaded only when it is shown, which is often when
  // something has failed: with no connection its file cannot come either,
  // and a broken picture is worse than none.
  const [failed, setFailed] = useState(false);
  const lead = wireToTop ? leadFromAbove[name] : undefined;
  if (failed) return null;
  const placing = `${shownClasses[shown]} ${className ?? ""} ${fittedToOctopus[name] ?? ""}`;
  const image = (
    <img
      src={small}
      // The browser takes the file that matches the screen's density.
      srcSet={`${small} 1x, ${medium} 2x, ${large} 3x`}
      width={widths[name]}
      height={HEIGHTS[0]}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      // A file that failed before the page took over the picture (a page
      // built ahead of time) fired its error unheard.
      ref={(image) => {
        if (image?.complete && image.currentSrc && !image.naturalWidth) {
          setFailed(true);
        }
      }}
      className={lead ? "block h-full w-auto max-w-none" : placing}
    />
  );
  if (!lead) return image;
  // The drawing in a box of its own size, with the lead carried on from the
  // top of the picture as far up as anything can be seen. Whatever the
  // drawing stands in cuts it off at its own edge (the player does), so the
  // lead comes in from outside. The box takes the size and the adjustments
  // the drawing would have had, and the line is sized in shares of the box,
  // so it is scaled and moved with the drawing.
  return (
    <span className={`relative w-fit! ${placing}`}>
      {image}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-[calc(100%-2px)] h-[100vh] -translate-x-1/2 ${
          tone === "on-dark" ? "bg-white" : "bg-black"
        }`}
        style={{ left: `${lead.at}%`, width: `${lead.thick}%` }}
      />
    </span>
  );
}

/**
 * The octopus for something going wrong or something not being found: one
 * of the drawings of that kind, a different one from visit to visit.
 *
 * `surface` says what it stands on: "dark" and "light" pick that drawing
 * outright, "theme" follows the page's theme. With "theme" both are in the
 * page and one is hidden; a hidden lazy image is not downloaded.
 *
 * `wireToTop` is for a place that cuts off what leaves it at the top (the
 * lesson's player): a drawing whose lead hangs from above has it carried on
 * up to that edge, so it comes in from outside the place.
 *
 * Size it by height (`h-32 w-auto`): the files are made for up to 160px.
 */
export function OctopusIllustration({
  kind,
  surface = "theme",
  wireToTop = false,
  className = "",
}: {
  kind: OctopusKind;
  surface?: "dark" | "light" | "theme";
  wireToTop?: boolean;
  className?: string;
}) {
  const name = usePickedPicture(kind);
  if (surface !== "theme") {
    return (
      <OctopusImage
        name={name}
        tone={surface === "dark" ? "on-dark" : "on-light"}
        shown="always"
        wireToTop={wireToTop}
        className={className}
      />
    );
  }
  return (
    <>
      <OctopusImage
        name={name}
        tone="on-dark"
        shown="dark-theme"
        wireToTop={wireToTop}
        className={className}
      />
      <OctopusImage
        name={name}
        tone="on-light"
        shown="light-theme"
        wireToTop={wireToTop}
        className={className}
      />
    </>
  );
}
