import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { createPortal } from "react-dom";

type InfoPopoverPlacement = "top" | "left" | "bottom";

interface DashboardInfoPopoverProps {
  className?: string;
  infoLabel: string;
  infoTitle: string;
  infoDescription: ReactNode;
  portal?: boolean;
}

export function DashboardInfoPopover({
  className = "",
  infoLabel,
  infoTitle,
  infoDescription,
  portal = false,
}: DashboardInfoPopoverProps) {
  const infoPopoverId = useId();
  const infoControlRef = useRef<HTMLDivElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const infoPopoverRef = useRef<HTMLDivElement>(null);
  const [isInfoPinned, setIsInfoPinned] = useState(false);
  const [isInfoHovered, setIsInfoHovered] = useState(false);
  const [isInfoFocused, setIsInfoFocused] = useState(false);
  const [isInfoDismissed, setIsInfoDismissed] = useState(false);
  const [infoPopoverPlacement, setInfoPopoverPlacement] =
    useState<InfoPopoverPlacement>("top");
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInfoOpen =
    !isInfoDismissed && (isInfoPinned || isInfoHovered || isInfoFocused);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsInfoHovered(false);
      closeTimeoutRef.current = null;
    }, 160);
  };

  useLayoutEffect(() => {
    if (!isInfoOpen) return undefined;

    const updateInfoPopoverPlacement = () => {
      const buttonBounds = infoButtonRef.current?.getBoundingClientRect();
      const popoverBounds = infoPopoverRef.current?.getBoundingClientRect();
      if (!buttonBounds || !popoverBounds) return;

      const collisionPadding = 12;
      const sideOffset = 8;
      const fitsAbove =
        buttonBounds.top - popoverBounds.height - sideOffset >=
        collisionPadding;
      const fitsLeft =
        buttonBounds.left - popoverBounds.width - sideOffset >=
        collisionPadding;
      const nextPlacement: InfoPopoverPlacement = fitsAbove
        ? "top"
        : fitsLeft
          ? "left"
          : "bottom";

      if (!portal) {
        setInfoPopoverPlacement((current) =>
          current === nextPlacement ? current : nextPlacement,
        );
        return;
      }

      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const section = infoControlRef.current?.closest(
        ".creator-dashboard-panel",
      );
      const sectionBounds = section?.getBoundingClientRect();
      if (portal && sectionBounds) {
        const sectionPadding = 12;
        const maxSectionLeft = Math.max(
          sectionPadding,
          sectionBounds.width - popoverBounds.width - sectionPadding,
        );
        const maxSectionTop = Math.max(
          sectionPadding,
          sectionBounds.height - popoverBounds.height - sectionPadding,
        );
        const preferredLeft =
          buttonBounds.right - popoverBounds.width - sectionBounds.left;
        const preferredTop =
          buttonBounds.bottom + sideOffset - sectionBounds.top;

        setInfoPopoverPlacement("bottom");
        setPopoverPosition({
          top: Math.min(Math.max(preferredTop, sectionPadding), maxSectionTop),
          left: Math.min(
            Math.max(preferredLeft, sectionPadding),
            maxSectionLeft,
          ),
        });
        return;
      }

      const maxLeft = Math.max(
        collisionPadding,
        viewportWidth - popoverBounds.width - collisionPadding,
      );
      const maxTop = Math.max(
        collisionPadding,
        viewportHeight - popoverBounds.height - collisionPadding,
      );
      const centeredTop = Math.min(
        Math.max(buttonBounds.top, collisionPadding),
        maxTop,
      );
      const centeredLeft = Math.min(
        Math.max(buttonBounds.right - popoverBounds.width, collisionPadding),
        maxLeft,
      );

      setInfoPopoverPlacement(nextPlacement);
      setPopoverPosition(
        nextPlacement === "top"
          ? {
              top:
                Math.max(
                  collisionPadding,
                  buttonBounds.top - popoverBounds.height - sideOffset,
                ) - (sectionBounds?.top ?? 0),
              left: centeredLeft - (sectionBounds?.left ?? 0),
            }
          : nextPlacement === "left"
            ? {
                top: centeredTop - (sectionBounds?.top ?? 0),
                left:
                  Math.max(
                    collisionPadding,
                    buttonBounds.left - popoverBounds.width - sideOffset,
                  ) - (sectionBounds?.left ?? 0),
              }
            : {
                top:
                  Math.min(maxTop, buttonBounds.bottom + sideOffset) -
                  (sectionBounds?.top ?? 0),
                left: centeredLeft - (sectionBounds?.left ?? 0),
              },
      );
    };

    updateInfoPopoverPlacement();
    window.addEventListener("resize", updateInfoPopoverPlacement);
    window.addEventListener("scroll", updateInfoPopoverPlacement, true);
    return () => {
      window.removeEventListener("resize", updateInfoPopoverPlacement);
      window.removeEventListener("scroll", updateInfoPopoverPlacement, true);
    };
  }, [isInfoOpen, portal]);

  useEffect(() => {
    if (!isInfoOpen) return undefined;

    const dismissInfo = () => {
      setIsInfoPinned(false);
      setIsInfoDismissed(true);
      setInfoPopoverPlacement("top");
    };
    const handleOutsidePointerDown = (event: globalThis.PointerEvent) => {
      if (!infoControlRef.current?.contains(event.target as Node)) {
        dismissInfo();
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") dismissInfo();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isInfoOpen]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const handleInfoToggle = () => {
    const nextPinned = !isInfoPinned;
    setIsInfoPinned(nextPinned);
    setIsInfoDismissed(!nextPinned);
    if (nextPinned && !isInfoOpen) setInfoPopoverPlacement("top");
  };

  const portalTarget =
    portal && typeof document !== "undefined"
      ? (infoControlRef.current?.closest(".creator-dashboard-panel") ??
        document.body)
      : null;

  return (
    <div
      ref={infoControlRef}
      className={`creator-panel-info-wrap ${className}`.trim()}
      onMouseEnter={() => {
        clearCloseTimeout();
        setIsInfoHovered(true);
        setIsInfoDismissed(false);
        if (!isInfoOpen) setInfoPopoverPlacement("top");
      }}
      onMouseLeave={() => {
        if (portal && !isInfoPinned && !isInfoFocused) {
          scheduleHoverClose();
        } else {
          setIsInfoHovered(false);
        }
      }}
    >
      <button
        type="button"
        className="creator-panel-info"
        ref={infoButtonRef}
        aria-label={infoLabel}
        aria-controls={infoPopoverId}
        aria-expanded={isInfoOpen}
        aria-describedby={isInfoOpen ? infoPopoverId : undefined}
        onFocus={() => {
          setIsInfoFocused(true);
          setIsInfoDismissed(false);
          if (!isInfoOpen) setInfoPopoverPlacement("top");
        }}
        onBlur={() => setIsInfoFocused(false)}
        onClick={handleInfoToggle}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {isInfoOpen &&
        (() => {
          const popover = (
            <div
              id={infoPopoverId}
              className={`creator-panel-info-popover${
                portal ? " creator-panel-info-popover--portal" : ""
              }`}
              ref={infoPopoverRef}
              data-placement={infoPopoverPlacement}
              role="tooltip"
              style={
                portal && popoverPosition
                  ? {
                      top: popoverPosition.top,
                      left: popoverPosition.left,
                    }
                  : portal
                    ? { visibility: "hidden" }
                    : undefined
              }
              onMouseEnter={portal ? clearCloseTimeout : undefined}
              onMouseLeave={portal ? scheduleHoverClose : undefined}
            >
              <strong>{infoTitle}</strong>
              <div className="creator-panel-info-content">
                {infoDescription}
              </div>
            </div>
          );

          return portal && portalTarget
            ? createPortal(popover, portalTarget)
            : popover;
        })()}
    </div>
  );
}
