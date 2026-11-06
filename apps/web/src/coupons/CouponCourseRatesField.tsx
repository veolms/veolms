import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { inputClass, sanitizeNumberInput } from "./couponHelpers";

/** One course's own discount under the coupon, as the form edits it. */
export interface CourseRateDraft {
  courseId: string;
  discountType: "percentage" | "fixed";
  discountValue: number | "";
}

const fieldClass = `${inputClass} h-11 rounded-xl`;
const selectTriggerClass =
  "h-11! p-0! bg-transparent! shadow-none! border-0! text-sm font-medium hover:bg-transparent! flex w-full items-center justify-between";

const rateTypeOptions: readonly [string, string][] = [
  ["percentage", "%"],
  ["fixed", "₹ off"],
];

/**
 * Gives some courses their own discount under one coupon (HAPPYDIWALI: 40%
 * on Node.js, 50% on everything else). The coupon's own discount stays the
 * default for every other course it applies to.
 */
export function CouponCourseRatesField({
  courses,
  rates,
  onChange,
  defaultLabel,
}: {
  /** Courses the coupon applies to, so only those can have a rate. */
  courses: ReadonlyArray<{ id: string; title: string }>;
  rates: readonly CourseRateDraft[];
  onChange: (rates: CourseRateDraft[]) => void;
  /** The coupon's own discount, e.g. "20%". */
  defaultLabel: string;
}) {
  const titleOf = (courseId: string) =>
    courses.find((course) => course.id === courseId)?.title ?? "Course";
  const options = courses
    .filter((course) => !rates.some((rate) => rate.courseId === course.id))
    .map((course) => [course.id, course.title] as const);

  const update = (courseId: string, patch: Partial<CourseRateDraft>) =>
    onChange(
      rates.map((rate) =>
        rate.courseId === courseId ? { ...rate, ...patch } : rate,
      ),
    );

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-(--text)">
        Different discount per course
      </span>
      <p className="mt-0 mb-2.5 text-[12px] text-(--muted)">
        Courses not listed here get the coupon&apos;s discount ({defaultLabel}
        ).
      </p>

      {rates.length > 0 ? (
        <ul className="m-0 mb-2.5 grid list-none gap-2 p-0">
          {rates.map((rate) => {
            const title = titleOf(rate.courseId);
            return (
              <li
                key={rate.courseId}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2"
              >
                <span className="truncate text-sm text-(--text)">{title}</span>
                <input
                  type="number"
                  min={1}
                  max={rate.discountType === "percentage" ? 100 : 100000}
                  value={rate.discountValue}
                  onChange={(event) =>
                    update(rate.courseId, {
                      discountValue: sanitizeNumberInput(event.target.value, {
                        max: rate.discountType === "percentage" ? 100 : 100000,
                      }),
                    })
                  }
                  aria-label={`Discount for ${title}`}
                  className={`${fieldClass} w-24`}
                />
                <div className={`${fieldClass} flex w-24 items-center`}>
                  <ThemedSelect
                    value={rate.discountType}
                    onValueChange={(value) => {
                      const discountType =
                        value as CourseRateDraft["discountType"];
                      update(rate.courseId, {
                        discountType,
                        discountValue:
                          discountType === "percentage" &&
                          typeof rate.discountValue === "number" &&
                          rate.discountValue > 100
                            ? 100
                            : rate.discountValue,
                      });
                    }}
                    options={rateTypeOptions}
                    ariaLabel={`Discount type for ${title}`}
                    triggerClassName={selectTriggerClass}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove the discount for ${title}`}
                  onClick={() =>
                    onChange(rates.filter((r) => r.courseId !== rate.courseId))
                  }
                  className="flex size-8 items-center justify-center rounded-full text-(--muted) hover:bg-(--accent)/12 hover:text-(--text) cursor-pointer"
                >
                  <X size={14} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={`${fieldClass} flex w-full items-center`}>
        <ThemedSelect
          id="coupon-course-rate-add"
          value=""
          onValueChange={(courseId) => {
            if (!courseId) return;
            onChange([
              ...rates,
              { courseId, discountType: "percentage", discountValue: "" },
            ]);
          }}
          options={options}
          searchable
          searchPlaceholder="Search courses..."
          defaultLimit={6}
          disabled={options.length === 0}
          ariaLabel="Add a course with its own discount"
          className="w-full"
          triggerClassName={selectTriggerClass}
        />
      </div>
    </div>
  );
}
