import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { formatExactTime, formatTimeAgo } from "../lib/timeAgo";

/** How long a tapped tooltip stays when nothing else closes it. */
const TAP_TOOLTIP_MS = 3000;
/** The tooltip's distance from the viewport's edges. */
const EDGE = 8;

/**
 * The moment a prerendered page was built. Its times say how long ago
 * things were then, in the build's time zone; while the page hydrates the
 * browser has to write the same, or React throws the page away and draws it
 * again. Right after, the times are worked out afresh for the reader.
 */
export const TimeAgoBuiltAt = createContext<number | undefined>(undefined);

const subscribeToNothing = () => () => {};

interface TimeAgoProps {
  /** When it happened. Nothing is drawn without a readable time. */
  value: string | number | Date | undefined | null;
  /** The short text, when the caller already has it; else worked out here. */
  label?: string;
  className?: string;
}

/**
 * When a post was written, as "2 hours ago". The exact date and time show
 * on hover (the browser's own tooltip) and, on a touch screen where there is
 * no hover, in a small dark tooltip above the time when it is tapped. A tap
 * on the time does nothing else, so it never opens the row it sits in.
 */
export function TimeAgo({ value, label, className = "" }: TimeAgoProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLTimeElement>(null);
  const lastPointerRef = useRef<string>("mouse");
  const builtAt = useContext(TimeAgoBuiltAt);
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  if (value === undefined || value === null || value === "") {
    return label ? <span className={className}>{label}</span> : null;
  }
  // In the built page, and while it hydrates: the time as of the build,
  // with no exact moment (that depends on the time zone), so the first
  // render after hydration writes the reader's own.
  const asBuilt = !hydrated && builtAt !== undefined;
  const exact = asBuilt ? "" : formatExactTime(value);
  const text = asBuilt
    ? formatTimeAgo(value, builtAt)
    : (label ?? formatTimeAgo(value));
  const date = new Date(value);
  const dateTime = Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString();

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    lastPointerRef.current = event.pointerType;
  };
  const onClick = (event: ReactMouseEvent<HTMLElement>) => {
    // A mouse has the hover tooltip; only a finger or pen opens this one.
    if (lastPointerRef.current === "mouse" || !exact) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen((wasOpen) => !wasOpen);
  };

  return (
    <>
      <time
        ref={anchorRef}
        dateTime={dateTime}
        title={exact || undefined}
        aria-label={exact ? `${text}, ${exact}` : undefined}
        onPointerDown={onPointerDown}
        onClick={onClick}
        className={className}
      >
        {text}
      </time>
      {open && (
        <TapTooltip
          anchorRef={anchorRef}
          text={exact}
          onClosed={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TapTooltip({
  anchorRef,
  text,
  onClosed,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  text: string;
  /** After it has faded out. */
  onClosed: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  // Shown once placed, so it fades in where it belongs instead of being
  // drawn first at the corner of the screen; it fades out before it goes.
  const [leaving, setLeaving] = useState(false);
  const onClose = useCallback(() => setLeaving(true), []);
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(onClosed, 150);
    return () => window.clearTimeout(timer);
  }, [leaving, onClosed]);

  // Above the time, centred on it, kept inside the screen; below it when
  // there is no room above.
  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const tooltip = tooltipRef.current?.getBoundingClientRect();
    if (!anchor || !tooltip) return;
    const left = Math.min(
      Math.max(EDGE, anchor.left + anchor.width / 2 - tooltip.width / 2),
      window.innerWidth - tooltip.width - EDGE,
    );
    const above = anchor.top - tooltip.height - 6;
    const top = above >= EDGE ? above : anchor.bottom + 6;
    setPosition({ left, top });
  }, [anchorRef]);

  // Gone with the next tap anywhere else, a scroll, or after a moment.
  useEffect(() => {
    const timer = window.setTimeout(onClose, TAP_TOOLTIP_MS);
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      style={
        position
          ? { left: position.left, top: position.top }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      className={`pointer-events-none fixed z-1000 rounded-md bg-black/90 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg transition-opacity duration-150 ease-out ${
        position && !leaving ? "opacity-100" : "opacity-0"
      }`}
    >
      {text}
    </div>,
    document.body,
  );
}
