import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import type { ReactNode, RefObject } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { getApplicationScrollElement } from "../shell/applicationScroll";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

const DISCUSSION_WORKSPACE_VIRTUAL_OVERSCAN = 5;
const DISCUSSION_WORKSPACE_CARD_GAP = 10;
const DISCUSSION_WORKSPACE_DESKTOP_CARD_HEIGHT = 112;
const DISCUSSION_WORKSPACE_MOBILE_CARD_HEIGHT = 110;
const DISCUSSION_WORKSPACE_MOBILE_QUERY = "(max-width: 780px)";

const subscribeToWorkspaceMobileQuery = (listener: () => void) => {
  if (typeof window === "undefined") return () => undefined;

  const media = window.matchMedia(DISCUSSION_WORKSPACE_MOBILE_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

const getWorkspaceMobileSnapshot = () =>
  typeof window !== "undefined" &&
  window.matchMedia(DISCUSSION_WORKSPACE_MOBILE_QUERY).matches;

const getWorkspaceMobileServerSnapshot = () => false;

function useWorkspaceMobileLayout() {
  return useSyncExternalStore(
    subscribeToWorkspaceMobileQuery,
    getWorkspaceMobileSnapshot,
    getWorkspaceMobileServerSnapshot,
  );
}

function useWorkspaceWindowScroll() {
  const [useWindowScroll, setUseWindowScroll] = useState(true);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };

    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, []);

  return useWindowScroll;
}

function getWorkspaceScrollMargin(
  feed: HTMLElement | null,
  scrollport: HTMLElement | null,
): number {
  if (!feed || typeof window === "undefined") return 0;

  const feedRect = feed.getBoundingClientRect();
  if (scrollport) {
    return (
      feedRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    );
  }

  return feedRect.top + window.scrollY;
}

function useWorkspaceScrollMargin(
  feedRef: RefObject<HTMLDivElement | null>,
  useWindowScroll: boolean,
  datasetKey: string,
  itemCount: number,
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      const nextScrollMargin = getWorkspaceScrollMargin(
        feedRef.current,
        useWindowScroll ? null : getApplicationScrollElement(),
      );
      setScrollMargin((current) =>
        Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
      );
    };

    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [datasetKey, feedRef, itemCount, useWindowScroll]);

  return scrollMargin;
}

export function getDiscussionWorkspaceItemKey(
  card: DiscussionWorkspaceCard,
): string {
  return `${card.itemType}:${card.id}`;
}

interface DiscussionWorkspaceVirtualizer {
  getTotalSize: () => number;
  getVirtualItems: () => Array<{ index: number; start: number }>;
  measure: () => void;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (
    index: number,
    options?: {
      align?: "start" | "center" | "end" | "auto";
      behavior?: "auto" | "smooth";
    },
  ) => void;
}

/**
 * Keeps the row of `focusKey` (the discussion open in the panel) on screen:
 * when it changes to a row that is not fully in view, below the page's
 * sticky tabs and filters, the list glides to bring it to the middle. The
 * virtualizer does the scrolling, so it reaches rows that are not drawn yet.
 */
function useScrollFocusedRowIntoView(
  virtualizer: DiscussionWorkspaceVirtualizer,
  feedRef: RefObject<HTMLDivElement | null>,
  cards: readonly DiscussionWorkspaceCard[],
  focusKey: string | null | undefined,
) {
  const lastFocusKey = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (!focusKey) {
      lastFocusKey.current = null;
      return;
    }
    if (focusKey === lastFocusKey.current) return;
    lastFocusKey.current = focusKey;
    const index = cards.findIndex(
      (card) => getDiscussionWorkspaceItemKey(card) === focusKey,
    );
    if (index < 0) return;
    const row = feedRef.current?.querySelector<HTMLElement>(
      `[data-discussion-workspace-virtual-row][data-index="${index}"]`,
    );
    if (row) {
      const rect = row.getBoundingClientRect();
      const scroller =
        getApplicationScrollElement()?.getBoundingClientRect() ?? {
          top: 0,
          bottom: window.innerHeight,
        };
      const sticky = feedRef.current
        ?.closest(".discussion-hub")
        ?.querySelector(".discussion-hub__sticky-region")
        ?.getBoundingClientRect();
      const top = Math.max(scroller.top, sticky?.bottom ?? scroller.top);
      if (rect.top >= top && rect.bottom <= scroller.bottom) return;
    }
    virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
  }, [cards, feedRef, focusKey, virtualizer]);
}

interface DiscussionWorkspaceVirtualRowsProps {
  cards: readonly DiscussionWorkspaceCard[];
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  feedRef: RefObject<HTMLDivElement | null>;
  scrollMargin: number;
  virtualizer: DiscussionWorkspaceVirtualizer;
}

