import { useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { Flag } from "@phosphor-icons/react/Flag";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Star } from "@phosphor-icons/react/Star";
import { ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import type { ReviewItem } from "./reviewsData";

export interface ReviewCardProps {
  review: ReviewItem;
  onToggleHelpful: (id: string) => void;
  onReportReview: (id: string) => void;
  setNotice?: (message: string) => void;
}

export function ReviewCard({
  review,
  onToggleHelpful,
  onReportReview,
  setNotice,
}: ReviewCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleCopyLink = () => {
    setMenuOpen(false);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        `${window.location.origin}/reviews#${review.id}`,
      );
      setNotice?.("Review link copied to clipboard.");
    }
  };

  const handleReport = () => {
    setMenuOpen(false);
    onReportReview(review.id);
  };

  return (
    <article
      id={review.id}
      className="group relative rounded-[18px] border border-[var(--border)] bg-[var(--card-surface-raised,var(--surface))] p-5 md:p-6 transition-all duration-200 hover:bg-[var(--card-surface-hover,var(--hover))]"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={review.avatarUrl}
            alt={review.authorName}
            className="h-11 w-11 flex-shrink-0 rounded-full object-cover border border-[var(--border)] bg-[var(--surface-strong)]"
            loading="lazy"
            onError={(e) => {
              // Graceful avatar fallback
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-bold text-sm md:text-base text-[var(--text)]">
                {review.authorName}
              </h3>
              {review.isVerifiedLearner && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  <ShieldCheck size={14} weight="fill" />
                  <span>Verified learner</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {review.timestamp}
            </p>
          </div>
        </div>

        {/* Card Options Menu */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={`Options for ${review.authorName}'s review`}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-30 min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyLink}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                >
                  <LinkSimple size={14} />
                  <span>Copy link</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleReport}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 hover:bg-[var(--hover)] cursor-pointer"
                >
                  <Flag size={14} />
                  <span>Report review</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Star Rating & Headline Row */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <div
          className="flex items-center gap-0.5 text-[var(--accent)]"
          aria-label={`Rating: ${review.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }).map((_, idx) => (
            <Star
              key={idx}
              size={16}
              weight={idx < review.rating ? "fill" : "regular"}
              className={
                idx < review.rating
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted)] opacity-30"
              }
            />
          ))}
        </div>
        <h4 className="font-bold text-sm md:text-base text-[var(--text)] tracking-tight">
          {review.title}
        </h4>
      </div>

      {/* Review Content */}
      <p className="mt-2 text-xs md:text-sm leading-relaxed text-[var(--text-secondary)]">
        {review.content}
      </p>

      {/* Instructor Reply if present */}
      {review.reply && (
        <div className="mt-4 rounded-[14px] p-3.5 md:p-4 bg-[color-mix(in_srgb,var(--surface-strong)_79%,var(--canvas))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)] border border-[var(--border)] ml-2 md:ml-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={review.reply.avatarUrl}
                alt={review.reply.authorName}
                className="h-7 w-7 rounded-full object-cover border border-[var(--border)]"
                loading="lazy"
              />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-[var(--text)]">
                  {review.reply.authorName}
                </span>
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] border border-[var(--accent-border)]">
                  {review.reply.authorRole}
                </span>
                <span className="text-[var(--muted)] opacity-80">
                  {review.reply.timestamp}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs md:text-sm leading-relaxed text-[var(--text-secondary)]">
            {review.reply.content}
          </p>
        </div>
      )}

      {/* Card Footer Actions */}
      <div className="mt-4 flex items-center gap-4 text-xs text-[var(--muted)]">
        <button
          type="button"
          onClick={() => onToggleHelpful(review.id)}
          aria-label={`${review.helpfulCount} people found this helpful`}
          aria-pressed={review.isHelpfulByUser}
          className={`inline-flex items-center gap-1.5 transition-colors hover:text-[var(--text)] cursor-pointer ${
            review.isHelpfulByUser ? "font-semibold text-[var(--accent)]" : ""
          }`}
        >
          <span className="opacity-60">•</span>
          <span>Helpful</span>
          <ThumbsUp
            size={14}
            weight={review.isHelpfulByUser ? "fill" : "regular"}
          />
          <span>{review.helpfulCount}</span>
        </button>

        <button
          type="button"
          onClick={() => onReportReview(review.id)}
          className="inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          <Flag size={13} />
          <span>Report</span>
        </button>
      </div>
    </article>
  );
}
