import { useState } from "react";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react/DotsThree";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { CourseReviewMeta } from "./reviewsData";
import { useBackDismiss } from "../navigation/useBackDismiss";

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

  useBackDismiss({
    open: moreMenuOpen,
    onDismiss: () => setMoreMenuOpen(false),
  });

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
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold tracking-tight text-white shadow-sm"
          style={{ backgroundColor: courseMeta.badgeColor }}
          aria-hidden="true"
        >
          {courseMeta.badgeText}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-(--text) md:text-lg">
            {courseMeta.courseTitle}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-(--muted) md:text-sm">
            <span className="flex items-center gap-1 font-medium text-(--text)">
              <Star size={15} weight="fill" className="fill-amber-400 text-amber-400" />
              {courseMeta.averageRating.toFixed(1)}
            </span>
            <span>({courseMeta.totalReviews} reviews)</span>
            <span className="opacity-60">•</span>
            <span>Last updated {courseMeta.lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
        <button
          type="button"
          onClick={onOpenWriteModal}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-(--accent) px-4 py-2.5 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] md:text-sm"
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
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-(--border) transition-all hover:bg-(--hover) hover:text-(--text) ${
            isBookmarked
              ? "border-(--accent-border) bg-(--accent-soft) text-(--accent)"
              : "text-(--muted)"
          }`}
        >
          <BookmarkSimple size={19} weight={isBookmarked ? "fill" : "regular"} />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((prev) => !prev)}
            aria-label="More options"
            aria-expanded={moreMenuOpen}
            title="More actions"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-(--border) text-(--muted) transition-all hover:bg-(--hover) hover:text-(--text)"
          >
            <DotsThree size={22} weight="bold" />
          </button>

          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMoreMenuOpen(false)} />
              <div
                role="menu"
                className="animate-in fade-in zoom-in-95 absolute top-full right-0 z-30 mt-1.5 min-w-47.5 rounded-xl border border-(--border) bg-(--card-surface) p-1.5 shadow-xl backdrop-blur-md duration-100"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleShare}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-(--text) transition-colors hover:bg-(--hover) md:text-sm"
                >
                  <ShareNetwork size={16} />
                  <span>Share course reviews</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleGuidelines}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-(--text) transition-colors hover:bg-(--hover) md:text-sm"
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
