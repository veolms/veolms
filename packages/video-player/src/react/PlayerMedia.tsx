import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type VideoHTMLAttributes,
} from "react";
import { usePlayerController } from "./context";

export type PlayerMediaProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "src" | "children"
> & {
  /**
   * Renders a second, hidden element the engine prepares the next video in
   * (a hovered or upcoming lesson), so switching to it is instant. Only for
   * engines that support it; fixed for the life of the player.
   */
  withStandby?: boolean;
};

type Slot = 0 | 1;

/** The standby is laid over the visible element, unseen and inert. */
const STANDBY_CLASSES = "opacity-0";

export const PlayerMedia = forwardRef<HTMLVideoElement, PlayerMediaProps>(
  function PlayerMedia(
    { preload = "auto", withStandby = false, className, ...props },
    forwardedRef,
  ) {
    const controller = usePlayerController();
    const [standbyEnabled] = useState(
      () => withStandby && controller.supportsStandbyMedia,
    );
    const slotsRef = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>(
      [null, null],
    );
    // Which element is on screen. The engine switches it (an instant change
    // of video); a ref so ref callbacks and the switch read it at once.
    const activeSlotRef = useRef<Slot>(0);
    const [activeSlot, setActiveSlot] = useState<Slot>(0);
    useImperativeHandle(
      forwardedRef,
      () => slotsRef.current[activeSlotRef.current] as HTMLVideoElement,
    );

    const setSlotMedia = useCallback(
      (slot: Slot, media: HTMLVideoElement | null) => {
        const previous = slotsRef.current[slot];
        slotsRef.current[slot] = media;
        const active = slot === activeSlotRef.current;
        if (media) {
          if (active) {
            void controller.attachMedia(media).catch(() => undefined);
          } else {
            controller.setStandbyMedia(media);
          }
        } else if (previous) {
          if (active) {
            void controller.detachMedia(previous).catch(() => undefined);
          } else {
            controller.setStandbyMedia(null);
          }
        }
      },
      [controller],
    );
    const setFirstMedia = useCallback(
      (media: HTMLVideoElement | null) => setSlotMedia(0, media),
      [setSlotMedia],
    );
    const setSecondMedia = useCallback(
      (media: HTMLVideoElement | null) => setSlotMedia(1, media),
      [setSlotMedia],
    );

    useEffect(() => {
      if (!standbyEnabled) return undefined;
      return controller.onActiveMediaChange((media) => {
        const slot = slotsRef.current.indexOf(media);
        if (slot !== 0 && slot !== 1) return;
        activeSlotRef.current = slot;
        // Shown in this very frame; React's render below only agrees.
        for (const [index, element] of slotsRef.current.entries()) {
          if (!element) continue;
          const standby = index !== slot;
          element.classList.toggle(STANDBY_CLASSES, standby);
          element.toggleAttribute("data-player-standby", standby);
        }
        setActiveSlot(slot);
      });
    }, [controller, standbyEnabled]);

    if (!standbyEnabled) {
      return (
        <video
          {...props}
          className={className}
          ref={setFirstMedia}
          preload={preload}
        />
      );
    }

    // Both elements are React's, laid over each other in the same place;
    // only their roles change, so React never sees an element disappear.
    const slotProps = (slot: Slot) => {
      const standby = slot !== activeSlot;
      return {
        ...props,
        className: `${className ?? ""} absolute inset-0 ${standby ? STANDBY_CLASSES : ""}`,
        preload,
        "data-player-standby": standby ? "" : undefined,
        "aria-hidden": standby ? true : props["aria-hidden"],
        tabIndex: standby ? -1 : props.tabIndex,
        // The standby is silent until it is switched to (the engine then
        // carries the volume over).
        muted: standby ? true : props.muted,
      };
    };

    return (
      <>
        <video {...slotProps(0)} ref={setFirstMedia} />
        <video {...slotProps(1)} ref={setSecondMedia} />
      </>
    );
  },
);
