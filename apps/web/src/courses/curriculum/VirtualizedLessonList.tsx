import {
  defaultRangeExtractor,
  useVirtualizer,
  useWindowVirtualizer,
} from "@tanstack/react-virtual";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Key,
  type ReactNode,
} from "react";
import { getApplicationScrollElement } from "../../shell/applicationScroll";

const VIRTUALIZE_AFTER = 80;
const LESSON_ROW_ESTIMATE = 168;
const LESSON_ROW_OVERSCAN = 8;
const LESSON_ROW_GAP = 10;
// A zero-size first measurement mounts only the overscan rows until the
// scroll element reports its actual viewport size.
const INITIAL_VIRTUALIZER_RECT = { width: 1024, height: 768 };
const LESSON_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], audio[controls], video[controls], summary';

type VirtualRange = Parameters<typeof defaultRangeExtractor>[0];

interface VirtualizedLessonListProps<T> {
  items: readonly T[];
  forceVirtualized?: boolean;
  estimatedItemSize?: number;
  itemGap?: number;
  overscan?: number;
  getScrollElement?: () => HTMLElement | null;
  getItemKey: (item: T) => string;
  pinnedItemIds: ReadonlySet<string>;
  onItemFocusChange?: (itemId: string, focused: boolean) => void;
  renderItem: (item: T, index: number) => ReactNode;
}

function getListScrollMargin(
  list: HTMLDivElement | null,
  scrollport: HTMLElement | null,
) {
  if (!list || typeof window === "undefined") return 0;

  const listRect = list.getBoundingClientRect();
  if (scrollport) {
    return (
      listRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    );
  }

  return listRect.top + window.scrollY;
}

function getNearestScrollableAncestor(element: HTMLElement | null) {
  if (!element || typeof window === "undefined") return null;

  let ancestor = element.parentElement;
  while (ancestor) {
    const overflowY = window.getComputedStyle(ancestor).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }

  return null;
}

