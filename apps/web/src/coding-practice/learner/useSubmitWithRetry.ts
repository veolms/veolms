import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CodingLesson,
  SubmitCodingRequest,
  SubmitCodingResponse,
} from "@veolms/contracts";
import { getApiError } from "../../lib/api-error";
import { useSubmitCoding } from "../../services/coding-practice";
import { readPendingSubmit, writePendingSubmit } from "./deviceStore";

export type SubmitOutcome =
  | { kind: "passed"; response: SubmitCodingResponse }
  | { kind: "failed"; response: SubmitCodingResponse }
  | { kind: "saving"; passed: boolean }
  | { kind: "updated" }
  | { kind: "error"; message: string };

const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

/**
 * Sends a submit. When the server cannot be reached (offline, busy), the
 * result waits on the device and is sent again: on a timer, when the
 * browser is back online, and the next time the lesson opens.
 */
export function useSubmitWithRetry(
  lesson: CodingLesson,
  onRecorded: (response: SubmitCodingResponse) => void,
) {
  const assignmentId = lesson.assignment.id;
  const mutation = useSubmitCoding(lesson);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const attempt = useRef(0);
  const timer = useRef<number | null>(null);
  const recorded = useRef(onRecorded);
  recorded.current = onRecorded;
  // The retry timer sends again through this, not through `send` itself.
  const resend = useRef<(payload: SubmitCodingRequest) => void>(() => {});

  const send = useCallback(
    (payload: SubmitCodingRequest) => {
      if (timer.current) window.clearTimeout(timer.current);
      mutation.mutate(payload, {
        onSuccess: (response) => {
          writePendingSubmit(assignmentId, null);
          attempt.current = 0;
          setOutcome({ kind: response.passed ? "passed" : "failed", response });
          recorded.current(response);
        },
        onError: (error) => {
          const apiError = getApiError(error);
          const status = apiError.status;
          if (status === 409) {
            writePendingSubmit(assignmentId, null);
            setOutcome({ kind: "updated" });
            return;
          }
          if (
            typeof status === "number" &&
            status >= 400 &&
            status < 500 &&
            status !== 408
          ) {
            writePendingSubmit(assignmentId, null);
            setOutcome({ kind: "error", message: apiError.message });
            return;
          }
          // Offline, a timeout or a busy server: keep it and try again.
          writePendingSubmit(assignmentId, payload);
          setOutcome({
            kind: "saving",
            passed:
              payload.results.length > 0 &&
              payload.results.every((result) => result.passed),
          });
          const delay =
            RETRY_DELAYS_MS[
              Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)
            ]!;
          attempt.current += 1;
          timer.current = window.setTimeout(
            () => resend.current(payload),
            delay,
          );
        },
      });
    },
    [assignmentId, mutation],
  );
  resend.current = send;

  // A submit left on the device by an earlier visit goes out now.
  useEffect(() => {
    const pending = readPendingSubmit(assignmentId);
    if (pending && pending.versionId === lesson.exercise.versionId)
      send(pending);
    else if (pending) writePendingSubmit(assignmentId, null);
    const onOnline = () => {
      const waiting = readPendingSubmit(assignmentId);
      if (waiting) send(waiting);
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (timer.current) window.clearTimeout(timer.current);
    };
    // Once per opened exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  return {
    submit: send,
    sending: mutation.isPending,
    outcome,
    clearOutcome: () => setOutcome(null),
  };
}
