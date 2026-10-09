import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";
import { HeroLampSoundToggle } from "./HeroLampSoundToggle";
import { HeroLaptopPower, useHeroLaptopPower } from "./HeroLaptopPower";
import { HeroLaptopPowerSpot } from "./HeroLaptopPowerSpot";
import { HeroLaptopScreen } from "./HeroLaptopScreen";
import {
  guestHeroDayImage,
  guestHeroDayLampOnImage,
  guestHeroImage,
  guestHeroLampOffImage,
  type GuestHeroPicture,
} from "./guestHeroImage";
import {
  playLampSwitchSound,
  readLampSoundMuted,
  writeLampSoundMuted,
} from "./lampSwitchSound";
import { useHeroLampHotspot } from "./useHeroLampHotspot";
import { useHeroLaptopScreen } from "./useHeroLaptopScreen";

/** How long the mute button stays once it has been called up. */
const SOUND_TOGGLE_VISIBLE_MS = 2000;
/**
 * The pace of the lamp while Shift+L is held: slow enough for each fade to
 * finish and well under three flashes a second.
 */
const LAMP_HOLD_INTERVAL_MS = 450;

/**
 * The lamp follows the theme until the visitor switches it: on in the dark
 * theme, off in the light one. The theme is only known in the browser, so
 * the choice is made in CSS from the document's theme and this override.
 */
type LampOverride = "on" | "off";

/**
 * Where the picture is held when it is cropped to the hero: towards the desk
 * on a phone, and centred once the hero is wide enough to show all of it.
 */
const DEFAULT_PICTURE_POSITION =
  "object-[62%_center] sm:object-[72%_center] xl:object-center";

/**
 * The fade that runs a band of the picture into the hero at its top and
 * bottom edges, for a hero that shows the picture as a band of its own
 * between its content rather than behind it.
 */
export const heroPictureBandFade =
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(to_bottom,#050915_0,rgb(5_9_21/0.55)_14%,transparent_34%,transparent_76%,#050915_100%)] [:root[data-theme=light]_&]:before:bg-[linear-gradient(to_bottom,#f4ecdf_0,rgb(244_236_223/0.6)_14%,transparent_34%,transparent_76%,#f4ecdf_100%)]";

/** One of the hero's stacked pictures, in its phone and wide crops. */
function HeroPicture({
  picture,
  position,
  className,
  priority = false,
  imageRef,
}: {
  picture: GuestHeroPicture;
  position: string;
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
        className={`absolute inset-x-0 top-0 h-full w-full object-cover ${position} ${className}`}
      />
    </picture>
  );
}

/**
 * The hero's scene: a picture of a desk with a lamp that switches and a
 * laptop whose screen is a live part of the page. By night (dark theme) the
 * hero is the picture's navy; by day (light theme) it is the sunlit wall.
 *
 * It is the hero's `section` and everything in it that belongs to the
 * picture. What the hero says is its children, which also decide where the
 * pictures go: they are handed over as one node, to be placed in a box that
 * the hero's content flows around (a band of its own) or that steps aside
 * (`static`) so the pictures fill the whole hero behind the content.
 */
export function HeroDesk({
  labelledBy,
  className,
  fadeClassName,
  picturePosition = DEFAULT_PICTURE_POSITION,
  laptopScreen,
  children,
}: {
  /** The id of the hero's title. */
  labelledBy: string;
  /** How the hero lays its content out, and how tall it is. */
  className: string;
  /**
   * The layer that deepens the side of the picture the content sits on, so
   * the text stays readable at every crop. It lies over the laptop as well.
   */
  fadeClassName: string;
  picturePosition?: string;
  /**
   * What the laptop in the picture shows: an image, a video or any live
   * element, laid out at 800 by 530 (see `HeroLaptopScreen`). The laptop
   * is on when the page loads and can be switched off and on; without this
   * it has no power and stays dark.
   */
  laptopScreen?: ReactNode;
  children: (pictures: ReactNode) => ReactNode;
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

  const pictures = (
    <>
      <HeroPicture
        picture={guestHeroImage}
        position={picturePosition}
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
        position={picturePosition}
        className="-z-30 hidden motion-reduce:transition-none [:root:not([data-theme=light])_[data-lamp]_&]:block [[data-lamp]_&]:transition-opacity [[data-lamp]_&]:duration-300 [[data-lamp=off]_&]:starting:opacity-0 [[data-lamp=on]_&]:opacity-0"
      />
      <HeroPicture
        picture={guestHeroDayImage}
        position={picturePosition}
        className="-z-20 hidden [:root[data-theme=light]_&]:block [[data-lamp=on]_&]:invisible [[data-lamp=on]_&]:transition-[visibility] [[data-lamp=on]_&]:delay-300"
      />
      <HeroPicture
        picture={guestHeroDayLampOnImage}
        position={picturePosition}
        className="-z-15 hidden motion-reduce:transition-none [:root[data-theme=light]_[data-lamp]_&]:block [[data-lamp]_&]:transition-opacity [[data-lamp]_&]:duration-300 [[data-lamp=off]_&]:opacity-0 [[data-lamp=on]_&]:starting:opacity-0"
      />
    </>
  );

  return (
    <section
      aria-labelledby={labelledBy}
      data-lamp={lampOverride}
      className={`relative isolate flex flex-col overflow-clip bg-[#050915] text-white [:root[data-theme=light]_&]:bg-[#f4ecdf] [:root[data-theme=light]_&]:text-slate-900 ${className}`}
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

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 ${fadeClassName}`}
      />

      {children(pictures)}
    </section>
  );
}
