import { useEffect, useRef } from "react";

import { useCurrentUser } from "../services/auth";
import { registerThisPushDevice } from "../services/notifications";

/**
 * Registers the native app install for push once per signed-in user per
 * app start: after login and on every start (docs/mobile-push.md). Does
 * nothing in a plain browser. Lives once in the root, next to
 * `AnalyticsIdentity`.
 */
export function PushDeviceRegistration() {
  const { data: user } = useCurrentUser();
  const userId = user?.id ?? null;
  // StrictMode runs effects twice in development; register once per user.
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      registeredFor.current = null; // signed out: register again on the next sign-in
      return;
    }
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    registerThisPushDevice().catch((error: unknown) =>
      console.warn("[NativeBridge] Push device registration failed:", error),
    );
  }, [userId]);

  return null;
}
