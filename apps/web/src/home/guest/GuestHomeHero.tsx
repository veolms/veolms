import { guestHomeGutter } from "./guestHomeSpacing";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { HomePageHero } from "@veolms/contracts/home-page-defaults";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "./GuestHomeLink";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
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
import { HeroLaptopPower, useHeroLaptopPower } from "./HeroLaptopPower";
import { HeroLaptopPowerSpot } from "./HeroLaptopPowerSpot";
import { HeroLaptopScreen } from "./HeroLaptopScreen";
import { useHeroLaptopScreen } from "./useHeroLaptopScreen";
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

/**
 * The hero's second action is a pane of glass lying over the picture, set
 * apart from it by a shadow underneath rather than a border or a glow. While
 * the lamp is on, its warm light falls on the glass from the top right
 * corner (the `before` layer, which fades with the lamp); by day that light
 * is fainter.
 *
 * The lamp hangs at the hero's right edge and the action sits near its left
 * one, so the wider the hero, the further the glass is from the lamp and the
 * less of its light reaches it: `--lamp-reach` runs from 1 on a hero up to
 * 800px wide down to 0 at 1450px (a desktop window with the sidebar closed),
 * where switching the lamp no longer shows on the glass at all. The hero's
 * width is a length (100cqw of the page container) and opacity wants a
 * number; `tan(atan2(length, 1px))` is the CSS way to turn one into the other.
 *
 * The lamp's light is its own set of classes because it falls on the primary
 * action beside the glass as well.
 */
const lampLightClasses = [
  "relative isolate",
  "before:[--lamp-reach:clamp(0,(1450_-_tan(atan2(100cqw,1px)))_/_650,1)]",
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[radial-gradient(130%_170%_at_100%_0%,rgb(255_190_120/0.36),rgb(255_190_120/0.1)_38%,transparent_68%)] before:opacity-(--lamp-reach) before:transition-opacity before:duration-300 motion-reduce:before:transition-none",
  "[[data-lamp=off]_&]:before:opacity-0",
  "[:root[data-theme=light]_&]:before:opacity-0 [:root[data-theme=light]_[data-lamp=on]_&]:before:opacity-[calc(var(--lamp-reach)*0.7)]",
].join(" ");

const glassActionClasses = [
  "inline-flex min-h-12 items-center justify-center rounded-lg px-6 text-base font-semibold text-white backdrop-blur-md",
  "transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
  // Night: dark glass with a faint tint of the screen's light, a touch
  // stronger in the bottom left corner where the picture behind is at its
  // darkest. It is lifted off the picture by a dark shadow, never a glow.
  "bg-white/8 bg-[linear-gradient(45deg,rgb(150_170_255/0.1),rgb(255_255_255/0.03)_55%,rgb(124_150_255/0.08))] hover:bg-white/16",
  "shadow-[0_12px_26px_-10px_rgb(0_0_0/0.7),0_3px_8px_-3px_rgb(0_0_0/0.45)]",
  lampLightClasses,
  // Day.
  "[:root[data-theme=light]_&]:bg-white/45 [:root[data-theme=light]_&]:bg-none [:root[data-theme=light]_&]:text-slate-900 [:root[data-theme=light]_&]:hover:bg-white/60 [:root[data-theme=light]_&]:focus-visible:outline-slate-900",
  "[:root[data-theme=light]_&]:shadow-[0_12px_28px_-8px_rgb(15_23_42/0.28),0_4px_10px_-4px_rgb(15_23_42/0.12)]",
].join(" ");

// Dark text on the bright accent reads thinner than the white text of the
// action beside it at the same weight, so by night it is set a step heavier
// to look the same.
const primaryActionClasses = `${lampLightClasses} group/cta inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-(--accent) px-6 text-base font-bold text-(--on-accent) shadow-[0_12px_28px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)] transition-[background-color,box-shadow] duration-150 hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [:root[data-theme=light]_&]:font-semibold`;

/**
 * Scrolls to a section of the home page from a link to its id. The page may
 * scroll inside the application frame rather than the window, and the hash is
 * not part of the route, so the browser's own jump is replaced.
 */
