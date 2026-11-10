import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CalendarPlusIcon as CalendarPlus } from "@phosphor-icons/react/CalendarPlus";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { InfinityIcon as InfinityGlyph } from "@phosphor-icons/react/Infinity";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/TrendUp";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  addAccessPeriod,
  extensionBase,
  type AccessExtensionUnit,
  type StudentCourseDetail,
} from "@veolms/contracts";
import { useId, useMemo, useState, type ReactNode } from "react";

import { Button } from "../components/Button";
import { SlideOverFrame } from "../components/SlideOverPanel";
import { useExtendCourseAccess } from "../services/access";
import { secondaryButtonClassName } from "../team/TeamBits";
import {
  calendarSpan,
  daysUntil,
  formatAccessDate,
  spanLabel,
  totalValidityLabel,
} from "./accessValidity";

const line = "border-(--border)";
const DAY_MS = 24 * 60 * 60 * 1000;

const QUICK_PICKS: readonly {
  amount: number;
  unit: AccessExtensionUnit;
  label: string;
}[] = [
  { amount: 30, unit: "days", label: "+30 days" },
  { amount: 3, unit: "months", label: "+3 months" },
  { amount: 6, unit: "months", label: "+6 months" },
  { amount: 1, unit: "years", label: "+1 year" },
];

const UNITS: readonly [AccessExtensionUnit, string][] = [
  ["days", "Days"],
  ["months", "Months"],
  ["years", "Years"],
];

/** "6 months", "1 year", "30 days". */
function periodLabel(amount: number, unit: AccessExtensionUnit): string {
  const word = unit.slice(0, -1);
  return `${amount} ${amount === 1 ? word : `${word}s`}`;
}

/**
 * Staff extend one student's access to one course, from the course's menu
 * on the student page: by a quick pick or any number of days, months or
 * years added to the current end date (from today when it has passed), or
 * to lifetime. The new date shows before it is saved. A drawer from the
 * right, like Grant course; mounted only while open.
 */
