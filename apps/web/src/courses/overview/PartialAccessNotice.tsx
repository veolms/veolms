import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import type { PartialAccessOffer } from "@veolms/contracts";
import { Button } from "../../components/Button";

export interface PartialAccessNoticeProps {
  /** The part sold from this page's link; null when the link is unknown. */
  offer: PartialAccessOffer | null;
  courseTitle: string;
  /** How many sections the course has. */
  totalSections: number;
  /**
   * Set when the link could not be checked (the request failed, which says
   * nothing about the link): asks for it again.
   */
  onRetry?: () => void;
}

/**
 * Over the price on a course page opened from a partial access link: what
 * is sold here is part of the course, which sections it opens, and that the
 * rest can be unlocked later for the difference (the upgrade, priced by the
 * server). The curriculum below marks each section the same way.
 */
export function PartialAccessNotice({
  offer,
  courseTitle,
  totalSections,
  onRetry,
}: PartialAccessNoticeProps) {
  if (!offer && onRetry) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-4 text-sm text-(--text-secondary)">
        <span>
          This partial access could not be loaded. Check your connection and try
          again.
        </span>
        <Button type="button" variant="quiet" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-4 text-sm text-(--text-secondary)">
        This partial access link no longer works. The full course is offered
        below.
      </div>
    );
  }

  const opened = offer.sectionIds.length;
  const locked = Math.max(0, totalSections - opened);
  return (
    <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2.5 py-1 text-[0.72rem] font-bold tracking-wide text-(--accent-ink,var(--accent)) uppercase">
        <PuzzlePiece size={13} weight="bold" aria-hidden="true" />
        Partial access
      </span>
      <p className="mt-2.5 mb-0 text-[1.02rem] leading-snug font-semibold text-(--text)">
        {offer.title}
      </p>
      <p className="mt-1.5 mb-0 text-sm leading-relaxed text-(--text-secondary)">
        Opens {opened} of {totalSections} sections of {courseTitle}.
        {locked > 0
          ? ` You can unlock the remaining ${locked === 1 ? "section" : `${locked} sections`} anytime later by paying just the difference.`
          : ""}
      </p>
      {!offer.onSale && (
        <p className="mt-2 mb-0 text-sm font-medium text-rose-500">
          This partial access is not on sale right now.
        </p>
      )}
    </div>
  );
}
