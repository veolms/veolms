import { useEffect } from "react";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { LecturePracticeResponse } from "@veolms/contracts";
import { DifficultyLabel, FOCUS_RING, HAIRLINE } from "../shared/ui";
import { StatusIcon } from "./ProblemTable";

/** The course's questions over the workspace's left side (LeetCode's list). */
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
  return (
    <div className="absolute inset-0 z-40 flex">
      <div
        role="dialog"
        aria-label="Questions"
        className="flex h-full w-full max-w-md flex-col bg-(--surface) shadow-2xl animate-in slide-in-from-left duration-200"
      >
        <div
          className={`flex items-center gap-3 border-b px-4 py-3 ${HAIRLINE}`}
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold text-(--text)">Questions</p>
            <p className="text-xs text-(--muted)">
              {solved} of {items.length} solved
            </p>
          </div>
          <button
            type="button"
            aria-label="Close the list"
            onClick={onClose}
            className={`flex size-9 cursor-pointer items-center justify-center rounded-full text-(--text-secondary) hover:bg-(--hover) ${FOCUS_RING}`}
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <ul className="grid content-start gap-0.5 overflow-y-auto p-2">
          {items.map((item, at) => (
            <li key={item.assignmentId}>
              <button
                type="button"
                onClick={() => onPick(item.assignmentId)}
                aria-current={item.assignmentId === currentId}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-(--hover) ${FOCUS_RING} ${
                  item.assignmentId === currentId
                    ? "bg-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                    : ""
                }`}
              >
                <span className="w-5 shrink-0">
                  <StatusIcon status={item.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm! font-semibold! text-(--text)">
                    {at + 1}. {item.title}
                  </span>
                  {item.lessonTitle ? (
                    <span className="block truncate text-xs text-(--muted)">
                      {item.lessonTitle}
                    </span>
                  ) : null}
                </span>
                <DifficultyLabel difficulty={item.difficulty} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label="Close the list"
        tabIndex={-1}
        onClick={onClose}
        className="flex-1 cursor-default bg-black/40"
      />
    </div>
  );
}
