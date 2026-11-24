import { useState } from "react";
import type { CodingMode, CodingSolutionPolicy } from "@veolms/contracts";
import { ThemedSelect } from "../../ThemedSelect";
import { FIELD, SELECT_TRIGGER } from "../shared/ui";
import type { ExerciseForm } from "./useExerciseForm";

const LABEL = "grid gap-1.5 text-xs font-semibold text-(--text-secondary)";

const topicsText = (topics: readonly string[]) => topics.join(", ");
const parseTopics = (text: string) =>
  [
    ...new Set(
      text
        .split(",")
        .map((topic) => topic.trim())
        .filter(Boolean),
    ),
  ]
    .map((topic) => topic.slice(0, 40))
    .slice(0, 8);

/**
 * Settings tab: how the question is practised (free practice or a timed
 * machine coding round), its topics (list filters), and when learners may
 * open the editorial and answer.
 */
export function PracticeFormatFields({
  form,
  change,
}: {
  form: ExerciseForm;
  change: (patch: Partial<ExerciseForm>) => void;
}) {
  const [topics, setTopics] = useState(() => topicsText(form.topics));
  const machine = form.settings.mode === "machine_coding";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={LABEL}>
        Format
        <ThemedSelect<CodingMode>
          triggerClassName={SELECT_TRIGGER}
          value={form.settings.mode}
          onValueChange={(mode) =>
            change({
              settings: {
                ...form.settings,
                mode,
                timeLimitMinutes:
                  mode === "machine_coding"
                    ? (form.settings.timeLimitMinutes ?? 45)
                    : null,
              },
            })
          }
          options={[
            ["practice", "Practice"],
            ["machine_coding", "Machine coding round (timed)"],
          ]}
          ariaLabel="Format"
        />
      </label>
      {machine ? (
        <label className={LABEL}>
          Time limit (minutes)
          <input
            type="number"
            min={5}
            max={240}
            value={form.settings.timeLimitMinutes ?? 45}
            onChange={(event) =>
              change({
                settings: {
                  ...form.settings,
                  timeLimitMinutes: Math.min(
                    240,
                    Math.max(5, Number(event.target.value) || 45),
                  ),
                },
              })
            }
            className={`${FIELD} h-10`}
          />
        </label>
      ) : null}
      <label className={`${LABEL} ${machine ? "" : "sm:col-span-2"}`}>
        Topics (comma separated)
        <input
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
          onBlur={() => {
            const parsed = parseTopics(topics);
            setTopics(topicsText(parsed));
            change({ topics: parsed });
          }}
          placeholder="Arrays, Closures, DOM events"
          className={`${FIELD} h-10`}
        />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Learners can open the editorial and answer
        <ThemedSelect<CodingSolutionPolicy>
          triggerClassName={SELECT_TRIGGER}
          value={form.solutionPolicy}
          onValueChange={(solutionPolicy) => change({ solutionPolicy })}
          options={[
            ["after_failed_submits", "After a few failed submits, or a pass"],
            ["after_pass", "Only after they pass"],
            ["always", "Any time"],
            ["never", "Never"],
          ]}
          ariaLabel="When learners can open the editorial"
        />
      </label>
      {form.solutionPolicy === "after_failed_submits" ? (
        <label className={LABEL}>
          Failed submits first
          <input
            type="number"
            min={1}
            max={50}
            value={form.solutionAfterFailedSubmits}
            onChange={(event) =>
              change({
                solutionAfterFailedSubmits: Math.min(
                  50,
                  Math.max(1, Number(event.target.value) || 3),
                ),
              })
            }
            className={`${FIELD} h-10`}
          />
        </label>
      ) : null}
    </div>
  );
}
