import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  BUILT_IN_COURSE_PAGE_SECTIONS,
  COURSE_PAGE_LIMITS,
  type CoursePageSection,
  type CoursePageSectionKind,
  type CoursePageSectionsResponse,
  type CourseSeo,
} from "@veolms/contracts";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { CenteredLoadingSpinner } from "../../../components/LoadingSpinner";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { getApiError } from "../../../lib/api-error";
import { useAutosync } from "../../../lib/autosync";
import {
  useCoursePageSections,
  useReorderCoursePageSections,
  useUpdateCoursePageSection,
} from "../../../services/courses";
import { WorkshopSaveStatus } from "../../../workshops/WorkshopSaveStatus";
import { inputClass, surfaceClass } from "../../../workshops/workshopHelpers";
import { SALES_SECTION_META, sectionSummary } from "./salesPageMeta";
import { SectionEditor } from "./SalesSectionEditors";

/**
 * The course editor's "Sales page" step
 * (creator-features/39-sales-page-sections-plan.md): the course page's
 * ready sections, switched on, put in order and filled in, and the page's
 * search title and description. Everything saves as it is typed.
 */

const iconButtonClasses =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:pointer-events-none disabled:opacity-30";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function SeoCard({
  courseId,
  courseTitle,
  shortDescription,
  pagePath,
  seo,
}: {
  courseId: string;
  courseTitle: string;
  shortDescription: string;
  pagePath: string;
  seo: CourseSeo;
}) {
  const update = useUpdateCoursePageSection();
  const autosync = useAutosync<CourseSeo, CoursePageSectionsResponse>({
    key: { entity: "course-page-seo", entityId: courseId, scope: "editor" },
    initialValue: seo,
    debounceMs: 900,
    maxWaitMs: 15_000,
    sync: (draft) =>
      update.mutateAsync({
        courseId,
        kind: "seo",
        payload: { content: draft },
      }),
    onSynced: (saved) => saved.seo,
  });
  const value = autosync.value;
  const shownTitle = value.title.trim() || courseTitle;
  const shownDescription = value.description.trim() || shortDescription;
  return (
    <section
      className={`${surfaceClass} grid gap-4 p-5`}
      aria-labelledby="sales-seo-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            <MagnifyingGlass size={18} weight="bold" />
          </span>
          <div>
            <h3
              id="sales-seo-heading"
              className="m-0 text-[15px] font-bold text-(--text)"
            >
              Search and sharing
            </h3>
            <p className="m-0 mt-0.5 text-[13px] text-(--muted)">
              How the page shows in Google and in links shared on WhatsApp.
              Leave empty to use the course title and short description.
            </p>
          </div>
        </div>
        <WorkshopSaveStatus status={autosync.status} error={autosync.error} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label
              htmlFor="sales-seo-title"
              className="text-[12.5px] font-medium text-(--muted)"
            >
              Search title
            </label>
            <span className="text-[11.5px] text-(--muted) tabular-nums">
              {value.title.length}/{COURSE_PAGE_LIMITS.seoTitle}
            </span>
          </div>
          <input
            id="sales-seo-title"
            type="text"
            value={value.title}
            maxLength={COURSE_PAGE_LIMITS.seoTitle}
            onChange={(event) =>
              autosync.update({ ...value, title: event.target.value })
            }
            placeholder={courseTitle}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label
              htmlFor="sales-seo-description"
              className="text-[12.5px] font-medium text-(--muted)"
            >
              Search description
            </label>
            <span className="text-[11.5px] text-(--muted) tabular-nums">
              {value.description.length}/{COURSE_PAGE_LIMITS.seoDescription}
            </span>
          </div>
          <input
            id="sales-seo-description"
            type="text"
            value={value.description}
            maxLength={COURSE_PAGE_LIMITS.seoDescription}
            onChange={(event) =>
              autosync.update({ ...value, description: event.target.value })
            }
            placeholder={
              shortDescription || "One or two sentences that make people click."
            }
            className={`${inputClass} w-full`}
          />
        </div>
      </div>
      <div
        className="grid gap-0.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3"
        aria-label="Search result preview"
      >
        <span className="truncate text-[12px] text-(--muted)">{pagePath}</span>
        <span className="truncate text-[15px] font-semibold text-(--accent-ink,var(--accent))">
          {shownTitle}
        </span>
        <span className="line-clamp-2 text-[13px] text-(--text-secondary,var(--muted))">
          {shownDescription ||
            "Add a short description so people know what they'll get."}
        </span>
      </div>
    </section>
  );
}

