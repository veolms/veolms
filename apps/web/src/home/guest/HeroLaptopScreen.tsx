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
 * scene: by night softened a touch to the photograph's focus and dimmed
 * (more with the lamp off). Over it lies the room's light on the glass and
 * the lamp's, each faint enough that what is on the screen stays clear.
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
      // Over the fades that lie over the picture: they deepen the picture
      // behind the copy, and the screen stays clear of them.
      //
      // Safari (the only engine that knows `font: -apple-system-body`)
      // paints the page picture a theme change animates without the
      // perspective in this transform, so for the length of the change the
      // screen sat smaller and up and to the left of the laptop. Named, it
      // is captured as a picture of its own and laid on with its transform
      // whole, as it is drawn the rest of the time.
      // While a menu is open on it (the video's settings) the screen is not
      // lit like the scene: no softening, dimming or sheen over the menu.
      className="absolute top-0 left-0 -z-9 origin-top-left overflow-hidden rounded-2xl bg-black transition-opacity duration-300 motion-reduce:transition-none starting:opacity-0 supports-[font:-apple-system-body]:[view-transition-name:hero-laptop-screen] [&:has([role=menu])>div]:filter-none! [&:has([role=menu])>span]:opacity-0!"
    >
      <div className="size-full blur-[0.5px] brightness-90 saturate-[0.92] transition-[filter] duration-300 motion-reduce:transition-none [:root[data-theme=light]_&]:filter-none [:root:not([data-theme=light])_[data-lamp=off]_&]:brightness-[0.8]">
        {children}
      </div>
      {/* The room's light on the glass. By night a faint sheen, the screen
          darkening towards its edges. By day the window's light, which comes
          from the top left, falls across its top left corner and down its
          left side, reaching faintly past the middle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(118deg,rgb(255_255_255/0.1)_0%,rgb(255_255_255/0.03)_30%,transparent_52%)] shadow-[inset_0_0_60px_rgb(0_0_0/0.4)] [:root[data-theme=light]_&]:bg-[radial-gradient(130%_190%_at_0%_0%,rgb(255_255_255/0.32)_0%,rgb(255_255_255/0.2)_20%,rgb(255_255_255/0.11)_40%,rgb(255_255_255/0.05)_58%,rgb(255_255_255/0.015)_74%,transparent_88%)] [:root[data-theme=light]_&]:shadow-[inset_0_0_48px_rgb(30_24_16/0.16)]"
      />
      {/* The lamp's light, falling on the screen's top right corner, frosted
          and warm: on by night unless it is switched off, and fainter by day
          when it is switched on. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_90%_at_100%_0%,rgb(255_212_164/0.34),rgb(255_218_176/0.13)_36%,rgb(255_226_192/0.035)_58%,transparent_74%)] opacity-0 mix-blend-screen transition-opacity duration-300 motion-reduce:transition-none [:root:not([data-theme=light])_&]:opacity-100 [:root[data-theme=light]_[data-lamp=on]_&]:opacity-70 [[data-lamp=off]_&]:opacity-0!"
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
