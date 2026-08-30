import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type { CSSProperties } from "react";
import { memo, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getMostRecentCoursePlayerSession,
  type CoursePlayerSession,
} from "../learning/coursePlayerNavigation";
import { LearningSpacePanel } from "./LearningSpacePanel";
import { useFloatingLearningSpacePanel } from "./useFloatingLearningSpacePanel";

const isDirectPointer = (pointerType: string | null | undefined) =>
  pointerType === "touch" || pointerType === "pen";

interface LearningSpaceProps {
  sessions: readonly CoursePlayerSession[];
  activeCourseId?: string | null;
  expanded: boolean;
  collapsedSidebar?: boolean;
  mobile?: boolean;
  mobileNavigationPlacement?: "bottom" | "sidebar";
  iconColor?: string;
  onExpandedChange: (expanded: boolean) => void;
  onRequestSidebarExpand?: () => void;
  onActivate: (session: CoursePlayerSession) => void;
  onClose: (session: CoursePlayerSession) => void;
}

export const LearningSpace = memo(function LearningSpace({
  sessions,
  activeCourseId,
  expanded,
  collapsedSidebar = false,
  mobile = false,
  mobileNavigationPlacement = "bottom",
  iconColor = "var(--accent)",
  onExpandedChange,
  onActivate,
  onClose,
}: LearningSpaceProps) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const sessionCountLabel = `${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}`;
  const floatingPanel = useFloatingLearningSpacePanel({
    open: expanded,
    mobile,
    mobileBottomNavigation: mobile && mobileNavigationPlacement === "bottom",
    onOpenChange: onExpandedChange,
    panelRef,
    triggerRef,
  });
  const active = Boolean(activeCourseId);
  const emptyOpen = !active && sessions.length === 0 && expanded;
  const mostRecentSession = getMostRecentCoursePlayerSession(sessions);

  const dismissPanel = () => {
    floatingPanel.setPinned(false);
    onExpandedChange(false);
  };

  const activateSession = (session: CoursePlayerSession) => {
    dismissPanel();
    onActivate(session);
  };

  const triggerLabel = `Learning Space, ${sessionCountLabel}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          active
            ? "is-active"
            : emptyOpen
              ? "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]!"
              : ""
        }
        style={{ "--nav-icon-color": iconColor } as CSSProperties}
        aria-label={triggerLabel}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-current={active ? "page" : undefined}
        title={
          collapsedSidebar
            ? `Learning Space · ${sessions.length} active`
            : undefined
        }
        data-learning-space-trigger
        data-empty-open={emptyOpen ? "true" : undefined}
        data-navigation-label={mobile ? "Learning Space" : undefined}
        onPointerDown={(event) => {
          lastPointerTypeRef.current = event.pointerType;
        }}
        onPointerEnter={(event) => {
          if (!isDirectPointer(event.pointerType)) floatingPanel.enterTrigger();
        }}
        onPointerLeave={(event) => {
          if (!isDirectPointer(event.pointerType)) floatingPanel.leaveTrigger();
        }}
        onPointerCancel={() => {
          lastPointerTypeRef.current = null;
        }}
        onFocus={
          mobile
            ? undefined
            : () => {
                if (!isDirectPointer(lastPointerTypeRef.current))
                  floatingPanel.enterFocus();
              }
        }
        onBlur={mobile ? undefined : floatingPanel.leaveFocus}
        onClick={(event) => {
          if (expanded && active) {
            dismissPanel();
            return;
          }

          const clickPointerType = (event.nativeEvent as PointerEvent)
            .pointerType;
          const directPointer = isDirectPointer(
            clickPointerType || lastPointerTypeRef.current,
          );
          lastPointerTypeRef.current = null;
          const transientPopup =
            Boolean(mostRecentSession) &&
            !mobile &&
            !directPointer &&
            floatingPanel.hoverCapable &&
            event.detail !== 0;
          const keepHoverOpenedPanel =
            expanded &&
            !active &&
            !mobile &&
            !directPointer &&
            floatingPanel.hoverCapable;

          floatingPanel.openFromClick(
            keepHoverOpenedPanel ? false : transientPopup,
          );
          if (mostRecentSession) onActivate(mostRecentSession);
        }}
      >
        {mobile && mobileNavigationPlacement === "bottom" ? (
          <>
            <span>
              <BookOpen size={23} weight={active ? "fill" : "regular"} />
            </span>
            <small>Learning</small>
          </>
        ) : (
          <>
            <BookOpen size={23} weight={active ? "fill" : "regular"} />
            <span className="courses-nav__text">Learning Space</span>
          </>
        )}
      </button>

      {expanded &&
        floatingPanel.renderPanel &&
        typeof document !== "undefined" &&
        createPortal(
          <LearningSpacePanel
            panelId={panelId}
            panelRef={panelRef}
            sessions={sessions}
            activeCourseId={activeCourseId}
            compact={floatingPanel.compact}
            compactColumns={floatingPanel.compactColumns}
            mobile={mobile}
            moving={floatingPanel.moving}
            pinned={floatingPanel.pinned}
            resizing={floatingPanel.resizing}
            resizingEdge={floatingPanel.resizingEdge}
            width={floatingPanel.width}
            style={floatingPanel.panelStyle}
            onPinnedChange={floatingPanel.setPinned}
            onDismiss={dismissPanel}
            onActivate={activateSession}
            onClose={onClose}
            onPanelPointerEnter={floatingPanel.enterPanel}
            onPanelPointerLeave={floatingPanel.leavePanel}
            onPanelFocus={floatingPanel.enterFocus}
            onPanelBlur={floatingPanel.leaveFocus}
            onInteractionLockedChange={floatingPanel.setInteractionLocked}
            onStartMove={floatingPanel.startMove}
            onMove={floatingPanel.movePanel}
            onFinishMove={floatingPanel.finishMove}
            onMoveWithKeyboard={floatingPanel.moveWithKeyboard}
            onStartResize={floatingPanel.startResize}
            onResize={floatingPanel.resizePanel}
            onFinishResize={floatingPanel.finishResize}
            onResizeWithKeyboard={floatingPanel.resizeWithKeyboard}
          />,
          document.body,
        )}
    </>
  );
});
