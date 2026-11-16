import type { ReactNode } from "react";
import type { PublicCoursePageSection } from "@veolms/contracts";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { QuotesIcon as Quotes } from "@phosphor-icons/react/Quotes";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { XIcon as X } from "@phosphor-icons/react/X";
import { Button } from "../../components/Button";
import {
  bandHeaderClasses,
  bandTitleClasses,
  overviewCardClasses,
  overviewCardPaddingClasses,
} from "./overviewStyles";

/**
 * The course page's ready sections, in the creator's order
 * (creator-features/39-sales-page-sections-plan.md). The curriculum and
 * "About this course" are the page's own and come in as `builtIn`. All
 * text is plain text: React writes it as text, line breaks kept.
 */

const cardClasses = `${overviewCardClasses} ${overviewCardPaddingClasses}`;
const bodyTextClasses =
  "m-0 text-[0.92rem] leading-[1.65] text-(--text-secondary) whitespace-pre-line";

/** What the page shows when the course has no sections of its own yet. */
const DEFAULT_SECTIONS: PublicCoursePageSection[] = [
  { kind: "curriculum" },
  { kind: "about" },
];

function SectionCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={cardClasses} aria-labelledby={id} data-fixed-radius>
      <div className={bandHeaderClasses}>
        <h2 id={id} className={bandTitleClasses}>
          {title}
        </h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckList({
  items,
  tone = "accent",
  columns = false,
}: {
  items: readonly string[];
  tone?: "accent" | "muted";
  columns?: boolean;
}) {
  const Icon = tone === "accent" ? Check : X;
  return (
    <ul
      className={`m-0 grid list-none gap-x-6 gap-y-3 p-0 ${columns ? "@2xl/overview:grid-cols-2" : ""}`}
    >
      {items.map((item, index) => (
        <li key={index} className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
              tone === "accent"
                ? "bg-(--accent)/12 text-(--accent)"
                : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)"
            }`}
            aria-hidden="true"
          >
            <Icon size={12} weight="bold" />
          </span>
          <span className="min-w-0 text-[0.94rem] leading-6 text-(--text)">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Initials({ name, size }: { name: string; size: string }) {
  const letters = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-(--accent)/12 font-bold text-(--accent) ${size}`}
    >
      {letters || "?"}
    </span>
  );
}

