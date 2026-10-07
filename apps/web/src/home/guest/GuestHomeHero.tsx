import { guestHomeGutter } from "./guestHomeSpacing";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { HomePageHero } from "@veolms/contracts/home-page-defaults";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "./GuestHomeLink";
import { useEffect, useRef, useState, type Ref } from "react";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";
import { HeroLampSoundToggle } from "./HeroLampSoundToggle";
import {
  playLampSwitchSound,
  readLampSoundMuted,
  writeLampSoundMuted,
} from "./lampSwitchSound";

/** How long the mute button stays once it has been called up. */
const SOUND_TOGGLE_VISIBLE_MS = 2000;
/**
 * The pace of the lamp while Shift+L is held: slow enough for each fade to
 * finish and well under three flashes a second.
 */
const LAMP_HOLD_INTERVAL_MS = 450;
import { useHeroLampHotspot } from "./useHeroLampHotspot";
import {
  guestHeroDayImage,
  guestHeroDayLampOnImage,
  guestHeroImage,
  guestHeroLampOffImage,
  type GuestHeroPicture,
} from "./guestHeroImage";

/**
 * The lamp follows the theme until the visitor switches it: on in the dark
 * theme, off in the light one. The theme is only known in the browser, so
 * the choice is made in CSS from the document's theme and this override.
 */
type LampOverride = "on" | "off";

/** One of the hero's stacked pictures, in its phone and wide crops. */
function HeroPicture({
  picture,
  className,
  priority = false,
  imageRef,
}: {
  picture: GuestHeroPicture;
  className: string;
  /** The picture the page is first painted with. */
  priority?: boolean;
  imageRef?: Ref<HTMLImageElement>;
}) {
  return (
    <picture>
      <source
        media={picture.phone.media}
        srcSet={picture.phone.srcSet}
        sizes={picture.phone.sizes}
        width={picture.phone.width}
        height={picture.phone.height}
      />
      <img
        ref={imageRef}
        src={picture.wide.src}
        srcSet={picture.wide.srcSet}
        sizes={picture.wide.sizes}
        width={picture.wide.width}
        height={picture.wide.height}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={`absolute inset-x-0 top-0 h-64 w-full object-cover object-[62%_center] sm:h-full sm:object-[72%_center] xl:object-center ${className}`}
      />
    </picture>
  );
}

/**
 * The hero is a picture of a desk with the copy laid over its empty side. By
 * night (dark theme) the copy is light on the picture's navy; by day (light
 * theme) it is dark on the sunlit wall. The fades run into the picture's own
 * colours rather than the page surface.
 */
