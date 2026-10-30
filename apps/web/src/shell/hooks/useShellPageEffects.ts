import {
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { CourseRole } from "../../courses/catalogue";
import { readPinnedHomeCourseId } from "../../home/learner/pinnedHomeCourse";
import { authStore, type AuthIdentityHint } from "../../store/auth.store";
import {
  prefetchGuestHomePage,
  prefetchLearnerHome,
} from "../../services/home";
import {
  creatorDashboardBody,
  guestHomeBody,
} from "../../routing/prerenderedBodies";
import { academyThemes } from "../../themes";
import { prefetchCapabilities } from "../../services/authorization";
import {
  isDashboardHomeHint,
  readHomeHint,
  rememberHomeHint,
} from "../../store/homeHint";
import { getLearningMobileMenuSnapPoint } from "../academyShellGeometry";

export interface UseShellPageEffectsArgs {
  page: string;
  queryClient: QueryClient;
  academyTheme: string;
  mobileMenuOpen: boolean;
  setMobileMenuCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  setMobileMenuSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  authUserFetched: boolean;
  authIdentityHint: AuthIdentityHint | null;
  workspaceRoleHint: "student" | "creator" | null;
  sessionPresentAtBoot: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  effectiveRole: CourseRole;
  canAccessDashboard: boolean;
  dashboardCapabilitiesResolved: boolean;
  isWorkspaceRoleHydrated: boolean;
  dashboardHomeExpected: boolean;
  isLearningSurface: boolean;
  mobileMenuContentSnapPoint: number;
}

export interface UseShellPageEffectsResult {
  currentAcademyThemeIndex: number;
}

export function useShellPageEffects({
  page,
  queryClient,
  academyTheme,
  mobileMenuOpen,
  setMobileMenuCollapsedSnapPoint,
  setMobileMenuSnapPoint,
  authUserFetched,
  authIdentityHint,
  workspaceRoleHint,
  sessionPresentAtBoot,
  isAuthenticated,
  isAdmin,
  effectiveRole,
  canAccessDashboard,
  dashboardCapabilitiesResolved,
  isWorkspaceRoleHydrated,
  dashboardHomeExpected,
  isLearningSurface,
  mobileMenuContentSnapPoint,
}: UseShellPageEffectsArgs): UseShellPageEffectsResult {
  useLayoutEffect(() => {
    if (!mobileMenuOpen) return;
    const nextSnapPoint = isLearningSurface
      ? Math.max(getLearningMobileMenuSnapPoint(), mobileMenuContentSnapPoint)
      : mobileMenuContentSnapPoint;
    setMobileMenuCollapsedSnapPoint(nextSnapPoint);
    setMobileMenuSnapPoint((current) =>
      current === 1 ? current : nextSnapPoint,
    );
  }, [
    isLearningSurface,
    mobileMenuOpen,
    mobileMenuContentSnapPoint,
    setMobileMenuCollapsedSnapPoint,
    setMobileMenuSnapPoint,
  ]);
  const currentAcademyThemeIndex = academyThemes.findIndex(
    (item) => item.id === academyTheme,
  );

  // The guest home is a nested lazy chunk that normally starts downloading
  // only after the auth check resolves. Fetching it as soon as the home page
  // is active removes that extra network round trip from the first paint of
  // the course rows (the page's LCP) on cold loads.
  useEffect(() => {
    // A browser that was signed in last time shows its own home, not this.
    if (page === "home" && !sessionPresentAtBoot) {
      void guestHomeBody.preload();
    }
  }, [page, sessionPresentAtBoot]);

  // A visitor who arrived on another page is likely to open the home page
  // next. Its code and its courses are fetched once the browser is idle, so
  // it opens complete instead of showing its rows loading.
  useEffect(() => {
    // A browser that was signed in last time has its own home, not this.
    if (sessionPresentAtBoot || isAuthenticated || page === "home") {
      return undefined;
    }
    const warm = () => {
      void guestHomeBody.preload();
      void prefetchGuestHomePage(queryClient);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, page, queryClient, sessionPresentAtBoot]);

  // The signed-in home used to load strictly in sequence: session check,
  // then its code, then its data, then the dashboard code. Its code can
  // download while the session check is still in flight, and its data can be
  // requested the moment the session is confirmed.
  useEffect(() => {
    if (page !== "home" || !(sessionPresentAtBoot || isAuthenticated)) return;
    if (
      workspaceRoleHint === "creator" ||
      dashboardHomeExpected ||
      effectiveRole === "creator"
    ) {
      void creatorDashboardBody.preload();
      return;
    }
    void import("../../home/AuthenticatedHomeBoundary");
    void import("../../home/learner/LearnerHome");
  }, [
    dashboardHomeExpected,
    effectiveRole,
    isAuthenticated,
    page,
    sessionPresentAtBoot,
    workspaceRoleHint,
  ]);
  // A layout effect, so that it runs before the home's own queries start
  // (they start from effects of components further down): asked for first,
  // those queries join these requests instead of making their own.
  useLayoutEffect(() => {
    // A remembered session may ask before the session check has answered:
    // this tab was signed in (the rule the catalogue uses), or the browser
    // was the last time it was open. Should the session have ended since,
    // the answer says so, as the session check's own would.
    const sessionExpected =
      isAuthenticated ||
      (!authUserFetched &&
        (authStore.hasSessionHint() || sessionPresentAtBoot));
    if (page !== "home" || !sessionExpected) return;
    if (
      dashboardHomeExpected ||
      effectiveRole === "creator" ||
      // Read here as well: the first pass of a page built ahead of time
      // runs before `homeHint` is given (it matches that page), and would
      // ask for a learner's courses on a dashboard's behalf.
      (!authUserFetched && isDashboardHomeHint(readHomeHint()))
    ) {
      // The dashboard's numbers, asked for beside its code and its
      // permission check instead of after them. Loaded on demand: the
      // module validates its answers, and that library stays out of the
      // code every page starts with.
      void import("../../services/analytics").then(({ prefetchDashboard }) =>
        prefetchDashboard(queryClient),
      );
      // Whether the account may see the dashboard is asked with the session
      // check rather than after it, when this tab knows which account it
      // was. The route guard finds the answer waiting.
      if (!authUserFetched && authIdentityHint?.userId) {
        void prefetchCapabilities(queryClient, authIdentityHint.userId);
      }
      return;
    }
    // A learner's courses, their goal summary and their place in the course
    // the home leads with, in one request (see `prefetchLearnerHome`).
    prefetchLearnerHome(queryClient, readPinnedHomeCourseId());
  }, [
    authIdentityHint?.userId,
    authUserFetched,
    dashboardHomeExpected,
    effectiveRole,
    isAuthenticated,
    page,
    queryClient,
    sessionPresentAtBoot,
  ]);

  // Which home this account has is kept for the next time the page is
  // opened (see store/homeHint.ts). The Student view's own answer, whether
  // the learner has courses, is kept by the home that finds it out.
  useEffect(() => {
    if (!isAuthenticated || !isWorkspaceRoleHydrated) return;
    if (effectiveRole !== "creator") {
      if (isDashboardHomeHint(readHomeHint())) rememberHomeHint(null);
      return;
    }
    if (!dashboardCapabilitiesResolved) return;
    rememberHomeHint(
      canAccessDashboard ? (isAdmin ? "admin-dashboard" : "dashboard") : null,
    );
  }, [
    canAccessDashboard,
    dashboardCapabilitiesResolved,
    effectiveRole,
    isAdmin,
    isAuthenticated,
    isWorkspaceRoleHydrated,
  ]);
  return {
    currentAcademyThemeIndex,
  };
}
