import type {
  SignInFailureKind,
  SignInFailureReport,
  SignInFailureRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authService } from "./auth.service";

/**
 * Sign-in requests that got no answer, or a server error, kept in this
 * browser until the server can be told (`POST /auth/sign-in-failures`).
 *
 * A request that never reached the server leaves nothing in its logs: a
 * student wrote in about "Something went wrong on our end" and the logs of
 * both servers had no trace of it. Kept here, the failure is reported the
 * next time a request goes through.
 */
const STORAGE_KEY = "veolms-sign-in-failures:v1";
const MAX_KEPT = 10;

/** When a sign-in request started, carried from `onMutate` to `onError`. */
export interface SignInAttempt {
  startedAt: number;
}

export function startSignInAttempt(): SignInAttempt {
  return { startedAt: Date.now() };
}

function failureKind(error: ApiError): SignInFailureKind | null {
  if (error.code === "ERR_NETWORK") return "unreachable";
  if (error.code === "ECONNABORTED") return "timeout";
  if (error.status >= 500) return "server-error";
  return null;
}

function isStoredReport(value: unknown): value is SignInFailureReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.request === "string" &&
    typeof report.kind === "string" &&
    typeof report.occurredAt === "string"
  );
}

function readPending(): SignInFailureReport[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(stored) ? stored.filter(isStoredReport) : [];
  } catch {
    return [];
  }
}

function writePending(reports: SignInFailureReport[]): void {
  try {
    if (reports.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // Storage unavailable: the report is simply lost.
  }
}

function forget(reports: SignInFailureReport[]): void {
  const done = new Set(reports.map((report) => JSON.stringify(report)));
  writePending(
    readPending().filter((report) => !done.has(JSON.stringify(report))),
  );
}

let sending: Promise<void> | null = null;

/** Sends what is kept, if anything. Safe to call often. */
export function sendPendingSignInFailures(): Promise<void> {
  if (sending || typeof window === "undefined") {
    return sending ?? Promise.resolve();
  }
  const reports = readPending();
  if (reports.length === 0) return Promise.resolve();

  sending = authService
    .reportSignInFailures({ reports })
    .then(
      () => forget(reports),
      (error: ApiError) => {
        // Refused as malformed, they would be refused every time. Anything
        // else (still offline, rate limited) is tried again later.
        if (error.status === 400) forget(reports);
      },
    )
    .finally(() => {
      sending = null;
    });
  return sending;
}

let watchingConnection = false;

function sendWhenBackOnline(): void {
  if (watchingConnection) return;
  watchingConnection = true;
  window.addEventListener("online", () => {
    void sendPendingSignInFailures();
  });
}

/**
 * Keeps a failed sign-in request to report, when it failed for want of an
 * answer or with a server error. A refusal the student can act on (a wrong
 * code, too many tries) is not kept.
 */
export function recordSignInFailure(
  request: SignInFailureRequest,
  error: ApiError,
  attempt?: SignInAttempt,
  identifier?: string,
): void {
  if (typeof window === "undefined") return;
  const kind = failureKind(error);
  if (!kind) return;

  const report: SignInFailureReport = {
    request,
    kind,
    code: String(error.code).slice(0, 64),
    occurredAt: new Date().toISOString(),
    online: navigator.onLine,
  };
  if (kind === "server-error") report.status = error.status;
  if (attempt) {
    report.elapsedMs = Math.min(
      Math.max(0, Math.round(Date.now() - attempt.startedAt)),
      3_600_000,
    );
  }
  const typed = identifier?.trim();
  if (typed) report.identifier = typed.slice(0, 254);

  writePending([...readPending(), report].slice(-MAX_KEPT));
  sendWhenBackOnline();
  void sendPendingSignInFailures();
}
