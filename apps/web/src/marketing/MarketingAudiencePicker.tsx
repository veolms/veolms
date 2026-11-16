import { useEffect, useMemo, useState } from "react";
import type {
  MarketingAudience,
  MarketingSegmentType,
} from "@veolms/contracts";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import {
  useMarketingAudienceCount,
  useMarketingAudienceOptions,
} from "../services/marketing";
import { fieldClass, selectTriggerClass } from "../workshops/workshopHelpers";
import {
  SEGMENT_CHOICES,
  audienceIsComplete,
  defaultSegment,
  formatCount,
} from "./marketingHelpers";

const DAY_CHOICES: Record<"new" | "inactive", readonly [string, string][]> = {
  new: [
    ["3", "Last 3 days"],
    ["7", "Last 7 days"],
    ["14", "Last 14 days"],
    ["30", "Last 30 days"],
    ["90", "Last 90 days"],
  ],
  inactive: [
    ["7", "No learning for 7 days"],
    ["14", "No learning for 14 days"],
    ["30", "No learning for 30 days"],
    ["60", "No learning for 60 days"],
    ["90", "No learning for 90 days"],
  ],
};

function useDebounced<T>(value: T, ms: number): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return current;
}

function CourseChips({
  label,
  selected,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  selected: readonly string[];
  options: readonly { id: string; title: string }[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const remaining = options.filter((course) => !selected.includes(course.id));
  return (
    <div className="grid gap-2">
      {selected.length ? (
        <ul
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
          aria-label={label}
        >
          {selected.map((id) => {
            const title =
              options.find((course) => course.id === id)?.title ?? "Course";
            return (
              <li
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--accent)/25 bg-(--accent)/10 py-0.5 pr-1 pl-2.5 text-[12px] font-semibold text-(--accent)"
              >
                <span className="truncate">{title}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(selected.filter((other) => other !== id))
                  }
                  disabled={disabled}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-(--accent) hover:bg-(--accent)/15"
                  aria-label={`Remove ${title}`}
                >
                  <X size={11} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {remaining.length ? (
        <div className={`${fieldClass} flex w-full items-center`}>
          <ThemedSelect
            value=""
            onValueChange={(id) => {
              if (id) onChange([...selected, id]);
            }}
            options={[
              ["", placeholder],
              ...remaining.map((course) => [course.id, course.title] as const),
            ]}
            searchable={remaining.length > 8}
            searchPlaceholder="Search courses"
            disabled={disabled}
            ariaLabel={label}
            triggerClassName={selectTriggerClass}
          />
        </div>
      ) : options.length === 0 ? (
        <p className="m-0 text-[12px] text-(--muted)">No courses yet.</p>
      ) : null}
    </div>
  );
}

/** Who a broadcast goes to: one ready audience, optionally without some buyers. */
export function MarketingAudiencePicker({
  audience,
  onChange,
  disabled = false,
}: {
  audience: MarketingAudience;
  onChange: (audience: MarketingAudience) => void;
  disabled?: boolean;
}) {
  const options = useMarketingAudienceOptions();
  const courses = options.data?.courses ?? [];
  const workshops = options.data?.workshops ?? [];
  const segment = audience.segment;
  const complete = audienceIsComplete(audience);
  const debounced = useDebounced(audience, 400);
  const count = useMarketingAudienceCount(
    audienceIsComplete(debounced) ? debounced : null,
  );
  const [showExclude, setShowExclude] = useState(
    audience.excludeCourseIds.length > 0,
  );
  const choice = SEGMENT_CHOICES.find((option) => option.type === segment.type);
  const segmentOptions = useMemo(
    () => SEGMENT_CHOICES.map((option) => [option.type, option.label] as const),
    [],
  );

  const setSegment = (next: MarketingAudience["segment"]) =>
    onChange({ ...audience, segment: next });

  if (segment.type === "not_opened") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-4">
        <UsersThree size={20} className="mt-0.5 shrink-0 text-(--accent)" />
        <div>
          <p className="m-0 text-sm font-semibold text-(--text)">
            People who didn’t open the first email
          </p>
          <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">
            {count.data
              ? `${formatCount(count.data.count)} people`
              : "Counting…"}{" "}
            · Unsubscribed people are left out.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="min-w-0">
        <label
          htmlFor="marketing-audience"
          className="mb-1.5 block text-[13px] font-medium text-(--text)"
        >
          Send to
        </label>
        <div className={`${fieldClass} flex w-full items-center`}>
          <ThemedSelect
            id="marketing-audience"
            value={segment.type}
            onValueChange={(type) =>
              setSegment(defaultSegment(type as MarketingSegmentType))
            }
            options={segmentOptions}
            disabled={disabled}
            ariaLabel="Send to"
            triggerClassName={selectTriggerClass}
          />
        </div>
        {choice ? (
          <p className="mt-1.5 mb-0 text-[12px] text-(--muted)">
            {choice.hint}
          </p>
        ) : null}
      </div>

      {segment.type === "bought" ||
      segment.type === "not_bought" ||
      segment.type === "not_started" ? (
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] font-medium text-(--text)">
            {segment.type === "not_started"
              ? "Courses (leave empty for any course)"
              : "Courses"}
          </p>
          <CourseChips
            label="Courses"
            selected={segment.courseIds}
            options={courses}
            onChange={(courseIds) => setSegment({ ...segment, courseIds })}
            disabled={disabled}
            placeholder="Add a course"
          />
        </div>
      ) : null}

      {segment.type === "workshop" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] font-medium text-(--text)">
              Workshop
            </p>
            <div className={`${fieldClass} flex w-full items-center`}>
              <ThemedSelect
                value={segment.workshopId}
                onValueChange={(workshopId) =>
                  setSegment({ ...segment, workshopId })
                }
                options={[
                  ["", "Choose a workshop"],
                  ...workshops.map(
                    (workshop) => [workshop.id, workshop.title] as const,
                  ),
                ]}
                searchable={workshops.length > 8}
                searchPlaceholder="Search workshops"
                disabled={disabled}
                ariaLabel="Workshop"
                triggerClassName={selectTriggerClass}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] font-medium text-(--text)">Who</p>
            <div className={`${fieldClass} flex w-full items-center`}>
              <ThemedSelect
                value={segment.attendance}
                onValueChange={(attendance) =>
                  setSegment({
                    ...segment,
                    attendance: attendance as typeof segment.attendance,
                  })
                }
                options={[
                  ["all", "Everyone registered"],
                  ["attended", "Those who joined"],
                  ["missed", "Those who didn't join"],
                ]}
                disabled={disabled}
                ariaLabel="Who"
                triggerClassName={selectTriggerClass}
              />
            </div>
          </div>
        </div>
      ) : null}

      {segment.type === "new" || segment.type === "inactive" ? (
        <div className="min-w-0 sm:max-w-xs">
          <p className="mb-1.5 text-[13px] font-medium text-(--text)">
            {segment.type === "new" ? "Joined in" : "Inactive for"}
          </p>
          <div className={`${fieldClass} flex w-full items-center`}>
            <ThemedSelect
              value={String(segment.days)}
              onValueChange={(days) =>
                setSegment({ ...segment, days: Number(days) })
              }
              options={DAY_CHOICES[segment.type]}
              disabled={disabled}
              ariaLabel={segment.type === "new" ? "Joined in" : "Inactive for"}
              triggerClassName={selectTriggerClass}
            />
          </div>
        </div>
      ) : null}

      {showExclude ? (
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] font-medium text-(--text)">
            Leave out people who bought
          </p>
          <CourseChips
            label="Leave out buyers of"
            selected={audience.excludeCourseIds}
            options={courses}
            onChange={(excludeCourseIds) =>
              onChange({ ...audience, excludeCourseIds })
            }
            disabled={disabled}
            placeholder="Add a course to leave out"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowExclude(true)}
          disabled={disabled}
          className="w-fit cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-(--accent) hover:underline"
        >
          + Leave out people who already bought a course
        </button>
      )}

      <div
        className="flex items-center gap-3 rounded-xl border border-(--accent)/20 bg-(--accent)/8 px-4 py-3"
        aria-live="polite"
      >
        <UsersThree
          size={20}
          weight="duotone"
          className="shrink-0 text-(--accent)"
        />
        <p className="m-0 text-[13px] text-(--text)">
          {!complete ? (
            "Pick the course or workshop to see how many people this reaches."
          ) : count.data ? (
            <>
              <span className="font-bold">{formatCount(count.data.count)}</span>{" "}
              {count.data.count === 1 ? "person" : "people"} will get this email
              <span className="text-(--muted)">
                {" "}
                · unsubscribed and bounced addresses are left out
              </span>
            </>
          ) : count.isError ? (
            "Couldn't count right now."
          ) : (
            "Counting…"
          )}
        </p>
      </div>
    </div>
  );
}
