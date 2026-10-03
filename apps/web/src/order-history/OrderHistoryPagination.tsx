import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";

export interface OrderHistoryPaginationProps {
  currentPage: number;
  totalPages: number;
  totalFilteredCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function OrderHistoryPagination({
  currentPage,
  totalPages,
  totalFilteredCount,
  pageSize,
  onPageChange,
}: OrderHistoryPaginationProps) {
  if (totalFilteredCount === 0 || totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalFilteredCount);
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstPage + index,
  );

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 py-4 text-xs text-(--muted) sm:flex-row sm:text-sm"
      aria-label="Purchase history pages"
    >
      <p>
        Showing{" "}
        <span className="font-semibold text-(--text)">
          {startItem}–{endItem}
        </span>{" "}
        of <span className="font-semibold text-(--text)">{totalFilteredCount}</span> orders
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="grid size-9 cursor-pointer place-items-center rounded-lg border border-(--border) bg-(--card-surface) text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CaretLeft size={16} />
        </button>
        {pageNumbers.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? "page" : undefined}
            aria-label={`Page ${page}`}
            className={`grid size-9 cursor-pointer place-items-center rounded-lg text-xs font-semibold transition-colors sm:text-sm ${
              page === currentPage
                ? "bg-(--accent) text-(--on-accent,#ffffff) shadow-xs"
                : "border border-(--border) bg-(--card-surface) text-(--muted) hover:bg-(--hover) hover:text-(--text)"
            }`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="grid size-9 cursor-pointer place-items-center rounded-lg border border-(--border) bg-(--card-surface) text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CaretRight size={16} />
        </button>
      </div>
    </nav>
  );
}