function SectionCard({
  courseId,
  section,
  index,
  count,
  open,
  onToggleOpen,
  onMove,
  dragging,
  handleProps,
  dragProps,
}: {
  courseId: string;
  section: CoursePageSection;
  index: number;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  onMove: (to: number) => void;
  dragging: boolean;
  handleProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  dragProps: {
    draggable: boolean;
    onDragStart: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragEnd: () => void;
  };
}) {
  const meta = SALES_SECTION_META[section.kind];
  const builtIn = BUILT_IN_COURSE_PAGE_SECTIONS.includes(section.kind);
  const update = useUpdateCoursePageSection();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const autosync = useAutosync<
    CoursePageSection["content"],
    CoursePageSectionsResponse
  >({
    key: {
      entity: "course-page-section",
      entityId: `${courseId}:${section.kind}`,
      scope: "editor",
    },
    initialValue: section.content,
    enabled: !builtIn,
    debounceMs: 900,
    maxWaitMs: 15_000,
    sync: (content) =>
      update.mutateAsync({
        courseId,
        kind: section.kind,
        payload: { content },
      }),
    onSynced: (saved) =>
      saved.sections.find((other) => other.kind === section.kind)?.content ??
      section.content,
  });
  const current = { ...section, content: autosync.value } as CoursePageSection;
  const Icon = meta.Icon;

  return (
    <li
      {...dragProps}
      className={`rounded-xl border bg-(--surface) transition-colors ${
        dragging
          ? "border-(--accent)/60 opacity-60"
          : open
            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
      }`}
    >
      <div className="flex items-center gap-1.5 p-2 pr-3">
        <span
          // Dragging is mouse-only (HTML drag and drop): on a phone the
          // arrows move a section, so the handle is left out there.
          className="flex shrink-0 cursor-grab items-center justify-center rounded-md p-1 text-(--muted) max-sm:hidden hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:cursor-grabbing"
          title="Drag to move"
          aria-hidden="true"
          {...handleProps}
        >
          <DotsSixVertical size={18} />
        </span>
        <button
          type="button"
          onClick={builtIn ? undefined : onToggleOpen}
          aria-expanded={builtIn ? undefined : open}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border-none bg-transparent p-1 text-left ${builtIn ? "cursor-default" : "cursor-pointer"}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent) max-sm:hidden">
            <Icon size={18} weight="bold" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate text-[14px] font-semibold text-(--text)">
              {meta.title}
            </span>
            <span className="truncate text-[12.5px] text-(--muted)">
              {builtIn
                ? "Always shown"
                : current.isVisible
                  ? sectionSummary(current)
                  : "Switched off"}
            </span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={iconButtonClasses}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
            aria-label={`Move ${meta.title} up`}
            title="Move up"
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            className={iconButtonClasses}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
            aria-label={`Move ${meta.title} down`}
            title="Move down"
          >
            <ArrowDown size={15} />
          </button>
          {builtIn ? null : (
            <>
              <span className="mx-1.5">
                <ToggleSwitch
                  checked={section.isVisible}
                  onChange={(isVisible) => {
                    setSwitchError(null);
                    update.mutate(
                      { courseId, kind: section.kind, payload: { isVisible } },
                      {
                        onError: (error) =>
                          setSwitchError(getApiError(error).message),
                      },
                    );
                  }}
                  label={`Show ${meta.title} on the page`}
                />
              </span>
              <button
                type="button"
                className={iconButtonClasses}
                onClick={onToggleOpen}
                aria-label={open ? `Close ${meta.title}` : `Edit ${meta.title}`}
              >
                <CaretDown
                  size={15}
                  weight="bold"
                  className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
            </>
          )}
        </span>
      </div>
      {switchError ? (
        <p className="m-0 px-4 pb-2 text-[12px] text-rose-500">{switchError}</p>
      ) : null}
      {open && !builtIn ? (
        <div className="grid gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="m-0 max-w-xl text-[13px] text-(--muted)">
              {meta.hint}
            </p>
            <WorkshopSaveStatus
              status={autosync.status}
              error={autosync.error}
            />
          </div>
          <SectionEditor
            section={current}
            onChange={(content) => autosync.update(content)}
          />
        </div>
      ) : null}
    </li>
  );
}

