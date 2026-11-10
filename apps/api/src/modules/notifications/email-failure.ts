import { z } from "zod";

/**
 * What a failed send means for the queue.
 *
 * - `permanent`: trying this message again cannot help (the address does not
 *   exist, the message itself was refused). The delivery is marked failed.
 * - `throttled`: the provider wants us to slow down or has had enough for
 *   today (quota, rate, "try again later"). The delivery is tried again
 *   after the pause without burning an attempt, and its lane rests.
 * - `transient`: anything else (network, timeout, a full mailbox). The usual
 *   backoff applies.
 */
export type EmailFailureKind = "permanent" | "throttled" | "transient";

export interface EmailFailure {
  kind: EmailFailureKind;
  /** The address is dead: never queue mail for it again. */
  suppress: boolean;
  /** Stop sending on this lane for a while before the provider stops us. */
  pauseLane: boolean;
  /** Short reason for the log and `last_error`. */
  reason: string;
}

/** The fields nodemailer puts on an SMTP error. */
interface SmtpErrorLike {
  code?: unknown;
  responseCode?: unknown;
  response?: unknown;
  message?: unknown;
}

const THROTTLE_TEXT =
  /quota|rate ?limit|too many|throttl|try again later|temporarily (deferred|rejected|unavailable)|sending limit|exceeded|4\.7\.0|4\.7\.28|5\.4\.5/i;
const DEAD_ADDRESS_TEXT =
  /no such user|user unknown|unknown user|does not exist|mailbox (not found|unavailable)|invalid recipient|recipient (address )?rejected|address rejected|5\.1\.[0-9]/i;
const POLICY_TEXT =
  /spam|blocked|blacklist|reputation|unauthenticated|not authenticated|authentication required|policy|not authorized|5\.7\.[0-9]|dmarc|spf|dkim/i;
const MAILBOX_FULL_TEXT = /mailbox full|over quota|5\.2\.[0-9]/i;

function text(error: SmtpErrorLike): string {
  return [error.response, error.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function responseCode(error: SmtpErrorLike): number | null {
  return typeof error.responseCode === "number" ? error.responseCode : null;
}

export function classifyEmailFailure(error: unknown): EmailFailure {
  if (error instanceof z.ZodError) {
    return {
      kind: "permanent",
      suppress: false,
      pauseLane: false,
      reason: "Queued email payload is invalid",
    };
  }
  const smtp: SmtpErrorLike =
    typeof error === "object" && error !== null ? (error as SmtpErrorLike) : {};
  const code = responseCode(smtp);
  const body = text(smtp);

  // Broken credentials fail every message the same way: rest, do not hammer.
  if (smtp.code === "EAUTH") {
    return {
      kind: "throttled",
      suppress: false,
      pauseLane: true,
      reason: "SMTP authentication failed",
    };
  }

  // Quota and rate replies come as 421/45x, but Gmail and Zoho also send
  // them as 550 ("Daily user sending limit exceeded"): the text decides.
  if (
    THROTTLE_TEXT.test(body) ||
    code === 421 ||
    (code !== null && code >= 450 && code < 460)
  ) {
    return {
      kind: "throttled",
      suppress: false,
      pauseLane: true,
      reason: `Provider throttled sending (${code ?? smtp.code ?? "no code"})`,
    };
  }

  if (code !== null && code >= 500) {
    if (DEAD_ADDRESS_TEXT.test(body)) {
      return {
        kind: "permanent",
        suppress: true,
        pauseLane: false,
        reason: `Address rejected by the provider (${code})`,
      };
    }
    if (MAILBOX_FULL_TEXT.test(body)) {
      return {
        kind: "transient",
        suppress: false,
        pauseLane: false,
        reason: `Recipient mailbox full (${code})`,
      };
    }
    if (POLICY_TEXT.test(body)) {
      // Our message or our domain was refused: the same message will be
      // refused again, and more of them hurt the domain's standing.
      return {
        kind: "permanent",
        suppress: false,
        pauseLane: true,
        reason: `Message refused by policy (${code})`,
      };
    }
    return {
      kind: "permanent",
      suppress: false,
      pauseLane: false,
      reason: `Message rejected (${code})`,
    };
  }

  // Connection problems (ECONNECTION, ETIMEDOUT, ESOCKET, EDNS) and 4xx
  // replies without a quota meaning: back off as before.
  return {
    kind: "transient",
    suppress: false,
    pauseLane: false,
    reason:
      typeof smtp.code === "string"
        ? `Send failed (${smtp.code})`
        : "Send failed",
  };
}