/**
 * Measures the rows on screen again, and draws them, in the same frame the
 * list changes width (the side panel opening or closing, a window resize).
 * The virtualizer's own observer measures them too, but redraws in a later
 * task, so taller rows were painted over the next ones for a frame or more.
 */
function useRemeasureRowsOnWidthChange(
  virtualizer: DiscussionWorkspaceVirtualizer,
  feedRef: RefObject<HTMLDivElement | null>,
) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed || typeof ResizeObserver === "undefined") return undefined;
    let width = feed.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? width;
      if (Math.abs(nextWidth - width) < 0.5) return;
      width = nextWidth;
      flushSync(() => {
        feed
          .querySelectorAll("[data-discussion-workspace-virtual-row]")
          .forEach((row) => virtualizer.measureElement(row));
        redraw();
      });
    });
    observer.observe(feed);
    return () => observer.disconnect();
  }, [feedRef, virtualizer]);
}

/**
 * Forgets the measured heights when the list changes (a tab or filter
 * switch) and measures the rows on screen again, before the browser paints.
 * The reset used to run after paint and threw away the heights the rows had
 * just been measured at, so every row sat at its estimated height, shorter
 * than most rows, and was drawn over the next one until something measured
 * the rows again (half a second or more).
 */
function useResetMeasurementsBeforePaint(
  virtualizer: DiscussionWorkspaceVirtualizer,
  feedRef: RefObject<HTMLDivElement | null>,
  datasetKey: string,
  estimateSize: number,
) {
  useLayoutEffect(() => {
    virtualizer.measure();
    feedRef.current
      ?.querySelectorAll("[data-discussion-workspace-virtual-row]")
      .forEach((row) => virtualizer.measureElement(row));
  }, [datasetKey, estimateSize, feedRef, virtualizer]);
}

/** How long after the last scroll event a scroll counts as over: the
 * virtualizer's own "is scrolling" lasts 150ms past it. */
const SCROLL_SETTLE_MS = 200;

/**
 * Measures the rows on screen again once a scroll has ended. While a scroll
 * is under way the virtualizer does not measure rows that come into view, so
 * a row that arrived during a long glide (the panel's previous and next
 * buttons scroll the list smoothly) kept its estimated height, shorter than
 * the row, and was drawn over the next one until something measured it.
 */
function useRemeasureRowsAfterScroll(
  virtualizer: DiscussionWorkspaceVirtualizer,
  feedRef: RefObject<HTMLDivElement | null>,
  getScrollTarget: () => Window | HTMLElement | null,
) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const target = getScrollTarget();
    if (!target) return undefined;
    let timer: number | undefined;
    const remeasure = () => {
      const feed = feedRef.current;
      if (!feed) return;
      flushSync(() => {
        feed
          .querySelectorAll("[data-discussion-workspace-virtual-row]")
          .forEach((row) => virtualizer.measureElement(row));
        redraw();
      });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(remeasure, SCROLL_SETTLE_MS);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      target.removeEventListener("scroll", onScroll);
    };
  }, [feedRef, getScrollTarget, virtualizer]);
}

const getWindowScrollTarget = () =>
  typeof window === "undefined" ? null : window;

