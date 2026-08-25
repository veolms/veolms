import { useEffect, useRef, useState } from "react";
import { ChatTeardropDotsIcon as ChatTeardropDots } from "@phosphor-icons/react/ChatTeardropDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import type { NavigateTo } from "../routing/navigation";
import { CourseReviewHeader } from "./CourseReviewHeader";
import { NeedHelpWidget } from "./NeedHelpWidget";
import { RatingSummaryWidget } from "./RatingSummaryWidget";
import { ReviewCard } from "./ReviewCard";
import { ReviewFiltersBar } from "./ReviewFiltersBar";
import { ReviewHighlightsWidget } from "./ReviewHighlightsWidget";
import type { ReviewTabId } from "./reviewsData";
import { TopReviewersWidget } from "./TopReviewersWidget";
import { useReviewsFilter } from "./useReviewsFilter";
import { WriteReviewModal } from "./WriteReviewModal";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface ReviewsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const tabsConfig: readonly {
  id: ReviewTabId;
  label: string;
  Icon: typeof ListBullets;
}[] = [
  { id: "all", label: "All Reviews", Icon: ListBullets },
  { id: "with-comments", label: "With Comments", Icon: ChatTeardropText },
  { id: "highest-rated", label: "Highest Rated", Icon: Star },
  { id: "lowest-rated", label: "Lowest Rated", Icon: SlidersHorizontal },
  { id: "my-review", label: "My Review", Icon: UserCircle },
];

