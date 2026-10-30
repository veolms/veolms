import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SlideOverFrame } from "../components/SlideOverPanel";
import { useSidePanelVariant } from "../components/useSidePanelVariant";
import {
  SplitFrameGutter,
  SplitFramePane,
  useSplitFrameWidth,
} from "../components/SplitFramePane";
import {
  Drawer,
  DrawerContent,
  type DrawerDismissThen,
} from "../components/ui/drawer";
import {
  getRightPanelShortcutLabel,
  RIGHT_PANEL_SHORTCUT_ARIA,
} from "../keyboardShortcuts";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { useShortcutPlatform } from "../useShortcutPlatform";
import type { NavigateTo } from "../routing/navigation";
import {
  DiscussionPanelEmpty,
  DiscussionPanelContent,
  type DiscussionPanelStep,
} from "./DiscussionWorkspacePanelContent";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

interface DiscussionWorkspacePanelProps {
  /** The discussion shown; none while the list has nothing to show. */
  card: DiscussionWorkspaceCard | null;
  /** What the open panel says when there is no discussion to show. */
  emptyMessage: string;
  /** Whether a discussion is open. A closed panel shows only on a desktop,
   * as its gutter at the frame's edge. */
  open: boolean;
  /** The gutter was dragged or double-clicked open. */
  onReopen: () => void;
  destination: string | null;
  /** Whether the card's own text is being edited. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
  onNavigatePage?: NavigateTo;
  onReport?: (card: DiscussionWorkspaceCard) => void;
  setNotice?: (message: string) => void;
  /** Stepping to the discussion above or below this one in the list. */
  step?: DiscussionPanelStep;
  courseThumbnail?: { url?: string | null; mediaId?: string | null };
}

/**
 * The discussion opened from the Discussions page: beside the list on a
 * desktop, over the page from the right on a tablet, and a sheet from the
 * bottom on a phone, where a sideways swipe moves through the list.
 */
export function DiscussionWorkspacePanel(props: DiscussionWorkspacePanelProps) {
  const variant = useSidePanelVariant();
  if (variant === "desktop") return <DesktopPanel {...props} />;
  if (!props.open) return null;
  if (variant === "tablet") return <TabletPanel {...props} />;
  return <PhonePanel {...props} />;
}

function DesktopPanel({
  card,
  emptyMessage,
  open,
  onReopen,
  onClose,
  onNavigatePage,
  ...props
}: DiscussionWorkspacePanelProps) {
  const shortcutLabel = getRightPanelShortcutLabel(useShortcutPlatform());
  // The page says whether the panel is open; the gutter can change it too.
  // Following the page must not report back to it as a change of the user's.
  const followingPageRef = useRef(false);
  const {
    paneRef,
    contentRef,
    paneWidth,
    collapsed,
    setCollapsed,
    gutterProps,
  } = useSplitFrameWidth({
    storageKey: "veolms-discussions-panel-width",
    closedLabel: "Discussion panel closed",
    defaultCollapsed: !open,
    onCollapsedChange: (nowCollapsed) => {
      if (followingPageRef.current) return;
      if (nowCollapsed) onClose();
      else onReopen();
    },
  });
  useEffect(() => {
    if (collapsed === !open) return;
    followingPageRef.current = true;
    setCollapsed(!open);
    followingPageRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows `open` only
  }, [open]);

  return (
    <SplitFramePane
      aria-label="Discussion details"
      paneRef={paneRef}
      width={paneWidth}
      slide
      className="flex flex-col"
    >
      <SplitFrameGutter
        aria-label="Resize discussion panel"
        aria-keyshortcuts={RIGHT_PANEL_SHORTCUT_ARIA}
        title={
          collapsed
            ? `Open discussion panel · drag, double-click or ${shortcutLabel}`
            : `Resize discussion panel · double-click or ${shortcutLabel} to close`
        }
        {...gutterProps}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[inherit]">
        {/* Never narrower than the pane's minimum: while the pane slides
              to a width after a drag, its contents keep their layout and
              the edge clips them, as on the lesson page. */}
        <div
          ref={contentRef}
          className="flex min-h-0 w-full min-w-75 shrink-0 flex-col"
        >
          {/* Closed, the panel is only its gutter: nothing is fetched for a
              discussion nobody opened. A drag brings the content in with
              the first movement. */}
          {!collapsed &&
            (card ? (
              <DiscussionPanelContent
                {...props}
                card={card}
                variant="desktop"
                onClose={onClose}
                onEscape={onClose}
                onOpenInCourse={(path) =>
                  onNavigatePage?.(path, { exact: true })
                }
              />
            ) : (
              <DiscussionPanelEmpty message={emptyMessage} onClose={onClose} />
            ))}
        </div>
      </div>
    </SplitFramePane>
  );
}

