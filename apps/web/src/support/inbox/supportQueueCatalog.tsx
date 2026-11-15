import { CellSignalHighIcon as CellSignalHigh } from "@phosphor-icons/react/CellSignalHigh";
import { CellSignalLowIcon as CellSignalLow } from "@phosphor-icons/react/CellSignalLow";
import { CellSignalMediumIcon as CellSignalMedium } from "@phosphor-icons/react/CellSignalMedium";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { CircleDashedIcon as CircleDashed } from "@phosphor-icons/react/CircleDashed";
import { CircleHalfIcon as CircleHalf } from "@phosphor-icons/react/CircleHalf";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { WarningIcon as Warning } from "@phosphor-icons/react/Warning";
import type { Icon } from "@phosphor-icons/react";
import type {
  SupportPerson,
  SupportPriority,
  SupportTicketStatus,
} from "@veolms/contracts/support";

import { DiscussionAvatar } from "../../learning/DiscussionAvatar";

/**
 * How the team's queue draws a status and a priority, the same on a card's
 * badge, a filter chip, the picker and the Activity log.
 */
export interface QueueStatusInfo {
  icon: Icon;
  weight: "regular" | "fill" | "bold";
  /** The icon's colour. */
  tone: string;
  /** One line in the picker: what the status means. */
  description: string;
}

export const QUEUE_STATUSES: Record<SupportTicketStatus, QueueStatusInfo> = {
  open: {
    icon: Circle,
    weight: "bold",
    tone: "text-(--accent)",
    description: "New, nobody has looked at it yet",
  },
  in_progress: {
    icon: CircleHalf,
    weight: "fill",
    tone: "text-amber-500 [:root[data-theme=dark]_&]:text-amber-300",
    description: "A team member is working on it",
  },
  waiting: {
    icon: Clock,
    weight: "bold",
    tone: "text-violet-500 [:root[data-theme=dark]_&]:text-violet-300",
    description: "You replied; waiting for their answer",
  },
  resolved: {
    icon: CheckCircle,
    weight: "fill",
    tone: "text-emerald-500 [:root[data-theme=dark]_&]:text-emerald-300",
    description: "Fixed or answered; the student is notified",
  },
  new: {
    icon: Circle,
    weight: "bold",
    tone: "text-(--accent)",
    description: "Nobody has read it yet",
  },
  reviewed: {
    icon: Eye,
    weight: "bold",
    tone: "text-violet-500 [:root[data-theme=dark]_&]:text-violet-300",
    description: "Read and discussed by the team",
  },
  planned: {
    icon: CheckCircle,
    weight: "fill",
    tone: "text-emerald-500 [:root[data-theme=dark]_&]:text-emerald-300",
    description: "On the roadmap",
  },
};

export function StatusIcon({
  status,
  size = 15,
}: {
  status: SupportTicketStatus;
  size?: number;
}) {
  const info = QUEUE_STATUSES[status];
  const StatusGlyph = info.icon;
  return (
    <StatusGlyph
      size={size}
      weight={info.weight}
      aria-hidden="true"
      className={`shrink-0 ${info.tone}`}
    />
  );
}

export interface QueuePriorityInfo {
  label: string;
  icon: Icon;
  tone: string;
}

export const NO_PRIORITY = "none" as const;

export const QUEUE_PRIORITIES: Record<
  SupportPriority | typeof NO_PRIORITY,
  QueuePriorityInfo
> = {
  none: { label: "No priority", icon: Minus, tone: "text-(--muted)" },
  low: { label: "Low", icon: CellSignalLow, tone: "text-(--text-secondary)" },
  medium: {
    label: "Medium",
    icon: CellSignalMedium,
    tone: "text-(--text-secondary)",
  },
  high: {
    label: "High",
    icon: CellSignalHigh,
    tone: "text-amber-500 [:root[data-theme=dark]_&]:text-amber-300",
  },
  urgent: {
    label: "Urgent",
    icon: Warning,
    tone: "text-rose-500 [:root[data-theme=dark]_&]:text-rose-300",
  },
};

export const PRIORITY_ORDER = [
  NO_PRIORITY,
  "urgent",
  "high",
  "medium",
  "low",
] as const;

export function PriorityIcon({
  priority,
  size = 15,
}: {
  priority: SupportPriority | null;
  size?: number;
}) {
  const info = QUEUE_PRIORITIES[priority ?? NO_PRIORITY];
  const PriorityGlyph = info.icon;
  return (
    <PriorityGlyph
      size={size}
      weight={priority === "urgent" ? "fill" : "bold"}
      aria-hidden="true"
      className={`shrink-0 ${info.tone}`}
    />
  );
}

/** First letters of a name, for an avatar without a picture. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Who works on a ticket: their picture, or a dashed circle with a "+person"
 * when nobody does.
 */
export function AssigneeAvatar({
  person,
  size = 22,
}: {
  person: SupportPerson | null;
  size?: number;
}) {
  if (!person) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-(--muted)"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <UserPlus size={Math.round(size * 0.55)} weight="bold" />
      </span>
    );
  }
  if (person.avatarUrl) {
    return (
      <span className="block shrink-0" style={{ width: size, height: size }}>
        <DiscussionAvatar
          src={person.avatarUrl}
          className="size-full"
          width={size}
          height={size}
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-(--accent)/20 font-bold text-(--accent)"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

/** The dashed placeholder alone, for "No assignee" in a picker. */
export function NoAssigneeIcon({ size = 20 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-dashed border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-(--muted)"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <CircleDashed size={Math.round(size * 0.5)} weight="bold" />
    </span>
  );
}