function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

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
        className={`absolute inset-x-0 top-0 h-full w-full object-cover object-[62%_center] sm:object-[72%_center] xl:object-center ${className}`}
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
  greeting,
  onNavigatePage,
  freeCoursesSectionId,
  laptopScreen,
}: {
  /** The configured copy; while it is still loading the hero shows its picture and placeholders. */
  hero?: HomePageHero;
  /** A short line of its own above the title, for a signed-in learner. */
  greeting?: string;
  onNavigatePage: NavigateTo;
  /** The secondary action scrolls to this section when it is on the page. */
  freeCoursesSectionId?: string;
  /**
   * What the laptop in the picture shows: an image, a video or any live
   * element, laid out at 800 by 530 (see `HeroLaptopScreen`). The laptop
   * is on when the page loads and can be switched off and on; without this
   * it has no power and stays dark.
   */
  laptopScreen?: ReactNode;
}) {
  const [lampOverride, setLampOverride] = useState<LampOverride>();
  const litPictureRef = useRef<HTMLImageElement>(null);
  const lampHotspot = useHeroLampHotspot(litPictureRef);
  const laptop = useHeroLaptopScreen(litPictureRef);
  const laptopPower = useHeroLaptopPower();

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
      className="relative isolate flex min-h-104 flex-col justify-start overflow-clip bg-[#050915] text-white [:root[data-theme=light]_&]:bg-[#f4ecdf] [:root[data-theme=light]_&]:text-slate-900 sm:min-h-[clamp(20rem,27vw,25rem)] sm:justify-center"
    >
      {laptopScreen ? (
        <>
          <HeroLaptopScreen transform={laptop.transform}>
            <HeroLaptopPower
              power={laptopPower.power}
              onSwitchOn={laptopPower.switchOn}
            >
              {laptopScreen}
            </HeroLaptopPower>
          </HeroLaptopScreen>
          {laptop.powerSpot ? (
            <HeroLaptopPowerSpot
              spot={laptop.powerSpot}
              isOn={laptopPower.power !== "off"}
              onToggle={laptopPower.toggle}
            />
          ) : null}
        </>
      ) : null}
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
        // Until it has been measured it holds the corner the lamp hangs in
        // (on a phone, where the picture is further down, it waits instead).
        className={`absolute z-10 cursor-pointer rounded-b-[45%] outline-none ${
          lampHotspot ? "" : "top-0 right-0 hidden h-12 w-14 sm:block"
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

      {/* Wider screens: the copy sits on the picture's empty left side, which
          is deepened so the text stays readable at every crop. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 hidden sm:block sm:bg-[linear-gradient(to_right,rgb(5_9_21/0.95)_0,rgb(5_9_21/0.86)_36%,rgb(5_9_21/0.45)_62%,transparent_84%)] sm:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.74)_34%,rgb(250_245_236/0.28)_56%,transparent_74%)]"
      />

      <div
        // The box lies over the laptop without showing; it lets the pointer
        // through to the screen, and only its own content takes it.
        className={`pointer-events-none flex w-full max-w-3xl flex-col items-start py-8 *:pointer-events-auto sm:py-12 ${guestHomeGutter}`}
      >
        {hero && greeting ? (
          <p className="mb-2 text-[1.375rem] leading-snug font-semibold text-slate-200 [:root[data-theme=light]_&]:text-slate-700 sm:mb-3 sm:text-[clamp(1.375rem,2.4vw,2rem)]">
            {greeting}
          </p>
        ) : null}
        <h1
          id="guest-home-hero-title"
          className="text-[clamp(1.5rem,7.4vw,2.75rem)] leading-[1.06] font-extrabold tracking-[-0.03em] sm:text-[clamp(2.25rem,4.4vw,3.5rem)]"
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

        {/* The pictures. On a phone they are a band of their own between the
            copy and the actions (the copy's last line runs a little over
            their top), faded into the hero at its top and bottom
            edges; on wider screens this box steps aside and they fill the
            whole hero behind the copy. */}
        <div className="pointer-events-none! relative -mx-[clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)] -mt-6 h-56 self-stretch before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(to_bottom,#050915_0,rgb(5_9_21/0.55)_14%,transparent_34%,transparent_76%,#050915_100%)] sm:static sm:mx-0 sm:mt-0 sm:h-auto sm:before:hidden [:root[data-theme=light]_&]:before:bg-[linear-gradient(to_bottom,#f4ecdf_0,rgb(244_236_223/0.6)_14%,transparent_34%,transparent_76%,#f4ecdf_100%)]">
          <HeroPicture
            picture={guestHeroImage}
            priority
            imageRef={litPictureRef}
            // Its phone crop sits a little to the left of the lamp-off one;
            // it is nudged across, at the same size, so the scene stays
            // still when the lamp switches. The offset grows with the
            // picture, by eye: two pixels on a 375px phone and two and a
            // half on a 520px one. The lamp-off picture keeps its place and
            // covers the hero edge to edge.
            className="-z-40 max-sm:translate-x-[calc(0.34%+0.72px)] [:root[data-theme=light]_&]:invisible [[data-lamp=off]_&]:invisible [[data-lamp=off]_&]:transition-[visibility] [[data-lamp=off]_&]:delay-300"
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
        </div>

        <div className="mt-3.5 flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center sm:mt-8">
          <GuestHomeLink
            href="/courses"
            onNavigatePage={onNavigatePage}
            data-control-radius-action
            className={primaryActionClasses}
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
              className={glassActionClasses}
              onClick={(event) => scrollToSection(event, freeCoursesSectionId)}
            >
              {hero.secondaryActionLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
