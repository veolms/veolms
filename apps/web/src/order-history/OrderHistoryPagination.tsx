import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/CaretRight";

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
  if (totalFilteredCount === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalFilteredCount);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-1 text-xs md:text-sm text-[var(--muted)]">
      {/* Range indicator */}
      <div>
        Showing <span className="font-semibold text-[var(--text)]">{startItem}</span> to{" "}
        <span className="font-semibold text-[var(--text)]">{endItem}</span> of{" "}
        <span className="font-semibold text-[var(--text)]">{totalFilteredCount}</span> orders
      </div>

      {/* Pagination button controls */}
      <div className="flex items-center gap-1.5" role="navigation" aria-label="Pagination Navigation">
        {/* Prev Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-surface)] text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <CaretLeft size={15} weight="bold" />
        </button>

        {/* Page Numbers */}
        {pageNumbers.map((page) => {
          const isActive = page === currentPage;
          return (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Page ${page}`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-[var(--accent)] text-[var(--on-accent,#ffffff)] shadow-sm"
                  : "border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              }`}
            >
              {page}
            </button>
          );
        })}

        {/* Next Page Button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-surface)] text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <CaretRight size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}