function TabletPanel({
  card,
  emptyMessage,
  onClose,
  onNavigatePage,
  open: _open,
  onReopen: _onReopen,
  ...props
}: DiscussionWorkspacePanelProps) {
  // The panel covers the page, so Back closes it rather than leaving the
  // Discussions page.
  const dismissThroughHistory = useBackDismiss({
    open: true,
    onDismiss: onClose,
  });
  return (
    <SlideOverFrame
      label="Discussion details"
      onClose={onClose}
      className="max-w-[460px]"
      // A light dim, no blur: the list stays readable behind the panel.
      backdropClassName="bg-black/35"
    >
      {card ? (
        <DiscussionPanelContent
          {...props}
          card={card}
          variant="tablet"
          onEscape={onClose}
          onOpenInCourse={(path) =>
            // The panel's Back entry is taken off first, so Back from the
            // lesson returns to the list and not to a closed panel.
            dismissThroughHistory(() => onNavigatePage?.(path, { exact: true }))
          }
        />
      ) : (
        <DiscussionPanelEmpty message={emptyMessage} />
      )}
    </SlideOverFrame>
  );
}

/** How far a finger has to travel sideways to move to the next discussion. */
const STEP_SWIPE_DISTANCE = 72;
/** How far a finger travels before the gesture is given a direction. */
const AXIS_DECISION_DISTANCE = 10;
/** A gesture counts as vertical only when it is clearly steeper than this. */
const VERTICAL_STEEPNESS = 1.5;
/** The sheet follows a sideways finger at this share of its travel. */
const STEP_SWIPE_FOLLOW = 0.5;

/**
 * A sideways swipe on the phone sheet moves to the discussion before or
 * after this one, as on the lesson page's thread sheet
 * (useThreadSwipeAxisLock): touches are read on the window before the
 * drawer sees them, held back until the finger has travelled far enough to
 * tell the direction, and then a clearly vertical gesture is left to the
 * drawer (and the content's scrolling) while any other is kept from it for
 * the rest of the touch. Without that the drawer dragged up and down with a
 * sideways swipe, and the content followed the finger one to one, so the
 * whole sheet moved too much. The content trails the finger at half its
 * travel, and the new discussion slides in from the side swiped towards. A
 * swipe that starts in the reply box, a code block or a menu is left to
 * them.
 */
function usePhoneStepSwipe(step: DiscussionPanelStep | undefined) {
  // State, not a ref: the drawer can put its content on the page after this
  // hook's first effect, and the listeners must follow the element.
  const [surface, surfaceRef] = useState<HTMLDivElement | null>(null);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  const [enterFrom, setEnterFrom] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    const win = surface?.ownerDocument.defaultView;
    if (!surface || !win) return undefined;

    let gesture: {
      x: number;
      y: number;
      axis: "x" | "y" | null;
      dx: number;
    } | null = null;

    const setOffset = (dx: number, animate: boolean) => {
      surface.style.transition = animate ? "transform 160ms ease-out" : "none";
      surface.style.transform = dx ? `translate3d(${dx}px,0,0)` : "";
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target as Element | null;
      gesture =
        stepRef.current &&
        touch &&
        event.touches.length === 1 &&
        !target?.closest(
          "[data-thread-reply-composer], pre, .cm-editor, [role=menu], input, textarea",
        )
          ? { x: touch.clientX, y: touch.clientY, axis: null, dx: 0 }
          : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      const current = stepRef.current;
      if (!gesture || !touch || !current || event.touches.length !== 1) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.axis === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_DECISION_DISTANCE) {
          // Not yet known: kept from the drawer so it does not start.
          event.stopPropagation();
          return;
        }
        gesture.axis =
          Math.abs(dy) > Math.abs(dx) * VERTICAL_STEEPNESS ? "y" : "x";
      }
      if (gesture.axis === "y") return;
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      gesture.dx = dx;
      const canGo =
        dx < 0 ? current.index < current.count - 1 : current.index > 0;
      // At either end of the list the sheet only gives a little.
      setOffset(dx * (canGo ? STEP_SWIPE_FOLLOW : 0.15), false);
    };

    const onTouchEnd = () => {
      const ended = gesture;
      gesture = null;
      const current = stepRef.current;
      if (!ended || ended.axis !== "x" || !current) return;
      if (
        ended.dx <= -STEP_SWIPE_DISTANCE &&
        current.index < current.count - 1
      ) {
        setOffset(0, false);
        setEnterFrom("right");
        current.onNext();
      } else if (ended.dx >= STEP_SWIPE_DISTANCE && current.index > 0) {
        setOffset(0, false);
        setEnterFrom("left");
        current.onPrev();
      } else {
        setOffset(0, true);
      }
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    // Window capture runs before the drawer's own listener on the document.
    win.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    win.addEventListener("touchend", onTouchEnd, { capture: true });
    win.addEventListener("touchcancel", onTouchEnd, { capture: true });
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      win.removeEventListener("touchmove", onTouchMove, { capture: true });
      win.removeEventListener("touchend", onTouchEnd, { capture: true });
      win.removeEventListener("touchcancel", onTouchEnd, { capture: true });
    };
  }, [surface]);

  return { surfaceRef, enterFrom };
}

