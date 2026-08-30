import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../navigation/useBackDismiss";

const courseMenuWidth = 238;
const courseMenuGap = 8;
const courseMenuViewportPadding = 12;
type CourseMenuHorizontalPlacement = "right" | "left" | "aligned";
type CourseMenuVerticalPlacement = "below" | "above";

interface CourseMenuPosition {
  left: number;
  top: number;
  maxHeight: number;
}

type DismissMenuThen = (afterDismiss: () => void) => void;
const CourseMenuDismissContext = createContext<DismissMenuThen | null>(null);

export interface MenuActionProps {
  Icon?: Icon;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function MenuAction({
  Icon,
  icon,
  label,
  onClick,
  destructive,
  disabled = false,
}: MenuActionProps) {
  const dismissThen = useContext(CourseMenuDismissContext);

  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[0.78rem] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
        disabled
          ? "cursor-not-allowed text-(--muted) opacity-60"
          : destructive
            ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
      }`}
      aria-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (dismissThen) dismissThen(onClick);
        else onClick();
      }}
    >
      {icon ??
        (Icon ? <Icon size={17} weight="regular" aria-hidden="true" /> : null)}
      <span>{label}</span>
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-(--border)" aria-hidden="true" />;
}

interface CourseActionMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  menuLabel?: string;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  dataMenu?: string;
  anchorPoint?: { x: number; y: number } | null;
}

export function CourseActionMenu({
  open,
  onOpenChange,
  ariaLabel,
  menuLabel = ariaLabel,
  children,
  className = "relative z-30 ml-auto shrink-0",
  triggerClassName = "size-10",
  menuClassName = "",
  dataMenu,
  anchorPoint,
}: CourseActionMenuProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPointerInteractionRef = useRef(false);
  const [menuHorizontalPlacement, setMenuHorizontalPlacement] =
    useState<CourseMenuHorizontalPlacement>("right");
  const [menuVerticalPlacement, setMenuVerticalPlacement] =
    useState<CourseMenuVerticalPlacement>("below");
  const [menuPosition, setMenuPosition] = useState<CourseMenuPosition | null>(
    null,
  );
  const [menuPressPulse, setMenuPressPulse] = useState(0);
  const [menuKeyboardFocus, setMenuKeyboardFocus] = useState(false);

  const dismissMenuThen = useBackDismiss({
    open,
    onDismiss: () => onOpenChange(false),
  });

  const updateMenuPlacement = useCallback(() => {
    const button = menuButtonRef.current;
    const menu = menuRef.current;
    if (!button || !menu || typeof window === "undefined") return;

    const buttonBounds = button.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const maxHeight = Math.max(
      80,
      window.innerHeight - courseMenuViewportPadding * 2,
    );
    const width = Math.min(
      menu.offsetWidth || menuBounds.width || courseMenuWidth,
      window.innerWidth - courseMenuViewportPadding * 2,
    );
    const measuredHeight =
      menu.scrollHeight || menu.offsetHeight || menuBounds.height;
    const height = Math.min(measuredHeight || maxHeight, maxHeight);

    if (anchorPoint) {
      const roomOnRight =
        window.innerWidth - courseMenuViewportPadding - anchorPoint.x;
      const roomBelow =
        window.innerHeight - courseMenuViewportPadding - anchorPoint.y;
      const horizontalPlacement: CourseMenuHorizontalPlacement =
        roomOnRight >= width + courseMenuGap ? "right" : "left";
      const verticalPlacement: CourseMenuVerticalPlacement =
        roomBelow >= height + courseMenuGap ? "below" : "above";
      const naturalLeft =
        horizontalPlacement === "right"
          ? anchorPoint.x + courseMenuGap
          : anchorPoint.x - width - courseMenuGap;
      const naturalTop =
        verticalPlacement === "below"
          ? anchorPoint.y + courseMenuGap
          : anchorPoint.y - height - courseMenuGap;
      const left = Math.min(
        Math.max(courseMenuViewportPadding, naturalLeft),
        window.innerWidth - courseMenuViewportPadding - width,
      );
      const top = Math.min(
        Math.max(courseMenuViewportPadding, naturalTop),
        window.innerHeight - courseMenuViewportPadding - height,
      );

      setMenuHorizontalPlacement(horizontalPlacement);
      setMenuVerticalPlacement(verticalPlacement);
      setMenuPosition((current) => {
        if (
          current?.left === left &&
          current.top === top &&
          current.maxHeight === maxHeight
        )
          return current;
        return { left, top, maxHeight };
      });
      return;
    }

    const roomOnRight =
      window.innerWidth - courseMenuViewportPadding - buttonBounds.right;
    const roomOnLeft = buttonBounds.left - courseMenuViewportPadding;
    const roomBelow =
      window.innerHeight - courseMenuViewportPadding - buttonBounds.bottom;
    const roomAbove = buttonBounds.top - courseMenuViewportPadding;
    const horizontalPlacement: CourseMenuHorizontalPlacement =
      roomOnRight >= width + courseMenuGap
        ? "right"
        : roomOnLeft >= width + courseMenuGap
          ? "left"
          : "aligned";
    const verticalPlacement: CourseMenuVerticalPlacement =
      roomBelow >= height + courseMenuGap
        ? "below"
        : roomAbove >= height + courseMenuGap || roomAbove > roomBelow
          ? "above"
          : "below";
    const alignmentGap = horizontalPlacement === "aligned" ? courseMenuGap : 0;
    const naturalLeft =
      horizontalPlacement === "right"
        ? buttonBounds.right
        : horizontalPlacement === "left"
          ? buttonBounds.left - width
          : buttonBounds.left;
    const naturalTop =
      verticalPlacement === "above"
        ? buttonBounds.top - height - alignmentGap
        : buttonBounds.bottom + alignmentGap;
    const left = Math.min(
      Math.max(courseMenuViewportPadding, naturalLeft),
      window.innerWidth - courseMenuViewportPadding - width,
    );
    const top = Math.min(
      Math.max(courseMenuViewportPadding, naturalTop),
      window.innerHeight - courseMenuViewportPadding - height,
    );

    setMenuHorizontalPlacement(horizontalPlacement);
    setMenuVerticalPlacement(verticalPlacement);
    setMenuPosition((current) => {
      if (
        current?.left === left &&
        current.top === top &&
        current.maxHeight === maxHeight
      )
        return current;
      return { left, top, maxHeight };
    });
  }, [anchorPoint]);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setMenuPosition(null);
      return;
    }

    updateMenuPlacement();
  }, [open, updateMenuPlacement]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        menuButtonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      dismissMenuThen(() => {});
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissMenuThen(() => menuButtonRef.current?.focus());
    };
    let repositionFrame = 0;
    const reposition = () => {
      if (repositionFrame) return;
      repositionFrame = window.requestAnimationFrame(() => {
        repositionFrame = 0;
        updateMenuPlacement();
      });
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      if (repositionFrame) window.cancelAnimationFrame(repositionFrame);
    };
  }, [dismissMenuThen, open, updateMenuPlacement]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ];
    if (!items.length) return;
    const activeItem =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[role="menuitem"]')
        : null;
    const activeIndex = activeItem ? items.indexOf(activeItem) : -1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (Math.max(0, activeIndex) +
              (event.key === "ArrowDown" ? 1 : -1) +
              items.length) %
            items.length;
    event.preventDefault();
    items[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className={className} data-course-menu={dataMenu}>
        <button
          type="button"
          ref={menuButtonRef}
          className={`group/action relative isolate flex ${triggerClassName} items-center justify-center overflow-visible rounded-full text-(--text-secondary) focus-visible:outline-none!`}
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={(event) => {
            if (event.button === 0) {
              menuPointerInteractionRef.current = true;
              setMenuKeyboardFocus(false);
              setMenuPressPulse((pulse) => pulse + 1);
            }
          }}
          onPointerUp={() => {
            menuPointerInteractionRef.current = false;
          }}
          onPointerCancel={() => {
            menuPointerInteractionRef.current = false;
            setMenuPressPulse(0);
          }}
          onPointerLeave={() => setMenuPressPulse(0)}
          onFocus={() => {
            if (!menuPointerInteractionRef.current) setMenuKeyboardFocus(true);
          }}
          onBlur={() => {
            menuPointerInteractionRef.current = false;
            setMenuKeyboardFocus(false);
          }}
          onKeyDown={(event) => {
            setMenuKeyboardFocus(true);
            if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
              setMenuPressPulse((pulse) => pulse + 1);
            }
          }}
          onClick={() => {
            if (open) dismissMenuThen(() => {});
            else onOpenChange(true);
          }}
        >
          <span
            className={`relative z-10 flex size-9 items-center justify-center rounded-full text-(--text-secondary) transition-colors duration-150 group-hover/action:text-(--text) ${menuKeyboardFocus ? "text-(--text)" : ""}`}
          >
            <span
              key={menuPressPulse}
              className={`pointer-events-none absolute inset-0 z-0 rounded-full transition-colors duration-150 group-hover/action:bg-[color-mix(in_srgb,var(--text)_9%,var(--surface-strong))] group-active/action:bg-[color-mix(in_srgb,var(--text)_24%,var(--surface-strong))] ${menuKeyboardFocus ? "bg-[color-mix(in_srgb,var(--text)_16%,var(--surface-strong))]" : ""} ${menuPressPulse > 0 ? "course-menu-press-feedback motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
              onAnimationEnd={() => setMenuPressPulse(0)}
            />
            <DotsThreeVertical
              className="relative z-10"
              size={24}
              weight="bold"
            />
          </span>
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <CourseMenuDismissContext.Provider value={dismissMenuThen}>
            <div
              ref={menuRef}
              className={`fixed z-[1000000] w-59.5 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-(--border-strong) bg-(--surface) p-1.5 shadow-[0_20px_48px_rgba(0,0,0,0.38)] ${menuClassName}`.trim()}
              role="menu"
              aria-label={menuLabel}
              data-placement={`${menuVerticalPlacement}-${menuHorizontalPlacement}`}
              data-control-radius-menu
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={handleMenuKeyDown}
              style={
                {
                  left: menuPosition?.left ?? courseMenuViewportPadding,
                  top: menuPosition?.top ?? courseMenuViewportPadding,
                  maxHeight:
                    menuPosition?.maxHeight ??
                    `calc(100vh - ${courseMenuViewportPadding * 2}px)`,
                  visibility: menuPosition ? "visible" : "hidden",
                  pointerEvents: menuPosition ? undefined : "none",
                } as CSSProperties
              }
            >
              {children}
            </div>
          </CourseMenuDismissContext.Provider>,
          document.body,
        )}
    </>
  );
}
