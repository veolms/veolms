import { useCallback, useRef, useState, type UIEvent } from "react";

/** How far one has to scroll one way before the bar hides or comes back. */
const THRESHOLD_PX = 24;
/** Near the top the bar always shows. */
const TOP_PX = 8;

/**
 * WhatsApp's chat list filters: they slide away while you scroll down the
 * list and come back as soon as you scroll up (or reach the top). Returns
 * whether the bar is hidden and the list's scroll handler. Direction is
 * judged over a short distance so a jittery finger does not flicker it.
 */
export function useHideOnScrollDown() {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const travelled = useRef(0);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const top = event.currentTarget.scrollTop;
    const delta = top - last.current;
    // A scroll event that moved nothing (a re-layout) says no direction.
    if (delta === 0) return;
    last.current = top;
    if (top <= TOP_PX) {
      travelled.current = 0;
      setHidden(false);
      return;
    }
    // Keep adding while the direction holds; start again when it turns.
    travelled.current =
      Math.sign(delta) === Math.sign(travelled.current)
        ? travelled.current + delta
        : delta;
    if (travelled.current > THRESHOLD_PX) setHidden(true);
    else if (travelled.current < -THRESHOLD_PX) setHidden(false);
  }, []);

  const show = useCallback(() => {
    travelled.current = 0;
    setHidden(false);
  }, []);

  return { hidden, onScroll, show };
}
