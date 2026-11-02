import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import type { Comment } from "../CommentCard";
import { getApplicationScrollElement } from "../../shell/applicationScroll";
import { watchLayoutResize } from "../../shell/phoneVideoFullscreenHold";
import { getClientEntityId } from "../../services/learning-interactions/interaction-entities";

const DISCUSSION_VIRTUAL_OVERSCAN = 5;
const DISCUSSION_VIRTUAL_ESTIMATE_SIZE = 240;

type DiscussionVirtualItem = {
  index: number;
  start: number;
  size: number;
  end: number;
};

type DiscussionVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => DiscussionVirtualItem[];
  scrollOffset: number | null;
  measureElement: (element: HTMLDivElement | null) => void;
};

type DiscussionVirtualFeedProps = {
  entries: Comment[];
  protectedEntryIndices: ReadonlySet<number>;
  renderEntry: (entry: Comment) => React.ReactNode;
  layoutKey?: string;
  /** The entries are the last list's, kept while a new one loads. */
  stale?: boolean;
};

/**
 * How many entries from the top stay mounted once the browser has had idle
 * time to mount them (99 in 100 lessons have fewer threads; a page of the
 * list holds 20). Beyond that the list is virtual as before.
 */
const DISCUSSION_MOUNTED_AHEAD_LIMIT = 60;
/** Entries mounted per idle moment. */
const DISCUSSION_MOUNTED_AHEAD_STEP = 2;

/**
 * The first entries of the list, mounted ahead of the reader in idle time
 * and then kept, so that a scroll through them adds and removes nothing.
 *
 * Why: on a lesson page every element added to the page costs 15 ms or more
 * of style work whatever it is (Chrome checks the page's many `:has()` rules
 * against each insertion; an empty div measured 15 ms on 2026-11-02), and a
 * comment card also takes 10 to 25 ms to render. Mounted as it scrolled into
 * range, each card dropped frames of the scroll.
 */
function useEntriesMountedAhead(entries: Comment[]) {
  const firstKey = entries[0] ? getClientEntityId(entries[0]) : null;
  const target = Math.min(entries.length, DISCUSSION_MOUNTED_AHEAD_LIMIT);
  const [mounted, setMounted] = useState({ firstKey, count: 0 });
  // Another list (a new filter) starts again from the top.
  const count = mounted.firstKey === firstKey ? mounted.count : 0;
  // The end of the range the reader sees: entries up to there are mounted
  // anyway, so mounting ahead starts after it.
  const rangeEndRef = useRef(0);

  useEffect(() => {
    if (count >= target) return undefined;
    const mountMore = () =>
      setMounted({
        firstKey,
        count: Math.min(
          target,
          Math.max(count, rangeEndRef.current + 1) +
            DISCUSSION_MOUNTED_AHEAD_STEP,
        ),
      });
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(mountMore);
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(mountMore, 100);
    return () => window.clearTimeout(timer);
  }, [count, firstKey, target]);

  return { count, rangeEndRef };
}

function useDiscussionRangeExtractor(
  entries: Comment[],
  protectedEntryIndices: ReadonlySet<number>,
) {
  const mountedAhead = useEntriesMountedAhead(entries);
  const mountedAheadCount = mountedAhead.count;
  const { rangeEndRef } = mountedAhead;
  return useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      rangeEndRef.current = range.endIndex;
      const indices = new Set(defaultRangeExtractor(range));
      protectedEntryIndices.forEach((index) => {
        if (index >= 0 && index < entries.length) indices.add(index);
      });
      for (let index = 0; index < mountedAheadCount; index += 1) {
        if (index < entries.length) indices.add(index);
      }
      return Array.from(indices).sort((left, right) => left - right);
    },
    [entries.length, mountedAheadCount, protectedEntryIndices, rangeEndRef],
  );
}