export function GuestHomeHero({
  hero,
  onNavigatePage,
  freeCoursesSectionId,
}: {
  /** The configured copy; while it is still loading the hero shows its picture and placeholders. */
  hero?: HomePageHero;
  onNavigatePage: NavigateTo;
  /** The secondary action scrolls to this section when it is on the page. */
  freeCoursesSectionId?: string;
}) {
  const [lampOverride, setLampOverride] = useState<LampOverride>();
  const litPictureRef = useRef<HTMLImageElement>(null);
  const lampHotspot = useHeroLampHotspot(litPictureRef);

  // The switch's sound can be muted from a button that shows beside the lamp
  // for a moment when the lamp is right-clicked (a long press on touch).
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundToggleVisible, setSoundToggleVisible] = useState(false);
  const soundToggleTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    setSoundMuted(readLampSoundMuted());
    return () => window.clearTimeout(soundToggleTimerRef.current);
  }, []);
  const holdSoundToggle = () =>
    window.clearTimeout(soundToggleTimerRef.current);
  const releaseSoundToggle = () => {
    window.clearTimeout(soundToggleTimerRef.current);
    soundToggleTimerRef.current = window.setTimeout(
      () => setSoundToggleVisible(false),
      SOUND_TOGGLE_VISIBLE_MS,
    );
  };
  const toggleSoundMuted = () => {
    const muted = !soundMuted;
    setSoundMuted(muted);
    writeLampSoundMuted(muted);
    // Unmuting answers with the sound it brings back.
    if (!muted) playLampSwitchSound(true);
  };

  const toggleLamp = () => {
    const isOn = lampOverride
      ? lampOverride === "on"
      : document.documentElement.dataset.theme !== "light";
    if (!soundMuted) playLampSwitchSound(!isOn);
    setLampOverride(isOn ? "off" : "on");
  };
  const showSoundToggle = () => {
    setSoundToggleVisible(true);
    releaseSoundToggle();
  };

  // The lamp's tooltip names what a press will do. Without an override that
  // depends on the theme, which is only known in the browser, so it is read
  // after mount and followed when the theme changes.
  const [themeLampIsOn, setThemeLampIsOn] = useState<boolean>();
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setThemeLampIsOn(root.dataset.theme !== "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  const lampIsOn = lampOverride ? lampOverride === "on" : themeLampIsOn;
  const lampAction =
    lampIsOn === undefined
      ? "Switch the lamp"
      : lampIsOn
        ? "Switch off the lamp"
        : "Switch on the lamp";

  // Shift+L works the lamp from the keyboard while the home page is open.
  // Held down, it keeps switching at a steady pace of its own: the keyboard's
  // repeat rate would flicker the picture far faster than is safe to look at.
  const toggleLampRef = useRef(toggleLamp);
  useEffect(() => {
    toggleLampRef.current = toggleLamp;
  });
  useEffect(() => {
    let holdTimer: number | undefined;
    const stopHold = () => {
      window.clearInterval(holdTimer);
      holdTimer = undefined;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.code !== "KeyL" ||
        event.defaultPrevented ||
        isEditingShortcutTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (event.repeat || holdTimer !== undefined) return;
      toggleLampRef.current();
      holdTimer = window.setInterval(
        () => toggleLampRef.current(),
        LAMP_HOLD_INTERVAL_MS,
      );
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyL" || event.key === "Shift") stopHold();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopHold);
    return () => {
      stopHold();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopHold);
    };
  }, []);

  return (
    <section
      aria-labelledby="guest-home-hero-title"
      data-lamp={lampOverride}
      className="relative isolate flex min-h-104 flex-col justify-end overflow-hidden bg-[#050915] text-white [:root[data-theme=light]_&]:bg-[#f4ecdf] [:root[data-theme=light]_&]:text-slate-900 sm:min-h-[clamp(20rem,27vw,25rem)] sm:justify-center"
    >
      <HeroPicture
        picture={guestHeroImage}
        priority
        imageRef={litPictureRef}
        className="-z-40 [:root[data-theme=light]_&]:invisible [[data-lamp=off]_&]:invisible [[data-lamp=off]_&]:transition-[visibility] [[data-lamp=off]_&]:delay-300"
      />
      {/* The other three lie over the lit night picture when their theme and
          lamp state call for them. None is rendered (and so downloaded)
          before that; once the visitor has used the switch, the two that
          answer to it stay rendered and fade in and out.

          A picture that is fully covered is also made invisible (once the
          fade over it has finished). Stacked pictures are not guaranteed to
          land on the same device pixels while the page scrolls, and the one
          underneath would otherwise show as a line along the hero's edge. */}
      <HeroPicture
        picture={guestHeroLampOffImage}
        className="-z-30 hidden motion-reduce:transition-none [:root:not([data-theme=light])_[data-lamp]_&]:block [[data-lamp]_&]:transition-opacity [[data-lamp]_&]:duration-300 [[data-lamp=off]_&]:starting:opacity-0 [[data-lamp=on]_&]:opacity-0"
      />
      <HeroPicture
        picture={guestHeroDayImage}
        className="-z-20 hidden [:root[data-theme=light]_&]:block [[data-lamp=on]_&]:invisible [[data-lamp=on]_&]:transition-[visibility] [[data-lamp=on]_&]:delay-300"
      />
      <HeroPicture
        picture={guestHeroDayLampOnImage}
        className="-z-15 hidden motion-reduce:transition-none [:root[data-theme=light]_[data-lamp]_&]:block [[data-lamp]_&]:transition-opacity [[data-lamp]_&]:duration-300 [[data-lamp=off]_&]:opacity-0 [[data-lamp=on]_&]:starting:opacity-0"
      />
      <button
        type="button"
        onClick={toggleLamp}
        onContextMenu={(event) => {
          event.preventDefault();
          showSoundToggle();
        }}
        aria-label={lampAction}
        title={`${lampAction} (Shift+L)`}
        aria-keyshortcuts="Shift+L"
        style={lampHotspot}
        // Until it has been measured it holds the corner the lamp hangs in.
        className={`absolute z-10 cursor-pointer rounded-b-[45%] outline-none ${
          lampHotspot ? "" : "top-0 right-0 h-12 w-14"
        }`}
      />
      {lampHotspot ? (
        <HeroLampSoundToggle
          lamp={lampHotspot}
          visible={soundToggleVisible}
          muted={soundMuted}
          onToggle={toggleSoundMuted}
          onHold={holdSoundToggle}
          onRelease={releaseSoundToggle}
        />
      ) : null}

      {/* Phone: the picture fades down into the copy below it. Wider screens:
          the copy sits on the picture's empty left side, which is deepened so
          the text stays readable at every crop. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(5_9_21/0.15)_0,rgb(5_9_21/0.5)_8rem,#050915_15.5rem)] [:root[data-theme=light]_&]:bg-[linear-gradient(to_bottom,transparent_0,rgb(244_236_223/0.55)_8rem,#f4ecdf_15.5rem)] sm:bg-[linear-gradient(to_right,rgb(5_9_21/0.95)_0,rgb(5_9_21/0.86)_36%,rgb(5_9_21/0.45)_62%,transparent_84%)] sm:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.74)_34%,rgb(250_245_236/0.28)_56%,transparent_74%)]"
      />

      <div
        className={`flex w-full max-w-3xl flex-col items-start pt-44 pb-8 sm:py-12 ${guestHomeGutter}`}
      >
        <h1
          id="guest-home-hero-title"
          className="text-[clamp(2.125rem,9vw,2.75rem)] leading-[1.06] font-extrabold tracking-[-0.03em] sm:text-[clamp(2.25rem,4.4vw,3.5rem)]"
        >
          {hero ? (
            <>
              {hero.headline}
              {hero.highlightedHeadline ? (
                <span className="block text-[color-mix(in_srgb,var(--accent)_66%,white)] [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))">
                  {hero.highlightedHeadline}
                </span>
              ) : null}
            </>
          ) : (
            <span
              aria-hidden="true"
              className="block h-[2.1em] w-[min(26rem,80vw)] animate-pulse rounded-xl bg-white/10"
            />
          )}
        </h1>
        {!hero || hero.description ? (
          <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-slate-200/90 [:root[data-theme=light]_&]:text-slate-700 sm:mt-5 sm:max-w-[min(32rem,54cqw)] sm:text-lg">
            {hero?.description}
          </p>
        ) : null}

        <div className="mt-7 flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center sm:mt-8">
          <GuestHomeLink
            href="/courses"
            onNavigatePage={onNavigatePage}
            data-control-radius-action
            className="group/cta inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-(--accent) px-6 text-base font-semibold text-(--on-accent) shadow-[0_12px_28px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)] transition-[background-color,box-shadow] duration-150 hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {hero?.primaryActionLabel ?? "Browse courses"}
            <ArrowRight
              size={18}
              weight="bold"
              aria-hidden="true"
              className="transition-transform duration-150 group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
            />
          </GuestHomeLink>
          {freeCoursesSectionId && hero?.secondaryActionLabel ? (
            <a
              href={`#${freeCoursesSectionId}`}
              data-control-radius-action
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white/12 px-6 text-base font-semibold text-white backdrop-blur-sm transition-colors duration-150 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [:root[data-theme=light]_&]:bg-white/60 [:root[data-theme=light]_&]:text-slate-900 [:root[data-theme=light]_&]:hover:bg-white/85 [:root[data-theme=light]_&]:focus-visible:outline-slate-900"
              onClick={(event) => {
                const section = document.getElementById(freeCoursesSectionId);
                if (!section) return;
                // The page may scroll inside the application frame rather
                // than the window, and the hash is not part of the route.
                event.preventDefault();
                section.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                  block: "start",
                });
              }}
            >
              {hero.secondaryActionLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
