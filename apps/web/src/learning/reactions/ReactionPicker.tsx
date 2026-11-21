import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { DiscussionReactionType } from "@veolms/contracts";
import { REACTION_CONFIGS, REACTION_TYPES } from "./reactionConstants";

interface ReactionPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentReaction?: DiscussionReactionType | null;
  onSelect: (reaction: DiscussionReactionType) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  autoFocusFirst?: boolean;
}

export function ReactionPicker({
  anchorRef,
  currentReaction,
  onSelect,
  onClose,
  onMouseEnter,
  onMouseLeave,
  autoFocusFirst = false,
}: ReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pickerWidth = 264;
    const pickerHeight = 48;

    let top = rect.top - pickerHeight - 8;
    if (top < 8) {
      top = rect.bottom + 8;
    }

    const maxLeft = Math.max(8, window.innerWidth - pickerWidth - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));

    setCoords({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        containerRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [anchorRef, onClose]);

  useEffect(() => {
    if (autoFocusFirst) {
      const firstButton =
        containerRef.current?.querySelector<HTMLButtonElement>("button");
      firstButton?.focus();
    }
  }, [autoFocusFirst]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const buttons = Array.from(
          containerRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
            [],
        );
        if (buttons.length === 0) return;
        const activeIndex = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (activeIndex >= 0) {
          e.preventDefault();
          const nextIndex =
            e.key === "ArrowRight"
              ? (activeIndex + 1) % buttons.length
              : (activeIndex - 1 + buttons.length) % buttons.length;
          buttons[nextIndex]?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined" || !coords) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Reactions"
      data-reaction-picker
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 1000,
      }}
      className="flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {REACTION_TYPES.map((type) => {
        const config = REACTION_CONFIGS[type];
        const Icon = config.icon;
        const isSelected = currentReaction === type;

        return (
          <button
            key={type}
            type="button"
            aria-label={config.label}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(type);
            }}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-150 hover:scale-125 focus-visible:outline-2 focus-visible:outline-(--accent) ${
              isSelected
                ? "bg-(--surface-sunken) scale-110"
                : "hover:bg-(--surface-sunken)"
            }`}
          >
            <span
              className={`${config.colorClass} flex items-center justify-center`}
            >
              <Icon size={22} weight={isSelected ? "fill" : "bold"} />
            </span>

            {/* Tooltip on hover */}
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-(--surface-inverted,#0f172a) px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-100 group-hover:opacity-100">
              {config.label}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