export function ReviewsPage({ onNavigatePage, setNotice }: ReviewsPageProps) {
  const {
    courseMeta,
    ratingSummary,
    highlights,
    topReviewers,
    reviews,
    totalFilteredCount,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    ratingFilter,
    setRatingFilter,
    sortBy,
    setSortBy,
    verifiedOnly,
    setVerifiedOnly,
    isBookmarked,
    toggleBookmark,
    isWriteModalOpen,
    setIsWriteModalOpen,
    isSupportModalOpen,
    setIsSupportModalOpen,
    toggleHelpful,
    reportReview,
    addReview,
    resetFilters,
  } = useReviewsFilter(setNotice);

  const [mobileSummaryExpanded, setMobileSummaryExpanded] = useState(true);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useBackDismiss({
    open: isSupportModalOpen,
    onDismiss: () => setIsSupportModalOpen(false),
  });

  // Keyboard shortcut listener (/ or Cmd+K to search, W to write review)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (!isInput) {
        if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
          e.preventDefault();
          document.getElementById("reviews-search-input")?.focus();
        } else if (e.key.toLowerCase() === "w" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setIsWriteModalOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setIsWriteModalOpen]);

  const handleContactSupport = () => {
    setIsSupportModalOpen(true);
  };

  return (
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="reviews-page-title"
    >
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="flex items-start justify-between gap-5 mb-6">
        <div>
          <h1
            id="reviews-page-title"
            className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] tracking-[-0.055em] leading-[1.02] text-(--text)"
          >
            Reviews
          </h1>
          <p className="mt-2 text-[0.92rem] text-(--muted) leading-normal">
            See what learners are saying about their learning experience.
          </p>
        </div>
        <span
          className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[19px] text-(--accent) transition-transform hover:scale-105"
          style={{
            background: "color-mix(in srgb, var(--accent) 16%, var(--surface))",
            boxShadow:
              "0 14px 26px color-mix(in srgb, var(--accent-shadow) 40%, transparent)",
          }}
          aria-hidden="true"
        >
          <ChatTeardropDots size={28} weight="duotone" />
        </span>
      </header>

      {/* Course Header Banner */}
      <section
        aria-label="Course details and actions"
        className="mb-5 rounded-[18px] border border-(--border) bg-(--card-surface) p-5 md:p-6 transition-all"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <CourseReviewHeader
          courseMeta={courseMeta}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
          onOpenWriteModal={() => setIsWriteModalOpen(true)}
          setNotice={setNotice}
        />
      </section>

      {/* Tab Navigation Bar with delicate thin bottom line and transparent background */}
      <nav
        aria-label="Review categories"
        className="scrollbar-none mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-transparent md:gap-3"
        role="tablist"
      >
        {tabsConfig.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative inline-flex min-h-11.5 shrink-0 items-center gap-2 px-3.5 pb-2.5 pt-1 text-xs md:text-sm font-[650] transition-colors cursor-pointer select-none ${
                isActive
                  ? "text-(--text)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
            >
              <Icon
                size={18}
                weight={isActive ? "fill" : "regular"}
                className={
                  isActive ? "text-(--accent)" : "text-(--muted)"
                }
              />
              <span>{tab.label}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-(--accent)"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Filter and Search Toolbar */}
      <section aria-label="Review filters" className="mb-5">
        <ReviewFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          ratingFilter={ratingFilter}
          onRatingFilterChange={setRatingFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          verifiedOnly={verifiedOnly}
          onToggleVerified={() => setVerifiedOnly((prev) => !prev)}
        />
      </section>

      {/* Mobile-only Collapsible Rating Summary */}
      <div className="mb-5 block lg:hidden">
        <RatingSummaryWidget
          summary={ratingSummary}
          selectedRatingFilter={ratingFilter}
          onSelectRatingFilter={setRatingFilter}
          isCollapsible={true}
          isExpanded={mobileSummaryExpanded}
          onToggleExpand={() => setMobileSummaryExpanded((prev) => !prev)}
        />
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Left / Main Column: Reviews Feed (8 of 12 columns on desktop) */}
        <main className="flex flex-col gap-4 lg:col-span-8 min-w-0">
          {reviews.length > 0 ? (
            reviews.map((item) => (
              <ReviewCard
                key={item.id}
                review={item}
                onToggleHelpful={toggleHelpful}
                onReportReview={reportReview}
                setNotice={setNotice}
              />
            ))
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-[18px] border border-(--border) bg-(--card-surface) p-12 text-center"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--hover) text-(--muted) mb-3">
                <Star size={24} />
              </div>
              <h3 className="text-base font-semibold text-(--text)">
                No reviews found
              </h3>
              <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted)">
                {searchQuery || ratingFilter !== "all" || verifiedOnly
                  ? "Try changing your search query or reset your active filters to view all reviews."
                  : "There are no reviews in this category yet."}
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}

          {/* Pagination note */}
          {reviews.length > 0 && (
            <div className="mt-2 flex items-center justify-center pt-2">
              <button
                type="button"
                onClick={() => setNotice?.("All reviews currently loaded.")}
                className="rounded-xl border border-(--border) bg-(--card-surface) px-5 py-2.5 text-xs md:text-sm font-medium text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                Showing {totalFilteredCount} reviews
              </button>
            </div>
          )}
        </main>

        {/* Right Column: Sidebar Widgets (4 of 12 columns on desktop) */}
        <aside className="flex flex-col gap-5 lg:col-span-4 min-w-0">
          {/* Desktop Rating Summary */}
          <div className="hidden lg:block">
            <RatingSummaryWidget
              summary={ratingSummary}
              selectedRatingFilter={ratingFilter}
              onSelectRatingFilter={setRatingFilter}
            />
          </div>

          {/* Highlights Widget */}
          <ReviewHighlightsWidget highlights={highlights} />

          {/* Top Reviewers Widget */}
          <TopReviewersWidget
            reviewers={topReviewers}
            onSelectReviewer={(name) => setSearchQuery(name)}
            onViewAll={() => setActiveTab("all")}
          />

          {/* Need Help Widget */}
          <NeedHelpWidget onContactSupport={handleContactSupport} />
        </aside>
      </div>

      {/* Write Review Modal */}
      <WriteReviewModal
        courseTitle={courseMeta.courseTitle}
        isOpen={isWriteModalOpen}
        onClose={() => setIsWriteModalOpen(false)}
        onSubmit={addReview}
      />

      {/* Contact Support Dialog Modal */}
      {isSupportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-[18px] border border-(--border) bg-(--card-surface) p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            style={{
              boxShadow: "var(--card-floating-shadow,var(--card-shadow))",
            }}
          >
            <h2 className="text-lg font-bold text-(--text)">
              Contact Learner Support
            </h2>
            <p className="mt-2 text-xs md:text-sm text-(--text-secondary)">
              Have questions or feedback regarding this course&apos;s reviews? Our
              support team is here to help 24/7.
            </p>
            <div className="mt-4 rounded-xl bg-(--card-surface-raised,var(--hover)) p-3.5 text-xs text-(--muted)">
              <span>Support email: </span>
              <strong className="text-(--text)">
                support@procodrr.com
              </strong>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                className="rounded-xl bg-(--accent) px-4 py-2 text-xs md:text-sm font-semibold text-(--on-accent,#ffffff) hover:opacity-90 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
