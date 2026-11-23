import { useCallback, useEffect, useState, type RefObject } from "react";

import type { ChatMediaKind } from "../lib/chatMediaCache";
import {
  chatUploadIdOf,
  discardShown,
  openKept,
  openPhoto,
  peekShown,
  type MediaHandle,
} from "./chatMediaSource";

/** How far ahead of the screen a lazy photo starts loading. */
const NEAR_MARGIN = "600px";

let observer: IntersectionObserver | null = null;
const waiting = new Map<Element, () => void>();

/**
 * Calls `callback` once `element` comes near the screen, as the browser's
 * own `loading="lazy"` does for an <img> with an address. `scrollMargin`
 * extends the margin to the chat's scrolling list where supported;
 * elsewhere a photo starts when it scrolls into view.
 */
function whenNear(element: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => undefined;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const ready = waiting.get(entry.target);
        if (!ready) continue;
        waiting.delete(entry.target);
        observer?.unobserve(entry.target);
        ready();
      }
    },
    {
      rootMargin: NEAR_MARGIN,
      scrollMargin: NEAR_MARGIN,
    } as IntersectionObserverInit,
  );
  waiting.set(element, callback);
  observer.observe(element);
  return () => {
    if (waiting.delete(element)) observer?.unobserve(element);
  };
}

export interface ChatMediaSource {
  /**
   * What to show: this device's copy (`blob:`), or the network address.
   * Undefined while the device is still being asked (a few milliseconds).
   */
  src: string | undefined;
  /** Shown from this device (kept, or downloaded by the page just now). */
  local: boolean;
  /** Whether the device has answered. */
  settled: boolean;
  /** The chat upload, when `src` is one this device can keep. */
  uploadId: string | null;
  /** The device's copy could not be shown: forget it, use the network. */
  fallBack: () => void;
}

interface SourceState {
  /** The address (and whether the device was asked) this answer is for. */
  for: string;
  src: string | undefined;
  local: boolean;
  settled: boolean;
}

function useDeviceSource(
  src: string,
  kind: ChatMediaKind,
  open: (uploadId: string) => Promise<MediaHandle | null>,
  /** Shown when the device has no copy (`src` itself, or nothing). */
  withoutCopy: string | undefined,
  lazy = false,
  element?: RefObject<Element | null>,
): ChatMediaSource {
  const uploadId = chatUploadIdOf(src);
  const [broken, setBroken] = useState<string | null>(null);
  const useDevice = uploadId !== null && broken !== src;
  const answerFor = `${useDevice ? "device" : "network"}:${src}`;

  const initial = (): SourceState => {
    if (!useDevice) {
      return { for: answerFor, src: withoutCopy, local: false, settled: true };
    }
    // Already open in this page (the bubble, then the viewer): at once.
    const ready = peekShown(kind, uploadId);
    return ready
      ? { for: answerFor, src: ready, local: true, settled: true }
      : { for: answerFor, src: undefined, local: false, settled: false };
  };
  const [state, setState] = useState<SourceState>(initial);
  const current = state.for === answerFor ? state : initial();

  useEffect(() => {
    if (!useDevice) return;
    let cancelled = false;
    let handle: MediaHandle | null = null;
    const start = () => {
      void open(uploadId).then(
        (opened) => {
          if (cancelled) {
            opened?.release();
            return;
          }
          handle = opened;
          setState({
            for: answerFor,
            src: opened?.url ?? withoutCopy,
            local: opened !== null,
            settled: true,
          });
        },
        () => {
          if (!cancelled) {
            setState({
              for: answerFor,
              src: withoutCopy,
              local: false,
              settled: true,
            });
          }
        },
      );
    };
    const target = lazy ? element?.current : null;
    const stopWaiting = target ? whenNear(target, start) : (start(), null);
    return () => {
      cancelled = true;
      stopWaiting?.();
      handle?.release();
    };
    // `open` and `element` are stable for each kind of caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerFor, uploadId, useDevice, withoutCopy, lazy]);

  const local = current.local;
  const fallBack = useCallback(() => {
    if (!uploadId || !local) return;
    discardShown(kind, uploadId);
    setBroken(src);
  }, [kind, local, src, uploadId]);

  return { ...current, uploadId, fallBack };
}

const openKeptVideo = (uploadId: string) => openKept("video", uploadId);
const openKeptStill = (uploadId: string) => openKept("poster", uploadId);

/** A chat photo: kept on this device, or downloaded once and kept. */
export function useChatPhotoSource(
  src: string,
  lazy: boolean,
  element: RefObject<Element | null>,
): ChatMediaSource {
  return useDeviceSource(src, "image", openPhoto, src, lazy, element);
}

/** A chat video: kept on this device, or the network (see `keepVideo`). */
export function useChatVideoSource(src: string): ChatMediaSource {
  return useDeviceSource(src, "video", openKeptVideo, src);
}

/** A kept video's still picture, for its bubble; `src` undefined if none. */
export function useChatVideoStill(src: string): ChatMediaSource {
  return useDeviceSource(src, "poster", openKeptStill, undefined);
}
