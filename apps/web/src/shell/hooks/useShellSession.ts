import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ToastMessage } from "../../ToastNotification";
import type { CourseRole } from "../../courses/catalogue";
import {
  onSignedOutHere,
  useCurrentUser,
  useSignOut,
} from "../../services/auth";
import {
  useAuthIdentityHint,
  useSessionPresentAtBoot,
  useAuthStore,
  type AuthIdentityHint,
} from "../../store/auth.store";
import { getRoleNavigationItems, type NavigationItem } from "../navigation";
import {
  getUserRoles,
  getVisibleWorkspaceRoles,
  hasAdminRole,
  resolveWorkspaceRole,
  getWorkspaceRoleStorageKey,
} from "../workspaceRole";
import { useAcademyRouteGuardState } from "../../routing/RouteGuards";
import { isDashboardHomeHint, readHomeHint } from "../../store/homeHint";
import { subscribeToNothing } from "../academyShellGeometry";
import type { AuthUser } from "../../store/auth.store";

export interface UseShellSessionArgs {
  page: string;
  role: CourseRole;
  hydratedWorkspaceRoleKey: string | null;
  activeSection: string;
  setSearch: Dispatch<SetStateAction<string>>;
  storedPreferencesReady: boolean;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
}

export interface UseShellSessionResult {
  authUser: ReturnType<typeof useCurrentUser>["data"];
  authUserFetched: boolean;
  authIdentityHint: AuthIdentityHint | null;
  workspaceRoleHint: "student" | "creator" | null;
  hydratedWorkspaceRoleHint: "student" | "creator" | null;
  sessionPresentAtBoot: boolean;
  showGuestHomeWhilePending: boolean;
  learnerWasNotEnrolled: boolean;
  activeUser: AuthUser | null | undefined;
  isAuthenticated: boolean;
  accountStatusUnknown: boolean;
  userRoles: readonly string[] | undefined;
  isAdmin: boolean;
  allowedWorkspaceRoles: CourseRole[];
  canSwitchWorkspace: boolean;
  effectiveRole: CourseRole;
  /** The account is in its creator view, as far as can be told before `effectiveRole` says so. */
  creatorViewExpected: boolean;
  canAccessDashboard: boolean;
  dashboardCapabilitiesResolved: boolean;
  routeContentBlocked: boolean;
  isEditingOrCreatingCourse: boolean;
  isAuthReady: boolean;
  shownSignedOut: boolean;
  discussionsWhileSessionPending: boolean;
  isWorkspaceRoleHydrated: boolean;
  dashboardHomeExpected: boolean;
  routeContentHeld: boolean;
  isDashboardRoute: boolean;
  roleNavigationItems: readonly NavigationItem[];
  isSigningOut: boolean;
  signOutAfterSync: () => Promise<void>;
}