function DiscussionVirtualFeedRows({
  feedRef,
  entries,
  renderEntry,
  virtualizer,
  scrollMargin = 0,
  stale = false,
}: DiscussionVirtualFeedProps & {
  feedRef?: React.Ref<HTMLDivElement>;
  virtualizer: DiscussionVirtualizer;
  scrollMargin?: number;
}) {
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      data-discussion-virtual-feed
      data-entry-count={entries.length}
      ref={feedRef}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
      aria-busy={stale || undefined}
      className={`relative w-full shrink-0 transition-opacity duration-150 motion-reduce:transition-none ${stale ? "opacity-50" : ""}`}
    >
      {virtualItems.map((virtualItem) => {
        const entry = entries[virtualItem.index];
        if (!entry) return null;
        return (
          <div
            key={getClientEntityId(entry)}
            data-index={virtualItem.index}
            data-client-id={getClientEntityId(entry)}
            ref={virtualizer.measureElement}
            className={virtualItem.index < entries.length - 1 ? "pb-1" : ""}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {renderEntry(entry)}
          </div>
        );
      })}
    </div>
  );
}

function DiscussionViewportVirtualFeed({
  viewportRef,
  ...props
}: DiscussionVirtualFeedProps & {
  viewportRef: React.RefObject<HTMLElement | null>;
}) {
  const rangeExtractor = useDiscussionRangeExtractor(
    props.entries,
    props.protectedEntryIndices,
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const marginMeasuredRef = useRef(false);
  const phoneScrollMargin = useDiscussionPhoneVirtualFeedScrollMargin(
    feedRef,
    viewportRef,
    marginMeasuredRef,
  );

  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => viewportRef.current,
    // The list can mount while the page is already scrolled (a linked
    // comment, a filter change). Without this the virtualizer assumes it
    // starts at the top and scrolls the page there.
    initialOffset: () => viewportRef.current?.scrollTop ?? 0,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor,
    scrollMargin: phoneScrollMargin,
  });
  keepScrollAdjustmentsUntilMeasured(virtualizer, marginMeasuredRef);

  return (
    <>
      <DiscussionVirtualFeedRows
        {...props}
        feedRef={feedRef}
        virtualizer={{
          ...virtualizer,
          measureElement: (element) => virtualizer.measureElement(element),
        }}
        scrollMargin={phoneScrollMargin}
      />
    </>
  );
}

function getDiscussionVirtualFeedScrollMargin(
  feed: HTMLDivElement | null,
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

/**
 * The virtualizer keeps the reader's place by shifting the scroll position
 * when an entry above them turns out taller or shorter than estimated. On
 * its first pass the list does not yet know how far down the page it starts,
 * so it takes entries that are really below the reader for ones above them
 * and moves the page. Until that distance has been measured it must not
 * adjust anything; after that this is the library's own rule.
 */
function keepScrollAdjustmentsUntilMeasured<
  TScrollElement extends Element | Window,
>(
  virtualizer: Virtualizer<TScrollElement, Element>,
  measuredRef: React.RefObject<boolean>,
) {
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance,
  ) =>
    measuredRef.current &&
    item.start + item.size <=
      (instance.scrollOffset ?? 0) + instance.scrollAdjustments &&
    instance.scrollDirection !== "backward";
}

function useDiscussionPhoneVirtualFeedScrollMargin(
  feedRef: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<HTMLElement | null>,
  measuredRef: React.RefObject<boolean>,
) {
  const [phoneScrollMargin, setPhoneScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const scrollport = viewportRef.current;
    const header = scrollport?.querySelector<HTMLElement>(
      "[data-discussion-scroll-header]",
    );
    if (!scrollport || !header) return undefined;

    const syncScrollMargin = () => {
      measuredRef.current = true;
      const nextScrollMargin = getDiscussionVirtualFeedScrollMargin(
        feedRef.current,
        scrollport,
      );
      setPhoneScrollMargin((current) =>
        Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
      );
    };

    syncScrollMargin();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncScrollMargin);
      return () => window.removeEventListener("resize", syncScrollMargin);
    }

    const resizeObserver = new ResizeObserver(syncScrollMargin);
    resizeObserver.observe(header);
    // The video scrolls in the same column above the list, and resizing it
    // moves the list as much as the header does.
    const videoSlot = scrollport.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    if (videoSlot) resizeObserver.observe(videoSlot);
    return () => {
      resizeObserver.disconnect();
    };
  }, [feedRef, measuredRef, viewportRef]);

  return phoneScrollMargin;
}

