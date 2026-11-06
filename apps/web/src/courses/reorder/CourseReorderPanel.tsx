import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ManagedCourseSummary } from "@veolms/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../../components/ui/drawer";
import { moveCourseBy, sameOrder } from "./courseOrder";
import { useCourseDragOrder } from "./useCourseDragOrder";

export interface CourseReorderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every course the admin's list holds, in its saved order. */
  courses: readonly ManagedCourseSummary[];
  saving: boolean;
  onSave: (courseIds: string[]) => Promise<void>;
}

const STATUS_LABEL: Record<ManagedCourseSummary["status"], string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

/**
 * Every course in one list, put in order by dragging or with the arrow
 * buttons, and saved together. Nothing changes until Save is pressed.
 */
export function CourseReorderPanel({
  open,
  onOpenChange,
  courses,
  saving,
  onSave,
}: CourseReorderPanelProps) {
  const savedIds = useMemo(() => courses.map((course) => course.id), [courses]);
  const [ids, setIds] = useState<string[]>(savedIds);
  const [dragHandleId, setDragHandleId] = useState<string | null>(null);
  const byId = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  // Each opening starts from the saved order.
  useEffect(() => {
    if (open) setIds(savedIds);
  }, [open, savedIds]);

  const drag = useCourseDragOrder(ids, setIds);
  const changed = !sameOrder(ids, savedIds);
  const shown = drag.order.filter((id) => byId.has(id));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent
        aria-label="Reorder courses"
        className="m-0! border-l border-(--border) data-[swipe-direction=right]:rounded-none! [--drawer-content-width:100%]! sm:[--drawer-content-width:min(36rem,92vw)]! xl:[--drawer-content-width:40rem]!"
      >
        <header className="flex items-start gap-3 border-b border-(--border) px-6 py-5">
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-base font-semibold text-(--text)">
              Reorder courses
            </DrawerTitle>
            <DrawerDescription className="mt-1.5 max-w-[34rem] text-[0.85rem] leading-6 text-(--muted)">
              Drag courses into the order everyone should see them in. The home
              page, the catalogue and every course list, for learners and
              visitors alike, follow it.
            </DrawerDescription>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </button>
        </header>

        <ol
          className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto px-4 py-4"
          data-base-ui-swipe-ignore=""
          aria-label="Courses, first to last"
        >
          {shown.map((id, index) => {
            const course = byId.get(id)!;
            const dragging = drag.draggedId === id;
            const handlers = drag.handlersFor(id, course.title);
            return (
              <li
                key={id}
                draggable={!saving && dragHandleId === id}
                {...handlers}
                onDragEnd={() => {
                  handlers.onDragEnd();
                  setDragHandleId(null);
                }}
                data-course-reorder-item={id}
                className={`group/line flex items-center gap-3 rounded-xl border bg-(--surface) p-2 pr-2.5 transition-colors ${
                  dragging
                    ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] opacity-60"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-(--hover)"
                }`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-md p-1 text-(--muted) ${
                    saving
                      ? "pointer-events-none opacity-30"
                      : "cursor-grab hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:cursor-grabbing"
                  }`}
                  onPointerEnter={() => setDragHandleId(id)}
                  onPointerDown={() => setDragHandleId(id)}
                  onPointerLeave={() => {
                    if (!drag.draggedId) setDragHandleId(null);
                  }}
                  title="Drag to reorder"
                  aria-hidden="true"
                >
                  <DotsSixVertical size={18} />
                </span>
                <span className="w-6 shrink-0 text-right text-[0.75rem] font-semibold tabular-nums text-(--muted)">
                  {index + 1}
                </span>
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    alt=""
                    className="h-11 w-18 shrink-0 rounded-md object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="h-11 w-18 shrink-0 rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="line-clamp-2 text-[0.9rem] leading-snug font-semibold break-words text-(--text)"
                    title={course.title}
                  >
                    {course.title}
                  </span>
                  <span className="mt-0.5 text-[0.75rem] text-(--muted)">
                    {STATUS_LABEL[course.status]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`Move ${course.title} up`}
                    disabled={saving || index === 0}
                    className="inline-flex size-7 items-center justify-center rounded-md text-(--muted) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:opacity-30"
                    onClick={() => setIds(moveCourseBy(ids, id, -1))}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${course.title} down`}
                    disabled={saving || index === shown.length - 1}
                    className="inline-flex size-7 items-center justify-center rounded-md text-(--muted) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:opacity-30"
                    onClick={() => setIds(moveCourseBy(ids, id, 1))}
                  >
                    <ArrowDown size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>

        <footer className="flex items-center justify-end gap-2 border-t border-(--border) px-6 py-4">
          <button
            type="button"
            className="min-h-10 rounded-(--control-radius-action) px-4 text-[0.8rem] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!changed || saving}
            aria-busy={saving}
            className="inline-flex min-h-10 items-center gap-2 rounded-(--control-radius-action) bg-(--accent) px-4 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:opacity-50"
            onClick={() => void onSave(ids)}
          >
            {saving ? (
              <CircleNotch size={16} className="animate-spin" aria-hidden />
            ) : null}
            Save order
          </button>
        </footer>
      </DrawerContent>
    </Drawer>
  );
}
