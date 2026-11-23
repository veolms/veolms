import { useId, useState } from "react";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import type {
  CodingDifficulty,
  CodingExerciseKind,
  CodingLanguage,
  CodingMode,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { useCodingAiWriter } from "../../services/coding-practice";
import { ThemedSelect } from "../../ThemedSelect";
import { FIELD, KIND_LABELS, SELECT_TRIGGER } from "../shared/ui";
import { AiProgressLine } from "./AiAssist";

const LABEL = "grid gap-1.5 text-xs font-semibold text-(--text-secondary)";

/**
 * "Create with AI": the AI reads the course and this lecture and writes a
 * whole question (statement, starter, answer, tests, hints, editorial) as a
 * draft. Quick generate leaves every choice to the AI.
 */
export function AiQuestionForm({
  courseId,
  lessonId,
  lessonTitle,
  onCreated,
  onCancel,
}: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  onCreated: (exerciseId: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const writer = useCodingAiWriter(courseId);
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<CodingExerciseKind | "auto">("auto");
  const [difficulty, setDifficulty] = useState<CodingDifficulty | "auto">(
    "auto",
  );
  const [mode, setMode] = useState<CodingMode>("practice");
  const [minutes, setMinutes] = useState(45);
  const [language, setLanguage] = useState<CodingLanguage>("javascript");

  const start = async (quick: boolean) => {
    const exercise = await writer.generate(
      quick
        ? { lessonId, language }
        : {
            lessonId,
            brief: brief.trim() || undefined,
            kind,
            difficulty,
            language,
            mode,
            timeLimitMinutes: mode === "machine_coding" ? minutes : null,
          },
    );
    if (exercise) onCreated(exercise.id);
  };

  if (writer.running && writer.progress)
    return (
      <AiProgressLine progress={writer.progress} onCancel={writer.cancel} />
    );

  return (
    <form
      className="grid gap-4 rounded-xl bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void start(false);
      }}
    >
      <div className="flex items-start gap-2">
        <Sparkle
          size={18}
          weight="fill"
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-(--accent-ink,var(--accent))"
        />
        <p className="text-sm text-(--text-secondary)">
          AI reads the course, its curriculum and <b>{lessonTitle}</b>, then
          writes the problem, starter code, answer, tests, hints and editorial.
          You get a draft to check; nothing goes to learners until you publish.
        </p>
      </div>
      <label className={LABEL} htmlFor={`${ids}-brief`}>
        What should it practise? (optional)
        <textarea
          id={`${ids}-brief`}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          maxLength={2_000}
          rows={3}
          placeholder="e.g. A debounce function, interview style. Or leave empty and let AI pick the best question for this lecture."
          className={`${FIELD} min-h-20 resize-y py-2`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          Type
          <ThemedSelect<CodingExerciseKind | "auto">
            triggerClassName={SELECT_TRIGGER}
            value={kind}
            onValueChange={setKind}
            options={[
              ["auto", "Let AI choose"],
              ...(Object.entries(KIND_LABELS) as [
                CodingExerciseKind,
                string,
              ][]),
            ]}
            ariaLabel="Type of question"
          />
        </label>
        <label className={LABEL}>
          Difficulty
          <ThemedSelect<CodingDifficulty | "auto">
            triggerClassName={SELECT_TRIGGER}
            value={difficulty}
            onValueChange={setDifficulty}
            options={[
              ["auto", "Let AI choose"],
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard"],
            ]}
            ariaLabel="Difficulty"
          />
        </label>
        <label className={LABEL}>
          Format
          <ThemedSelect<CodingMode>
            triggerClassName={SELECT_TRIGGER}
            value={mode}
            onValueChange={setMode}
            options={[
              ["practice", "Practice"],
              ["machine_coding", "Machine coding round"],
            ]}
            ariaLabel="Format"
          />
        </label>
        <label className={LABEL}>
          {mode === "machine_coding" ? "Minutes" : "Language"}
          {mode === "machine_coding" ? (
            <input
              type="number"
              min={5}
              max={240}
              value={minutes}
              onChange={(event) =>
                setMinutes(
                  Math.min(240, Math.max(5, Number(event.target.value) || 45)),
                )
              }
              className={`${FIELD} h-10`}
            />
          ) : (
            <ThemedSelect<CodingLanguage>
              triggerClassName={SELECT_TRIGGER}
              value={language}
              onValueChange={setLanguage}
              options={[
                ["javascript", "JavaScript"],
                ["typescript", "TypeScript"],
              ]}
              ariaLabel="Language"
            />
          )}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">
          <Sparkle size={15} weight="fill" aria-hidden="true" />
          Generate
        </Button>
        <Button
          type="button"
          variant="quiet"
          elevation="flat"
          onClick={() => void start(true)}
          title="AI picks the question, type and difficulty for this lecture"
        >
          <Lightning size={15} weight="fill" aria-hidden="true" />
          Quick generate
        </Button>
        <Button
          type="button"
          variant="quiet"
          elevation="flat"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {writer.error ? (
        <p role="alert" className="text-sm text-(--code-fail)">
          {writer.error}
        </p>
      ) : null}
    </form>
  );
}
