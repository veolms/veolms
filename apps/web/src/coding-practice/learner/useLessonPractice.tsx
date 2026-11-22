import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useCoursePractice } from "../../services/coding-practice";
import { CODE_TONES, FOCUS_RING } from "../shared/ui";
import { PracticeCard, type PracticeItem } from "./PracticeCard";
import { usePracticeViewer } from "./usePracticeViewer";

/** What the lessons list needs to show and open a lecture's practice. */
export interface LessonPracticeMarks {
  /** Lessons (by number in the course) with published practice. */
  lessonNumbers: ReadonlySet<number>;
  /** The lesson whose practice is open, if any. */
  activeLesson: number | null;
  onOpen: (lessonNumber: number) => void;
}

/** A lecture with more than one question: pick which to practise. */
function PracticePicker({
  title,
  items,
  onPick,
  onClose,
}: {
  title: string;
  items: PracticeItem[];
  onPick: (assignmentId: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const done = items.filter((item) => item.status === "done").length;
  return createPortal(
    <div
      className={`fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 ${CODE_TONES}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Practice for ${title}`}
        className="grid max-h-[85dvh] w-full max-w-lg grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-2xl bg-(--surface) text-(--text) shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))">
            <CodeGlyph size={18} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Practice</p>
            <p className="truncate text-xs text-(--muted)">
              {title} · {done} of {items.length} done
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex size-9 cursor-pointer items-center justify-center rounded-full text-(--text-secondary) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) ${FOCUS_RING}`}
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <ul className="grid content-start gap-2 overflow-y-auto px-4 pb-4">
          {items.map((item) => (
            <PracticeCard key={item.assignmentId} item={item} onOpen={onPick} />
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A course's practice, by lecture, for the lessons list: which lessons have
 * practice (they show a practice icon, like the quiz's) and what happens
 * when it is pressed. One question opens straight away; several open a
 * short list to pick from. `view` is the open question or list.
 */
export function useLessonPractice({
  courseId,
  lessons,
  lessonUuidOf,
  lessonTitleOf,
}: {
  courseId: string | undefined;
  /** The course's lessons, by number. */
  lessons: ReadonlyMap<number, unknown>;
  lessonUuidOf: (lessonNumber: number) => string | undefined;
  lessonTitleOf: (lessonNumber: number) => string;
}) {
  const practice = useCoursePractice(courseId);
  const viewer = usePracticeViewer();
  const [picking, setPicking] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<number | null>(null);

  const byLesson = useMemo(() => {
    const map = new Map<string, PracticeItem[]>();
    for (const item of practice.data ?? []) {
      if (!item.lessonId) continue;
      const list = map.get(item.lessonId) ?? [];
      list.push(item);
      map.set(item.lessonId, list);
    }
    return map;
  }, [practice.data]);

  const marked = useMemo(() => {
    const set = new Set<number>();
    if (byLesson.size === 0) return set;
    for (const number of lessons.keys()) {
      const uuid = lessonUuidOf(number);
      if (uuid && byLesson.has(uuid)) set.add(number);
    }
    return set;
  }, [byLesson, lessons, lessonUuidOf]);

  const itemsOf = useCallback(
    (lessonNumber: number) => {
      const uuid = lessonUuidOf(lessonNumber);
      return (uuid && byLesson.get(uuid)) || [];
    },
    [byLesson, lessonUuidOf],
  );

  const onOpen = useCallback(
    (lessonNumber: number) => {
      const items = itemsOf(lessonNumber);
      if (items.length === 0) return;
      setActiveLesson(lessonNumber);
      if (items.length === 1)
        viewer.open(items[0]!.assignmentId, lessonTitleOf(lessonNumber));
      else setPicking(lessonNumber);
    },
    [itemsOf, lessonTitleOf, viewer],
  );

  // The question closed: the lesson's icon is no longer the open one.
  useEffect(() => {
    if (!viewer.openId && picking === null) setActiveLesson(null);
  }, [viewer.openId, picking]);

  const marks = useMemo<LessonPracticeMarks>(
    () => ({ lessonNumbers: marked, activeLesson, onOpen }),
    [marked, activeLesson, onOpen],
  );

  const view = (
    <>
      {picking !== null && !viewer.openId ? (
        <PracticePicker
          title={lessonTitleOf(picking)}
          items={itemsOf(picking)}
          onPick={(assignmentId) =>
            viewer.open(assignmentId, lessonTitleOf(picking))
          }
          onClose={() => setPicking(null)}
        />
      ) : null}
      {viewer.view}
    </>
  );

  return { marks, view };
}
