import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "veolms.chat.listWidth";
const MIN_WIDTH = 300;
const MAX_WIDTH = 620;
/** The list never takes more than this share of the chat area. */
const MAX_SHARE = 0.55;
const KEY_STEP = 16;

function readSaved(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function save(width: number | null) {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Private windows: the width is kept for this visit only.
  }
}

/**
 * The chat list's width, dragged on its edge (or arrow keys on it) and
 * remembered on this device. Double-click puts it back to the default:
 * 30% of the chat area, as in WhatsApp, between 300 and 460 px.
 */
export function useChatListWidth(areaRef: React.RefObject<HTMLElement | null>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [areaWidth, setAreaWidth] = useState(0);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setChosen(readSaved());
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAreaWidth(entry.contentRect.width);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [areaRef]);

  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, areaWidth * MAX_SHARE));
  const clamp = useCallback(
    (value: number) => Math.min(max, Math.max(MIN_WIDTH, value)),
    [max],
  );
  const fallback = Math.min(460, Math.max(MIN_WIDTH, areaWidth * 0.3));
  const width = clamp(chosen ?? fallback);

  const set = useCallback(
    (value: number | null) => {
      const next = value === null ? null : clamp(value);
      setChosen(next);
      save(next);
    },
    [clamp],
  );

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": "Resize chat list",
    "aria-valuemin": MIN_WIDTH,
    "aria-valuemax": Math.round(max),
    "aria-valuenow": Math.round(width),
    tabIndex: 0,
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startWidth: width };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const drag = dragRef.current;
      if (!drag) return;
      setChosen(clamp(drag.startWidth + event.clientX - drag.startX));
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      if (!dragRef.current) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      save(width);
    },
    onDoubleClick() {
      set(null);
    },
    onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
      if (event.key === "ArrowLeft") set(width - KEY_STEP);
      else if (event.key === "ArrowRight") set(width + KEY_STEP);
      else if (event.key === "Home") set(MIN_WIDTH);
      else if (event.key === "End") set(max);
      else return;
      event.preventDefault();
    },
  };

  return { width, handleProps };
}
