import { useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { Star } from "@phosphor-icons/react/Star";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { CourseReviewMeta } from "./reviewsData";

export interface CourseReviewHeaderProps {
  courseMeta: CourseReviewMeta;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenWriteModal: () => void;
  setNotice?: (message: string) => void;
}

export function CourseReviewHeader({
  courseMeta,
  isBookmarked,
  onToggleBookmark,
  onOpenWriteModal,
  setNotice,
}: CourseReviewHeaderProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const handleShare = () => {
    setMoreMenuOpen(false);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      setNotice?.("Link copied to clipboard!");
    } else {
      setNotice?.("Share link generated.");
    }
  };

  const handleGuidelines = () => {
    setMoreMenuOpen(false);
    setNotice?.("Review guidelines: Keep feedback respectful and constructive.");
  };

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      {/* Course Info */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm text-base tracking-tight"
          style={{ backgroundColor: courseMeta.badgeColor }}
          aria-hidden="true"
        >
          {courseMeta.badgeText}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base md:text-lg font-semibold text-[var(--text)] tracking-tight">
            {courseMeta.courseTitle}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs md:text-sm text-[var(--muted)] mt-0.5">
            <span className="flex items-center gap-1 font-medium text-[var(--text)]">
              <Star size={15} weight="fill" className="text-amber-400 fill-amber-400" />
              {courseMeta.averageRating.toFixed(1)}
            </span>
            <span>({courseMeta.totalReviews} reviews)</span>
            <span className="opacity-60">•</span>
            <span>Last updated {courseMeta.lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
        <button
          type="button"
          onClick={onOpenWriteModal}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs md:text-sm font-semibold text-[var(--on-accent,#ffffff)] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
        >
          <PencilSimple size={17} weight="bold" />
          <span>Write a review</span>
        </button>

        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark reviews"}
          aria-pressed={isBookmarked}
          title={isBookmarked ? "Bookmarked" : "Bookmark"}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] transition-all hover:bg-[var(--hover)] hover:text-[var(--text)] cursor-pointer ${
            isBookmarked
              ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]"
              : "text-[var(--muted)]"
          }`}
        >
          <BookmarkSimple
            size={19}
            weight={isBookmarked ? "fill" : "regular"}
          />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((prev) => !prev)}
            aria-label="More options"
            aria-expanded={moreMenuOpen}
            title="More actions"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition-all hover:bg-[var(--hover)] hover:text-[var(--text)] cursor-pointer"
          >
            <DotsThree size={22} weight="bold" />
          </button>

          {moreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setMoreMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-30 min-w-[190px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleShare}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs md:text-sm text-[var(--text)] transition-colors hover:bg-[var(--hover)] cursor-pointer"
                >
                  <ShareNetwork size={16} />
                  <span>Share course reviews</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleGuidelines}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs md:text-sm text-[var(--text)] transition-colors hover:bg-[var(--hover)] cursor-pointer"
                >
                  <WarningCircle size={16} />
                  <span>Review guidelines</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
