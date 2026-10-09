import type { ReactNode } from "react";
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
 *
 * To sit in the picture rather than on it, the content is lit like the
 * scene: softened a touch to the photograph's focus, dimmed by night (more
 * with the lamp off), washed out by day, with the glass's sheen and the
 * darkening towards its edges laid over it.
 */
export function HeroLaptopScreen({
  transform,
  children,
}: {
  /** From `useHeroLaptopScreen`; the screen waits until it is known. */
  transform?: string;
  children: ReactNode;
}) {
  if (!transform) return null;

  return (
    <div
      style={{
        transform,
        width: HERO_LAPTOP_SCREEN_WIDTH,
        height: HERO_LAPTOP_SCREEN_HEIGHT,
      }}
      // Under the fades that lie over the picture, so they dim the screen
      // with the rest of the laptop.
      className="absolute top-0 left-0 -z-12 origin-top-left overflow-hidden rounded-2xl bg-black transition-opacity duration-300 motion-reduce:transition-none starting:opacity-0"
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
