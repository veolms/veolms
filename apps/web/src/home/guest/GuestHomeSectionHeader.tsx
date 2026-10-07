import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "./GuestHomeLink";

/** A flat section heading: title, one supporting line, and a "view all" link. */
export function GuestHomeSectionHeader({
  id,
  title,
  subtitle,
  actionLabel = "View all",
  actionHref,
  onNavigatePage,
}: {
  id: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  onNavigatePage?: NavigateTo;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="min-w-0">
        <h2
          id={id}
          className="truncate text-xl font-bold tracking-[-0.02em] text-(--text) sm:text-2xl"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-(--muted)">{subtitle}</p>
        ) : null}
      </div>
      {actionHref ? (
        <GuestHomeLink
          href={actionHref}
          onNavigatePage={onNavigatePage}
          aria-label={`${actionLabel}: ${title}`}
          className={`group/all inline-flex shrink-0 items-center min-h-8 gap-1.5 rounded-md text-sm font-semibold whitespace-nowrap text-(--accent-ink,var(--accent)) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
        >
          {actionLabel}
          <ArrowRight
            size={16}
            weight="bold"
            aria-hidden="true"
            className="transition-transform duration-150 group-hover/all:translate-x-0.5 motion-reduce:transition-none"
          />
        </GuestHomeLink>
      ) : null}
    </div>
  );
}
