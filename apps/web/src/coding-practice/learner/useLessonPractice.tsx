import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  prefetchCodingPractice,
  useCoursePractice,
} from "../../services/coding-practice";
import { useLocation, useNavigate } from "react-router";
import { practicePath, type PracticeReturn } from "../lab/practicePaths";
import { preloadPracticeWorkspace } from "../lab/usePreloadPracticeWorkspace";
import { CODE_TONES, FOCUS_RING } from "../shared/ui";
import { PracticeCard, type PracticeItem } from "./PracticeCard";

/** An older link to a question (`?practice=<id>` on a lecture). */
function practiceInAddress(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("practice");
}

/** Runs `work` once the page is idle (soon, where idle callbacks are missing). */
function whenIdle(work: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(work, { timeout: 3_000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(work, 1_500);
  return () => window.clearTimeout(timer);
}

/** The current lecture's questions fetched ahead, at most this many. */
const PREFETCH_PER_LECTURE = 3;

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
  courseSlug,
  lessons,
  lessonUuidOf,
  lessonTitleOf,
  currentLesson,
}: {
  courseId: string | undefined;
  /** The question opens at /practice/<course slug>/<question>. */
  courseSlug: string | undefined;
  /** The lecture on screen: its practice is fetched ahead. */
  currentLesson?: number | null;
  /** The course's lessons, by number. */
  lessons: ReadonlyMap<number, unknown>;
  lessonUuidOf: (lessonNumber: number) => string | undefined;
  lessonTitleOf: (lessonNumber: number) => string;
}) {
  const practice = useCoursePractice(courseId);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<number | null>(null);

  /**
   * The question at its own address. Back there returns to this lecture;
   * the question is fetched alongside the page's code, not after it.
   */
  const openQuestion = useCallback(
    (assignmentId: string, options: { replace?: boolean } = {}) => {
      if (!courseSlug) return;
      prefetchCodingPractice(queryClient, assignmentId);
      const url = new URL(window.location.href);
      url.searchParams.delete("practice");
      const state: PracticeReturn = {
        practiceFrom: `${url.pathname}${url.search}${url.hash}`,
        // Replaced: Back opens the lecture instead of stepping back.
        practiceBack: !options.replace,
      };
      navigate(practicePath(courseSlug, assignmentId), {
        replace: options.replace,
        state,
      });
    },
    [courseSlug, navigate, queryClient],
  );

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
      if (items.length === 1) openQuestion(items[0]!.assignmentId);
      else setPicking(lessonNumber);
    },
    [itemsOf, openQuestion],
  );

  // A course with practice: the practice screen's code is fetched while
  // the page is idle, so opening a question does not wait for it.
  const hasPractice = marked.size > 0;
  useEffect(() => {
    if (!hasPractice) return undefined;
    return whenIdle(preloadPracticeWorkspace);
  }, [hasPractice]);

  // The lecture on screen: its questions too.
  const currentItems =
    currentLesson === null || currentLesson === undefined
      ? null
      : itemsOf(currentLesson);
  const currentIds = (currentItems ?? [])
    .slice(0, PREFETCH_PER_LECTURE)
    .map((item) => item.assignmentId)
    .join(",");
  useEffect(() => {
    if (!currentIds) return undefined;
    return whenIdle(() => {
      for (const id of currentIds.split(","))
        prefetchCodingPractice(queryClient, id);
    });
  }, [currentIds, queryClient]);

  // An older address that names a question on the lecture (?practice=…,
  // before 24 Nov 2026): it moves to the question's own address, once. The
  // id is read when the lecture opens: the lesson route tidies its address
  // (dropping ?practice) before the course's questions arrive. Once tidied,
  // the question is pushed and Back returns to the clean lecture; while the
  // lecture's entry still has ?practice, the question replaces it, so Back
  // can never land on ?practice again and open the question in a loop.
  const wantedAtOpen = useRef<string | null | undefined>(undefined);
  if (wantedAtOpen.current === undefined)
    wantedAtOpen.current = practiceInAddress();
  useEffect(() => {
    const wanted = wantedAtOpen.current;
    if (!wanted || !practice.data) return;
    wantedAtOpen.current = null;
    if (!practice.data.some((item) => item.assignmentId === wanted)) return;
    openQuestion(wanted, { replace: practiceInAddress() !== null });
  }, [practice.data, openQuestion]);

  // Back on the lecture: its icon is no longer the open one.
  useEffect(() => {
    if (picking === null) setActiveLesson(null);
  }, [picking, location.key]);

  const marks = useMemo<LessonPracticeMarks>(
    () => ({ lessonNumbers: marked, activeLesson, onOpen }),
    [marked, activeLesson, onOpen],
  );

  const view = (
    <>
      {picking !== null ? (
        <PracticePicker
          title={lessonTitleOf(picking)}
          items={itemsOf(picking)}
          onPick={(assignmentId) => {
            setPicking(null);
            openQuestion(assignmentId);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </>
  );

  return { marks, view };
}