export function SalesPageStepPanel({
  courseId,
  courseSlug,
  courseTitle,
  shortDescription,
}: {
  courseId: string | null;
  courseSlug: string | undefined;
  courseTitle: string;
  shortDescription: string;
}) {
  const query = useCoursePageSections(courseId);
  const reorder = useReorderCoursePageSections();
  const [order, setOrder] = useState<CoursePageSectionKind[]>([]);
  const [openKind, setOpenKind] = useState<CoursePageSectionKind | null>(null);
  const [handleKind, setHandleKind] = useState<CoursePageSectionKind | null>(
    null,
  );
  const [dragging, setDragging] = useState<CoursePageSectionKind | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const draggedIndex = useRef<number | null>(null);

  const serverOrder = query.data?.sections.map((section) => section.kind) ?? [];
  const serverOrderKey = serverOrder.join(",");
  useEffect(() => {
    if (!dragging)
      setOrder(
        serverOrderKey
          ? (serverOrderKey.split(",") as CoursePageSectionKind[])
          : [],
      );
  }, [serverOrderKey, dragging]);

  if (!courseId) {
    return (
      <div className={`${surfaceClass} p-6 text-sm text-(--muted)`}>
        Save the course&apos;s basics first, then come back to build its sales
        page.
      </div>
    );
  }
  if (query.isLoading || !query.data) {
    return query.isError ? (
      <div className={`${surfaceClass} p-6 text-sm text-rose-500`}>
        {getApiError(query.error).message}
      </div>
    ) : (
      <CenteredLoadingSpinner
        label="Loading the sales page"
        className="min-h-52 py-16"
      />
    );
  }

  const byKind = new Map(
    query.data.sections.map((section) => [section.kind, section]),
  );
  const shown = (order.length ? order : serverOrder).filter((kind) =>
    byKind.has(kind),
  );
  const pagePath = courseSlug ? `/courses/${courseSlug}/overview` : "";

  const commitOrder = (next: CoursePageSectionKind[]) => {
    setOrderError(null);
    setOrder(next);
    reorder.mutate(
      { courseId, kinds: next },
      { onError: (error) => setOrderError(getApiError(error).message) },
    );
  };

  const onDragStart = (event: DragEvent, index: number) => {
    draggedIndex.current = index;
    setDragging(shown[index]!);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      SALES_SECTION_META[shown[index]!].title,
    );
  };
  const onDragOver = (event: DragEvent, index: number) => {
    const from = draggedIndex.current;
    if (from === null) return;
    event.preventDefault();
    if (from === index) return;
    draggedIndex.current = index;
    setOrder(move(shown, from, index));
  };
  const onDragEnd = () => {
    const moved =
      draggedIndex.current !== null && shown.join(",") !== serverOrderKey;
    draggedIndex.current = null;
    setDragging(null);
    setHandleKind(null);
    if (moved) commitOrder(shown);
  };

  return (
    <div className="grid w-full min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-2xl text-[13.5px] leading-6 text-(--muted)">
          Turn your course page into a sales page. Switch on the sections you
          want, fill them in and put them in order. An empty section is never
          shown.
        </p>
        {pagePath ? (
          <a
            href={pagePath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <ArrowSquareOut size={16} />
            Preview page
          </a>
        ) : null}
      </div>

      <SeoCard
        courseId={courseId}
        courseTitle={courseTitle}
        shortDescription={shortDescription}
        pagePath={pagePath}
        seo={query.data.seo}
      />

      <section
        className={`${surfaceClass} grid gap-3 p-5`}
        aria-labelledby="sales-sections-heading"
      >
        <div>
          <h3
            id="sales-sections-heading"
            className="m-0 text-[15px] font-bold text-(--text)"
          >
            Page sections
          </h3>
          <p className="m-0 mt-0.5 text-[13px] text-(--muted)">
            In the order they appear under the price. Drag the handle or use the
            arrows to move one.
          </p>
        </div>
        {orderError ? (
          <p className="m-0 text-[12.5px] text-rose-500">{orderError}</p>
        ) : null}
        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Page sections">
          {shown.map((kind, index) => {
            const section = byKind.get(kind)!;
            return (
              <SectionCard
                key={kind}
                dragProps={{
                  draggable: handleKind === kind,
                  onDragStart: (event) => onDragStart(event, index),
                  onDragOver: (event) => onDragOver(event, index),
                  onDragEnd,
                }}
                courseId={courseId}
                section={section}
                index={index}
                count={shown.length}
                open={openKind === kind}
                onToggleOpen={() =>
                  setOpenKind(openKind === kind ? null : kind)
                }
                onMove={(to) => commitOrder(move(shown, index, to))}
                dragging={dragging === kind}
                handleProps={{
                  onMouseEnter: () => setHandleKind(kind),
                  onMouseLeave: () => {
                    if (!dragging) setHandleKind(null);
                  },
                }}
              />
            );
          })}
        </ul>
      </section>
    </div>
  );
}
