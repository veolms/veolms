import { Link } from "react-router";
import { LEGAL_PAGES } from "./legalPages";

/**
 * The legal and company pages as one row of small links, for the foot of a
 * page or a form. Each opens in the same tab, as the app's own pages do.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal and company"
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-(--muted) ${className}`}
    >
      {LEGAL_PAGES.map((page) => (
        <Link
          key={page.path}
          to={page.path}
          className="rounded-sm underline-offset-2 hover:text-(--text) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          {page.title}
        </Link>
      ))}
    </nav>
  );
}
