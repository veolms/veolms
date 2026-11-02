import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { PartialAccessCourse } from "@veolms/contracts";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { copyTextToClipboard } from "../lib/clipboard";
import { Switch } from "../home-page-settings/homePageSettingsControls";
import { usePartialAccess, useSavePartialAccess } from "../services/courses";
import {
  formatPriceWithCurrency,
  getCurrencySymbol,
} from "./overview/coursePriceFormat";

export interface CoursePartialAccessCardProps {
  courseId: string | null;
}

const fieldClass =
  "w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 px-3.5 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed";
const labelClass = "text-(--text-secondary) text-[0.84rem] font-semibold";
const rowClass =
  "rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]";
const linkButtonClass =
  "cursor-pointer border-none bg-transparent p-0 text-[0.78rem] font-bold hover:underline disabled:cursor-not-allowed disabled:opacity-50";
/** A row's own actions (Copy link, Edit, Delete): small buttons. */
const rowActionClass = "h-8 gap-1.5 px-3 text-[0.8rem]";

interface Draft {
  title: string;
  salePrice: string;
  sectionIds: ReadonlySet<string>;
  onSale: boolean;
}

/** The page a part of the course is sold from, as a full address. */
function offerUrl(item: PartialAccessCourse): string {
  return typeof window === "undefined"
    ? item.offerPath
    : new URL(item.offerPath, window.location.origin).toString();
}

function draftFrom(item: PartialAccessCourse | null): Draft {
  return {
    title: item?.title ?? "",
    salePrice: item ? String(item.salePrice) : "",
    sectionIds: new Set(item?.sectionIds ?? []),
    onSale: item?.onSale ?? false,
  };
}

