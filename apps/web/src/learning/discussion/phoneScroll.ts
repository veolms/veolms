import React, { useEffect, useRef } from "react";

/**
 * Where each lesson's phone page was scrolled to, for as long as the app
 * stays open. On a phone the lesson column (video, description and comments)
 * scrolls, and it is rebuilt whenever the lesson is left and reopened
 * (minimizing the player and expanding it again does that), so its position
 * is kept here rather than in the element.
 */
const phoneDiscussionScrollPositions = new Map<string, number>();

export function usePhoneDiscussionScrollMemory({
  viewportRef,
  memoryKey,
  enabled,
  contentReady,
}: {
  viewportRef: React.RefObject<HTMLElement | null>;
  memoryKey: string | undefined;
  enabled: boolean;
  /** The lesson and its comments are in, so the page is its real height. */
  contentReady: boolean;
}) {
  const restoringRef = useRef(false);
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !memoryKey || !enabled) return undefined;
    const remember = () => {
      // Its own attempts to get back to the old position are not the reader
      // scrolling, and must not overwrite what is being restored.
      if (restoringRef.current) return;
      phoneDiscussionScrollPositions.set(memoryKey, viewport.scrollTop);
    };
    viewport.addEventListener("scroll", remember, { passive: true });
    return () => viewport.removeEventListener("scroll", remember);
  }, [contentReady, enabled, memoryKey, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (
      !viewport ||
      !memoryKey ||
      !enabled ||
      !contentReady ||
      restoredKeyRef.current === memoryKey
    ) {
      return undefined;
    }
    restoredKeyRef.current = memoryKey;
    const remembered = phoneDiscussionScrollPositions.get(memoryKey) ?? 0;
    if (remembered < 1) return undefined;
    // A video at full height scrolls away with the page: the lesson opens
    // at its top, video in view. Only a shortened video stays at the top
    // while the page under it is put back where it was.
    if (!viewport.querySelector("[data-learning-player-shortened]")) {
      return undefined;
    }

    // The list measures its comments as they appear, so the remembered
    // position may not be reachable at once. Keep going back to it until it
    // holds, the reader takes over, or a couple of seconds have passed.
    const interactions = ["wheel", "touchstart", "keydown", "pointerdown"];
    let timer: number | undefined;
    let attempts = 0;
    restoringRef.current = true;
    const stop = () => {
      restoringRef.current = false;
      window.clearTimeout(timer);
      for (const name of interactions) {
        window.removeEventListener(name, stop, true);
      }
    };
    const restore = () => {
      viewport.scrollTop = remembered;
      attempts += 1;
      if (attempts < 16) timer = window.setTimeout(restore, 120);
      else stop();
    };
    for (const name of interactions) {
      window.addEventListener(name, stop, { capture: true, passive: true });
    }
    restore();
    return stop;
  }, [contentReady, enabled, memoryKey, viewportRef]);
}
