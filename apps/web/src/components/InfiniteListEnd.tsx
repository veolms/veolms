import { useEffect, useRef } from "react";

import { LoadingSpinnerIcon } from "./LoadingSpinner";

/**
 * The end of an infinite list (as the coupons, students and support lists
 * load more): when it scrolls near the screen the next page loads, with a
 * small spinner while it does. The button is there for a page whose end
 * never scrolls into view by itself (a short list in a tall window, or a
 * browser without IntersectionObserver). Nothing shows once all is loaded.
 */
export function InfiniteListEnd({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  label,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  /** What is loading, for screen readers and the button ("students"). */
  label: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchRef.current();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage]);

  if (!hasNextPage) return null;
  return (
    <div ref={endRef} className="flex justify-center p-4">
      {isFetchingNextPage ? (
        <span role="status" aria-label={`Loading more ${label}`}>
          <LoadingSpinnerIcon size={18} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          className="cursor-pointer rounded-xl border border-(--border) bg-(--card-surface) px-4 py-2 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          Load more {label}
        </button>
      )}
    </div>
  );
}
