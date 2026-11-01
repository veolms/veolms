import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Course, CourseRole } from "../../courses/catalogue";
import { prefetchCourseEditor } from "../../services/courses";
import { getInitialSidebarShellState } from "../sidebarPreferences";
import { DEFAULT_ACADEMY_THEME } from "../../themes";
import type { SidebarMode } from "../../settings/settingsPreferences";
import type { ProfilePreferences } from "../../settings/profileTypes";
import { loadCourseCreatePage } from "../academyLazyPages";
import type { ThemePreference } from "../academyShellTypes";
import { subscribeToNothing } from "../academyShellGeometry";

export interface UseShellWorkspaceStateArgs {}

export interface UseShellWorkspaceStateResult {
  queryClient: QueryClient;
  prepareCourseEditorEdit: (course: Course) => void;
  role: CourseRole;
  setRole: Dispatch<SetStateAction<CourseRole>>;
  hydratedWorkspaceRoleKey: string | null;
  setHydratedWorkspaceRoleKey: Dispatch<SetStateAction<string | null>>;
  sidebarMode: SidebarMode;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarWidth: number;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  sidebarShellHydratedRef: RefObject<boolean>;
  sidebarControlKey: "prerender" | "client";
  sidebarResizing: boolean;
  setSidebarResizing: Dispatch<SetStateAction<boolean>>;
  sidebarResizePreviewWidth: number | null;
  setSidebarResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  sidebarOverlaySwipeOffset: number | null;
  setSidebarOverlaySwipeOffset: Dispatch<SetStateAction<number | null>>;
  compactNavigation: boolean;
  setCompactNavigation: Dispatch<SetStateAction<boolean>>;
  coarseNavigationInput: boolean;
  setCoarseNavigationInput: Dispatch<SetStateAction<boolean>>;
  edgeSidebarOpen: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  theme: ThemePreference;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  resolvedTheme: "light" | "dark";
  setResolvedTheme: Dispatch<SetStateAction<"light" | "dark">>;
  academyTheme: string;
  setAcademyTheme: Dispatch<SetStateAction<string>>;
}

export function useShellWorkspaceState({}: UseShellWorkspaceStateArgs): UseShellWorkspaceStateResult {
  const queryClient = useQueryClient();
  const warmCourseEditorChunk = useCallback((_course: Course) => {
    void loadCourseCreatePage().catch(() => undefined);
  }, []);
  const prepareCourseEditorEdit = useCallback(
    (course: Course) => {
      warmCourseEditorChunk(course);
      void prefetchCourseEditor(queryClient, course.id);
    },
    [queryClient, warmCourseEditorChunk],
  );
  // Keep the first client render identical to the prerender. Restore the
  // account-specific workspace role only after `/auth/me` identifies the
  // account below.
  const [role, setRole] = useState<CourseRole>("student");
  const [hydratedWorkspaceRoleKey, setHydratedWorkspaceRoleKey] = useState<
    string | null
  >(null);
  const [savedShellProfiles, setSavedShellProfiles] = useState<
    Record<CourseRole, ProfilePreferences | null>
  >({ student: null, creator: null });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    () => getInitialSidebarShellState().mode,
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () => getInitialSidebarShellState().width,
  );
  const sidebarShellHydratedRef = useRef(false);
  // True only while React hydrates the prerendered page. The prerender always
  // describes the expanded sidebar and hydration does not patch mismatched
  // attributes, so the controls whose attributes follow the sidebar mode are
  // keyed on this and remounted once with their real values.
  const hydratingPrerender = useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true,
  );
  const sidebarControlKey = hydratingPrerender ? "prerender" : "client";

  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [sidebarResizePreviewWidth, setSidebarResizePreviewWidth] = useState<
    number | null
  >(null);
  const [sidebarOverlaySwipeOffset, setSidebarOverlaySwipeOffset] = useState<
    number | null
  >(null);
  // Browser-only input capabilities are applied after startup so the loading
  // boundary remains deterministic across the build and the first client pass.
  // Compact navigation must start as the prerendered "wide" value: it gates
  // whole elements (mobile dock, sidebar controls), so reading the viewport
  // here makes hydration fail on phones (React #418) and React then discards
  // and re-renders the entire prerendered tree. The pre-hydration layout is
  // CSS-driven via data-navigation-layout, and the mount effect below applies
  // the real matchMedia value immediately after hydration.
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [coarseNavigationInput, setCoarseNavigationInput] = useState(false);
  const [edgeSidebarOpen, setEdgeSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [academyTheme, setAcademyTheme] = useState(DEFAULT_ACADEMY_THEME);
  return {
    queryClient,
    prepareCourseEditorEdit,
    role,
    setRole,
    hydratedWorkspaceRoleKey,
    setHydratedWorkspaceRoleKey,
    sidebarMode,
    setSidebarMode,
    sidebarWidth,
    setSidebarWidth,
    sidebarShellHydratedRef,
    sidebarControlKey,
    sidebarResizing,
    setSidebarResizing,
    sidebarResizePreviewWidth,
    setSidebarResizePreviewWidth,
    sidebarOverlaySwipeOffset,
    setSidebarOverlaySwipeOffset,
    compactNavigation,
    setCompactNavigation,
    coarseNavigationInput,
    setCoarseNavigationInput,
    edgeSidebarOpen,
    setEdgeSidebarOpen,
    theme,
    setTheme,
    resolvedTheme,
    setResolvedTheme,
    academyTheme,
    setAcademyTheme,
  };
}
