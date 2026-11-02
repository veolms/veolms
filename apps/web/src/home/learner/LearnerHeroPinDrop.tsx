import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { useEffect, useRef, useState } from "react";
import {
  PIN_DROP_EVENT,
  PIN_DROP_OVER_EVENT,
  readPinCourseDrop,
} from "./pinCourseDrag";

/**
 * Lies over the hero's course card while one of the learner's course cards
 * is being dragged, and pins the course dropped on it. It reaches a little
 * past the card on every side, so the drop need not be exact. It is only
 * there during the drag, so the card's own controls are never under it
 * otherwise. Goes inside a `relative` box the size of the card.
 *
 * A mouse's drag arrives as the browser's drag events, a finger's as the
 * page's own (see `getPinCourseDragProps`).
 */
export function LearnerHeroPinDrop({
  onPin,
}: {
  onPin: (courseId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const touchOver = (event: Event) => {
      setOver((event as CustomEvent<{ over: boolean }>).detail.over);
    };
    const touchDrop = (event: Event) => {
      onPinRef.current(
        (event as CustomEvent<{ courseId: string }>).detail.courseId,
      );
    };
    zone.addEventListener(PIN_DROP_OVER_EVENT, touchOver);
    zone.addEventListener(PIN_DROP_EVENT, touchDrop);
    return () => {
      zone.removeEventListener(PIN_DROP_OVER_EVENT, touchOver);
      zone.removeEventListener(PIN_DROP_EVENT, touchDrop);
    };
  }, []);

  return (
    <div
      ref={zoneRef}
      data-learner-hero-pin-drop=""
      onDragEnter={() => setOver(true)}
      onDragLeave={(event) => {
        // Moving onto the label inside is not leaving.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const courseId = readPinCourseDrop(event);
        if (courseId) onPin(courseId);
      }}
      className={`pointer-events-auto! absolute -inset-3 z-50 grid place-items-center rounded-[1.75rem] border-2 border-dashed backdrop-blur-[2px] transition-colors duration-150 motion-reduce:transition-none ${
        over
          ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_22%,rgb(2_6_23/0.72))]"
          : "border-white/50 bg-slate-950/60"
      }`}
    >
      <p className="pointer-events-none flex items-center gap-2 text-[0.9375rem] font-semibold whitespace-nowrap text-white">
        <PushPin size={18} weight="fill" aria-hidden="true" />
        {over ? "Release to pin" : "Drop here to pin to Home"}
      </p>
    </div>
  );
}
