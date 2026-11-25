import { useEffect } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import type { LecturePracticeResponse } from "@veolms/contracts";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import {
  LESSON_CARD_ACTIVE_SURFACE,
  LESSON_CARD_HOVER_SURFACE,
  LESSON_CARD_REST_SURFACE,
} from "../../learning/lessonCardSurfaces";
import {
  CODE_TONES,
  DifficultyLabel,
  DraftLabel,
  FOCUS_RING,
} from "../shared/ui";

type Item = LecturePracticeResponse["items"][number];

/** The question's number, or a tick once solved (as lesson rows show). */
function RowMark({ item, number }: { item: Item; number: number }) {
  if (item.status === "done")
    return (
      <span
        aria-label="Solved"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--code-pass)_16%,transparent)] text-(--code-pass)"
      >
        <Check size={14} weight="bold" aria-hidden="true" />
      </span>
    );
  return (
    <span
      aria-label={item.status === "started" ? "Attempted" : "To do"}
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
        item.status === "started"
          ? "border-2 border-dashed border-(--code-warn) text-(--code-warn)"
          : "border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-(--text-secondary)"
      }`}
    >
      {number}
    </span>
  );
}

/**
 * The course's questions (LeetCode's list), in the app's slide-over panel:
 * the same frame, header and backdrop as the other side panels, over the
 * question page.
 */
export function QuestionDrawer({
  items,
  currentId,
  onPick,
  onClose,
}: {
  items: LecturePracticeResponse["items"];
  currentId: string;
  onPick: (assignmentId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const solved = items.filter((item) => item.status === "done").length;
  const share = items.length ? solved / items.length : 0;
  return (
    <SlideOverPanel
      label="Questions"
      title="Questions"
      onClose={onClose}
      closeLabel="Close the list"
      side="left"
      // Over the question page, which is itself a full-screen layer.
      layerClassName="z-[1300]"
      // The question page's own ground, not the raised panel colour: the
      // list belongs to this page (the panel colour clashed with it).
      className={`max-w-md bg-(--canvas)! ${CODE_TONES}`}
      headerContent={
        <div className="mt-3 grid gap-2">
          <p className="text-sm text-(--muted)">
            <b className="text-(--text)">{solved}</b> of {items.length} solved
          </p>
          <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <span
              className="block h-full rounded-full bg-(--code-pass) transition-[width] duration-300"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </span>
        </div>
      }
    >
      <ul className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto p-3">
        {items.map((item, at) => {
          const current = item.assignmentId === currentId;
          return (
            <li key={item.assignmentId}>
              <button
                type="button"
                onClick={() => onPick(item.assignmentId)}
                aria-current={current ? "true" : undefined}
                // The course sidebar's lesson cards: the same resting,
                // hover and active surfaces.
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 ${FOCUS_RING} ${
                  current
                    ? LESSON_CARD_ACTIVE_SURFACE
                    : `${LESSON_CARD_REST_SURFACE} ${LESSON_CARD_HOVER_SURFACE}`
                }`}
              >
                <RowMark item={item} number={at + 1} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm! font-semibold! break-words text-(--text)">
                    {item.title}
                    {item.draft ? <DraftLabel /> : null}
                  </span>
                  {item.lessonTitle ? (
                    <span className="mt-0.5 block truncate text-xs text-(--muted)">
                      {item.lessonTitle}
                    </span>
                  ) : null}
                </span>
                <DifficultyLabel difficulty={item.difficulty} />
              </button>
            </li>
          );
        })}
      </ul>
    </SlideOverPanel>
  );
}