function useDiscussionScrollMode() {
  const [useWindowScroll, setUseWindowScroll] = useState(true);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };

    syncScrollMode();
    return watchLayoutResize(syncScrollMode);
  }, []);

  return useWindowScroll;
}

function useDiscussionVirtualFeedScrollMargin(
  feedRef: React.RefObject<HTMLDivElement | null>,
  useWindowScroll: boolean,
  layoutKey: string | undefined,
  itemCount: number,
  measuredRef: React.RefObject<boolean>,
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      measuredRef.current = true;
      const nextScrollMargin = getDiscussionVirtualFeedScrollMargin(
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
  }, [feedRef, itemCount, layoutKey, measuredRef, useWindowScroll]);

  return scrollMargin;
}

function DiscussionWindowVirtualFeed(props: DiscussionVirtualFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const marginMeasuredRef = useRef(false);
  const scrollMargin = useDiscussionVirtualFeedScrollMargin(
    feedRef,
    true,
    props.layoutKey,
    props.entries.length,
    marginMeasuredRef,
  );
  const virtualizer = useWindowVirtualizer({
    count: props.entries.length,
    // The list can mount while the page is already scrolled (a linked
    // comment, a filter change). Without this the virtualizer assumes it
    // starts at the top and scrolls the page there.
    initialOffset: () => (typeof window === "undefined" ? 0 : window.scrollY),
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor: useDiscussionRangeExtractor(
      props.entries,
      props.protectedEntryIndices,
    ),
    scrollMargin,
  });
  keepScrollAdjustmentsUntilMeasured(virtualizer, marginMeasuredRef);

  useEffect(() => {
    virtualizer.measure();
  }, [props.layoutKey, virtualizer]);

  return (
    <DiscussionVirtualFeedRows
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={{
        ...virtualizer,
        measureElement: (element) => virtualizer.measureElement(element),
      }}
    />
  );
}

function DiscussionScrollportVirtualFeed(props: DiscussionVirtualFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const marginMeasuredRef = useRef(false);
  const scrollMargin = useDiscussionVirtualFeedScrollMargin(
    feedRef,
    false,
    props.layoutKey,
    props.entries.length,
    marginMeasuredRef,
  );
  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: getApplicationScrollElement,
    // The list can mount while the page is already scrolled (a linked
    // comment, a filter change). Without this the virtualizer assumes it
    // starts at the top and scrolls the page there.
    initialOffset: () => getApplicationScrollElement()?.scrollTop ?? 0,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor: useDiscussionRangeExtractor(
      props.entries,
      props.protectedEntryIndices,
    ),
    scrollMargin,
  });
  keepScrollAdjustmentsUntilMeasured(virtualizer, marginMeasuredRef);

  useEffect(() => {
    virtualizer.measure();
  }, [props.layoutKey, virtualizer]);

  return (
    <DiscussionVirtualFeedRows
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={{
        ...virtualizer,
        measureElement: (element) => virtualizer.measureElement(element),
      }}
    />
  );
}

function DiscussionDesktopVirtualFeed(props: DiscussionVirtualFeedProps) {
  const useWindowScroll = useDiscussionScrollMode();

  if (useWindowScroll) return <DiscussionWindowVirtualFeed {...props} />;
  return <DiscussionScrollportVirtualFeed {...props} />;
}

export function DiscussionVirtualFeed({
  viewportRef,
  isPhone,
  ...props
}: DiscussionVirtualFeedProps & {
  viewportRef: React.RefObject<HTMLElement | null>;
  isPhone: boolean;
}) {
  if (isPhone) {
    return (
      <DiscussionViewportVirtualFeed viewportRef={viewportRef} {...props} />
    );
  }

  return <DiscussionDesktopVirtualFeed {...props} />;
}
