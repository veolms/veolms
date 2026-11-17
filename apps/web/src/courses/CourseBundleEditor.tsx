import { useMemo, useState } from "react";
import type { CourseBundle, ManagedCourseSummary } from "@veolms/contracts";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { Button } from "../components/Button";
import { SlideOverPanel } from "../components/SlideOverPanel";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { getApiError } from "../lib/api-error";
import {
  useCreateBundle,
  useDeleteBundle,
  useUpdateBundle,
} from "../services/bundles";

const inr = (amount: number) =>
  `₹${Math.round(amount).toLocaleString("en-IN")}`;

const fieldClasses =
  "w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 py-2.5 text-[0.9rem] font-semibold text-(--text) outline-none transition-[border-color] duration-150 focus:border-(--accent)";

function slugFrom(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60) || "bundle";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Makes or changes a bundle: its name, its courses (this course always
 * among them) and its price, with today's prices added up beside it so the
 * creator sees the saving buyers will see. A bundle that saves nothing
 * cannot be saved.
 */
export function CourseBundleEditor({
  courseId,
  bundle,
  courses,
  onClose,
}: {
  courseId: string;
  /** Null to make a new one. */
  bundle: CourseBundle | null;
  /** The academy's courses, with today's prices. */
  courses: readonly ManagedCourseSummary[];
  onClose: () => void;
}) {
  const create = useCreateBundle();
  const update = useUpdateBundle();
  const remove = useDeleteBundle();
  const [title, setTitle] = useState(bundle?.title ?? "");
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () =>
      new Set([
        courseId,
        ...(bundle?.items ?? []).map((item) => item.courseId),
      ]),
  );
  const [priceText, setPriceText] = useState(
    bundle ? String(bundle.price) : "",
  );
  const [live, setLive] = useState(
    bundle ? bundle.status === "published" : true,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Paid courses only: a free one has nothing to save on.
  const choices = useMemo(
    () =>
      courses
        .filter(
          (course) =>
            course.status !== "archived" &&
            ((course.price ?? 0) > 0 || picked.has(course.id)),
        )
        .sort((a, b) =>
          a.id === courseId
            ? -1
            : b.id === courseId
              ? 1
              : a.title.localeCompare(b.title),
        ),
    [courses, courseId, picked],
  );
  const apart = choices
    .filter((course) => picked.has(course.id))
    .reduce((sum, course) => sum + (course.price ?? 0), 0);
  const price = Number(priceText.replace(/\D/gu, "")) || 0;
  const saving = apart - price;
  const problem =
    picked.size < 2
      ? "Add at least one more course."
      : !title.trim()
        ? "Name the bundle."
        : price <= 0
          ? "Set the bundle's price."
          : saving <= 0
            ? "The bundle must cost less than its courses bought apart."
            : null;
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save() {
    if (problem) return;
    setError(null);
    const courseIds = [...picked];
    try {
      if (bundle) {
        await update.mutateAsync({
          id: bundle.id,
          body: {
            title: title.trim(),
            price,
            courseIds,
            status: live ? "published" : "draft",
          },
        });
      } else {
        await create.mutateAsync({
          slug: slugFrom(title),
          title: title.trim(),
          price,
          currency: "INR",
          courseIds,
          status: live ? "published" : "draft",
        });
      }
      onClose();
    } catch (problemError) {
      setError(getApiError(problemError).message);
    }
  }

  async function deleteBundle() {
    if (!bundle) return;
    setError(null);
    try {
      await remove.mutateAsync(bundle.id);
      onClose();
    } catch (problemError) {
      setError(getApiError(problemError).message);
    }
  }

  return (
    <SlideOverPanel
      label={bundle ? `Edit ${bundle.title}` : "Make a bundle"}
      title={bundle ? "Edit bundle" : "Make a bundle"}
      onClose={onClose}
      closeLabel="Close"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="bundle-title"
            className="text-[0.84rem] font-semibold text-(--text-secondary)"
          >
            Bundle name
          </label>
          <input
            id="bundle-title"
            className={fieldClasses}
            value={title}
            maxLength={120}
            placeholder="Backend + System Design"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[0.84rem] font-semibold text-(--text-secondary)">
            Courses in it
          </legend>
          {choices.map((course) => {
            const isThis = course.id === courseId;
            const on = picked.has(course.id);
            return (
              <button
                key={course.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={isThis}
                onClick={() =>
                  setPicked((current) => {
                    const next = new Set(current);
                    if (next.has(course.id)) next.delete(course.id);
                    else next.add(course.id);
                    return next;
                  })
                }
                className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors disabled:cursor-default ${
                  on
                    ? "border-(--accent)/50 bg-(--accent)/8"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:border-(--accent)/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                    on
                      ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                      : "border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                  }`}
                >
                  {on ? <Check size={12} weight="bold" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.88rem] font-semibold text-(--text)">
                    {course.title}
                  </span>
                  {isThis ? (
                    <span className="block text-[0.75rem] text-(--muted)">
                      This course, always in its own bundles
                    </span>
                  ) : course.status === "draft" ? (
                    <span className="block text-[0.75rem] text-(--muted)">
                      Draft: the bundle shows once it is published
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[0.85rem] font-semibold tabular-nums text-(--muted)">
                  {inr(course.price ?? 0)}
                </span>
              </button>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="bundle-price"
            className="text-[0.84rem] font-semibold text-(--text-secondary)"
          >
            Bundle price
          </label>
          <div className="relative flex w-full items-center">
            <span className="pointer-events-none absolute left-3.5 text-[0.9rem] font-semibold text-(--muted)">
              ₹
            </span>
            <input
              id="bundle-price"
              inputMode="numeric"
              className={`${fieldClasses} pl-8`}
              value={priceText}
              placeholder={apart > 0 ? String(Math.round(apart * 0.8)) : "0"}
              onChange={(event) =>
                setPriceText(event.target.value.replace(/[^\d]/gu, ""))
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))] p-3.5 text-[0.86rem] tabular-nums">
          <div className="flex justify-between gap-3 text-(--muted)">
            <span>{picked.size} courses bought apart</span>
            <span>{inr(apart)}</span>
          </div>
          <div className="flex justify-between gap-3 text-(--muted)">
            <span>Bundle price</span>
            <span>{price > 0 ? inr(price) : "—"}</span>
          </div>
          <div className="flex justify-between gap-3 font-bold text-(--text)">
            <span>Buyers save</span>
            <span>
              {price > 0 && saving > 0
                ? `${inr(saving)} (${Math.round((saving / apart) * 100)}%)`
                : "—"}
            </span>
          </div>
        </div>

        <p
          className={`m-0 rounded-[10px] px-3.5 py-2.5 text-[0.82rem] font-semibold ${
            problem
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
          aria-live="polite"
        >
          {problem ??
            `Shows as “You save ${inr(saving)}” on each of these courses' price cards.`}
        </p>

        <label className="flex items-center justify-between gap-3 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3.5 py-3">
          <span>
            <span className="block text-[0.88rem] font-semibold text-(--text)">
              Show on the price cards
            </span>
            <span className="block text-[0.75rem] text-(--muted)">
              Off keeps it as a draft only you can see here.
            </span>
          </span>
          <ToggleSwitch
            checked={live}
            onChange={setLive}
            label="Show on the price cards"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="m-0 text-[0.82rem] font-semibold text-rose-500"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-4 sm:px-6">
        {bundle ? (
          confirmingDelete ? (
            <span className="flex items-center gap-3 text-[0.8rem]">
              <button
                type="button"
                onClick={() => void deleteBundle()}
                disabled={busy}
                className="cursor-pointer border-none bg-transparent p-0 font-bold text-rose-500 hover:underline"
              >
                Delete bundle
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="cursor-pointer border-none bg-transparent p-0 font-semibold text-(--muted) hover:underline"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="cursor-pointer border-none bg-transparent p-0 text-[0.8rem] font-semibold text-(--muted) hover:text-rose-500"
            >
              Delete
            </button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2.5">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || problem !== null}
          >
            {busy ? "Saving…" : "Save bundle"}
          </Button>
        </div>
      </div>
    </SlideOverPanel>
  );
}