function wholeNumber(value: string): number | null {
  const trimmed = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Parts of this course sold on their own. Each one is an unlisted course:
 * it is shown nowhere, not even in the course list, and exists for its
 * purchase records and invoices. Whoever holds it gets this course with only
 * the chosen sections open; the other lessons stay locked.
 */
export function CoursePartialAccessCard({
  courseId,
}: CoursePartialAccessCardProps) {
  const query = usePartialAccess(courseId);
  const save = useSavePartialAccess();
  // null: no form open; "new": adding one; otherwise the one being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const coursePrice = query.data?.coursePrice ?? 0;
  const courseCurrency = query.data?.courseCurrency ?? "INR";
  const sections = useMemo(() => query.data?.sections ?? [], [query.data]);

  function remove(partialCourseId: string) {
    if (!courseId) return;
    setConfirmingDelete(null);
    save.mutate({ courseId, action: "delete", partialCourseId });
  }

  return (
    <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
      <div className="mb-4.5">
        <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
          Partial access
        </h3>
        <p className="m-0 text-(--muted) text-[0.83rem]">
          Sell some sections of this course on their own. Each one is a hidden
          course with its own name and price: it is not listed anywhere, and its
          orders and invoices carry its name. Students who have it see this
          course with only the chosen sections open.
        </p>
      </div>

      {!courseId ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-5 text-center text-xs text-(--muted)">
          Save course basics before adding partial access.
        </div>
      ) : query.isError ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-red-400">
            Unable to load partial access.{" "}
            {query.error?.message ?? "Please try again."}
          </p>
          <Button
            type="button"
            onClick={() => void query.refetch()}
            className="w-fit"
          >
            Retry
          </Button>
        </div>
      ) : query.isLoading ? (
        <CircleNotch size={18} className="animate-spin text-(--muted)" />
      ) : (
        <div className="flex flex-col gap-3.5">
          {items.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {items.map((item) =>
                editing === item.courseId ? (
                  <li key={item.courseId}>
                    <PartialAccessForm
                      courseId={courseId}
                      item={item}
                      sections={sections}
                      coursePrice={coursePrice}
                      courseCurrency={courseCurrency}
                      onDone={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={item.courseId}
                    className={`${rowClass} flex flex-wrap items-center gap-3 px-3.5 py-2.5`}
                  >
                    <PuzzlePiece
                      size={16}
                      weight="bold"
                      className="shrink-0 text-(--accent)"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88rem] font-semibold text-(--text)">
                        {item.title}
                      </span>
                      <span className="block text-[0.76rem] text-(--muted)">
                        {item.sectionIds.length} of {sections.length} sections
                        {" · "}
                        {formatPriceWithCurrency(item.salePrice, item.currency)}
                        {" · "}
                        {item.learnerCount === 1
                          ? "1 student"
                          : `${item.learnerCount} students`}
                        {" · "}
                        {item.onSale ? "On sale" : "Not on sale"}
                      </span>
                    </span>
                    {confirmingDelete === item.courseId ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="danger"
                          motion="static"
                          onClick={() => remove(item.courseId)}
                          className={rowActionClass}
                        >
                          <Trash size={14} weight="bold" aria-hidden="true" />
                          Delete
                        </Button>
                        <Button
                          variant="quiet"
                          motion="static"
                          onClick={() => setConfirmingDelete(null)}
                          className={rowActionClass}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2">
                        <CopyLinkButton url={offerUrl(item)} />
                        <Button
                          variant="quiet"
                          motion="static"
                          onClick={() => setEditing(item.courseId)}
                          disabled={editing !== null || save.isPending}
                          className={rowActionClass}
                        >
                          <PencilSimple
                            size={14}
                            weight="bold"
                            aria-hidden="true"
                          />
                          Edit
                        </Button>
                        {/* Kept once anyone has it: their orders name it. */}
                        {item.learnerCount === 0 && item.orderCount === 0 && (
                          <Button
                            variant="quiet"
                            motion="static"
                            onClick={() => setConfirmingDelete(item.courseId)}
                            disabled={editing !== null || save.isPending}
                            aria-label={`Delete ${item.title}`}
                            className="size-8 px-0"
                          >
                            <Trash size={14} weight="bold" aria-hidden="true" />
                          </Button>
                        )}
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}

          {editing === "new" ? (
            <PartialAccessForm
              courseId={courseId}
              item={null}
              sections={sections}
              coursePrice={coursePrice}
              courseCurrency={courseCurrency}
              onDone={() => setEditing(null)}
            />
          ) : (
            <Button
              type="button"
              variant="quiet"
              onClick={() => setEditing("new")}
              disabled={editing !== null || sections.length === 0}
              className="w-fit"
            >
              Add partial access
            </Button>
          )}

          {sections.length === 0 && (
            <p className="m-0 text-[0.78rem] text-(--muted)">
              Add sections to the curriculum first.
            </p>
          )}

          {save.isError && editing === null && (
            <p className="m-0 text-xs font-medium text-rose-500">
              {save.error?.message ?? "Could not update partial access."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** How long the button says "Copied" before it is "Copy link" again. */
const COPIED_FOR_MS = 1800;

/**
 * Copies a partial access link. The answer shows on the button itself, and
 * only there: green with a tick that pops in, "Copied"; or red, "Copy
 * failed", when the browser refuses the copy.
 */
function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copy() {
    const copied = await copyTextToClipboard(url);
    setState(copied ? "copied" : "failed");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(
      () => setState("idle"),
      COPIED_FOR_MS,
    );
  }

  const copied = state === "copied";
  const failed = state === "failed";
  return (
    <>
      <Button
        variant="quiet"
        motion="static"
        onClick={() => void copy()}
        className={`${rowActionClass} min-w-28 duration-200 ${
          copied
            ? "bg-emerald-500/14! text-emerald-500!"
            : failed
              ? "bg-rose-500/12! text-rose-500!"
              : ""
        }`}
      >
        {copied ? (
          <Check
            key="copied"
            size={14}
            weight="bold"
            aria-hidden="true"
            className="animate-in zoom-in-50 spin-in-12 duration-200"
          />
        ) : failed ? (
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
        ) : (
          <LinkSimple size={14} weight="bold" aria-hidden="true" />
        )}
        {copied ? "Copied" : failed ? "Copy failed" : "Copy link"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied" : failed ? "Could not copy the link" : ""}
      </span>
    </>
  );
}

/** Adds a part of the course, or changes one: title, price and sections. */
function PartialAccessForm({
  courseId,
  item,
  sections,
  coursePrice,
  courseCurrency,
  onDone,
}: {
  courseId: string;
  item: PartialAccessCourse | null;
  sections: readonly { id: string; title: string }[];
  /** What the whole course sells for: the part is shown against it. */
  coursePrice: number;
  /** The whole course's currency, which the part is sold in too. */
  courseCurrency: string;
  onDone: () => void;
}) {
  const save = useSavePartialAccess();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item));
  const [error, setError] = useState<string | null>(null);
  const formId = item?.courseId ?? "new";

  function toggleSection(sectionId: string, checked: boolean) {
    setDraft((current) => {
      const next = new Set(current.sectionIds);
      if (checked) next.add(sectionId);
      else next.delete(sectionId);
      return { ...current, sectionIds: next };
    });
  }

  function submit() {
    const title = draft.title.trim();
    const salePrice = wholeNumber(draft.salePrice);
    if (!title) return setError("Give it a name.");
    if (salePrice === null) {
      return setError("Enter the price as a whole number.");
    }
    if (draft.sectionIds.size === 0) {
      return setError("Choose at least one section.");
    }
    setError(null);
    const payload = {
      title,
      salePrice,
      onSale: draft.onSale,
      sectionIds: sections
        .map((section) => section.id)
        .filter((id) => draft.sectionIds.has(id)),
    };
    save.mutate(
      item
        ? {
            courseId,
            action: "update",
            partialCourseId: item.courseId,
            payload,
          }
        : { courseId, action: "create", payload },
      { onSuccess: onDone },
    );
  }

  const allChosen = draft.sectionIds.size === sections.length;

  return (
    <div className={`${rowClass} flex flex-col gap-4 p-4`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`partial-title-${formId}`} className={labelClass}>
            Name
          </label>
          {/* On sale: anyone with its link can buy it. */}
          <span className="flex items-center gap-2 text-[0.8rem] font-semibold text-(--text-secondary)">
            Enable link
            <Switch
              checked={draft.onSale}
              onChange={(onSale) =>
                setDraft((current) => ({ ...current, onSale }))
              }
              label="Enable link"
            />
          </span>
        </div>
        <input
          id={`partial-title-${formId}`}
          type="text"
          value={draft.title}
          maxLength={200}
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
          placeholder="Core Concepts Edition"
          className={fieldClass}
        />
        <p className="m-0 text-(--muted) text-[0.78rem]">
          What purchase history and invoices call it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`partial-sale-${formId}`} className={labelClass}>
          Selling price ({getCurrencySymbol(courseCurrency).trim()})
        </label>
        <input
          id={`partial-sale-${formId}`}
          type="text"
          inputMode="numeric"
          value={draft.salePrice}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              salePrice: event.target.value,
            }))
          }
          placeholder="1499"
          className={fieldClass}
        />
        {coursePrice > 0 && (
          <p className="m-0 text-(--muted) text-[0.78rem]">
            Shown against the full course&apos;s price,{" "}
            {formatPriceWithCurrency(coursePrice, courseCurrency)}, with the
            difference as a partial access discount.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>
            Sections it opens ({draft.sectionIds.size} of {sections.length})
          </span>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                sectionIds: new Set(
                  allChosen ? [] : sections.map((section) => section.id),
                ),
              }))
            }
            className={`${linkButtonClass} text-(--accent)`}
          >
            {allChosen ? "Clear" : "Choose all"}
          </button>
        </div>
        <ol className="m-0 p-0 list-none flex flex-col">
          {sections.map((section, index) => (
            <li key={section.id}>
              <Checkbox
                id={`partial-section-${formId}-${section.id}`}
                className="w-full -ml-2.5"
                checked={draft.sectionIds.has(section.id)}
                onCheckedChange={(checked) =>
                  toggleSection(section.id, checked)
                }
                label={`${index + 1}. ${section.title}`}
              />
            </li>
          ))}
        </ol>
      </div>

      {item && item.learnerCount > 0 && (
        <p className="m-0 text-[0.78rem] text-(--muted)">
          A change of sections reaches its {item.learnerCount}{" "}
          {item.learnerCount === 1 ? "student" : "students"} straight away. Past
          orders keep the name and price they were bought under.
        </p>
      )}

      {(error || save.isError) && (
        <p className="m-0 text-xs font-medium text-rose-500">
          {error ?? save.error?.message ?? "Could not save."}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving…" : item ? "Save changes" : "Add"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
