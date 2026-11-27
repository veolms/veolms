import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import type { LecturePracticeResponse } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { DifficultyLabel, DraftLabel, KIND_SHORT } from "../shared/ui";

export type PracticeItem = LecturePracticeResponse["items"][number];

/** One practice exercise as a learner sees it: what it is, and how far they got. */
export function PracticeCard({
  item,
  onOpen,
}: {
  item: PracticeItem;
  onOpen: (assignmentId: string) => void;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,var(--surface))] p-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
          item.status === "done"
            ? "bg-[color-mix(in_srgb,var(--code-pass)_14%,transparent)] text-(--code-pass)"
            : "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent-ink,var(--accent))"
        }`}
      >
        {item.status === "done" ? (
          <CheckCircle size={20} weight="fill" aria-label="Done" />
        ) : (
          <CodeGlyph size={20} weight="bold" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold break-words text-(--text)">
          {item.title}
          {item.draft ? <DraftLabel /> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--muted)">
          <span>{KIND_SHORT[item.kind]}</span>
          <span aria-hidden="true">·</span>
          <span>~{item.estimatedMinutes} min</span>
          <DifficultyLabel difficulty={item.difficulty} />
        </p>
      </div>
      <Button
        className="h-9 shrink-0 px-3 text-sm! font-semibold!"
        variant={item.status === "new" ? "primary" : "quiet"}
        elevation={item.status === "new" ? undefined : "flat"}
        onClick={() => onOpen(item.assignmentId)}
      >
        {item.status === "new"
          ? "Start"
          : item.status === "started"
            ? "Continue"
            : "Practise again"}
      </Button>
    </li>
  );
}