function PersonPhoto({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size: string;
}) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full object-cover ${size}`}
    />
  ) : (
    <Initials name={name} size={size} />
  );
}

function SalesSection({
  section,
  builtIn,
  onNavigatePage,
}: {
  section: PublicCoursePageSection;
  builtIn: { curriculum: ReactNode; about: ReactNode };
  onNavigatePage?: (path: string) => void;
}) {
  switch (section.kind) {
    case "curriculum":
      return <>{builtIn.curriculum}</>;
    case "about":
      return <>{builtIn.about}</>;
    case "outcomes":
      return (
        <SectionCard id="cov-outcomes-heading" title="What you'll learn">
          <CheckList items={section.items} columns />
        </SectionCard>
      );
    case "requirements":
      return (
        <SectionCard id="cov-requirements-heading" title="Before you start">
          <CheckList items={section.items} />
        </SectionCard>
      );
    case "audience":
      return (
        <SectionCard id="cov-audience-heading" title="Who this course is for">
          <div className="grid gap-6 @2xl/overview:grid-cols-2">
            {section.forYou.length ? (
              <div className="grid min-w-0 content-start gap-3">
                <h3 className="m-0 text-[0.95rem] font-semibold text-(--text)">
                  This is for you if
                </h3>
                <CheckList items={section.forYou} />
              </div>
            ) : null}
            {section.notForYou.length ? (
              <div className="grid min-w-0 content-start gap-3">
                <h3 className="m-0 text-[0.95rem] font-semibold text-(--text)">
                  It&apos;s not for you if
                </h3>
                <CheckList items={section.notForYou} tone="muted" />
              </div>
            ) : null}
          </div>
        </SectionCard>
      );
    case "instructor": {
      const { instructor } = section;
      return (
        <SectionCard id="cov-instructor-heading" title="Your instructor">
          <div className="flex min-w-0 flex-col gap-4 @lg/overview:flex-row @lg/overview:items-start">
            <PersonPhoto
              name={instructor.name}
              url={instructor.avatarUrl}
              size="size-20 text-xl"
            />
            <div className="grid min-w-0 gap-1.5">
              <p className="m-0 text-[1.05rem] font-bold text-(--text)">
                {instructor.name}
              </p>
              {instructor.headline ? (
                <p className="m-0 text-[0.88rem] font-medium text-(--muted)">
                  {instructor.headline}
                </p>
              ) : null}
              {instructor.bio ? (
                <p className={`${bodyTextClasses} mt-1.5`}>{instructor.bio}</p>
              ) : null}
            </div>
          </div>
        </SectionCard>
      );
    }
    case "testimonials":
      return (
        <SectionCard id="cov-testimonials-heading" title="What students say">
          <ul className="m-0 grid list-none gap-3.5 p-0 @2xl/overview:grid-cols-2">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))] p-4"
              >
                <Quotes
                  size={22}
                  weight="fill"
                  className="text-(--accent) opacity-70"
                  aria-hidden="true"
                />
                <blockquote className={`${bodyTextClasses} text-(--text)`}>
                  {item.quote}
                </blockquote>
                <div className="mt-auto flex min-w-0 items-center gap-3">
                  <PersonPhoto
                    name={item.name}
                    url={item.photoUrl}
                    size="size-10 text-sm"
                  />
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[0.9rem] font-semibold text-(--text)">
                      {item.name}
                    </p>
                    {item.detail ? (
                      <p className="m-0 truncate text-[0.82rem] text-(--muted)">
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    case "faq":
      return (
        <SectionCard id="cov-faq-heading" title="Questions & answers">
          {/* Native details: opens and closes without JavaScript, so it
              works in the pre-built page and for search engines too. */}
          <div className="grid gap-2">
            {section.items.map((item) => (
              <details
                key={item.id}
                className="group/faq rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_35%,var(--surface))] open:bg-(--surface)"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[0.95rem] font-semibold text-(--text) [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">{item.question}</span>
                  <CaretDown
                    size={16}
                    weight="bold"
                    className="shrink-0 text-(--muted) transition-transform duration-200 group-open/faq:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <p className={`${bodyTextClasses} px-4 pb-4`}>{item.answer}</p>
              </details>
            ))}
          </div>
        </SectionCard>
      );
    case "guarantee":
      return (
        <section
          className={`${cardClasses} flex flex-col gap-4 @lg/overview:flex-row @lg/overview:items-start`}
          aria-labelledby="cov-guarantee-heading"
          data-fixed-radius
        >
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500"
            aria-hidden="true"
          >
            <ShieldCheck size={26} weight="duotone" />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <h2 id="cov-guarantee-heading" className={bandTitleClasses}>
              {section.title || "Our promise"}
            </h2>
            {section.text ? (
              <p className={bodyTextClasses}>{section.text}</p>
            ) : null}
            <a
              href="/policies"
              onClick={(event) => {
                if (!onNavigatePage) return;
                event.preventDefault();
                onNavigatePage("/policies");
              }}
              className="w-fit text-[0.88rem] font-semibold text-(--accent-ink,var(--accent)) hover:underline"
            >
              Read the refund policy
            </a>
          </div>
        </section>
      );
  }
}

/** Scrolls back to the price card, where the course is bought. */
function scrollToPriceCard() {
  const card = document.querySelector<HTMLElement>(
    '[aria-label="Course pricing and enrollment"]',
  );
  if (!card) return;
  const reduce = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  card.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "center",
  });
  card.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
}

export function CourseSalesSections({
  sections,
  builtIn,
  courseTitle,
  showJoinCall,
  onNavigatePage,
}: {
  /** Absent: the course has no sales page data (an older page or preview). */
  sections: readonly PublicCoursePageSection[] | undefined;
  builtIn: { curriculum: ReactNode; about: ReactNode };
  courseTitle: string;
  /** A visitor who can buy: a last "Join now" at the bottom of the page. */
  showJoinCall: boolean;
  onNavigatePage?: (path: string) => void;
}) {
  const shown = sections && sections.length ? sections : DEFAULT_SECTIONS;
  const hasOwnSections = shown.some(
    (section) => section.kind !== "curriculum" && section.kind !== "about",
  );
  // One box for all of them: on a wide page the column is a two-column grid
  // made for one left-hand box beside the price, and more boxes would
  // spill into the price's column. The gap is the column's own.
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {shown.map((section) => (
        <SalesSection
          key={section.kind}
          section={section}
          builtIn={builtIn}
          onNavigatePage={onNavigatePage}
        />
      ))}
      {showJoinCall && hasOwnSections ? (
        <section
          className={`${cardClasses} flex flex-col items-start gap-4 @lg/overview:flex-row @lg/overview:items-center @lg/overview:justify-between`}
          aria-label="Join this course"
          data-fixed-radius
        >
          <div className="min-w-0">
            <p className="m-0 text-[1.1rem] font-bold text-(--text)">
              Ready to start?
            </p>
            <p className="m-0 mt-1 text-[0.9rem] text-(--muted)">
              Join {courseTitle} and start learning today.
            </p>
          </div>
          <Button onClick={scrollToPriceCard}>
            <ArrowUp size={16} weight="bold" />
            Join now
          </Button>
        </section>
      ) : null}
    </div>
  );
}
