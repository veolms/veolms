import type { CSSProperties, ReactNode } from "react";
import {
  HERO_LAPTOP_SCREEN_HEIGHT,
  HERO_LAPTOP_SCREEN_WIDTH,
} from "./useHeroLaptopScreen";

/**
 * What the laptop in the hero picture is showing. Its children are ordinary
 * page content, laid out upright at 800 by 530 and then fitted onto the
 * laptop's screen in the photograph, so an image, a video, an iframe or any
 * live component can be put there and stays a real, working part of the
 * page. Give the content `size-full` and it fills the screen.
 * `--hero-laptop-screen-scale` holds how much smaller than that it is drawn,
 * for content that should be laid out at the size it is seen at (see
 * `heroLaptopDrawnSizeClasses`).
 *
 * To sit in the picture rather than on it, the content is lit like the
 * scene: softened a touch to the photograph's focus, dimmed by night (more
 * with the lamp off), washed out by day, with the glass's sheen and the
 * darkening towards its edges laid over it.
 */
export function HeroLaptopScreen({
  transform,
  drawnScale = 1,
  children,
}: {
  /** From `useHeroLaptopScreen`; the screen waits until it is known. */
  transform?: string;
  /** From `useHeroLaptopScreen`. */
  drawnScale?: number;
  children: ReactNode;
}) {
  if (!transform) return null;

  return (
    <div
      data-hero-measured=""
      style={
        {
          transform,
          width: HERO_LAPTOP_SCREEN_WIDTH,
          height: HERO_LAPTOP_SCREEN_HEIGHT,
          "--hero-laptop-screen-scale": drawnScale,
        } as CSSProperties
      }
      // Under the fades that lie over the picture, so they dim the screen
      // with the rest of the laptop.
      //
      // Safari (the only engine that knows `font: -apple-system-body`)
      // paints the page picture a theme change animates without the
      // perspective in this transform, so for the length of the change the
      // screen sat smaller and up and to the left of the laptop. Named, it
      // is captured as a picture of its own and laid on with its transform
      // whole, as it is drawn the rest of the time.
      // While a menu is open on it (the video's settings) the screen is not
      // lit like the scene: no softening, dimming or sheen over the menu.
      className="absolute top-0 left-0 -z-12 origin-top-left overflow-hidden rounded-2xl bg-black transition-opacity duration-300 motion-reduce:transition-none starting:opacity-0 supports-[font:-apple-system-body]:[view-transition-name:hero-laptop-screen] [&:has([role=menu])>div]:filter-none! [&:has([role=menu])>span]:opacity-0"
    >
      <div className="size-full blur-[0.5px] brightness-90 saturate-[0.92] transition-[filter] duration-300 motion-reduce:transition-none [:root[data-theme=light]_&]:brightness-105 [:root[data-theme=light]_&]:contrast-[0.86] [:root[data-theme=light]_&]:saturate-[0.82] [:root:not([data-theme=light])_[data-lamp=off]_&]:brightness-[0.8]">
        {children}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(118deg,rgb(255_255_255/0.1)_0%,rgb(255_255_255/0.03)_30%,transparent_52%)] shadow-[inset_0_0_60px_rgb(0_0_0/0.4)] [:root[data-theme=light]_&]:bg-[linear-gradient(118deg,rgb(255_255_255/0.3)_0%,rgb(255_255_255/0.12)_40%,rgb(255_255_255/0.06)_100%)] [:root[data-theme=light]_&]:shadow-[inset_0_0_60px_rgb(0_0_0/0.18)]"
      />
    </div>
  );
}

/**
 * For a box inside the laptop's screen that fills it: laid out at the size
 * the screen is drawn at (a few hundred pixels across), then scaled up to
 * fill the screen, which the screen's own transform takes back down. Its
 * text and controls are then seen at their own size, not shrunk with the
 * screen.
 */
export const heroLaptopDrawnSizeClasses =
  "absolute top-0 left-0 h-[calc(100%*var(--hero-laptop-screen-scale,1))] w-[calc(100%*var(--hero-laptop-screen-scale,1))] origin-top-left scale-[calc(1/var(--hero-laptop-screen-scale,1))]";