/** The window's height, kept current. */
function useWindowHeight() {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  useEffect(() => {
    const sync = () => setHeight(window.innerHeight);
    window.addEventListener("resize", sync);
    sync();
    return () => window.removeEventListener("resize", sync);
  }, []);
  return height;
}

function PhonePanel({
  onClose,
  onNavigatePage,
  card,
  emptyMessage,
  step,
  open: _open,
  onReopen: _onReopen,
  ...props
}: DiscussionWorkspacePanelProps) {
  const [open, setOpen] = useState(true);
  const dismissThenRef = useRef<DrawerDismissThen | null>(null);
  const swipe = usePhoneStepSwipe(step);
  // Two stops, as the lesson's thread sheet: the sheet opens 40px short of
  // the top, and a swipe up (on the handle, or on the content when there is
  // nothing to scroll) takes it to full screen; down goes back, then closes.
  const viewportHeight = useWindowHeight();
  const collapsedSnapPoint = Math.max(320, viewportHeight - 40);
  const snapPoints = useMemo(
    () => [collapsedSnapPoint, 1],
    [collapsedSnapPoint],
  );
  const [snapPoint, setSnapPoint] = useState<number | null>(collapsedSnapPoint);

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      onSnapPointChange={(next) => {
        if (typeof next === "number" || next === null) setSnapPoint(next);
      }}
      snapToSequentialPoints
      showSwipeHandle
      // Over the content, as on the lesson's thread sheet, so the top row
      // (and its hover) reaches the sheet's top edge.
      swipeHandleClassName="absolute inset-x-0 top-0 z-30 pt-2.5"
      dismissThenRef={dismissThenRef}
    >
      <DrawerContent
        aria-label="Discussion details"
        finalFocus={false}
        // Full height; the snap point decides how much of it shows.
        style={
          {
            "--drawer-content-height": `${viewportHeight}px`,
            "--drawer-content-max-height": `${viewportHeight}px`,
          } as CSSProperties
        }
        className="bg-(--surface) data-expanded:rounded-none!"
      >
        <div
          ref={swipe.surfaceRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            key={card?.id ?? "empty"}
            className={`flex min-h-0 flex-1 flex-col ${
              swipe.enterFrom === "right"
                ? "animate-in fade-in slide-in-from-right-10 duration-200"
                : swipe.enterFrom === "left"
                  ? "animate-in fade-in slide-in-from-left-10 duration-200"
                  : ""
            }`}
          >
            {card ? (
              <DiscussionPanelContent
                {...props}
                card={card}
                step={step}
                variant="phone"
                onOpenInCourse={(path) => {
                  const navigate = () =>
                    onNavigatePage?.(path, { exact: true });
                  const dismissThen = dismissThenRef.current;
                  if (dismissThen) dismissThen(navigate);
                  else navigate();
                }}
              />
            ) : (
              <DiscussionPanelEmpty message={emptyMessage} />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
