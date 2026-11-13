import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { useNotificationTaps } from "../native-bridge";
import { sanitizeReturnTo } from "../routing/routeAccess";
import { useCurrentUser } from "../services/auth";
import { useMarkNotificationRead } from "../services/notifications";

/**
 * A tapped notification's link, if it is a page of this site: exactly one
 * leading `/`, no backslash, no whitespace or control characters. Native
 * checked it too; this side checks again.
 */
function safeDeepLink(value: string | null | undefined): string | null {
  if (!value || /[\s\\\p{Cc}]/u.test(value)) return null;
  return sanitizeReturnTo(value);
}

/**
 * Inside the native app: opens a tapped notification's page without
 * reloading (no white flash, playback and typed text survive), and marks
 * the tapped bell item read. On a cold start the tap arrives before the
 * session check has answered, so the item is kept for this page load and
 * marked once the visitor is known to be signed in. Does nothing in a
 * plain browser. Lives once in the root, next to `PushDeviceRegistration`.
 */
export function NotificationTapHandler() {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const here = useRef("");
  const { data: user, isPending } = useCurrentUser();
  const userId = user?.id ?? null;
  const { mutate: markRead } = useMarkNotificationRead();
  const [tappedId, setTappedId] = useState<string | null>(null);
  // StrictMode runs effects twice in development; mark each item once.
  const markedId = useRef<string | null>(null);

  useEffect(() => {
    here.current = `${pathname}${search}${hash}`;
  }, [pathname, search, hash]);

  useNotificationTaps((tap) => {
    const link = safeDeepLink(tap.deepLink);
    if (link && link !== here.current) void navigate(link);
    if (tap.notificationId) setTappedId(tap.notificationId);
  });

  useEffect(() => {
    if (!tappedId || isPending) return;
    setTappedId(null);
    if (!userId || markedId.current === tappedId) return;
    markedId.current = tappedId;
    // Already read, gone or signed out (401, 404): nothing to do.
    markRead(tappedId, { onError: () => undefined });
  }, [tappedId, isPending, userId, markRead]);

  return null;
}
