import type { MouseEvent } from "react";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import type {
  CourseOverviewResponse,
  CoursePricingSummary,
} from "@veolms/contracts";
import { formatMoney } from "@veolms/contracts/commerce/money";
import { formatPriceWithCurrency } from "./coursePriceFormat";
import { CoursePriceSwitch } from "../CoursePriceSwitch";
import { courseCardShimmerClass } from "../courseCardShimmer";
import { useAuthStore } from "../../store/auth.store";
import { coursePriceState, useCoursePrices } from "../liveCoursePrices";

export type IncludedCourse = NonNullable<
  CourseOverviewResponse["includedCourses"]
>[number];

/**
 * The courses that come with this one (its linked courses), at the top of
 * "This course includes".
 *
 * Worded as part of what the buyer gets, never as "free": "free" read as
 * if those courses cost nothing on their own, and the course being sold
 * looked cheaper for it. So the group is "3 more courses", and each row
 * is tagged "Included" with what that course sells for on its own where it
 * is sold. A row opens that course's page.
 *
 * What a course sells for is its price in force (`liveCoursePrices`), not
 * the one in the course's curriculum, which a page is built with: that
 * says whether the course is sold on its own (`worth`), and is shown only
 * to a visitor who is not signed in when the price in force could not be
 * loaded.
 */
export function IncludedCoursesList({
  courses,
  onOpenCourse,
}: {
  courses: readonly IncludedCourse[];
  onOpenCourse?: (path: string) => void;
}) {
  const coursePrices = useCoursePrices();
  const signedIn = useAuthStore((state) => Boolean(state.user));
  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="m-0 text-[0.95rem] leading-snug font-semibold text-(--text)">
        {courses.length === 1
          ? "1 more course"
          : `${courses.length} more courses`}
      </h4>
      <ul className="m-0 grid list-none gap-2.5 p-0 @2xl/price:grid-cols-2">
        {courses.map((course) => {
          const path = `/courses/${encodeURIComponent(course.slug)}/overview`;
          const open = (event: MouseEvent<HTMLAnchorElement>) => {
            if (
              !onOpenCourse ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onOpenCourse(path);
          };
          const price = course.worth
            ? coursePriceState(coursePrices, course.id)
            : null;
          return (
            <li key={course.id} className="min-w-0">
              <a
                href={path}
                onClick={open}
                className="group flex min-w-0 items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_55%,var(--surface))] p-2.5 pr-3 no-underline transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      srcSet={course.thumbnailSrcSet
                        ?.map((variant) => `${variant.url} ${variant.width}w`)
                        .join(", ")}
                      sizes="96px"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-[0.95rem] leading-snug font-semibold text-(--text)">
                    {course.title}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[0.82rem] leading-none text-(--muted)">
                    <span className="inline-flex shrink-0 items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-1 text-[0.72rem] font-bold text-[color-mix(in_srgb,var(--accent)_80%,var(--text))]">
                      Included
                    </span>
                    {price?.status === "pending" ? (
                      <span className="truncate">
                        Worth <WorthShimmer />
                      </span>
                    ) : price?.status === "known" &&
                      price.pricing.pricingType === "paid" ? (
                      <span className="truncate">
                        Worth <IncludedCourseWorth pricing={price.pricing} />
                      </span>
                    ) : price?.status === "failed" &&
                      course.worth &&
                      !signedIn ? (
                      <span className="truncate">
                        Worth <ListedWorth worth={course.worth} />
                      </span>
                    ) : null}
                  </span>
                </span>
                <CaretRight
                  size={16}
                  weight="bold"
                  className="shrink-0 text-(--muted) transition-colors group-hover:text-(--accent)"
                  aria-hidden="true"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WorthShimmer() {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[0.8em] w-12 rounded-sm align-middle ${courseCardShimmerClass}`}
    />
  );
}

/**
 * What a course sells for on its own, as the API words it: its sale price
 * when it has one. In the visitor's region when it has a price for buyers
 * outside India, with a shimmer until the region is known.
 */
function IncludedCourseWorth({ pricing }: { pricing: CoursePricingSummary }) {
  const domestic = formatPriceWithCurrency(
    pricing.salePrice ?? pricing.price,
    pricing.currency,
  );
  if (!pricing.international) return domestic;
  return (
    <CoursePriceSwitch
      display="inline"
      domestic={domestic}
      international={formatMoney(pricing.international.salePriceMinor, {
        currency: pricing.international.currency,
      })}
      pending={<WorthShimmer />}
    />
  );
}

/** The worth the course's curriculum carries (see `IncludedCoursesList`). */
function ListedWorth({
  worth,
}: {
  worth: NonNullable<IncludedCourse["worth"]>;
}) {
  const domestic = formatPriceWithCurrency(worth.amount, worth.currency);
  if (!worth.international) return domestic;
  return (
    <CoursePriceSwitch
      display="inline"
      domestic={domestic}
      international={formatMoney(worth.international.amountMinor, {
        currency: worth.international.currency,
      })}
      pending={<WorthShimmer />}
    />
  );
}