export function ExtendValidityPanel({
  userId,
  studentName,
  studentEmail,
  course,
  onClose,
  onExtended,
}: {
  userId: string;
  studentName: string;
  studentEmail: string | null;
  course: StudentCourseDetail;
  onClose: () => void;
  onExtended: (message: string) => void;
}) {
  const amountId = useId();
  const notifyId = useId();
  const extend = useExtendCourseAccess();
  const [amount, setAmount] = useState("6");
  const [unit, setUnit] = useState<AccessExtensionUnit>("months");
  const [lifetime, setLifetime] = useState(false);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The moment the drawer opened: the preview does not drift while it is
  // open.
  const [now] = useState(() => new Date());
  const start = new Date(course.accessStartsAt);
  const currentEnd = course.accessExpiresAt
    ? new Date(course.accessExpiresAt)
    : null;
  const expired = currentEnd !== null && currentEnd.getTime() <= now.getTime();

  const count = Number(amount);
  const amountValid = Number.isInteger(count) && count >= 1 && count <= 1000;
  const newEnd = useMemo(
    () =>
      amountValid
        ? addAccessPeriod(extensionBase(currentEnd, now), count, unit)
        : null,
    // currentEnd is read from the course; its time is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [amountValid, count, unit, course.accessExpiresAt, now],
  );
  const addedDays =
    newEnd && currentEnd
      ? Math.round(
          (newEnd.getTime() - extensionBase(currentEnd, now).getTime()) /
            DAY_MS,
        )
      : null;

  const confirmLabel = lifetime
    ? "Give lifetime access"
    : amountValid
      ? `Extend by ${periodLabel(count, unit)}`
      : "Extend";

  const save = () => {
    if (!lifetime && !amountValid) {
      setError("Enter a whole number from 1 to 1000.");
      return;
    }
    setError(null);
    extend.mutate(
      {
        userId,
        courseId: course.courseId,
        body: lifetime
          ? { kind: "lifetime", notify }
          : { kind: "extend", amount: count, unit, notify },
      },
      {
        onSuccess: (result) =>
          onExtended(
            result.validUntil
              ? `${studentName} can open ${course.courseTitle} until ${formatAccessDate(result.validUntil)}.`
              : `${studentName} has lifetime access to ${course.courseTitle}.`,
          ),
        onError: (cause) =>
          setError(
            cause.message || "Could not extend access. Please try again.",
          ),
      },
    );
  };

  return (
    <SlideOverFrame
      label="Extend validity"
      onClose={onClose}
      className="max-w-[520px]"
    >
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className={`shrink-0 border-b px-6 pt-6 pb-5 ${line}`}>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent)/12 text-(--accent)">
              <CalendarPlus size={20} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-(--text)">
                Extend validity
              </h2>
              <p className="mt-0.5 truncate text-xs text-(--muted)">
                {course.courseTitle} · {studentName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <section aria-labelledby={`${amountId}-current`}>
            <h3
              id={`${amountId}-current`}
              className="mb-2.5 text-sm font-semibold text-(--text-secondary)"
            >
              Current validity
            </h3>
            <div className="grid grid-cols-3 gap-2.5 max-[440px]:gap-1.5">
              <ValidityCard
                label="Started"
                icon={<CalendarBlank size={15} aria-hidden="true" />}
                tone="text-(--accent)"
                value={formatAccessDate(start)}
                note="Enrolled on"
              />
              <ValidityCard
                label="Expires"
                icon={<Clock size={15} aria-hidden="true" />}
                tone="text-amber-500 [:root[data-theme=dark]_&]:text-amber-300"
                value={currentEnd ? formatAccessDate(currentEnd) : "Never"}
                note={
                  currentEnd
                    ? expired
                      ? "Already ended"
                      : totalValidityLabel(start, currentEnd)
                    : "Lifetime access"
                }
              />
              <ValidityCard
                label="Remaining"
                icon={<TrendUp size={15} aria-hidden="true" />}
                tone="text-emerald-500 [:root[data-theme=dark]_&]:text-emerald-300"
                value={
                  currentEnd
                    ? expired
                      ? "0d"
                      : spanLabel(calendarSpan(now, currentEnd))
                    : "∞"
                }
                note={
                  currentEnd
                    ? `${Math.max(0, daysUntil(currentEnd, now))} days`
                    : "No end date"
                }
              />
            </div>
          </section>

          {lifetime ? (
            <div className="flex items-start gap-3 rounded-2xl border border-(--accent)/40 bg-(--accent)/8 p-4">
              <InfinityGlyph
                size={22}
                weight="bold"
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-(--accent)"
              />
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-(--text)">
                  No expiry
                </p>
                <p className="m-0 mt-0.5 text-xs text-(--muted)">
                  {studentName} keeps {course.courseTitle} for life. It can be
                  revoked later from this page.
                </p>
              </div>
            </div>
          ) : (
            <>
              <section aria-labelledby={`${amountId}-by`}>
                <h3
                  id={`${amountId}-by`}
                  className="mb-2.5 text-sm font-semibold text-(--text-secondary)"
                >
                  Extend by
                </h3>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PICKS.map((pick) => {
                    const selected =
                      count === pick.amount && unit === pick.unit;
                    return (
                      <button
                        key={pick.label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setAmount(String(pick.amount));
                          setUnit(pick.unit);
                          setError(null);
                        }}
                        className="h-9 rounded-lg bg-(--surface-strong) px-3.5 text-[0.82rem] font-semibold text-(--text-secondary) ring-1 ring-(--border) transition-colors ring-inset hover:text-(--text) aria-pressed:bg-(--accent)/12 aria-pressed:text-(--accent) aria-pressed:ring-(--accent)/60"
                      >
                        {pick.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2.5">
                  <label htmlFor={amountId} className="sr-only">
                    How many
                  </label>
                  <input
                    id={amountId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    step={1}
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setError(null);
                    }}
                    aria-invalid={!amountValid || undefined}
                    className="h-11 rounded-xl border border-(--border) bg-(--canvas) px-3.5 text-base font-semibold text-(--text) outline-none focus:border-(--accent) aria-invalid:border-rose-500"
                  />
                  <div
                    role="radiogroup"
                    aria-label="Unit"
                    className="grid grid-cols-3 gap-1 rounded-xl bg-(--surface-strong) p-1 ring-1 ring-(--border) ring-inset"
                  >
                    {UNITS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={unit === value}
                        onClick={() => setUnit(value)}
                        className="rounded-lg text-[0.82rem] font-semibold text-(--muted) transition-colors hover:text-(--text) aria-checked:bg-(--surface) aria-checked:text-(--text) aria-checked:shadow-sm"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section
                aria-live="polite"
                className="rounded-2xl border border-(--accent)/40 bg-(--accent)/8 p-4"
              >
                <p className="m-0 text-xs font-semibold text-(--accent)">
                  New expiry
                </p>
                {newEnd ? (
                  <>
                    <p className="m-0 mt-1.5 flex flex-wrap items-center gap-2.5">
                      {currentEnd ? (
                        <>
                          <s className="text-sm text-(--muted)">
                            {formatAccessDate(currentEnd)}
                          </s>
                          <ArrowRight
                            size={15}
                            weight="bold"
                            aria-label="becomes"
                            className="text-(--accent)"
                          />
                        </>
                      ) : null}
                      <span className="text-2xl font-bold tracking-[-0.02em] text-(--text)">
                        {formatAccessDate(newEnd)}
                      </span>
                    </p>
                    <p className="m-0 mt-1.5 text-xs text-(--muted)">
                      {spanLabel(calendarSpan(now, newEnd))} remaining from
                      today
                      {addedDays !== null
                        ? ` · +${addedDays} ${addedDays === 1 ? "day" : "days"} added`
                        : ""}
                      {expired
                        ? " · counted from today, as access had ended"
                        : ""}
                    </p>
                  </>
                ) : (
                  <p className="m-0 mt-1.5 text-sm text-(--muted)">
                    Enter a whole number from 1 to 1000.
                  </p>
                )}
              </section>
            </>
          )}

          <div className="flex items-center justify-between gap-4">
            <label htmlFor={notifyId} className="min-w-0 cursor-pointer">
              <span className="block text-sm font-semibold text-(--text)">
                Notify student by email
              </span>
              <span className="block truncate text-xs text-(--muted)">
                {studentEmail
                  ? `Sends the new expiry date to ${studentEmail}`
                  : "Sends the new expiry date to the student"}
              </span>
            </label>
            <button
              id={notifyId}
              type="button"
              role="switch"
              aria-checked={notify}
              onClick={() => setNotify((value) => !value)}
              className="relative h-6 w-11 shrink-0 rounded-full bg-(--surface-strong) ring-1 ring-(--border) transition-colors ring-inset aria-checked:bg-(--accent) aria-checked:ring-(--accent)"
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${notify ? "translate-x-5" : ""}`}
              />
            </button>
          </div>

          {error ? (
            <p role="alert" className="m-0 text-sm text-rose-500">
              {error}
            </p>
          ) : null}
        </div>

        <div
          className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-6 py-4 ${line}`}
        >
          <button
            type="button"
            onClick={() => {
              setLifetime((value) => !value);
              setError(null);
            }}
            className="text-sm font-semibold text-(--accent) hover:underline"
          >
            {lifetime ? "Set an end date instead" : "Set no expiry instead"}
          </button>
          <div className="flex shrink-0 gap-2 max-[440px]:w-full">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onClose}
            >
              Cancel
            </button>
            <Button
              type="submit"
              elevation="flat"
              motion="static"
              className="whitespace-nowrap max-[440px]:flex-1"
              disabled={extend.isPending || (!lifetime && !amountValid)}
            >
              <CalendarPlus size={16} aria-hidden="true" />
              {extend.isPending ? "Saving…" : confirmLabel}
            </Button>
          </div>
        </div>
      </form>
    </SlideOverFrame>
  );
}

function ValidityCard({
  label,
  icon,
  tone,
  value,
  note,
}: {
  label: string;
  icon: ReactNode;
  tone: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-(--border) bg-(--surface-strong) p-3 max-[440px]:p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-(--muted)">
        {label}
        <span className={`${tone} max-[440px]:hidden`}>{icon}</span>
      </div>
      <p className="m-0 mt-1.5 truncate text-[0.95rem] font-bold text-(--text) max-[440px]:text-[0.8rem]">
        {value}
      </p>
      <p className="m-0 truncate text-[0.7rem] text-(--muted)">{note}</p>
    </div>
  );
}