function DiscussionWorkspaceVirtualRows({
  cards,
  renderCard,
  feedRef,
  scrollMargin,
  virtualizer,
}: DiscussionWorkspaceVirtualRowsProps) {
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={feedRef}
      data-discussion-workspace-virtual-feed
      data-discussion-entry-count={cards.length}
      data-discussion-mounted-row-count={virtualItems.length}
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((virtualItem) => {
        const card = cards[virtualItem.index];
        if (!card) return null;

        const itemKey = getDiscussionWorkspaceItemKey(card);
        return (
          <div
            key={itemKey}
            ref={virtualizer.measureElement}
            data-discussion-workspace-virtual-row
            data-index={virtualItem.index}
            data-item-key={itemKey}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${Math.round(virtualItem.start - scrollMargin)}px)`,
            }}
          >
            {renderCard(card)}
          </div>
        );
      })}
    </div>
  );
}

interface DiscussionWorkspaceVirtualFeedSurfaceProps {
  cards: readonly DiscussionWorkspaceCard[];
  datasetKey: string;
  focusKey?: string | null;
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  useWindowScroll: boolean;
}

function DiscussionWorkspaceVirtualFeedSurface({
  cards,
  datasetKey,
  focusKey,
  renderCard,
  useWindowScroll,
}: DiscussionWorkspaceVirtualFeedSurfaceProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const isMobileLayout = useWorkspaceMobileLayout();
  const scrollMargin = useWorkspaceScrollMargin(
    feedRef,
    useWindowScroll,
    datasetKey,
    cards.length,
  );
  const estimateSize =
    (isMobileLayout
      ? DISCUSSION_WORKSPACE_MOBILE_CARD_HEIGHT
      : DISCUSSION_WORKSPACE_DESKTOP_CARD_HEIGHT) +
    DISCUSSION_WORKSPACE_CARD_GAP;

  if (useWindowScroll) {
    return (
      <DiscussionWorkspaceWindowVirtualFeed
        cards={cards}
        datasetKey={datasetKey}
        estimateSize={estimateSize}
        feedRef={feedRef}
        focusKey={focusKey}
        renderCard={renderCard}
        scrollMargin={scrollMargin}
      />
    );
  }

  return (
    <DiscussionWorkspaceScrollportVirtualFeed
      cards={cards}
      datasetKey={datasetKey}
      estimateSize={estimateSize}
      feedRef={feedRef}
      focusKey={focusKey}
      renderCard={renderCard}
      scrollMargin={scrollMargin}
    />
  );
}

interface DiscussionWorkspaceVirtualFeedProps {
  cards: readonly DiscussionWorkspaceCard[];
  datasetKey: string;
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  /** The row kept on screen (the discussion open beside the list). */
  focusKey?: string | null;
}

interface DiscussionWorkspaceVirtualFeedImplProps extends DiscussionWorkspaceVirtualFeedProps {
  estimateSize: number;
  feedRef: RefObject<HTMLDivElement | null>;
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  scrollMargin: number;
}

function DiscussionWorkspaceWindowVirtualFeed({
  cards,
  datasetKey,
  estimateSize,
  feedRef,
  focusKey,
  renderCard,
  scrollMargin,
}: DiscussionWorkspaceVirtualFeedImplProps) {
  const virtualizer = useWindowVirtualizer({
    count: cards.length,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getDiscussionWorkspaceItemKey(cards[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_WORKSPACE_VIRTUAL_OVERSCAN,
    scrollMargin,
  });

  useResetMeasurementsBeforePaint(
    virtualizer,
    feedRef,
    datasetKey,
    estimateSize,
  );
  useRemeasureRowsOnWidthChange(virtualizer, feedRef);
  useRemeasureRowsAfterScroll(virtualizer, feedRef, getWindowScrollTarget);
  useScrollFocusedRowIntoView(virtualizer, feedRef, cards, focusKey);

  return (
    <DiscussionWorkspaceVirtualRows
      cards={cards}
      feedRef={feedRef}
      renderCard={renderCard}
      scrollMargin={scrollMargin}
      virtualizer={virtualizer}
    />
  );
}

function DiscussionWorkspaceScrollportVirtualFeed({
  cards,
  datasetKey,
  estimateSize,
  feedRef,
  focusKey,
  renderCard,
  scrollMargin,
}: DiscussionWorkspaceVirtualFeedImplProps) {
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: getApplicationScrollElement,
    estimateSize: () => estimateSize,
    // Starts from where the page is: the virtualizer scrolls to its offset
    // when it attaches, and from 0 a list arriving (a tab switch) would
    // move the page to the top by itself.
    initialOffset: () => getApplicationScrollElement()?.scrollTop ?? 0,
    getItemKey: (index) => getDiscussionWorkspaceItemKey(cards[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_WORKSPACE_VIRTUAL_OVERSCAN,
    scrollMargin,
  });

  useResetMeasurementsBeforePaint(
    virtualizer,
    feedRef,
    datasetKey,
    estimateSize,
  );
  useRemeasureRowsOnWidthChange(virtualizer, feedRef);
  useRemeasureRowsAfterScroll(
    virtualizer,
    feedRef,
    getApplicationScrollElement,
  );
  useScrollFocusedRowIntoView(virtualizer, feedRef, cards, focusKey);

  return (
    <DiscussionWorkspaceVirtualRows
      cards={cards}
      feedRef={feedRef}
      renderCard={renderCard}
      scrollMargin={scrollMargin}
      virtualizer={virtualizer}
    />
  );
}

export function DiscussionWorkspaceVirtualFeed({
  cards,
  datasetKey,
  focusKey,
  renderCard,
}: DiscussionWorkspaceVirtualFeedProps) {
  const useWindowScroll = useWorkspaceWindowScroll();

  return (
    <DiscussionWorkspaceVirtualFeedSurface
      cards={cards}
      datasetKey={datasetKey}
      focusKey={focusKey}
      renderCard={renderCard}
      useWindowScroll={useWindowScroll}
    />
  );
}
