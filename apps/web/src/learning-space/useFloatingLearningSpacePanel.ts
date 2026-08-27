import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { COMPACT_NAVIGATION_QUERY } from "../shell/sidebarVisibility";

const PANEL_STATE_STORAGE_KEY = "veolms-learning-space-panel-state";
const PANEL_STATE_VERSION = 5;
const VIEWPORT_GUTTER = 12;
const VIEWPORT_LEFT_EDGE = 0;
export const PANEL_MIN_WIDTH = 120;
const PANEL_COMPACT_WIDTH = 300;
const PANEL_SINGLE_COLUMN_WIDTH = 208;
export const PANEL_MAX_WIDTH = 460;
const PANEL_DEFAULT_WIDTH = 440;
const MOVE_ACTIVATION_DISTANCE = 4;
const HOVER_CLOSE_DELAY_MS = 160;
const CLICK_PANEL_GRACE_MS = 800;

interface PanelPosition {
  left: number;
  top: number;
}

interface StoredPanelState {
  version: number;
  width: number;
  height: number | null;
  pinned: boolean;
  x: number | null;
  y: number | null;
}

export type LearningSpaceResizeEdge = "right" | "left";

interface ResizeInteraction {
  edge: LearningSpaceResizeEdge;
  pointerId: number;
  startX: number;
  startWidth: number;
  startPosition: PanelPosition;
}

interface MoveInteraction {
  activated: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: PanelPosition;
}