export function VirtualizedLessonList<T>({
  items,
  forceVirtualized = false,
  estimatedItemSize = LESSON_ROW_ESTIMATE,
  itemGap = LESSON_ROW_GAP,
  overscan,
  getScrollElement: getScrollElementOverride,
  getItemKey,
  pinnedItemIds,
  onItemFocusChange,
  renderItem,
}: VirtualizedLessonListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const resolveScrollElement = useCallback(
    () =>
      getScrollElementOverride
        ? getScrollElementOverride()
        : (getNearestScrollableAncestor(listRef.current) ??
          getApplicationScrollElement()),
    [getScrollElementOverride],
  );
  const [useWindowScroll, setUseWindowScroll] = useState(() => {
    if (typeof window === "undefined") return true;
    const initialElement =
      getScrollElementOverride
        ? getScrollElementOverride()
        : (typeof document !== "undefined"
            ? getApplicationScrollElement()
            : null);
    return initialElement === null;
  });
  const [scrollMargin, setScrollMargin] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<{
    itemId: string;
    edge: "first" | "last";
  } | null>(null);
  const virtualized =
    items.length >= VIRTUALIZE_AFTER || (forceVirtualized && items.length > 0);
  const effectiveOverscan =
    overscan ?? (estimatedItemSize <= 60 ? 14 : LESSON_ROW_OVERSCAN);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(resolveScrollElement() === null);
    };

    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, [resolveScrollElement]);

  const syncScrollMargin = useCallback(() => {
    const scrollElement = useWindowScroll ? null : resolveScrollElement();
    const next = getListScrollMargin(listRef.current, scrollElement);
    setScrollMargin((current) =>
      Math.abs(current - next) > 1 ? next : current,
    );
  }, [resolveScrollElement, useWindowScroll]);

  useLayoutEffect(() => {
    syncScrollMargin();

    const scrollElement = useWindowScroll ? null : resolveScrollElement();

    window.addEventListener("resize", syncScrollMargin);

    const handleTransitionEnd = () => syncScrollMargin();
    window.addEventListener("transitionend", handleTransitionEnd, {
      passive: true,
    });
    window.addEventListener("animationend", handleTransitionEnd, {
      passive: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        syncScrollMargin();
      });

      if (listRef.current) {
        resizeObserver.observe(listRef.current);
      }
      if (scrollElement) {
        resizeObserver.observe(scrollElement);
        if (scrollElement.firstElementChild) {
          resizeObserver.observe(scrollElement.firstElementChild);
        }
      }
    }

    const timers = [
      window.setTimeout(syncScrollMargin, 50),
      window.setTimeout(syncScrollMargin, 150),
      window.setTimeout(syncScrollMargin, 320),
      window.setTimeout(syncScrollMargin, 500),
    ];

    return () => {
      window.removeEventListener("resize", syncScrollMargin);
      window.removeEventListener("transitionend", handleTransitionEnd);
      window.removeEventListener("animationend", handleTransitionEnd);
      resizeObserver?.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [items.length, resolveScrollElement, syncScrollMargin, useWindowScroll]);

  const indexById = useMemo(() => {
    const indexes = new Map<string, number>();
    items.forEach((item, index) => indexes.set(getItemKey(item), index));
    return indexes;
  }, [getItemKey, items]);

  const rangeExtractor = useCallback(
    (range: VirtualRange) => {
      const indexes = new Set(defaultRangeExtractor(range));
      const pinnedIds = pendingFocus
        ? [...pinnedItemIds, pendingFocus.itemId]
        : pinnedItemIds;
      for (const itemId of pinnedIds) {
        const index = indexById.get(itemId);
        if (index !== undefined && index < range.count) indexes.add(index);
      }
      return [...indexes].sort((left, right) => left - right);
    },
    [indexById, pendingFocus, pinnedItemIds],
  );

  const itemKey = useCallback(
    (index: number) => {
      const item = items[index];
      return item === undefined ? index : getItemKey(item);
    },
    [getItemKey, items],
  );

  const handleRowKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab") return;
      const row = event.currentTarget;
      const focusableElements = Array.from(
        row.querySelectorAll<HTMLElement>(LESSON_FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.getAttribute("aria-hidden") !== "true",
      );
      if (focusableElements.length === 0) return;

      const activeElement = document.activeElement;
      const atBoundary = event.shiftKey
        ? focusableElements[0] === activeElement
        : focusableElements[focusableElements.length - 1] === activeElement;
      if (!atBoundary) return;

      const currentIndex = Number(row.dataset.index);
      const targetIndex = currentIndex + (event.shiftKey ? -1 : 1);
      const targetItem = items[targetIndex];
      if (!targetItem) return;

      event.preventDefault();
      setPendingFocus({
        itemId: getItemKey(targetItem),
        edge: event.shiftKey ? "last" : "first",
      });
    },
    [getItemKey, items],
  );

  const windowVirtualizer = useWindowVirtualizer({
    count: virtualized && useWindowScroll ? items.length : 0,
    estimateSize: () => estimatedItemSize + itemGap,
    getItemKey: itemKey,
    initialRect: INITIAL_VIRTUALIZER_RECT,
    overscan: effectiveOverscan,
    rangeExtractor,
    scrollMargin: useWindowScroll ? scrollMargin : 0,
  });
  // TanStack Virtual's mutable virtualizer API is intentionally held locally.
  // eslint-disable-next-line react-hooks/incompatible-library
  const scrollportVirtualizer = useVirtualizer({
    count: virtualized && !useWindowScroll ? items.length : 0,
    estimateSize: () => estimatedItemSize + itemGap,
    getItemKey: itemKey,
    getScrollElement: resolveScrollElement,
    initialRect: INITIAL_VIRTUALIZER_RECT,
    overscan: effectiveOverscan,
    rangeExtractor,
    scrollMargin: useWindowScroll ? 0 : scrollMargin,
  });

  const virtualizer = useWindowScroll
    ? windowVirtualizer
    : scrollportVirtualizer;
  const virtualItems = virtualized ? virtualizer.getVirtualItems() : [];
  const totalSize = virtualizer.getTotalSize();

  useLayoutEffect(() => {
    if (!pendingFocus) return;
    if (!indexById.has(pendingFocus.itemId)) {
      setPendingFocus(null);
      return;
    }

    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        "[data-lesson-virtual-row]",
      ) ?? [],
    ).find((element) => element.dataset.lessonId === pendingFocus.itemId);
    if (!row) return;

    const focusableElements = Array.from(
      row.querySelectorAll<HTMLElement>(LESSON_FOCUSABLE_SELECTOR),
    ).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        element.getAttribute("aria-hidden") !== "true",
    );
    const target =
      pendingFocus.edge === "first"
        ? focusableElements[0]
        : focusableElements[focusableElements.length - 1];
    target?.focus();
    setPendingFocus(null);
  }, [indexById, pendingFocus, virtualItems]);

  if (!virtualized) {
    return (
      <div ref={listRef} className="flex flex-col gap-2.5">
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="relative w-full"
      style={{ height: `${totalSize}px` }}
      data-lesson-virtual-list
      data-lesson-mounted-row-count={virtualItems.length}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        if (item === undefined) return null;
        const itemId = getItemKey(item);
        const transform = `translateY(${virtualItem.start - scrollMargin}px)`;

        return (
          <div
            key={virtualItem.key as Key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-lesson-virtual-row
            data-lesson-id={itemId}
            onFocusCapture={() => onItemFocusChange?.(itemId, true)}
            onKeyDownCapture={handleRowKeyDown}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                onItemFocusChange?.(itemId, false);
              }
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              boxSizing: "border-box",
              paddingBottom: `${itemGap}px`,
              transform,
            }}
          >
            {renderItem(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
