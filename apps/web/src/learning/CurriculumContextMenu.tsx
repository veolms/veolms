import { ArrowsInLineVerticalIcon as ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVerticalIcon as ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { CrosshairSimpleIcon as CrosshairSimple } from "@phosphor-icons/react/CrosshairSimple";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { ListMagnifyingGlassIcon as ListMagnifyingGlass } from "@phosphor-icons/react/ListMagnifyingGlass";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import type { LessonDrawerHeroControlProps } from "./useLessonDrawerHeroControl";

const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;
const MENU_GUTTER = 8;
const MENU_ANCHOR_OFFSET = 4;
const TYPEAHEAD_RESET_DELAY = 500;

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Point {
  x: number;
  y: number;
}

interface MenuPosition {
  left: number;
  top: number;
  maxHeight: number;
}

interface CurriculumMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface CurriculumMenuGroup {
  id: string;
  label?: string;
  items: CurriculumMenuItem[];
}

interface CurriculumContextMenuProps {
  children: ReactNode;
  drawerHeroControlProps?: LessonDrawerHeroControlProps;
  allSectionsExpanded: boolean;
  allSectionsCollapsed: boolean;
  onExpandAllSections: () => void;
  onCollapseAllSections: () => void;
  onGoToCurrentSection: () => void;
  onGoToCurrentLecture: () => void;
  onSearchLectures: () => void;
  onViewCourseOverview: () => void;
}

const getViewportBounds = () => {
  const visualViewport = window.visualViewport;
  return {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  };
};

const getFocusableActiveElement = () => {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement !== document.body
    ? activeElement
    : null;
};

export function CurriculumContextMenu({
  children,
  drawerHeroControlProps,
  allSectionsExpanded,
  allSectionsCollapsed,
  onExpandAllSections,
  onCollapseAllSections,
  onGoToCurrentSection,
  onGoToCurrentLecture,
  onSearchLectures,
  onViewCourseOverview,
}: CurriculumContextMenuProps) {
  const labelId = `curriculum-context-menu-label-${useId().replaceAll(":", "")}`;
  const [anchorPoint, setAnchorPoint] = useState<Point | null>(null);
  const [position, setPosition] = useState<MenuPosition>({
    left: MENU_GUTTER,
    top: MENU_GUTTER,
    maxHeight: 0,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointRef = useRef<Point | null>(null);
  const longPressOpenedRef = useRef(false);
  const typeaheadRef = useRef({ value: "", lastTypedAt: 0 });

  const menuGroups: CurriculumMenuGroup[] = [
    {
      id: "curriculum",
      label: "Curriculum actions",
      items: [
        ...(!allSectionsExpanded
          ? [
              {
                id: "expand-all",
                label: "Expand all sections",
                icon: <ArrowsOutLineVertical aria-hidden="true" />,
                onSelect: onExpandAllSections,
              },
            ]
          : []),
        ...(!allSectionsCollapsed
          ? [
              {
                id: "collapse-all",
                label: "Collapse all sections",
                icon: <ArrowsInLineVertical aria-hidden="true" />,
                onSelect: onCollapseAllSections,
              },
            ]
          : []),
      ],
    },
    {
      id: "navigation",
      items: [
        {
          id: "current-section",
          label: "Go to current section",
          icon: <CrosshairSimple aria-hidden="true" />,
          onSelect: onGoToCurrentSection,
        },
        {
          id: "current-lecture",
          label: "Go to current lecture",
          icon: <Play aria-hidden="true" />,
          onSelect: onGoToCurrentLecture,
        },
        {
          id: "search",
          label: "Search lectures",
          icon: <ListMagnifyingGlass aria-hidden="true" />,
          onSelect: onSearchLectures,
        },
      ],
    },
    {
      id: "course",
      items: [
        {
          id: "overview",
          label: "View course overview",
          icon: <Eye aria-hidden="true" />,
          onSelect: onViewCourseOverview,
        },
      ],
    },
  ];
  const menuItems = menuGroups.flatMap((group) => group.items);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPointRef.current = null;
  }, []);

  const openMenu = useCallback(
    (point: Point, returnFocus: HTMLElement | null) => {
      const viewport = getViewportBounds();
      returnFocusRef.current = returnFocus;
      setActiveIndex(0);
      setEntered(false);
      setPosition({
        left: point.x,
        top: point.y + MENU_ANCHOR_OFFSET,
        maxHeight: Math.max(0, viewport.height - MENU_GUTTER * 2),
      });
      setAnchorPoint(point);
    },
    [],
  );

  const closeMenu = useCallback((restoreFocus: boolean) => {
    const menu = menuRef.current;
    const returnFocus = returnFocusRef.current;
    const activeElement = document.activeElement;
    const focusWasInMenu =
      activeElement instanceof Node && Boolean(menu?.contains(activeElement));
    const shouldRestoreFocus =
      restoreFocus &&
      Boolean(returnFocus?.isConnected) &&
      (focusWasInMenu || activeElement === document.body);

    setAnchorPoint(null);
    setEntered(false);

    if (!shouldRestoreFocus || !returnFocus) return;
    queueMicrotask(() => {
      const currentActiveElement = document.activeElement;
      if (
        currentActiveElement !== document.body &&
        !(
          currentActiveElement instanceof Node &&
          menu?.contains(currentActiveElement)
        )
      ) {
        return;
      }
      returnFocus.focus({ preventScroll: true });
    });
  }, []);

  const updatePosition = useCallback(() => {
    const menu = menuRef.current;
    if (!menu || !anchorPoint) return;

    const viewport = getViewportBounds();
    const menuBounds = menu.getBoundingClientRect();
    const minimumLeft = viewport.left + MENU_GUTTER;
    const minimumTop = viewport.top + MENU_GUTTER;
    const maximumLeft = Math.max(
      minimumLeft,
      viewport.left + viewport.width - menuBounds.width - MENU_GUTTER,
    );
    const maximumTop = Math.max(
      minimumTop,
      viewport.top + viewport.height - menuBounds.height - MENU_GUTTER,
    );
    const nextPosition = {
      left: Math.min(Math.max(anchorPoint.x, minimumLeft), maximumLeft),
      top: Math.min(
        Math.max(anchorPoint.y + MENU_ANCHOR_OFFSET, minimumTop),
        maximumTop,
      ),
      maxHeight: Math.max(0, viewport.height - MENU_GUTTER * 2),
    };

    setPosition((current) =>
      current.left === nextPosition.left &&
      current.top === nextPosition.top &&
      current.maxHeight === nextPosition.maxHeight
        ? current
        : nextPosition,
    );
  }, [anchorPoint]);

  useClientLayoutEffect(() => {
    if (!anchorPoint) return undefined;

    updatePosition();
    itemRefs.current[0]?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [anchorPoint, updatePosition]);

  useEffect(() => {
    if (!anchorPoint) return undefined;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorPoint, closeMenu, updatePosition]);

  useEffect(
    () => () => {
      cancelLongPress();
    },
    [cancelLongPress],
  );

  const focusItem = (index: number) => {
    if (menuItems.length === 0) return;
    const nextIndex = (index + menuItems.length) % menuItems.length;
    setActiveIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus({ preventScroll: true });
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      focusItem(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      focusItem(activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusItem(menuItems.length - 1);
      return;
    }
    if (
      event.key.length !== 1 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const now = Date.now();
    const nextQuery =
      now - typeaheadRef.current.lastTypedAt > TYPEAHEAD_RESET_DELAY
        ? event.key.toLocaleLowerCase()
        : `${typeaheadRef.current.value}${event.key.toLocaleLowerCase()}`;
    typeaheadRef.current = { value: nextQuery, lastTypedAt: now };
    for (let offset = 1; offset <= menuItems.length; offset += 1) {
      const candidateIndex = (activeIndex + offset) % menuItems.length;
      if (
        menuItems[candidateIndex]?.label
          .toLocaleLowerCase()
          .startsWith(nextQuery)
      ) {
        event.preventDefault();
        focusItem(candidateIndex);
        break;
      }
    }
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(
      { x: event.clientX, y: event.clientY },
      getFocusableActiveElement(),
    );
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const opensContextMenu =
      event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
    if (!opensContextMenu) return;

    event.preventDefault();
    event.stopPropagation();
    const target =
      event.target instanceof HTMLElement ? event.target : event.currentTarget;
    const targetBounds = target.getBoundingClientRect();
    openMenu(
      {
        x: targetBounds.left + Math.min(16, targetBounds.width),
        y: targetBounds.bottom,
      },
      target,
    );
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    cancelLongPress();
    longPressOpenedRef.current = false;
    if (event.touches.length !== 1) return;

    event.stopPropagation();
    const touch = event.touches[0];
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    longPressPointRef.current = point;
    const returnFocus = getFocusableActiveElement();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressOpenedRef.current = true;
      flushSync(() => openMenu(point, returnFocus));
    }, LONG_PRESS_DELAY);
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const startPoint = longPressPointRef.current;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !startPoint || !touch) {
      cancelLongPress();
      return;
    }
    if (
      Math.abs(touch.clientX - startPoint.x) > LONG_PRESS_MOVE_THRESHOLD ||
      Math.abs(touch.clientY - startPoint.y) > LONG_PRESS_MOVE_THRESHOLD
    ) {
      cancelLongPress();
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const openedFromLongPress = longPressOpenedRef.current;
    cancelLongPress();
    longPressOpenedRef.current = false;
    if (!openedFromLongPress) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const menu =
    anchorPoint && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Course curriculum actions"
            className={`fixed isolate z-220 min-w-52 max-w-[min(19rem,calc(100vw-1rem))] origin-top-left overflow-x-hidden overflow-y-auto rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-1.5 text-(--text) shadow-[0_18px_48px_rgb(0_0_0/0.3)] backdrop-blur-xl transition-[transform,opacity] duration-100 ease-out outline-none ${entered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}`}
            style={{
              left: position.left,
              top: position.top,
              maxHeight: position.maxHeight,
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={handleMenuKeyDown}
          >
            {menuGroups.map((group, groupIndex) => {
              const precedingItemCount = menuGroups
                .slice(0, groupIndex)
                .reduce(
                  (count, candidate) => count + candidate.items.length,
                  0,
                );
              return (
                <Fragment key={group.id}>
                  <div
                    role="group"
                    aria-labelledby={group.label ? labelId : undefined}
                  >
                    {group.label && (
                      <div
                        id={labelId}
                        className="px-2.5 py-1.5 text-xs font-semibold text-(--muted)"
                      >
                        {group.label}
                      </div>
                    )}
                    {group.items.map((item, itemIndex) => {
                      const flatIndex = precedingItemCount + itemIndex;
                      return (
                        <button
                          key={item.id}
                          ref={(node) => {
                            itemRefs.current[flatIndex] = node;
                          }}
                          type="button"
                          role="menuitem"
                          tabIndex={flatIndex === activeIndex ? 0 : -1}
                          className="relative flex w-full cursor-default items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-sm text-(--text-secondary) outline-none select-none hover:bg-(--hover) hover:text-(--text) focus:bg-(--hover) focus:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                          onFocus={() => setActiveIndex(flatIndex)}
                          onPointerMove={() => focusItem(flatIndex)}
                          onClick={() => {
                            closeMenu(true);
                            item.onSelect();
                          }}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  {groupIndex < menuGroups.length - 1 && (
                    <div
                      role="separator"
                      className="mx-1 my-1 h-px bg-(--border)"
                    />
                  )}
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        {...drawerHeroControlProps}
        className="learning-curriculum__hero touch-pan-y"
        style={{
          ...drawerHeroControlProps?.style,
          WebkitTouchCallout: "none",
        }}
        aria-haspopup="menu"
        onContextMenu={handleContextMenu}
        onKeyDown={handleTriggerKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={cancelLongPress}
      >
        {children}
      </div>
      {menu}
    </>
  );
}
