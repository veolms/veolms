import { useState } from "react";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import type { ReviewItem } from "./reviewsData";
import { useBackDismiss } from "../navigation/useBackDismiss";

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

  useBackDismiss({ open: menuOpen, onDismiss: () => setMenuOpen(false) });

  const handleCopyLink = () => {
    setMenuOpen(false);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(`${window.location.origin}/reviews#${review.id}`);
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
      className="group relative rounded-[18px] border border-(--border) bg-(--card-surface-raised,var(--surface)) p-5 transition-all duration-200 hover:bg-(--card-surface-hover,var(--hover)) md:p-6"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <img
            src={review.avatarUrl}
            alt={review.authorName}
            className="h-11 w-11 shrink-0 rounded-full border border-(--border) bg-(--surface-strong) object-cover"
            loading="lazy"
            onError={(e) => {
              // Graceful avatar fallback
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-bold text-(--text) md:text-base">
                {review.authorName}
              </h3>
              {review.isVerifiedLearner && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                  <ShieldCheck size={14} weight="fill" />
                  <span>Verified learner</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-(--muted)">{review.timestamp}</p>
          </div>
        </div>

        {/* Card Options Menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={`Options for ${review.authorName}'s review`}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="animate-in fade-in zoom-in-95 absolute top-full right-0 z-30 mt-1 min-w-40 rounded-xl border border-(--border) bg-(--card-surface) p-1.5 shadow-xl backdrop-blur-md duration-100"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyLink}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover)"
                >
                  <LinkSimple size={14} />
                  <span>Copy link</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleReport}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 hover:bg-(--hover)"
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
          className="flex items-center gap-0.5 text-(--accent)"
          aria-label={`Rating: ${review.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }).map((_, idx) => (
            <Star
              key={idx}
              size={16}
              weight={idx < review.rating ? "fill" : "regular"}
              className={idx < review.rating ? "text-(--accent)" : "text-(--muted) opacity-30"}
            />
          ))}
        </div>
        <h4 className="text-sm font-bold tracking-tight text-(--text) md:text-base">
          {review.title}
        </h4>
      </div>

      {/* Review Content */}
      <p className="mt-2 text-xs leading-relaxed text-(--text-secondary) md:text-sm">
        {review.content}
      </p>

      {/* Instructor Reply if present */}
      {review.reply && (
        <div className="mt-4 ml-2 rounded-[14px] border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_79%,var(--canvas))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)] md:ml-4 md:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src={review.reply.avatarUrl}
                alt={review.reply.authorName}
                className="h-7 w-7 rounded-full border border-(--border) object-cover"
                loading="lazy"
              />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-(--text)">{review.reply.authorName}</span>
                <span className="rounded-full border border-(--accent-border) bg-(--accent-soft) px-2 py-0.5 text-[10px] font-medium text-(--accent)">
                  {review.reply.authorRole}
                </span>
                <span className="text-(--muted) opacity-80">{review.reply.timestamp}</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-(--text-secondary) md:text-sm">
            {review.reply.content}
          </p>
        </div>
      )}

      {/* Card Footer Actions */}
      <div className="mt-4 flex items-center gap-4 text-xs text-(--muted)">
        <button
          type="button"
          onClick={() => onToggleHelpful(review.id)}
          aria-label={`${review.helpfulCount} people found this helpful`}
          aria-pressed={review.isHelpfulByUser}
          className={`inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-(--text) ${
            review.isHelpfulByUser ? "font-semibold text-(--accent)" : ""
          }`}
        >
          <span className="opacity-60">•</span>
          <span>Helpful</span>
          <ThumbsUp size={14} weight={review.isHelpfulByUser ? "fill" : "regular"} />
          <span>{review.helpfulCount}</span>
        </button>

        <button
          type="button"
          onClick={() => onReportReview(review.id)}
          className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-(--text)"
        >
          <Flag size={13} />
          <span>Report</span>
        </button>
      </div>
    </article>
  );
}
