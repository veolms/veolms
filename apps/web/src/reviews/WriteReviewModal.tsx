import { useEffect, useRef, useState } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface WriteReviewModalProps {
  courseTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (review: {
    rating: number;
    title: string;
    content: string;
    recommend: boolean;
  }) => void;
}

export function WriteReviewModal({
  courseTitle,
  isOpen,
  onClose,
  onSubmit,
}: WriteReviewModalProps) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [recommend, setRecommend] = useState(true);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useBackDismiss({ open: isOpen, onDismiss: onClose });

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setContent("");
      setRating(5);
      setRecommend(true);
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Please provide some feedback in your review.");
      return;
    }
    onSubmit({
      rating,
      title: title.trim() || "Course Review",
      content: content.trim(),
      recommend,
    });
  };

  const currentDisplayRating = hoverRating ?? rating;

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="write-review-title"
    >
      <div
        ref={modalRef}
        className="animate-in zoom-in-95 w-full max-w-lg rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-2xl duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="write-review-title"
              className="text-lg font-bold tracking-tight text-(--text) md:text-xl"
            >
              Write a review
            </h2>
            <p className="mt-0.5 text-xs text-(--muted)">{courseTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {/* Star Picker */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-(--text)">
              Your overall rating
            </label>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => {
                const starVal = index + 1;
                const isFilled = starVal <= currentDisplayRating;
                return (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(null)}
                    aria-label={`${starVal} star${starVal > 1 ? "s" : ""}`}
                    className="cursor-pointer p-1 text-(--accent) transition-transform hover:scale-110"
                  >
                    <Star
                      size={24}
                      weight={isFilled ? "fill" : "regular"}
                      className={isFilled ? "text-(--accent)" : "text-(--muted) opacity-40"}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-xs font-semibold text-(--text)">
                {currentDisplayRating} out of 5 stars
              </span>
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label
              htmlFor="review-title"
              className="mb-1.5 block text-xs font-semibold text-(--text)"
            >
              Review headline
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Excellent TypeScript course, clearly explained"
              className="w-full rounded-xl border border-(--border) bg-(--card-surface-raised,var(--canvas)) px-3.5 py-2 text-xs text-(--text) placeholder-(--muted) focus:border-(--accent) focus:ring-1 focus:ring-(--accent) focus:outline-none md:text-sm"
            />
          </div>

          {/* Review Content */}
          <div>
            <label
              htmlFor="review-content"
              className="mb-1.5 block text-xs font-semibold text-(--text)"
            >
              Detailed review
            </label>
            <textarea
              id="review-content"
              rows={4}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError("");
              }}
              placeholder="What did you like or dislike? How did this course help your learning?"
              className="w-full resize-none rounded-xl border border-(--border) bg-(--card-surface-raised,var(--canvas)) px-3.5 py-2.5 text-xs text-(--text) placeholder-(--muted) focus:border-(--accent) focus:ring-1 focus:ring-(--accent) focus:outline-none md:text-sm"
            />
            {error && <p className="mt-1 text-xs font-medium text-rose-500">{error}</p>}
          </div>

          {/* Recommendation Checkbox */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={recommend}
              onClick={() => setRecommend((prev) => !prev)}
              className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-colors ${
                recommend
                  ? "border-(--accent) bg-(--accent) text-white"
                  : "border-(--border) bg-transparent"
              }`}
            >
              {recommend && <Check size={13} weight="bold" />}
            </button>
            <span
              onClick={() => setRecommend((prev) => !prev)}
              className="cursor-pointer text-xs text-(--text-secondary) select-none"
            >
              I recommend this course to other learners
            </span>
          </div>

          {/* Action Buttons */}
          <div className="mt-2 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-(--border) px-4 py-2 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) md:text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] md:text-sm"
            >
              Submit review
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
