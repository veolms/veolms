import { useSyncExternalStore } from "react";
import type { LoginResponse } from "@veolms/contracts";

// A student signing in on one device more than the academy allows is asked
// to sign one of their devices out. The sign-in that hit the limit waits on
// the answer: signing a device out finishes it (as if it had succeeded at
// once), closing the question fails it with the limit's own message.

interface Prompt {
  finish: (response: LoginResponse) => void;
  cancel: () => void;
}

let prompt: Prompt | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDeviceLimitPrompt(): Prompt | null {
  return useSyncExternalStore(
    subscribe,
    () => prompt,
    () => null,
  );
}

/**
 * Shows the student their devices and resolves with the sign-in once one is
 * signed out; rejects with `limitError` if they close the question instead.
 */
export function askToSignOutADevice(
  limitError: unknown,
): Promise<LoginResponse> {
  // A second sign-in that hits the limit replaces the first question.
  prompt?.cancel();
  return new Promise<LoginResponse>((resolve, reject) => {
    const current: Prompt = {
      finish: (response) => {
        if (prompt === current) prompt = null;
        notify();
        resolve(response);
      },
      cancel: () => {
        if (prompt === current) prompt = null;
        notify();
        reject(limitError);
      },
    };
    prompt = current;
    notify();
  });
}
