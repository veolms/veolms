import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PrinterIcon as Printer } from "@phosphor-icons/react/Printer";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router";
import { procodrrLogoSvg } from "../shell/academyShellConstants";
import type { LegalDocument } from "./legalDocument";
import {
  LEGAL_PAGES,
  LEGAL_SUPPORT_EMAIL,
  type LegalPagePath,
} from "./legalPages";

const PAGE_ICONS: Record<
  LegalPagePath,
  ComponentType<{ className?: string; weight?: "regular" | "bold" }>
> = {
  "/terms": FileText,
  "/privacy": ShieldCheck,
  "/policies": ArrowCounterClockwise,
  "/community-guidelines": UsersThree,
  "/about": Info,
  "/contact": EnvelopeSimple,
  "/delete-account": Trash,
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

const GROUP_LABEL =
  "px-3 pb-2 text-[11px] font-bold tracking-[0.11em] text-(--muted) uppercase";

// The document's own markup (from the ProCodrr website) carries no classes:
// its sections, lists, tables and links are styled from here.
const PROSE = [
  "text-base leading-[1.75] text-(--text-secondary)",
  "[&_p]:mb-3.5",
  "[&_a]:font-semibold [&_a]:text-(--accent-ink,var(--accent)) [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-(--text)",
  "[&_strong]:font-semibold [&_strong]:text-(--text)",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-(--text)",
  "[&_ul]:mb-3.5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2.5 [&_ul>li]:relative [&_ul>li]:pl-5 [&_ul>li]:leading-[1.65]",
  "[&_ul>li]:before:absolute [&_ul>li]:before:top-[0.68em] [&_ul>li]:before:left-0.5 [&_ul>li]:before:size-1.5 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-(--accent) [&_ul>li]:before:content-['']",
  "[&_ol]:mb-3.5 [&_ol]:list-decimal [&_ol]:space-y-2.5 [&_ol]:pl-6 [&_ol>li]:pl-1 [&_ol>li]:marker:font-semibold [&_ol>li]:marker:text-(--accent)",
  "[&_address]:not-italic",
  "[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-(--border) [&_table]:text-sm [&_table]:leading-6",
  "[&_th]:bg-(--surface) [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-(--text) [&_th]:align-top",
  "[&_td]:border-t [&_td]:border-(--border) [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:align-top",
  "[&_section]:scroll-mt-6 [&_section]:border-t [&_section]:border-(--border) [&_section]:pt-8.5 [&_section]:pb-5",
  "[&_h2]:mb-3.5 [&_h2]:flex [&_h2]:items-baseline [&_h2]:gap-3.5 [&_h2]:text-[19px] sm:[&_h2]:text-[22px] [&_h2]:leading-[1.3] [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-(--text)",
  "[&_h2>span]:shrink-0 [&_h2>span]:text-[13px] [&_h2>span]:font-bold [&_h2>span]:text-(--accent-ink,var(--accent)) [&_h2>span]:tabular-nums",
].join(" ");

/** The id of the section being read: the last whose top has passed a line near the top of the window. */
function useCurrentSection(sections: LegalDocument["sections"]) {
  const [current, setCurrent] = useState(sections[0]?.id);
  useEffect(() => {
    const update = () => {
      let next = sections[0]?.id;
      for (const { id } of sections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= 120) next = id;
      }
      setCurrent(next);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);
  return current;
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="inline-flex h-6 w-auto text-(--text) [&_svg]:h-full [&_svg]:w-auto"
        role="img"
        aria-label="ProCodrr"
        dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
      />
      <span className="text-sm font-medium text-(--muted)">Legal</span>
    </span>
  );
}

function SideNavigation({ currentPath }: { currentPath: string }) {
  return (
    <nav
      aria-label="Legal pages"
      className="sticky top-6 hidden w-55 shrink-0 flex-col gap-1 self-start lg:flex"
    >
      {(["policies", "company"] as const).map((group) => (
        <div key={group} className="flex flex-col gap-1 not-first:pt-5">
          <div className={GROUP_LABEL}>
            {group === "policies" ? "Policies" : "Company"}
          </div>
          {LEGAL_PAGES.filter((page) => page.group === group).map((page) => {
            const Icon = PAGE_ICONS[page.path];
            const current = page.path === currentPath;
            return (
              <Link
                key={page.path}
                to={page.path}
                aria-current={current ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-[10px] border px-3 text-sm no-underline transition-colors ${FOCUS_RING} ${
                  current
                    ? "border-(--accent-border) bg-(--selected) font-semibold text-(--text)"
                    : "border-transparent font-medium text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
                }`}
              >
                <Icon
                  className={`size-4.5 shrink-0 ${current ? "text-(--accent)" : "text-(--muted)"}`}
                />
                {page.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function PageChips({ currentPath }: { currentPath: string }) {
  return (
    <nav
      aria-label="Legal pages"
      className="flex gap-2 overflow-x-auto border-b border-(--border) px-5 py-3.5 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
    >
      {LEGAL_PAGES.map((page) => {
        const current = page.path === currentPath;
        return (
          <Link
            key={page.path}
            to={page.path}
            aria-current={current ? "page" : undefined}
            className={`inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-[13px] whitespace-nowrap no-underline ${FOCUS_RING} ${
              current
                ? "border-(--accent-border) bg-(--selected) font-semibold text-(--text)"
                : "border-(--border) bg-(--surface) font-medium text-(--text-secondary)"
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SectionLinks({
  sections,
  current,
}: {
  sections: LegalDocument["sections"];
  current: string | undefined;
}) {
  return sections.map((section) => {
    const active = section.id === current;
    return (
      <a
        key={section.id}
        href={`#${section.id}`}
        aria-current={active ? "location" : undefined}
        className={`flex min-h-9 items-center border-l-2 py-1 pl-3.5 text-[13px] leading-[1.4] no-underline transition-colors hover:text-(--text) ${FOCUS_RING} ${
          active
            ? "border-(--accent) font-semibold text-(--text)"
            : "border-(--border) font-medium text-(--muted)"
        }`}
      >
        {section.title}
      </a>
    );
  });
}

/**
 * A legal or company page (Terms of Service, Privacy Policy, …), open to
 * anyone outside the app's shell: a bar back to the app, the pages' own
 * navigation, the document with its sections numbered and listed under
 * "On this page", and a way to write to support.
 */
export function LegalPageLayout({
  document: page,
}: {
  document: LegalDocument;
}) {
  const current = useCurrentSection(page.sections);
  const onContactPage = page.path === "/contact";

  return (
    <div className="flex min-h-dvh flex-col bg-(--canvas) text-(--text-secondary)">
      <header className="border-b border-(--border) bg-(--header,var(--surface))">
        <div className="mx-auto flex h-15 w-full max-w-340 items-center gap-2 px-2 sm:h-auto sm:gap-4 sm:px-8 sm:py-3.5">
          <Link
            to="/"
            aria-label="Back to ProCodrr"
            className={`inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-(--border-strong,var(--border)) bg-(--surface) text-sm font-semibold text-(--text) no-underline transition-colors hover:bg-(--hover) sm:w-auto sm:pr-4 sm:pl-3 ${FOCUS_RING}`}
          >
            <ArrowLeft className="size-4.5" weight="bold" />
            <span className="hidden sm:inline">Back to ProCodrr</span>
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-6 w-px bg-(--border) sm:block"
          />
          <span className="flex-1 pl-1.5 sm:pl-0">
            <Logo />
          </span>
          <Link
            to="/contact"
            aria-label="Contact support"
            className={`inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium text-(--text-secondary) no-underline transition-colors hover:bg-(--hover) hover:text-(--text) sm:w-auto sm:px-3.5 ${FOCUS_RING}`}
          >
            <EnvelopeSimple className="size-4.5 text-(--accent)" />
            <span className="hidden sm:inline">Contact support</span>
          </Link>
        </div>
      </header>

      <PageChips currentPath={page.path} />

      <div className="mx-auto flex w-full max-w-340 flex-1 items-start justify-between gap-14 px-5 pt-7 pb-16 sm:px-8 lg:pt-12">
        <SideNavigation currentPath={page.path} />

        <main className="min-w-0 max-w-180 flex-1">
          <div className="text-[11px] font-bold tracking-[0.15em] text-(--accent-ink,var(--accent)) uppercase sm:text-xs">
            Legal
          </div>
          <h1 className="mt-2 text-[32px] leading-[1.15] font-extrabold tracking-[-0.025em] text-(--text) sm:mt-2.5 sm:text-[44px]">
            {page.heading}
          </h1>
          {page.effective ? (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-(--muted) sm:mt-4 sm:text-sm">
              <CalendarBlank className="size-4 shrink-0" />
              {page.effective}
            </p>
          ) : null}
          <div className="mt-4.5 text-[15px] leading-[1.7] sm:mt-5.5 sm:text-[17px] [&_a]:font-semibold [&_a]:text-(--accent-ink,var(--accent)) [&_a]:underline [&_a]:underline-offset-4 [&_p]:mb-3">
            {page.intro}
          </div>

          {page.sections.length > 1 ? (
            <details className="group mt-5 rounded-2xl border border-(--border) bg-(--surface) xl:hidden">
              <summary
                className={`flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-4.5 text-sm font-semibold text-(--text) [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
              >
                On this page
                <CaretDown
                  className="size-4 text-(--muted) transition-transform group-open:rotate-180"
                  weight="bold"
                />
              </summary>
              <div className="flex flex-col px-4.5 pb-3">
                {page.sections.map((section, index) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="flex min-h-10 items-center gap-3 py-1 text-sm text-(--text-secondary) no-underline"
                  >
                    <span className="w-5 shrink-0 text-xs font-bold text-(--accent-ink,var(--accent)) tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </a>
                ))}
              </div>
            </details>
          ) : null}

          <div className={`mt-7 sm:mt-10 ${PROSE}`}>{page.body}</div>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-(--border) bg-(--surface) p-5 sm:p-6">
            <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-(--accent-soft) sm:flex">
              <ChatCircle className="size-5 text-(--accent)" />
            </div>
            <div className="min-w-50 flex-1">
              <div className="text-[15px] font-bold text-(--text) sm:text-base">
                Have a question?
              </div>
              <div className="mt-1 text-[13px] leading-[1.55] text-(--muted) sm:text-sm">
                Write to us at{" "}
                <a
                  href={`mailto:${LEGAL_SUPPORT_EMAIL}`}
                  className="font-semibold text-(--text-secondary) underline underline-offset-4 hover:text-(--text)"
                >
                  {LEGAL_SUPPORT_EMAIL}
                </a>{" "}
                and we&rsquo;ll get back to you.
              </div>
            </div>
            {onContactPage ? (
              <a
                href={`mailto:${LEGAL_SUPPORT_EMAIL}`}
                className={`inline-flex h-11.5 w-full items-center justify-center rounded-xl bg-(--accent) px-5 text-sm font-bold text-(--on-accent) no-underline transition-colors hover:bg-(--accent-hover,var(--accent)) sm:h-11 sm:w-auto ${FOCUS_RING}`}
              >
                Email us
              </a>
            ) : (
              <Link
                to="/contact"
                className={`inline-flex h-11.5 w-full items-center justify-center rounded-xl bg-(--accent) px-5 text-sm font-bold text-(--on-accent) no-underline transition-colors hover:bg-(--accent-hover,var(--accent)) sm:h-11 sm:w-auto ${FOCUS_RING}`}
              >
                Contact us
              </Link>
            )}
          </div>
        </main>

        <aside
          aria-label="On this page"
          className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-55 shrink-0 flex-col gap-0.5 self-start overflow-y-auto xl:flex"
        >
          {page.sections.length > 1 ? (
            <>
              <div className="pb-2.5 text-[11px] font-bold tracking-[0.11em] text-(--muted) uppercase">
                On this page
              </div>
              <SectionLinks sections={page.sections} current={current} />
            </>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className={`mt-5 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-(--border) bg-transparent text-[13px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) ${FOCUS_RING}`}
          >
            <Printer className="size-4" />
            Print or save as PDF
          </button>
        </aside>
      </div>

      <footer className="border-t border-(--border) bg-(--surface)">
        <div className="mx-auto flex w-full max-w-340 flex-col-reverse gap-2.5 px-5 pt-5 pb-8 text-[13px] text-(--muted) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-8 sm:py-5">
          <span>© 2026 ProCodrr Labs LLP. All rights reserved.</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_PAGES.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                aria-current={link.path === page.path ? "page" : undefined}
                className={`no-underline hover:text-(--text) ${FOCUS_RING} ${
                  link.path === page.path
                    ? "text-(--text-secondary)"
                    : "text-(--muted)"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </span>
        </div>
      </footer>
    </div>
  );
}
