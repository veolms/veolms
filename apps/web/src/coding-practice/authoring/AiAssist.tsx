import { useId, useState } from "react";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { WrenchIcon as Wrench } from "@phosphor-icons/react/Wrench";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import type { CodingAiProgress } from "../../services/coding-practice";
import { FIELD } from "../shared/ui";

/** What the AI is doing, with a Cancel. Shared by writing and changing. */
export function AiProgressLine({
  progress,
  onCancel,
}: {
  progress: CodingAiProgress;
  onCancel: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] px-4 py-3 text-sm"
    >
      <LoadingSpinnerIcon size={16} />
      <span className="font-semibold text-(--text)">{progress.message}</span>
      {progress.stage === "writing" && progress.chars > 0 ? (
        <span className="text-(--muted) tabular-nums">
          {(progress.chars / 1000).toFixed(1)}k characters
        </span>
      ) : null}
      <span className="text-xs text-(--muted)">This takes about a minute.</span>
      <Button
        variant="quiet"
        elevation="flat"
        className="ml-auto h-8 px-3"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

/**
 * The editor's AI bar: change the question in words ("add edge cases",
 * "make it harder"), or fix what Check tests found. The change goes into
 * the draft; nothing is published.
 */
export function AiAssist({
  running,
  progress,
  error,
  summary,
  canFix,
  onImprove,
  onFix,
  onCancel,
}: {
  running: boolean;
  progress: CodingAiProgress | null;
  error: string | null;
  summary: string | null;
  /** Check tests found something to fix. */
  canFix: boolean;
  onImprove: (instruction: string) => void;
  onFix: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [instruction, setInstruction] = useState("");
  if (running && progress)
    return <AiProgressLine progress={progress} onCancel={onCancel} />;
  return (
    <div className="grid gap-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3.5%,transparent)] p-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!instruction.trim()) return;
          onImprove(instruction.trim());
          setInstruction("");
        }}
      >
        <label htmlFor={`${ids}-ask`} className="sr-only">
          What should AI change?
        </label>
        <Sparkle
          size={17}
          weight="fill"
          aria-hidden="true"
          className="shrink-0 text-(--accent-ink,var(--accent))"
        />
        <input
          id={`${ids}-ask`}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={2_000}
          placeholder="Ask AI to change it: add edge cases, make it harder, simpler words…"
          className={`${FIELD} h-9 min-w-48 flex-1`}
        />
        <Button
          type="submit"
          variant="quiet"
          elevation="flat"
          className="h-9 px-3"
          disabled={!instruction.trim()}
        >
          Improve with AI
        </Button>
        {canFix ? (
          <Button type="button" className="h-9 px-3" onClick={onFix}>
            <Wrench size={15} weight="bold" aria-hidden="true" />
            Fix with AI
          </Button>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="text-sm text-(--code-fail)">
          {error}
        </p>
      ) : summary ? (
        <p role="status" className="text-sm text-(--text-secondary)">
          {summary} Check the tests, then publish when it looks right.
        </p>
      ) : null}
    </div>
  );
}
