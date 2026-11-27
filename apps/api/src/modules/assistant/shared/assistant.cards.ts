import {
  CHAT_BODY_MAX_BYTES,
  CHAT_BODY_MAX_CHARS,
  type AssistantCard,
  type AssistantCardKind,
  type AssistantCardLink,
  type AssistantCardState,
  type AssistantCardStep,
} from "@veolms/contracts";

import type { AssistantCardRow } from "./assistant.repository.ts";

export const CARD_KIND_LABELS: Record<AssistantCardKind, string> = {
  fix: "Bug fix",
  build: "Feature",
  research: "Research",
  ask: "Question",
  review: "Review",
};

export const CARD_STATE_LABELS: Record<AssistantCardState, string> = {
  queued: "Queued",
  running: "Working",
  waiting: "Waiting for you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const STEP_MARKS: Record<AssistantCardStep["state"], string> = {
  pending: "○",
  active: "…",
  done: "✓",
  failed: "✗",
  skipped: "–",
};

/** Steps kept when a card is too long for one chat message. */
const SHORT_STEPS = 12;

function fits(body: string): boolean {
  return (
    body.length <= CHAT_BODY_MAX_CHARS &&
    Buffer.byteLength(body) <= CHAT_BODY_MAX_BYTES
  );
}

function escapeLinkLabel(label: string): string {
  return label.replace(/[[\]]/g, "");
}

function compose(
  card: {
    kind: AssistantCardKind;
    title: string;
    state: AssistantCardState;
    steps: readonly AssistantCardStep[];
    links: readonly AssistantCardLink[];
    stopRequested: boolean;
  },
  steps: readonly AssistantCardStep[],
  links: readonly AssistantCardLink[],
  dropped: number,
): string {
  const state =
    card.stopRequested && !["done", "failed", "stopped"].includes(card.state)
      ? "Stopping"
      : CARD_STATE_LABELS[card.state];
  const lines = [`*${CARD_KIND_LABELS[card.kind]}* · ${state}`, card.title];
  if (steps.length > 0) {
    lines.push("");
    if (dropped > 0) lines.push(`… ${dropped} earlier steps`);
    for (const step of steps)
      lines.push(`${STEP_MARKS[step.state]} ${step.label}`);
  }
  if (links.length > 0) {
    lines.push("");
    lines.push(
      links
        .map((link) => `[${escapeLinkLabel(link.label)}](${link.url})`)
        .join(" · "),
    );
  }
  return lines.join("\n");
}

/**
 * The status card as chat text: what push notifications, search, older
 * apps and other channels show. The web app draws the same card from the
 * card's own data. Always fits in one chat message: older steps and extra
 * links are left out first.
 */
export function renderCardBody(card: {
  kind: AssistantCardKind;
  title: string;
  state: AssistantCardState;
  steps: readonly AssistantCardStep[];
  links: readonly AssistantCardLink[];
  stopRequested: boolean;
}): string {
  let body = compose(card, card.steps, card.links, 0);
  if (fits(body)) return body;
  const steps = card.steps.slice(-SHORT_STEPS);
  body = compose(card, steps, card.links, card.steps.length - steps.length);
  if (fits(body)) return body;
  body = compose(
    card,
    steps,
    card.links.slice(0, 3),
    card.steps.length - steps.length,
  );
  if (fits(body)) return body;
  return compose(card, [], [], card.steps.length).slice(0, CHAT_BODY_MAX_CHARS);
}

export function isFinishedState(state: AssistantCardState): boolean {
  return state === "done" || state === "failed" || state === "stopped";
}

export function presentCard(row: AssistantCardRow): AssistantCard {
  return {
    id: row.id,
    roomId: row.room_id,
    messageSeq: row.message_seq === null ? null : Number(row.message_seq),
    requestSeq: Number(row.request_seq),
    kind: row.kind,
    title: row.title,
    state: row.state,
    steps: row.steps,
    links: row.links,
    stopRequested: row.stop_requested_at !== null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}
