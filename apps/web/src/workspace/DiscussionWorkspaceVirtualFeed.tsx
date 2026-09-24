import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
        Math.abs(current - nextScrollMargin) > 1
          ? nextScrollMargin
          : current,
      );
    };

    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [datasetKey, feedRef, itemCount, useWindowScroll]);

  return scrollMargin;
}

function getDiscussionWorkspaceItemKey(card: DiscussionWorkspaceCard): string {
  return `${card.itemType}:${card.id}`;
}

interface DiscussionWorkspaceVirtualizer {
  getTotalSize: () => number;
  getVirtualItems: () => Array<{ index: number; start: number }>;
  measure: () => void;
  measureElement: (element: Element | null) => void;
}

interface DiscussionWorkspaceVirtualRowsProps {
  cards: readonly DiscussionWorkspaceCard[];
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  feedRef: RefObject<HTMLDivElement | null>;
  scrollMargin: number;
  virtualizer: DiscussionWorkspaceVirtualizer;
}

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
            className={
              virtualItem.index < cards.length - 1 ? "pb-2.5" : undefined
            }
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
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
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
  useWindowScroll: boolean;
}

function DiscussionWorkspaceVirtualFeedSurface({
  cards,
  datasetKey,
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
      renderCard={renderCard}
      scrollMargin={scrollMargin}
    />
  );
}

interface DiscussionWorkspaceVirtualFeedProps {
  cards: readonly DiscussionWorkspaceCard[];
  datasetKey: string;
  renderCard: (card: DiscussionWorkspaceCard) => ReactNode;
}

interface DiscussionWorkspaceVirtualFeedImplProps
  extends DiscussionWorkspaceVirtualFeedProps {
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

  useEffect(() => {
    virtualizer.measure();
  }, [datasetKey, estimateSize, virtualizer]);

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
  renderCard,
  scrollMargin,
}: DiscussionWorkspaceVirtualFeedImplProps) {
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: getApplicationScrollElement,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getDiscussionWorkspaceItemKey(cards[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_WORKSPACE_VIRTUAL_OVERSCAN,
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [datasetKey, estimateSize, virtualizer]);

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
  renderCard,
}: DiscussionWorkspaceVirtualFeedProps) {
  const useWindowScroll = useWorkspaceWindowScroll();

  return (
    <DiscussionWorkspaceVirtualFeedSurface
      cards={cards}
      datasetKey={datasetKey}
      renderCard={renderCard}
      useWindowScroll={useWindowScroll}
    />
  );
}
