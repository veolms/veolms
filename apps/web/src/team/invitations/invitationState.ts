import {
  TEAM_INVITATION_TTL_DAYS,
  type TeamInvitation,
} from "@veolms/contracts";
import { formatTeamDate } from "../teamFormat";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Under this much time left, a pending link reads "Expires soon". */
const SOON_MS = 2 * DAY_MS;

export type InvitationTone = "pending" | "soon" | "accepted" | "muted";

export interface InvitationState {
  label: string;
  /** Right of the label: time left, or when it closed. */
  detail: string;
  tone: InvitationTone;
  /** How much of the link's life is left, 0 to 1. */
  progress: number;
  /** Still open: can be resent or revoked. */
  isOpen: boolean;
}

function timeLeft(ms: number): string {
  if (ms < HOUR_MS) return "Within the hour";
  if (ms < DAY_MS) {
    const hours = Math.round(ms / HOUR_MS);
    return `${hours} hour${hours === 1 ? "" : "s"} left`;
  }
  const days = Math.round(ms / DAY_MS);
  return days === 1 ? "Tomorrow" : `${days} days left`;
}

/** What the Link column shows for an invitation. */
export function invitationState(
  invitation: Pick<
    TeamInvitation,
    "status" | "expiresAt" | "acceptedAt" | "revokedAt"
  >,
  now = Date.now(),
): InvitationState {
  switch (invitation.status) {
    case "accepted":
      return {
        label: "Accepted",
        detail: `Joined ${formatTeamDate(invitation.acceptedAt)}`,
        tone: "accepted",
        progress: 1,
        isOpen: false,
      };
    case "revoked":
      return {
        label: "Revoked",
        detail: formatTeamDate(invitation.revokedAt),
        tone: "muted",
        progress: 0,
        isOpen: false,
      };
    case "expired":
      return {
        label: "Expired",
        detail: formatTeamDate(invitation.expiresAt),
        tone: "muted",
        progress: 0,
        isOpen: true,
      };
    case "pending": {
      const left = Math.max(0, new Date(invitation.expiresAt).getTime() - now);
      const soon = left < SOON_MS;
      return {
        label: soon ? "Expires soon" : "Pending",
        detail: timeLeft(left),
        tone: soon ? "soon" : "pending",
        progress: Math.min(1, left / (TEAM_INVITATION_TTL_DAYS * DAY_MS)),
        isOpen: true,
      };
    }
  }
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "Sent 2 days ago", or "Sent Oct 9" once it is more than a week back. */
export function sentLabel(createdAt: string, now = Date.now()): string {
  const days = Math.round((new Date(createdAt).getTime() - now) / DAY_MS);
  if (days > -7) return `Sent ${relative.format(days, "day")}`;
  return `Sent ${formatTeamDate(createdAt)}`;
}
