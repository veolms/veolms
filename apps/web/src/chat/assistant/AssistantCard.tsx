import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { MinusCircleIcon as MinusCircle } from "@phosphor-icons/react/MinusCircle";
import { StopIcon as Stop } from "@phosphor-icons/react/Stop";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type {
  AssistantCard as Card,
  AssistantCardStep,
} from "@veolms/contracts";

import { getApiError } from "../../lib/api-error";
import { useStopAssistantCard } from "../../services/assistant";
import { cn } from "../../lib/utils";

const KIND_LABELS: Record<Card["kind"], string> = {
  fix: "Bug fix",
  build: "Feature",
  research: "Research",
  ask: "Question",
  review: "Review",
};

const STATE_LABELS: Record<Card["state"], string> = {
  queued: "Queued",
  running: "Working",
  waiting: "Waiting for you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const FINISHED: ReadonlySet<Card["state"]> = new Set([
  "done",
  "failed",
  "stopped",
]);

function StepIcon({ state }: { state: AssistantCardStep["state"] }) {
  const common = "shrink-0";
  switch (state) {
    case "done":
      return (
        <CheckCircle
          size={17}
          weight="fill"
          className={cn(common, "text-(--success)")}
          aria-hidden="true"
        />
      );
    case "active":
      return (
        <CircleNotch
          size={17}
          className={cn(common, "animate-spin text-(--accent)")}
          aria-hidden="true"
        />
      );
    case "failed":
      return (
        <XCircle
          size={17}
          weight="fill"
          className={cn(common, "text-(--danger)")}
          aria-hidden="true"
        />
      );
    case "skipped":
      return (
        <MinusCircle
          size={17}
          className={cn(common, "text-(--muted)")}
          aria-hidden="true"
        />
      );
    default:
      return (
        <Circle
          size={17}
          className={cn(common, "text-(--muted)")}
          aria-hidden="true"
        />
      );
  }
}

const STEP_STATE_NAMES: Record<AssistantCardStep["state"], string> = {
  done: "done",
  active: "in progress",
  failed: "failed",
  skipped: "skipped",
  pending: "not started",
};

/**
 * An assistant request's status card, drawn inside Claude's chat bubble:
 * what kind of request, where it stands, its steps, its links and Stop.
 * The message underneath carries the same as text (push, search).
 */
export function AssistantCard({
  card,
  onError,
}: {
  card: Card;
  onError: (message: string) => void;
}) {
  const stop = useStopAssistantCard(card.roomId);
  const finished = FINISHED.has(card.state);
  const stopping = card.stopRequested && !finished;

  return (
    <section
      aria-label={`${KIND_LABELS[card.kind]}: ${card.title}`}
      className="flex min-w-60 flex-col gap-2 py-0.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-(--accent-soft) px-2 py-0.5 text-[0.72rem] font-semibold text-(--accent-ink)">
          {KIND_LABELS[card.kind]}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[0.78rem] font-medium",
            card.state === "failed" ? "text-(--danger)" : "text-(--muted)",
          )}
          aria-live="polite"
        >
          {card.state === "running" && !stopping ? (
            <CircleNotch
              size={13}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {stopping ? "Stopping…" : STATE_LABELS[card.state]}
        </span>
      </div>
      <p className="m-0 text-[0.92rem] font-semibold text-(--text)">
        {card.title}
      </p>
      {card.steps.length > 0 ? (
        <ol
          className="m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label="Steps"
        >
          {card.steps.map((step, index) => (
            <li
              key={`${index}-${step.label}`}
              className={cn(
                "flex items-center gap-2 text-[0.84rem]",
                step.state === "pending" || step.state === "skipped"
                  ? "text-(--muted)"
                  : "text-(--text)",
              )}
            >
              <StepIcon state={step.state} />
              <span>{step.label}</span>
              <span className="sr-only">, {STEP_STATE_NAMES[step.state]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {card.links.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {card.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[0.84rem] font-medium text-(--accent-ink) underline-offset-2 hover:underline"
            >
              {link.label}
              <ArrowSquareOut size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}
      {!finished ? (
        <div>
          <button
            type="button"
            disabled={stopping || stop.isPending}
            onClick={() =>
              stop.mutate(card.id, {
                onError: (error) => onError(getApiError(error).message),
              })
            }
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-(--chat-line-strong) bg-transparent px-3 text-[0.8rem] font-medium text-(--text) hover:bg-(--chat-hover) disabled:cursor-default disabled:opacity-60"
          >
            <Stop size={14} weight="fill" aria-hidden="true" />
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
