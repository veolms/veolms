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
const LESSON_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], audio[controls], video[controls], summary';

type VirtualRange = Parameters<typeof defaultRangeExtractor>[0];

interface VirtualizedLessonListProps<T> {
  items: readonly T[];
  forceVirtualized?: boolean;
  estimatedItemSize?: number;
  itemGap?: number;
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

export function VirtualizedLessonList<T>({
  items,
  forceVirtualized = false,
  estimatedItemSize = LESSON_ROW_ESTIMATE,
  itemGap = LESSON_ROW_GAP,
  getItemKey,
  pinnedItemIds,
  onItemFocusChange,
  renderItem,
}: VirtualizedLessonListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [useWindowScroll, setUseWindowScroll] = useState(true);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<{
    itemId: string;
    edge: "first" | "last";
  } | null>(null);
  const virtualized =
    items.length >= VIRTUALIZE_AFTER || (forceVirtualized && items.length > 0);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };

    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, []);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      const next = getListScrollMargin(
        listRef.current,
        useWindowScroll ? null : getApplicationScrollElement(),
      );
      setScrollMargin((current) =>
        Math.abs(current - next) > 1 ? next : current,
      );
    };

    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [items.length, renderItem, useWindowScroll]);

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
    overscan: LESSON_ROW_OVERSCAN,
    rangeExtractor,
    scrollMargin: useWindowScroll ? scrollMargin : 0,
  });
  const scrollportVirtualizer = useVirtualizer({
    count: virtualized && !useWindowScroll ? items.length : 0,
    estimateSize: () => estimatedItemSize + itemGap,
    getItemKey: itemKey,
    getScrollElement: () => getApplicationScrollElement(),
    overscan: LESSON_ROW_OVERSCAN,
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
  }, [indexById, pendingFocus]);

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