interface UseFloatingLearningSpacePanelOptions {
  open: boolean;
  mobile: boolean;
  mobileBottomNavigation: boolean;
  onOpenChange: (open: boolean) => void;
  panelRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const subscribeToCompactNavigationViewport = (onStoreChange: () => void) => {
  const media = window.matchMedia(COMPACT_NAVIGATION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getCompactNavigationViewportSnapshot = () =>
  window.matchMedia(COMPACT_NAVIGATION_QUERY).matches;

const getServerCompactNavigationViewportSnapshot = () => false;

const clampPosition = (
  position: PanelPosition,
  width: number,
  height: number,
): PanelPosition => ({
  left: clamp(
    position.left,
    VIEWPORT_LEFT_EDGE,
    window.innerWidth - width - VIEWPORT_GUTTER,
  ),
  top: clamp(
    position.top,
    VIEWPORT_GUTTER,
    window.innerHeight - height - VIEWPORT_GUTTER,
  ),
});

const readStoredState = (): StoredPanelState => {
  const fallback: StoredPanelState = {
    version: PANEL_STATE_VERSION,
    width: PANEL_DEFAULT_WIDTH,
    height: null,
    pinned: false,
    x: null,
    y: null,
  };
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(PANEL_STATE_STORAGE_KEY) || "null",
    );
    if (!parsed || typeof parsed !== "object") return fallback;
    const candidate = parsed as Partial<StoredPanelState>;
    if (candidate.version !== PANEL_STATE_VERSION) return fallback;
    const width =
      typeof candidate.width === "number" && Number.isFinite(candidate.width)
        ? clamp(candidate.width, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
        : PANEL_DEFAULT_WIDTH;
    return {
      version: PANEL_STATE_VERSION,
      width,
      height: null,
      pinned: candidate.pinned === true,
      x:
        typeof candidate.x === "number" && Number.isFinite(candidate.x)
          ? candidate.x
          : null,
      y:
        typeof candidate.y === "number" && Number.isFinite(candidate.y)
          ? candidate.y
          : null,
    };
  } catch {
    return fallback;
  }
};

const releasePointerCapture = (element: HTMLElement, pointerId: number) => {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    // Pointer capture can already be released when the browser cancels a drag.
  }
};

export function useFloatingLearningSpacePanel({
  open,
  mobile,
  mobileBottomNavigation,
  onOpenChange,
  panelRef,
  triggerRef,
}: UseFloatingLearningSpacePanelOptions) {
  const compactNavigationViewportSnapshot = useSyncExternalStore(
    subscribeToCompactNavigationViewport,
    getCompactNavigationViewportSnapshot,
    getServerCompactNavigationViewportSnapshot,
  );
  const compactNavigationViewport =
    !mobile && compactNavigationViewportSnapshot;
  const [width, setWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [position, setPosition] = useState<PanelPosition>({
    left: VIEWPORT_LEFT_EDGE,
    top: VIEWPORT_GUTTER,
  });
  const [savedPosition, setSavedPosition] = useState<PanelPosition | null>(
    null,
  );
  const [pinned, setPinnedState] = useState(false);
  const [moving, setMoving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [resizingEdge, setResizingEdge] =
    useState<LearningSpaceResizeEdge | null>(null);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [triggerVisible, setTriggerVisible] = useState(true);
  const [stateReady, setStateReady] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const clickCloseTimerRef = useRef<number | null>(null);
  const resizeRef = useRef<ResizeInteraction | null>(null);
  const moveRef = useRef<MoveInteraction | null>(null);
  const pointerInsideTriggerRef = useRef(false);
  const pointerInsidePanelRef = useRef(false);
  const focusInsideRef = useRef(false);
  const interactionLockedRef = useRef(false);
  const pinnedRef = useRef(false);
  const detachedUntilCloseRef = useRef(false);
  const triggerVisibleRef = useRef(true);
  const savedPositionRef = useRef<PanelPosition | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const cancelClickClose = useCallback(() => {
    if (clickCloseTimerRef.current === null) return;
    window.clearTimeout(clickCloseTimerRef.current);
    clickCloseTimerRef.current = null;
  }, []);

  const clearDetachedPosition = useCallback(() => {
    detachedUntilCloseRef.current = false;
    savedPositionRef.current = null;
    setSavedPosition(null);
  }, []);

  const scheduleClose = useCallback(() => {
    if (mobile) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (
        pinnedRef.current ||
        (!mobile && !triggerVisibleRef.current) ||
        pointerInsideTriggerRef.current ||
        pointerInsidePanelRef.current ||
        interactionLockedRef.current
      )
        return;
      clearDetachedPosition();
      onOpenChange(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose, clearDetachedPosition, mobile, onOpenChange]);

  const openFromClick = useCallback(
    (transient: boolean) => {
      cancelClose();
      cancelClickClose();
      onOpenChange(true);
      if (!transient || mobile || !hoverCapable) return;

      clickCloseTimerRef.current = window.setTimeout(() => {
        clickCloseTimerRef.current = null;
        const activeElement = document.activeElement;
        const panelHasFocus =
          activeElement instanceof Node &&
          Boolean(panelRef.current?.contains(activeElement));
        if (
          pinnedRef.current ||
          pointerInsidePanelRef.current ||
          panelHasFocus ||
          interactionLockedRef.current
        )
          return;
        clearDetachedPosition();
        onOpenChange(false);
      }, CLICK_PANEL_GRACE_MS);
    },
    [
      cancelClickClose,
      cancelClose,
      clearDetachedPosition,
      hoverCapable,
      mobile,
      onOpenChange,
      panelRef,
    ],
  );

  const updatePosition = useCallback(() => {
    if (!open || mobile) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    if (
      (pinnedRef.current || detachedUntilCloseRef.current) &&
      savedPositionRef.current
    ) {
      const next = clampPosition(
        savedPositionRef.current,
        panel.offsetWidth || width,
        panel.offsetHeight,
      );
      savedPositionRef.current = next;
      setSavedPosition(next);
      setPosition(next);
      return;
    }

    const triggerBounds = trigger.getBoundingClientRect();
    const sidebar = trigger.closest<HTMLElement>(".courses-sidebar");
    const anchorBounds = sidebar?.getBoundingClientRect() ?? triggerBounds;
    setPosition({
      left: Math.round(anchorBounds.right - 1),
      top: Math.round(
        clamp(
          triggerBounds.top,
          VIEWPORT_GUTTER,
          window.innerHeight - VIEWPORT_GUTTER,
        ),
      ),
    });
  }, [mobile, open, panelRef, triggerRef, width]);

  useEffect(() => {
    const stored = readStoredState();
    setWidth(stored.width);
    setPinnedState(stored.pinned);
    pinnedRef.current = stored.pinned;
    const storedPosition =
      !stored.pinned || stored.x === null || stored.y === null
        ? null
        : { left: stored.x, top: stored.y };
    setSavedPosition(storedPosition);
    savedPositionRef.current = storedPosition;
    setStateReady(true);

    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => setHoverCapable(media.matches);
    syncHoverCapability();
    media.addEventListener?.("change", syncHoverCapability);
    return () => media.removeEventListener?.("change", syncHoverCapability);
  }, []);

  useEffect(() => {
    const syncTriggerVisibility = () => {
      let current: HTMLElement | null = triggerRef.current;
      let visible = Boolean(current);
      while (current && visible) {
        const styles = window.getComputedStyle(current);
        if (styles.display === "none" || styles.visibility === "hidden")
          visible = false;
        current = current.parentElement;
      }
      triggerVisibleRef.current = visible;
      setTriggerVisible(visible);
      if (!visible) cancelClose();
    };

    syncTriggerVisibility();
    window.addEventListener("resize", syncTriggerVisibility);

    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(syncTriggerVisibility);
    let current: HTMLElement | null = triggerRef.current;
    while (current) {
      observer?.observe(current, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      });
      current = current.parentElement;
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncTriggerVisibility);
    };
  }, [cancelClose, mobile, triggerRef]);

  useEffect(() => {
    if (!stateReady) return;
    try {
      window.localStorage.setItem(
        PANEL_STATE_STORAGE_KEY,
        JSON.stringify({
          version: PANEL_STATE_VERSION,
          width,
          height: null,
          pinned,
          x: savedPosition?.left ?? null,
          y: savedPosition?.top ?? null,
        } satisfies StoredPanelState),
      );
    } catch {
      // The panel remains fully usable when preference storage is unavailable.
    }
  }, [pinned, savedPosition, stateReady, width]);

  useEffect(() => {
    if (stateReady && pinned && !mobile && !compactNavigationViewport && !open)
      onOpenChange(true);
  }, [
    compactNavigationViewport,
    mobile,
    onOpenChange,
    open,
    pinned,
    stateReady,
  ]);

  useLayoutEffect(() => {
    if (!open || mobile) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const sidebar =
      triggerRef.current?.closest<HTMLElement>(".courses-sidebar");
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (sidebar) observer?.observe(sidebar);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mobile, open, panelRef, triggerRef, updatePosition, width]);

  useEffect(() => {
    if (!open) {
      cancelClose();
      cancelClickClose();
      if (!pinnedRef.current) clearDetachedPosition();
    }
  }, [cancelClickClose, cancelClose, clearDetachedPosition, open]);

  useEffect(
    () => () => {
      cancelClose();
      cancelClickClose();
    },
    [cancelClickClose, cancelClose],
  );

  useEffect(() => {
    if (!open) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pinnedRef.current) onOpenChange(false);
    };
    const dismissMobilePanel = (event: PointerEvent) => {
      if (!mobile) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      )
        return;
      onOpenChange(false);
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("pointerdown", dismissMobilePanel);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("pointerdown", dismissMobilePanel);
    };
  }, [mobile, onOpenChange, open, panelRef, triggerRef]);

  const setPinned = useCallback(
    (nextPinned: boolean) => {
      pinnedRef.current = nextPinned;
      setPinnedState(nextPinned);
      if (nextPinned) {
        detachedUntilCloseRef.current = false;
        cancelClose();
        cancelClickClose();
        onOpenChange(true);
        return;
      }
      detachedUntilCloseRef.current = true;
      if (
        !pointerInsidePanelRef.current &&
        !pointerInsideTriggerRef.current &&
        !focusInsideRef.current
      )
        scheduleClose();
    },
    [cancelClickClose, cancelClose, onOpenChange, scheduleClose],
  );

  const enterTrigger = useCallback(() => {
    pointerInsideTriggerRef.current = true;
    cancelClose();
    if (!mobile && hoverCapable) onOpenChange(true);
  }, [cancelClose, hoverCapable, mobile, onOpenChange]);

  const leaveTrigger = useCallback(() => {
    pointerInsideTriggerRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const enterPanel = useCallback(() => {
    pointerInsidePanelRef.current = true;
    cancelClose();
    cancelClickClose();
  }, [cancelClickClose, cancelClose]);

  const leavePanel = useCallback(() => {
    pointerInsidePanelRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const enterFocus = useCallback(() => {
    focusInsideRef.current = true;
    cancelClose();
    if (panelRef.current?.contains(document.activeElement)) cancelClickClose();
    onOpenChange(true);
  }, [cancelClickClose, cancelClose, onOpenChange, panelRef]);

  const leaveFocus = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        (triggerRef.current?.contains(nextTarget) ||
          panelRef.current?.contains(nextTarget))
      )
        return;
      focusInsideRef.current = false;
      scheduleClose();
    },
    [panelRef, scheduleClose, triggerRef],
  );

  const setInteractionLocked = useCallback(
    (locked: boolean) => {
      interactionLockedRef.current = locked;
      if (locked) {
        cancelClose();
        cancelClickClose();
      } else if (
        !pointerInsidePanelRef.current &&
        !pointerInsideTriggerRef.current &&
        !focusInsideRef.current
      )
        scheduleClose();
    },
    [cancelClickClose, cancelClose, scheduleClose],
  );

  const startMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (mobile || event.button !== 0) return;
      if ((event.target as Element).closest("button")) return;
      const panel = panelRef.current;
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      moveRef.current = {
        activated: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: { left: bounds.left, top: bounds.top },
      };
      interactionLockedRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [mobile, panelRef],
  );

  const movePanel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const move = moveRef.current;
      const panel = panelRef.current;
      if (!move || !panel || move.pointerId !== event.pointerId) return;
      if (!move.activated) {
        const distance = Math.hypot(
          event.clientX - move.startX,
          event.clientY - move.startY,
        );
        if (distance < MOVE_ACTIVATION_DISTANCE) return;
        move.activated = true;
        if (!pinnedRef.current) setPinned(true);
        setMoving(true);
      }
      event.preventDefault();
      const next = clampPosition(
        {
          left: move.startPosition.left + event.clientX - move.startX,
          top: move.startPosition.top + event.clientY - move.startY,
        },
        panel.offsetWidth || width,
        panel.offsetHeight,
      );
      savedPositionRef.current = next;
      setSavedPosition(next);
      setPosition(next);
    },
    [panelRef, setPinned, width],
  );

  const finishMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const move = moveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    moveRef.current = null;
    interactionLockedRef.current = false;
    releasePointerCapture(event.currentTarget, event.pointerId);
    setMoving(false);
  }, []);

  const moveWithKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (mobile || !pinnedRef.current || !event.altKey) return;
      const deltas: Record<string, readonly [number, number] | undefined> = {
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
      };
      const delta = deltas[event.key];
      const panel = panelRef.current;
      if (!delta || !panel) return;
      event.preventDefault();
      const next = clampPosition(
        {
          left: position.left + delta[0],
          top: position.top + delta[1],
        },
        panel.offsetWidth || width,
        panel.offsetHeight,
      );
      savedPositionRef.current = next;
      setSavedPosition(next);
      setPosition(next);
    },
    [mobile, panelRef, position, width],
  );

  const startResize = useCallback(
    (
      edge: LearningSpaceResizeEdge,
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      if (
        mobile ||
        event.button !== 0 ||
        (!pinnedRef.current && edge !== "right")
      )
        return;
      const panel = panelRef.current;
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      resizeRef.current = {
        edge,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: bounds.width || width,
        startPosition: { left: bounds.left, top: bounds.top },
      };
      interactionLockedRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      setResizingEdge(edge);
      setResizing(true);
    },
    [mobile, panelRef, width],
  );

  const resizePanel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - resize.startX;
      const right = resize.startPosition.left + resize.startWidth;
      let nextWidth = resize.startWidth;
      let nextPosition = resize.startPosition;

      if (resize.edge === "right") {
        nextWidth = clamp(
          resize.startWidth + deltaX,
          PANEL_MIN_WIDTH,
          Math.min(
            PANEL_MAX_WIDTH,
            window.innerWidth - resize.startPosition.left - VIEWPORT_GUTTER,
          ),
        );
      } else {
        nextWidth = clamp(
          resize.startWidth - deltaX,
          PANEL_MIN_WIDTH,
          Math.min(PANEL_MAX_WIDTH, right - VIEWPORT_LEFT_EDGE),
        );
        nextPosition = {
          ...nextPosition,
          left: right - nextWidth,
        };
      }

      setWidth(nextWidth);

      if (
        nextPosition.left !== resize.startPosition.left ||
        nextPosition.top !== resize.startPosition.top
      ) {
        savedPositionRef.current = nextPosition;
        setSavedPosition(nextPosition);
        setPosition(nextPosition);
      }
    },
    [],
  );

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      resizeRef.current = null;
      interactionLockedRef.current = false;
      releasePointerCapture(event.currentTarget, event.pointerId);
      setResizingEdge(null);
      setResizing(false);
      if (
        !pinnedRef.current &&
        !pointerInsidePanelRef.current &&
        !pointerInsideTriggerRef.current &&
        !focusInsideRef.current
      )
        scheduleClose();
    },
    [scheduleClose],
  );

  const resizeWithKeyboard = useCallback(
    (
      edge: LearningSpaceResizeEdge,
      event: ReactKeyboardEvent<HTMLDivElement>,
    ) => {
      if (mobile || (!pinnedRef.current && edge !== "right")) return;
      const validKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const panel = panelRef.current;
      if (!validKey || !panel) return;
      event.preventDefault();
      const bounds = panel.getBoundingClientRect();
      const step = 12;

      if (edge === "right") {
        const delta = event.key === "ArrowRight" ? step : -step;
        setWidth(
          clamp(
            width + delta,
            PANEL_MIN_WIDTH,
            Math.min(
              PANEL_MAX_WIDTH,
              window.innerWidth - bounds.left - VIEWPORT_GUTTER,
            ),
          ),
        );
        return;
      }

      if (edge === "left") {
        const delta = event.key === "ArrowLeft" ? step : -step;
        const right = position.left + width;
        const nextWidth = clamp(
          width + delta,
          PANEL_MIN_WIDTH,
          Math.min(PANEL_MAX_WIDTH, right - VIEWPORT_LEFT_EDGE),
        );
        const next = { left: right - nextWidth, top: position.top };
        setWidth(nextWidth);
        savedPositionRef.current = next;
        setSavedPosition(next);
        setPosition(next);
      }
    },
    [mobile, panelRef, position, width],
  );

  const panelStyle: CSSProperties = mobile
    ? {
        right: "0.75rem",
        bottom: mobileBottomNavigation
          ? "calc(66px + env(safe-area-inset-bottom))"
          : "max(0.75rem, env(safe-area-inset-bottom))",
        left: "0.75rem",
        width: "calc(100vw - 1.5rem)",
        maxWidth: "calc(100dvw - 1.5rem)",
        maxHeight: mobileBottomNavigation
          ? "calc(100dvh - max(4.5rem, env(safe-area-inset-top)) - calc(66px + env(safe-area-inset-bottom)))"
          : "calc(100dvh - max(4.5rem, env(safe-area-inset-top)) - max(0.75rem, env(safe-area-inset-bottom)))",
      }
    : {
        left: position.left,
        top: position.top,
        width,
        maxHeight: `calc(100vh - ${Math.round(position.top + VIEWPORT_GUTTER)}px)`,
      };

  return {
    compact: !mobile && width < PANEL_COMPACT_WIDTH,
    compactColumns:
      !mobile && width < PANEL_COMPACT_WIDTH
        ? width < PANEL_SINGLE_COLUMN_WIDTH
          ? (1 as const)
          : (2 as const)
        : (1 as const),
    enterFocus,
    enterPanel,
    enterTrigger,
    finishMove,
    finishResize,
    hoverCapable,
    leaveFocus,
    leavePanel,
    leaveTrigger,
    movePanel,
    moveWithKeyboard,
    moving,
    openFromClick,
    panelStyle,
    pinned: mobile ? false : pinned,
    resizePanel,
    resizeWithKeyboard,
    resizing,
    resizingEdge,
    renderPanel: mobile || (!compactNavigationViewport && triggerVisible),
    setInteractionLocked,
    setPinned,
    startMove,
    startResize,
    width,
  };
}
