import { Link, useLocation } from "react-router";
import { LegalLinks } from "../legal/LegalLinks";
import { findLegalPage } from "../legal/legalPages";

export function meta({ location }: { location: { pathname: string } }) {
  const page = findLegalPage(location.pathname);
  return page
    ? [{ title: page.title }, { name: "description", content: page.summary }]
    : [];
}

/**
 * One of the academy's legal and company pages (Terms of Service, Privacy
 * Policy, Refund Policy, Contact Us, About Us), open to anyone, signed in or
 * not, outside the app's shell.
 */
export default function LegalPageRoute() {
  const { pathname } = useLocation();
  const page = findLegalPage(pathname);

  return (
    <div className="min-h-dvh bg-(--canvas) px-4 py-10 text-(--text) sm:py-16">
      <main className="mx-auto w-full max-w-2xl">
        <Link
          to="/"
          className="text-sm font-semibold text-(--accent-ink,var(--accent)) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          ← Back to the academy
        </Link>
        {page ? (
          <article className="mt-6">
            <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
            <p className="mt-2 text-(--muted)">{page.summary}</p>
            {page.sections.map((section) => (
              <section key={section.heading} className="mt-8">
                <h2 className="text-lg font-semibold">{section.heading}</h2>
                <p className="mt-2 leading-7 text-(--text-secondary)">
                  {section.body}
                </p>
              </section>
            ))}
          </article>
        ) : (
          <p className="mt-6">This page could not be found.</p>
        )}
        <LegalLinks className="mt-14 border-t border-(--border) pt-6" />
      </main>
    </div>
  );
}
