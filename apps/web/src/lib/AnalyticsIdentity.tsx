import { useEffect } from "react";
import { reportAnalyticsVisitor } from "@veolms/web-core";
import { useCurrentUser } from "../services/auth";

/**
 * Tells the analytics sink who is signed in (see `AnalyticsSink.identify`
 * in web-core): once the session check has answered, then on every
 * sign-in and sign-out. Lives once in the root, next to
 * `AnalyticsPageViews`; it shares the root's `/auth/me` query.
 */
export function AnalyticsIdentity() {
  const { data: user, isPending } = useCurrentUser();
  const userId = user?.id ?? null;
  // Joined so the effect only reruns when the roles really change.
  const roles = user?.roles?.join(",") ?? "";

  useEffect(() => {
    if (isPending) return;
    reportAnalyticsVisitor(
      userId ? { id: userId, roles: roles ? roles.split(",") : [] } : null,
    );
  }, [isPending, userId, roles]);

  return null;
}