export function useShellSession({
  page,
  role,
  hydratedWorkspaceRoleKey,
  activeSection,
  setSearch,
  storedPreferencesReady,
  setNotice,
}: UseShellSessionArgs): UseShellSessionResult {
  const {
    data: authUser,
    isError: authUserError,
    isFetched: authUserFetched,
  } = useCurrentUser();
  const authIdentityHint = useAuthIdentityHint();
  const workspaceRoleHint = (() => {
    if (typeof window === "undefined" || !authIdentityHint) return null;
    try {
      const storedRole = localStorage.getItem(
        getWorkspaceRoleStorageKey(authIdentityHint.userId),
      );
      return storedRole === "creator" || storedRole === "student"
        ? storedRole
        : null;
    } catch {
      return null;
    }
  })();
  // Post-hydration view of the stored role hint. The server snapshot stays
  // null so the first client render matches the prerendered guest markup;
  // right after hydration it switches, letting creator/admin sessions hide
  // the guest-home preview without a hydration mismatch.
  const hydratedWorkspaceRoleHint = useSyncExternalStore(
    subscribeToNothing,
    () => workspaceRoleHint,
    () => null,
  );
  // Same idea for any signed-in browser: its home is not the guest home, so
  // a loading state stands in until the session check answers.
  const sessionPresentAtBoot = useSessionPresentAtBoot();
  const showGuestHomeWhilePending =
    hydratedWorkspaceRoleHint !== "creator" && !sessionPresentAtBoot;
  // Which home the account had last time, when it is not the usual one
  // (see store/homeHint.ts). Nothing while hydrating, like the hints above.
  const homeHint = useSyncExternalStore(
    subscribeToNothing,
    readHomeHint,
    () => null,
  );
  // A learner who had no courses last time has the guest home with a
  // greeting, not the home that lists courses.
  const learnerWasNotEnrolled = homeHint === "new-learner";
  const storeUser = useAuthStore((s) => s.user);
  // Once `/auth/me` has completed, its null result must win over any
  // in-memory login snapshot. Before that, the snapshot is useful only for
  // same-page navigation after login; it is never persisted across reloads.
  const activeUser = authUserFetched && !authUserError ? authUser : storeUser;
  const isAuthenticated = Boolean(activeUser);
  // The catalogue search belongs to whoever typed it. Its stored copy is
  // forgotten when the session ends (`forgetAccountBrowserState`), but this
  // page stays mounted through a session that ends without a reload, and
  // went on filtering the next account's catalogue by it.
  const activeUserId = activeUser?.id ?? null;
  const searchOwnerIdRef = useRef(activeUserId);
  useEffect(() => {
    const previousOwnerId = searchOwnerIdRef.current;
    searchOwnerIdRef.current = activeUserId;
    if (previousOwnerId && previousOwnerId !== activeUserId) setSearch("");
  }, [activeUserId, setSearch]);
  // The session has not been checked yet and nothing is remembered about the
  // account, so it is too early to offer "Login".
  const accountStatusUnknown =
    !isAuthenticated && !authUserFetched && !authIdentityHint;
  const userRoles = getUserRoles(activeUser);
  const isAdmin = hasAdminRole(userRoles);
  const allowedWorkspaceRoles = useMemo(
    () => getVisibleWorkspaceRoles(userRoles, role),
    [role, userRoles],
  );
  const canSwitchWorkspace =
    allowedWorkspaceRoles.includes("student") &&
    allowedWorkspaceRoles.includes("creator");
  const effectiveRole = useMemo(
    () => (isAuthenticated ? resolveWorkspaceRole(userRoles, role) : "student"),
    [isAuthenticated, role, userRoles],
  );
  const {
    canAccessDashboard,
    dashboardCapabilitiesResolved,
    dashboardPermissionPending,
    routeContentBlocked,
    permissions,
  } = useAcademyRouteGuardState();
  const isEditingOrCreatingCourse = page === "course-create";
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  // Whether this page has shown someone signed out. Signing in after that
  // keeps the guest home up until the learner's own home is ready, just as
  // for a browser that opened the page signed out: signing out and back in
  // without a reload used to show the placeholders of a learner with
  // courses in between, whatever the account had.
  const [shownSignedOut, setShownSignedOut] = useState(false);
  if (isAuthReady && !isAuthenticated && !shownSignedOut) {
    setShownSignedOut(true);
  }
  // The Discussions page needs a session, and the route guard holds every
  // such page back until the session check has answered. A browser that was
  // signed in last time is shown the page meanwhile: its heading, tabs and
  // filters are the same whatever the answer, and it asks for nothing until
  // the answer is in (see DiscussionsWorkspace). Should the session turn out
  // to be gone, the guard sends the visitor to sign in as it always did.
  const discussionsWhileSessionPending =
    routeContentBlocked &&
    !isAuthReady &&
    sessionPresentAtBoot &&
    page === "workspace" &&
    activeSection === "Discussions";
  const workspaceRoleKey =
    storedPreferencesReady && authUserFetched
      ? (activeUser?.id ?? "guest")
      : null;
  const isWorkspaceRoleHydrated =
    workspaceRoleKey !== null && hydratedWorkspaceRoleKey === workspaceRoleKey;
  // The account is in its Admin or Instructor view, as far as can be told
  // before `effectiveRole` says so. That takes the session check and then
  // the saved view, and until both are in `effectiveRole` reads "student":
  // an admin's page used to open as a learner's and turn into their own.
  // First the view remembered from last time stands in, then the one the
  // account's saved choice (or, for an admin with none, its role) gives.
  const creatorViewExpected =
    (!isAuthReady && sessionPresentAtBoot && isDashboardHomeHint(homeHint)) ||
    (isAuthenticated &&
      !isWorkspaceRoleHydrated &&
      (workspaceRoleHint === "creator" ||
        (workspaceRoleHint === null && isAdmin)));
  const dashboardHomeExpected = page === "home" && creatorViewExpected;
  // The route guard holds a page back with a plain spinner in its place.
  // The home page is the exception while all that is awaited is whether the
  // account may see the dashboard: it shows the dashboard's own placeholder
  // meanwhile, or the learner's home when the account is in its Student
  // view, which does not depend on the answer.
  const routeContentHeld =
    routeContentBlocked &&
    !discussionsWhileSessionPending &&
    !(dashboardPermissionPending && page === "home");
  const isDashboardRoute =
    page === "home" && (effectiveRole === "creator" || dashboardHomeExpected);
  // Team members beyond admin and instructor see the pages their
  // permissions open (see navigation.ts).
  const teamNavigation = useMemo(
    () => ({ roles: userRoles ?? [], permissions }),
    [permissions, userRoles],
  );
  const roleNavigationItems = useMemo(
    () =>
      creatorViewExpected
        ? getRoleNavigationItems(
            "creator",
            isAuthenticated ? isAdmin : homeHint === "admin-dashboard",
            teamNavigation,
          )
        : getRoleNavigationItems(effectiveRole, isAdmin, teamNavigation),
    [
      creatorViewExpected,
      effectiveRole,
      homeHint,
      isAdmin,
      isAuthenticated,
      teamNavigation,
    ],
  );
  // Every sign-out confirmed in this tab, whichever screen started it.
  useEffect(
    () =>
      onSignedOutHere(() =>
        setNotice({ type: "success", message: "Logged out successfully." }),
      ),
    [setNotice],
  );
  const { isPending: isSigningOut, signOut } = useSignOut();
  const signOutAfterSync = useCallback(async () => {
    // The question has closed itself by now (see closeOnConfirm).
    const result = await signOut();
    if (result === "still-signed-in") {
      setNotice({
        type: "error",
        message:
          "We couldn't sign you out, so you're still signed in. Please try again.",
      });
    }
  }, [setNotice, signOut]);
  return {
    authUser,
    authUserFetched,
    authIdentityHint,
    workspaceRoleHint,
    hydratedWorkspaceRoleHint,
    sessionPresentAtBoot,
    showGuestHomeWhilePending,
    learnerWasNotEnrolled,
    activeUser,
    isAuthenticated,
    accountStatusUnknown,
    userRoles,
    isAdmin,
    allowedWorkspaceRoles,
    canSwitchWorkspace,
    effectiveRole,
    canAccessDashboard,
    dashboardCapabilitiesResolved,
    routeContentBlocked,
    isEditingOrCreatingCourse,
    isAuthReady,
    shownSignedOut,
    discussionsWhileSessionPending,
    isWorkspaceRoleHydrated,
    creatorViewExpected,
    dashboardHomeExpected,
    routeContentHeld,
    isDashboardRoute,
    roleNavigationItems,
    isSigningOut,
    signOutAfterSync,
  };
}
