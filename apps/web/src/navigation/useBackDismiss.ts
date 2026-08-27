import { useCallback, useId, useLayoutEffect, useRef } from "react";

const OVERLAY_HISTORY_STATE_KEY = "__veolmsOverlayHistoryEntry";

interface BackDismissLayer {
  dismiss: () => void;
}

interface UseBackDismissOptions {
  enabled?: boolean;
  open: boolean;
  onDismiss: () => void;
}

const activeLayers = new Map<string, BackDismissLayer>();
let currentHistoryEntryId: string | null = null;
let historyListenerAttached = false;
let staleEntryCleanupFrame: number | null = null;
let activeLayerRestorationFrame: number | null = null;

const getOverlayHistoryEntryId = (state: unknown) => {
  if (typeof state !== "object" || state === null) return null;

  const entryId = (state as Record<string, unknown>)[OVERLAY_HISTORY_STATE_KEY];
  return typeof entryId === "string" ? entryId : null;
};

const scheduleStaleEntryCleanup = () => {
  if (staleEntryCleanupFrame !== null) return;

  staleEntryCleanupFrame = window.requestAnimationFrame(() => {
    staleEntryCleanupFrame = null;
    const entryId = getOverlayHistoryEntryId(window.history.state);
    currentHistoryEntryId = entryId;
    if (entryId !== null && !activeLayers.has(entryId)) window.history.back();
  });
};

const getTopmostActiveLayer = () => {
  let topmostLayer: [string, BackDismissLayer] | null = null;
  for (const layer of activeLayers) topmostLayer = layer;
  return topmostLayer;
};

const scheduleActiveLayerRestoration = () => {
  if (activeLayerRestorationFrame !== null) return;

  activeLayerRestorationFrame = window.requestAnimationFrame(() => {
    activeLayerRestorationFrame = null;
    const topmostLayer = getTopmostActiveLayer();
    if (!topmostLayer) return;

    const [entryId] = topmostLayer;
    const browserEntryId = getOverlayHistoryEntryId(window.history.state);
    currentHistoryEntryId = browserEntryId;
    if (browserEntryId === entryId) return;

    const currentState = window.history.state;
    const historyState =
      typeof currentState === "object" && currentState !== null
        ? currentState
        : {};
    window.history.pushState(
      {
        ...historyState,
        [OVERLAY_HISTORY_STATE_KEY]: entryId,
      },
      "",
      window.location.href,
    );
    currentHistoryEntryId = entryId;
  });
};

const handlePopState = (event: PopStateEvent) => {
  const leavingEntryId = currentHistoryEntryId;
  const nextEntryId = getOverlayHistoryEntryId(event.state);
  currentHistoryEntryId = nextEntryId;

  if (leavingEntryId !== null) {
    const leavingLayer = activeLayers.get(leavingEntryId);
    if (leavingLayer) {
      // The visible stack is authoritative. Some Android WebViews can report
      // the parent history entry while a nested popup is visibly above it.
      // In that case dismiss the newest active layer, never the drawer below.
      const [topmostEntryId, topmostLayer] = getTopmostActiveLayer() ?? [
        leavingEntryId,
        leavingLayer,
      ];
      activeLayers.delete(topmostEntryId);
      topmostLayer.dismiss();
    }
  }

  // A lower layer may have closed while another popup was above it. Skip that
  // now-stale same-URL history entry so one Back press still dismisses exactly
  // one visible layer and never leaves an invisible stop in the history stack.
  if (nextEntryId !== null && !activeLayers.has(nextEntryId))
    scheduleStaleEntryCleanup();
  else if (nextEntryId === null && activeLayers.size > 0)
    scheduleActiveLayerRestoration();
};

const ensureHistoryListener = () => {
  if (historyListenerAttached) return;
  currentHistoryEntryId = getOverlayHistoryEntryId(window.history.state);
  window.addEventListener("popstate", handlePopState);
  historyListenerAttached = true;
};

const registerBackDismissLayer = (entryId: string, layer: BackDismissLayer) => {
  ensureHistoryListener();
  activeLayers.set(entryId, layer);

  const currentState = window.history.state;
  const historyState =
    typeof currentState === "object" && currentState !== null
      ? currentState
      : {};
  window.history.pushState(
    {
      ...historyState,
      [OVERLAY_HISTORY_STATE_KEY]: entryId,
    },
    "",
    window.location.href,
  );
  currentHistoryEntryId = entryId;
};

const unregisterBackDismissLayer = (entryId: string) => {
  if (!activeLayers.delete(entryId)) return;

  const browserEntryId = getOverlayHistoryEntryId(window.history.state);
  currentHistoryEntryId = browserEntryId;
  if (browserEntryId !== entryId) return;

  window.requestAnimationFrame(() => {
    if (
      getOverlayHistoryEntryId(window.history.state) === entryId &&
      !activeLayers.has(entryId)
    )
      window.history.back();
  });
};

/**
 * Adds a same-URL history layer while a transient surface is open. Browser or
 * Android Back therefore dismisses the topmost drawer, dialog, menu, listbox,
 * or popover before normal route history is allowed to continue.
 */
export function useBackDismiss({
  enabled = true,
  open,
  onDismiss,
}: UseBackDismissOptions) {
  const reactId = useId();
  const sequenceRef = useRef(0);
  const entryIdRef = useRef<string | null>(null);
  const deferredUnmountFrameRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (deferredUnmountFrameRef.current !== null) {
      window.cancelAnimationFrame(deferredUnmountFrameRef.current);
      deferredUnmountFrameRef.current = null;
    }

    if (!enabled || !open) {
      const entryId = entryIdRef.current;
      entryIdRef.current = null;
      if (entryId !== null) unregisterBackDismissLayer(entryId);
      return undefined;
    }

    if (entryIdRef.current === null) {
      const entryId = `${reactId}-${++sequenceRef.current}`;
      entryIdRef.current = entryId;
      registerBackDismissLayer(entryId, {
        dismiss: () => onDismissRef.current(),
      });
    }

    return () => {
      const entryId = entryIdRef.current;
      if (entryId === null) return;

      // Deferring unmount cleanup lets React Strict Mode immediately remount
      // the same open layer without adding a duplicate history entry.
      deferredUnmountFrameRef.current = window.requestAnimationFrame(() => {
        deferredUnmountFrameRef.current = null;
        if (entryIdRef.current !== entryId) return;
        entryIdRef.current = null;
        unregisterBackDismissLayer(entryId);
      });
    };
  }, [enabled, open, reactId]);

  return useCallback((afterDismiss: () => void) => {
    if (typeof window === "undefined") {
      onDismissRef.current();
      afterDismiss();
      return;
    }

    const entryId = entryIdRef.current;
    if (entryId === null) {
      onDismissRef.current();
      afterDismiss();
      return;
    }

    if (deferredUnmountFrameRef.current !== null) {
      window.cancelAnimationFrame(deferredUnmountFrameRef.current);
      deferredUnmountFrameRef.current = null;
    }

    entryIdRef.current = null;
    activeLayers.delete(entryId);
    onDismissRef.current();

    if (getOverlayHistoryEntryId(window.history.state) !== entryId) {
      afterDismiss();
      return;
    }

    let completed = false;
    let fallbackTimer = 0;
    const finish = () => {
      if (completed) return;
      completed = true;
      window.removeEventListener("popstate", finish);
      window.clearTimeout(fallbackTimer);
      window.setTimeout(afterDismiss, 0);
    };

    window.addEventListener("popstate", finish, { once: true });
    window.history.back();
    fallbackTimer = window.setTimeout(finish, 1000);
  }, []);
}
