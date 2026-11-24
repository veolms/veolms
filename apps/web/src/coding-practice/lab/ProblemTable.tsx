import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleDashedIcon as CircleDashed } from "@phosphor-icons/react/CircleDashed";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { TimerIcon as Timer } from "@phosphor-icons/react/Timer";
import type {
  CodingDifficulty,
  LecturePracticeResponse,
} from "@veolms/contracts";
import { ElevatedCard } from "../../components/ElevatedCard";
import { ThemedSelect } from "../../ThemedSelect";
import {
  CODE_TONES,
  DifficultyLabel,
  FIELD,
  FOCUS_RING,
  KIND_SHORT,
  SELECT_TRIGGER,
} from "../shared/ui";
import { practicePath } from "./practicePaths";

type Item = LecturePracticeResponse["items"][number];
type StatusFilter = "all" | "todo" | "started" | "done";

export function StatusIcon({ status }: { status: Item["status"] }) {
  if (status === "done")
    return (
      <CheckCircle
        size={18}
        weight="fill"
        className="text-(--code-pass)"
        aria-label="Solved"
      />
    );
  if (status === "started")
    return (
      <CircleDashed
        size={18}
        weight="bold"
        className="text-(--code-warn)"
        aria-label="Attempted"
      />
    );
  return <span className="block size-4.5" aria-label="To do" />;
}

/**
 * A course's questions as LeetCode's problem list: status, title, lecture,
 * difficulty, with filters by status, difficulty and lecture, and search.
 */
export function ProblemTable({
  courseSlug,
  items,
  returnPath,
}: {
  courseSlug: string;
  items: Item[];
  /** Where Back from a question returns. */
  returnPath: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [difficulty, setDifficulty] = useState<CodingDifficulty | "all">("all");
  const [section, setSection] = useState("all");
  const sections = useMemo(
    () => [
      ...new Set(
        items
          .map((item) => item.sectionTitle)
          .filter((title): title is string => Boolean(title)),
      ),
    ],
    [items],
  );
  const shown = items.filter((item) => {
    if (status === "todo" && item.status !== "new") return false;
    if (status === "started" && item.status !== "started") return false;
    if (status === "done" && item.status !== "done") return false;
    if (difficulty !== "all" && item.difficulty !== difficulty) return false;
    if (section !== "all" && item.sectionTitle !== section) return false;
    const query = search.trim().toLowerCase();
    if (
      query &&
      !`${item.title} ${item.lessonTitle ?? ""} ${item.topics.join(" ")}`
        .toLowerCase()
        .includes(query)
    )
      return false;
    return true;
  });

  return (
    <section className={`grid gap-3 ${CODE_TONES}`} aria-label="Questions">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Search questions</span>
          <MagnifyingGlass
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search questions or topics"
            className={`${FIELD} h-10 pl-9`}
          />
        </label>
        <div className="w-36">
          <ThemedSelect<StatusFilter>
            triggerClassName={SELECT_TRIGGER}
            value={status}
            onValueChange={setStatus}
            ariaLabel="Status"
            options={[
              ["all", "All statuses"],
              ["todo", "To do"],
              ["started", "Attempted"],
              ["done", "Solved"],
            ]}
          />
        </div>
        <div className="w-36">
          <ThemedSelect<CodingDifficulty | "all">
            triggerClassName={SELECT_TRIGGER}
            value={difficulty}
            onValueChange={setDifficulty}
            ariaLabel="Difficulty"
            options={[
              ["all", "All levels"],
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard"],
            ]}
          />
        </div>
        {sections.length > 1 ? (
          <div className="w-52 max-sm:w-full">
            <ThemedSelect<string>
              triggerClassName={SELECT_TRIGGER}
              value={section}
              onValueChange={setSection}
              ariaLabel="Section"
              options={[
                ["all", "All sections"],
                ...sections.map((title) => [title, title] as [string, string]),
              ]}
            />
          </div>
        ) : null}
      </div>
      <ElevatedCard as="ul" className="m-0 list-none overflow-hidden p-0">
        {shown.length === 0 ? (
          <li className="px-5 py-10 text-center text-sm text-(--muted)">
            No questions match.
          </li>
        ) : (
          shown.map((item, index) => (
            <li
              key={item.assignmentId}
              className="border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] first:border-t-0"
            >
              <Link
                to={practicePath(courseSlug, item.assignmentId)}
                state={{ practiceFrom: returnPath }}
                className={`flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-(--hover) sm:px-5 ${FOCUS_RING} ${index % 2 ? "bg-[color-mix(in_srgb,var(--text)_2%,transparent)]" : ""}`}
              >
                <span className="w-5 shrink-0">
                  <StatusIcon status={item.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-semibold text-(--text)">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-(--muted)">
                    {item.lessonTitle ? (
                      <span className="truncate">{item.lessonTitle}</span>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>{KIND_SHORT[item.kind]}</span>
                    {item.topics.slice(0, 3).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 max-sm:hidden"
                      >
                        {topic}
                      </span>
                    ))}
                  </span>
                </span>
                {item.mode === "machine_coding" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-(--accent-ink,var(--accent)) max-sm:hidden">
                    <Timer size={13} weight="bold" aria-hidden="true" />
                    {item.timeLimitMinutes ?? 45} min
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-(--muted) tabular-nums max-sm:hidden">
                    ~{item.estimatedMinutes} min
                  </span>
                )}
                <span className="w-20 shrink-0 text-right">
                  <DifficultyLabel difficulty={item.difficulty} />
                </span>
              </Link>
            </li>
          ))
        )}
      </ElevatedCard>
    </section>
  );
}
