import { Suspense } from "react";
import { PrefetchPageLinks } from "react-router";
import type { CSSProperties, ReactNode, Ref } from "react";
import type {
  CourseListResponse,
  GuestHomePageResponse,
} from "@veolms/contracts";
import type { CourseCurriculumPreview } from "./courses/staticCurriculum";
import {
  SETTINGS_DEFAULT_TAB,
  normalizeSettingsTab,
} from "./routing/tabSessionState";
import { ToastNotification } from "./ToastNotification";
import type { LearningCourse } from "./StudentPages";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
} from "./courses/catalogue";
import { AcademyPaletteMenu } from "./shell/AcademyPaletteMenu";
import { useMobileMenuRoleSwitch } from "./shell/hooks/useMobileMenuRoleSwitch";
import { useAcademyPageContent } from "./shell/hooks/useAcademyPageContent";
import { FloatingScrollbar } from "./shell/FloatingScrollbar";
import { FrameEdge } from "./shell/FrameEdge";
import { ShellDragSurface } from "./shell/ShellDragSurface";

import { academyThemes } from "./themes";
import type { NavigateTo } from "./routing/navigation";
import {
  LogoutConfirmModal,
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  ReadingModeQuickMenu,
  SettingsQuickMenu,
} from "./shell/academyLazyPages";
import { SIDEBAR_COLLAPSED_WIDTH } from "./shell/academyShellConstants";
import type { CoursesPageRenderContext } from "./shell/academyShellTypes";
export type { CoursesPageRenderContext } from "./shell/academyShellTypes";
import { SidebarTooltipSurface } from "./shell/SidebarTooltipSurface";
import { SidebarResizeHandle } from "./shell/SidebarResizeHandle";
import { SidebarBrand } from "./shell/SidebarBrand";
import { SidebarNavigation } from "./shell/SidebarNavigation";
import { SidebarProfileMenuLayer } from "./shell/SidebarProfileMenuLayer";
import { SidebarProfileButton } from "./shell/SidebarProfileButton";
import { SidebarAppearanceDock } from "./shell/SidebarAppearanceDock";
import { ShellMainFrame } from "./shell/ShellMainFrame";
import { MobileBottomNavigation } from "./shell/MobileBottomNavigation";
import { MobileSheetProfile } from "./shell/MobileSheetProfile";
import { MobileSheetProfileMenu } from "./shell/MobileSheetProfileMenu";
import { MobileSheetAppearance } from "./shell/MobileSheetAppearance";
import { useShellWorkspaceState } from "./shell/hooks/useShellWorkspaceState";
import { useShellPreferencesState } from "./shell/hooks/useShellPreferencesState";
import { useCatalogueFilterState } from "./shell/hooks/useCatalogueFilterState";
import { useShellMenusState } from "./shell/hooks/useShellMenusState";
import { useShellSession } from "./shell/hooks/useShellSession";
import { useCatalogueQueries } from "./shell/hooks/useCatalogueQueries";
import { useShellProfileSummary } from "./shell/hooks/useShellProfileSummary";
import { useShellRefs } from "./shell/hooks/useShellRefs";
import { useLessonBackgroundPage } from "./shell/hooks/useLessonBackgroundPage";
import { useShellGestureRefs } from "./shell/hooks/useShellGestureRefs";
import { useShellLayoutEffects } from "./shell/hooks/useShellLayoutEffects";
import { usePlatformAppearanceDefaults } from "./shell/hooks/usePlatformAppearanceDefaults";
import { useShellEffects } from "./shell/hooks/useShellEffects";
import { useShellWarmUpEffects } from "./shell/hooks/useShellWarmUpEffects";
import { useShellKeyboardEffects } from "./shell/hooks/useShellKeyboardEffects";
import { useThemeTransitionGestures } from "./shell/hooks/useThemeTransitionGestures";
import { useCatalogueView } from "./shell/hooks/useCatalogueView";
import { useMobileMenuActions } from "./shell/hooks/useMobileMenuActions";
import { useSidebarPresentation } from "./shell/hooks/useSidebarPresentation";
import { useAppearanceControls } from "./shell/hooks/useAppearanceControls";
import { usePalettePreview } from "./shell/hooks/usePalettePreview";
import { useDockLongPress } from "./shell/hooks/useDockLongPress";
import { useSidebarTooltip } from "./shell/hooks/useSidebarTooltip";
import { useSidebarGestures } from "./shell/hooks/useSidebarGestures";
import { useSidebarResize } from "./shell/hooks/useSidebarResize";
import { useSidebarControls } from "./shell/hooks/useSidebarControls";
import { useShellPageEffects } from "./shell/hooks/useShellPageEffects";
interface CoursesPageProps {
  initialPublishedCoursePage?: CourseListResponse;
  initialPublishedCoursePageNeedsRefresh?: boolean;
  initialCourseCurriculum?: CourseCurriculumPreview;
  initialGuestHomePage?: GuestHomePageResponse;
  initialGuestHomeCopy?: GuestHomePageResponse;
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
  onNavigatePage: NavigateTo;
  onNavigateBack?: () => void;
  /** The menu page `onNavigateBack` returns to, as the menu names it. */
  navigateBackSection?: string;
  onExitSettings?: () => void;
  showPageBackButton?: boolean;
  cataloguePathname?: string;
  routeCatalogueEnrollmentFilter?: Extract<
    CourseEnrollmentFilter,
    "all" | "enrolled" | "not-enrolled" | "free" | "wishlist"
  >;
  page?: string;
  section?: string | null;
  settingsTab?: string;
  platformTab?: string;
  analyticsTab?: string;
  discussionTab?: string;
  courseSlug?: string;
  quizId?: string;
  assignmentId?: string;
  username?: string;
  couponId?: string;
  miniPlayerCourseId?: string | null;
  learningBackground?: {
    courseSlug?: string;
    discussionTab?: string;
    page: string;
    pathname?: string;
    scrollLeft: number;
    scrollTop: number;
    section?: string;
    settingsTab?: string;
    platformTab?: string;
    analyticsTab?: string;
  } | null;
  /**
   * While a lesson fills the screen: the page and navigation section the
   * player was opened from, which the shell keeps highlighted.
   */
  learningOriginSection?: string | null;
  learningMotionStageRef?: Ref<HTMLDivElement>;
  renderMain?: ((context: CoursesPageRenderContext) => ReactNode) | null;
}

export function CoursesPage({
  initialPublishedCoursePage,
  initialPublishedCoursePageNeedsRefresh = false,
  initialCourseCurriculum,
  initialGuestHomePage,
  initialGuestHomeCopy,
  onOpenCourse,
  onNavigatePage,
  onNavigateBack,
  navigateBackSection,
  onExitSettings,
  showPageBackButton = false,
  cataloguePathname = "/courses",
  routeCatalogueEnrollmentFilter = "all",
  page = "courses",
  section: requestedSection = null,
  settingsTab = SETTINGS_DEFAULT_TAB,
  platformTab,
  analyticsTab,
  discussionTab = "all",
  courseSlug,
  quizId,
  assignmentId,
  username,
  couponId,
  miniPlayerCourseId = null,
  learningBackground = null,
  learningOriginSection = null,
  learningMotionStageRef,
  renderMain = null,
}: CoursesPageProps) {
  const {
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
  } = useShellWorkspaceState({});
  const {
    appliedAcademyTheme,
    setAppliedAcademyTheme,
    palettePreviewTheme,
    setPalettePreviewTheme,
    displayedAcademyTheme,
    sidebarPreferences,
    setSidebarPreferences,
    mobileSidebarNavigationActive,
    sidebarAvailable,
    pageTabColors,
    setPageTabColors,
    sidebarHeaderLayout,
    sidebarDockItems,
    settingsInSidebarDock,
    sidebarMaxWidth,
    showSidebarAppearanceControl,
    showSidebarThemeIcon,
    readingModePreferences,
    setReadingModePreferences,
    readingModeEnabled,
  } = useShellPreferencesState({
    compactNavigation,
    academyTheme,
  });
  const {
    activeSection,
    setActiveSection,
    creatorEnrollmentFilter,
    setCreatorEnrollmentFilter,
    search,
    setSearch,
    debouncedSearch,
    statusFilter,
    setStatusFilter,
    filterOwnerRef,
    sort,
    setSort,
    wishlisted,
    storedPreferencesReady,
    setStoredPreferencesReady,
  } = useCatalogueFilterState({
    page,
    requestedSection,
  });
  const {
    courseMenu,
    setCourseMenu,
    profileMenu,
    setProfileMenu,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    paletteMenu,
    setPaletteMenu,
    paletteMenuSource,
    setPaletteMenuSource,
    readingModeMenu,
    setReadingModeMenu,
    settingsQuickMenu,
    setSettingsQuickMenu,
    settingsQuickMenuLoaded,
    setSettingsQuickMenuLoaded,
    sidebarTooltip,
    setSidebarTooltip,
    navigationScrollFade,
    setNavigationScrollFade,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileNavigationSheetMounted,
    pendingMobileMenuOpen,
    setPendingMobileMenuOpen,
    profileMenuSurfaceMounted,
    setProfileMenuSurfaceMounted,
    pendingProfileMenuOpen,
    setPendingProfileMenuOpen,
    logoutModalMounted,
    setLogoutModalMounted,
    mobilePaletteMenu,
    setMobilePaletteMenu,
    mobileMenuCollapsedSnapPoint,
    setMobileMenuCollapsedSnapPoint,
    mobileMenuSnapPoint,
    setMobileMenuSnapPoint,
    mobileBottomNavHidden,
    setMobileBottomNavHidden,
    notice,
    setNotice,
    isFullscreen,
    setIsFullscreen,
    shortcutPlatform,
  } = useShellMenusState();
  const {
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
    creatorViewExpected,
    canAccessDashboard,
    dashboardCapabilitiesResolved,
    routeContentBlocked,
    isEditingOrCreatingCourse,
    isAuthReady,
    shownSignedOut,
    discussionsWhileSessionPending,
    isWorkspaceRoleHydrated,
    dashboardHomeExpected,
    routeContentHeld,
    isDashboardRoute,
    roleNavigationItems,
    isSigningOut,
    signOutAfterSync,
  } = useShellSession({
    page,
    role,
    hydratedWorkspaceRoleKey,
    activeSection,
    setSearch,
    storedPreferencesReady,
    setNotice,
  });
  const {
    isCourseCataloguePage,
    isStudentCatalogueRoute,
    enrollmentFilter,
    needsCompleteCourseList,
    pagedCourseQuery,
    completeCourseQuery,
    publishedCourses,
    enrolledCoursesData,
    learnerStateKnown,
    myCoursesQuery,
    myCoursesData,
    deletedCoursesQuery,
    deletedCoursesData,
    isCourseCatalogueLoadError,
    isLoadingCourses,
    handleEnrollmentFilterChange,
    deleteCourseMutation,
    restoreCourseMutation,
    deletingCourseIds,
    setDeletingCourseIds,
  } = useCatalogueQueries({
    cataloguePathname,
    initialPublishedCoursePage,
    initialPublishedCoursePageNeedsRefresh,
    learningBackground,
    onNavigatePage,
    page,
    renderMain,
    routeCatalogueEnrollmentFilter,
    creatorEnrollmentFilter,
    setCreatorEnrollmentFilter,
    debouncedSearch,
    statusFilter,
    sort,
    authUserFetched,
    workspaceRoleHint,
    isAuthenticated,
    isAdmin,
    effectiveRole,
    isEditingOrCreatingCourse,
    isAuthReady,
    isWorkspaceRoleHydrated,
  });

  const {
    shellProfileKnownName,
    shellProfileDisplayName,
    shellProfileSubtitle,
    ProfileSubtitleIcon,
    shellProfileAvatarUrl,
    shellProfileAvatarSrcSet,
    unreadNotificationCount,
  } = useShellProfileSummary({
    authUserFetched,
    authIdentityHint,
    activeUser,
    isAuthenticated,
    userRoles,
    canSwitchWorkspace,
    effectiveRole,
  });
  const {
    profileRef,
    coursesAppRef,
    appliedThemeRef,
    appliedPaletteRef,
    paletteStyleRequestRef,
    themeRevealOriginRef,
    revertPalettePreviewRef,
    activateAppearanceOptionRef,
    acknowledgeLongPressRef,
    openLogoutConfirm,
    dismissProfileMenuThen,
    appearanceControlsRef,
    appearanceControlRectsRef,
    appearanceLayoutRef,
    appearanceAnimationsRef,
    appearanceModeTriggerRef,
    paletteTriggerRef,
    mobileAppearanceModeTriggerRef,
    mobilePaletteTriggerRef,
    navigationRef,
    mainScrollportRef,
    mobileBottomNavRef,
    mobileMoreRef,
    mobileSheetRef,
    mobileMenuDismissThenRef,
    dismissSettingsQuickMenuThen,
    toggleSettingsNavigationRef,
    toggleAppearanceRef,
    mobileMenuSnapPoints,
  } = useShellRefs({
    profileMenu,
    setProfileMenu,
    setLogoutConfirmOpen,
    paletteMenu,
    setPaletteMenu,
    readingModeMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    settingsQuickMenu,
    mobilePaletteMenu,
    setMobilePaletteMenu,
    mobileMenuCollapsedSnapPoint,
  });
  const {
    isLearningSurface,
    keepLessonPageBoxes,
    onDeepGround,
    mobileSheetSizeRef,
    mobileMenuContentSnapPoint,
    activeNavigationSection,
    isNavigationItemActive,
  } = useLessonBackgroundPage({
    cataloguePathname,
    learningBackground,
    learningOriginSection,
    page,
    renderMain,
    requestedSection,
    sidebarDockItems,
    mobileMenuOpen,
    isAuthenticated,
    isAdmin,
    canSwitchWorkspace,
    effectiveRole,
    mobileSheetRef,
  });
  const {
    sidebarResizeRef,
    sidebarResizeSyncTimerRef,
    sidebarScreenSwipeStartRef,
    sidebarResizeMoveRef,
    sidebarResizeFinishRef,
    sidebarOverlaySwipeConsumedRef,
    appearanceSwipeRef,
    appearanceSwipeConsumedRef,
    dockLongPressRef,
    dockLongPressConsumedUntilRef,
    longPressAudioContextRef,
    sidebarTooltipTimerRef,
    primaryShortcutModifier,
    settingsShortcutKeys,
    sidebarShortcutTitle,
    showKeyboardShortcuts,
    settingsControlTitle,
  } = useShellGestureRefs({
    sidebarPreferences,
    shortcutPlatform,
  });

  useShellLayoutEffects({
    setRole,
    setHydratedWorkspaceRoleKey,
    setSidebarMode,
    sidebarMode,
    setSidebarWidth,
    sidebarWidth,
    sidebarShellHydratedRef,
    setSidebarResizing,
    setSidebarResizePreviewWidth,
    setSidebarOverlaySwipeOffset,
    compactNavigation,
    setTheme,
    theme,
    setResolvedTheme,
    academyTheme,
    setAcademyTheme,
    setAppliedAcademyTheme,
    displayedAcademyTheme,
    setSidebarPreferences,
    setPageTabColors,
    setReadingModePreferences,
    setStoredPreferencesReady,
    storedPreferencesReady,
    mobileMenuOpen,
    setMobileMenuCollapsedSnapPoint,
    setMobileMenuSnapPoint,
    authUserFetched,
    activeUser,
    userRoles,
    appliedThemeRef,
    appliedPaletteRef,
    themeRevealOriginRef,
    isLearningSurface,
    mobileMenuContentSnapPoint,
    sidebarResizeRef,
    dockLongPressRef,
    longPressAudioContextRef,
  });

  usePlatformAppearanceDefaults({
    storedPreferencesReady,
    setTheme,
    setAcademyTheme,
    appliedThemeRef,
  });

  useShellEffects({
    onNavigatePage,
    page,
    requestedSection,
    queryClient,
    role,
    setRole,
    setSidebarMode,
    sidebarMode,
    setSidebarWidth,
    sidebarShellHydratedRef,
    setCompactNavigation,
    setCoarseNavigationInput,
    setEdgeSidebarOpen,
    sidebarPreferences,
    pageTabColors,
    sidebarMaxWidth,
    setReadingModePreferences,
    setActiveSection,
    setCreatorEnrollmentFilter,
    setStatusFilter,
    filterOwnerRef,
    storedPreferencesReady,
    setCourseMenu,
    profileMenu,
    setProfileMenu,
    logoutConfirmOpen,
    setMobileMenuOpen,
    mobileNavigationSheetMounted,
    pendingMobileMenuOpen,
    setPendingMobileMenuOpen,
    profileMenuSurfaceMounted,
    setProfileMenuSurfaceMounted,
    pendingProfileMenuOpen,
    setPendingProfileMenuOpen,
    setLogoutModalMounted,
    authUserFetched,
    activeUser,
    isAuthenticated,
    userRoles,
    isAdmin,
    canSwitchWorkspace,
    effectiveRole,
    isWorkspaceRoleHydrated,
    navigationRef,
  });

  const { settingsWarmed } = useShellWarmUpEffects({
    compactNavigation,
    isGuest: !isAuthenticated && !accountStatusUnknown,
    mobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileNavigationSheetMounted,
  });

  useShellKeyboardEffects({
    page,
    setSidebarResizing,
    setSidebarResizePreviewWidth,
    setSidebarOverlaySwipeOffset,
    compactNavigation,
    setEdgeSidebarOpen,
    setPalettePreviewTheme,
    mobileSidebarNavigationActive,
    showSidebarAppearanceControl,
    showSidebarThemeIcon,
    paletteMenu,
    setPaletteMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobilePaletteMenu,
    setMobilePaletteMenu,
    setMobileBottomNavHidden,
    mobileBottomNavRef,
    sidebarResizeRef,
  });

  useThemeTransitionGestures({
    onNavigatePage,
    setSidebarMode,
    sidebarMode,
    edgeSidebarOpen,
    setEdgeSidebarOpen,
    setActiveSection,
    setCourseMenu,
    setProfileMenu,
    setPaletteMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    setMobileMenuOpen,
    setPendingMobileMenuOpen,
    setPendingProfileMenuOpen,
    setMobilePaletteMenu,
    profileRef,
    revertPalettePreviewRef,
    activateAppearanceOptionRef,
    acknowledgeLongPressRef,
    toggleSettingsNavigationRef,
    toggleAppearanceRef,
    dockLongPressConsumedUntilRef,
  });

  const {
    navigation,
    updateNavigationScrollFade,
    totalCoursesCount,
    handleDeleteCourse,
    handleRestoreCourse,
    quickFilterCounts,
    visibleCourses,
    toggleWishlist,
    resetCatalogue,
  } = useCatalogueView({
    onNavigatePage,
    sidebarMode,
    compactNavigation,
    settingsInSidebarDock,
    setCreatorEnrollmentFilter,
    setSearch,
    debouncedSearch,
    setStatusFilter,
    statusFilter,
    sort,
    wishlisted,
    setNavigationScrollFade,
    setNotice,
    authUser,
    effectiveRole,
    roleNavigationItems,
    isCourseCataloguePage,
    isStudentCatalogueRoute,
    enrollmentFilter,
    needsCompleteCourseList,
    pagedCourseQuery,
    publishedCourses,
    enrolledCoursesData,
    learnerStateKnown,
    myCoursesData,
    deletedCoursesData,
    deleteCourseMutation,
    restoreCourseMutation,
    setDeletingCourseIds,
    navigationRef,
  });

  const {
    closeMobileMenu,
    openMobileNavigationMenu,
    dismissMobileMenuThen,
    selectNavigation,
    toggleSettingsNavigation,
    navigateSettingsQuickMenu,
  } = useMobileMenuActions({
    onExitSettings,
    onNavigatePage,
    page,
    setEdgeSidebarOpen,
    setProfileMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    settingsQuickMenu,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileNavigationSheetMounted,
    setPendingMobileMenuOpen,
    setMobilePaletteMenu,
    setMobileMenuCollapsedSnapPoint,
    setMobileMenuSnapPoint,
    mobileMenuDismissThenRef,
    dismissSettingsQuickMenuThen,
    toggleSettingsNavigationRef,
    isLearningSurface,
    mobileMenuContentSnapPoint,
  });
  const { switchRoleFromMobileMenu, applyRoleAfterMobileMenuClosed } =
    useMobileMenuRoleSwitch({
      mobileMenuOpen,
      setRole,
      dismissMobileMenuThen,
    });

  const {
    navigationUsesCompactInteraction,
    renderedSidebarMode,
    renderedSidebarWidth,
    sidebarCollapsed,
    sidebarHidden,
    sidebarPresentedAsOverlay,
    sidebarVisuallyCollapsed,
    sidebarControlAction,
    sidebarControlTitle,
    sidebarBrandTitle,
    appearanceControlsHorizontal,
  } = useSidebarPresentation({
    sidebarMode,
    sidebarWidth,
    sidebarResizing,
    sidebarResizePreviewWidth,
    compactNavigation,
    coarseNavigationInput,
    sidebarShortcutTitle,
    showKeyboardShortcuts,
  });

  const {
    changeAppearanceMode,
    updateReadingMode,
    showReadingModeMenu,
    showSettingsQuickMenu,
    openSettingsQuickMenu,
    openReadingModeMenu,
    fullscreenActionLabel,
    toggleFullscreen,
    emptyAreaDoubleTapHandlers,
    consumeAppearanceGestureClick,
    commitPalette,
    changePalette,
  } = useAppearanceControls({
    sidebarWidth,
    sidebarResizePreviewWidth,
    setTheme,
    resolvedTheme,
    setAcademyTheme,
    setAppliedAcademyTheme,
    setPalettePreviewTheme,
    displayedAcademyTheme,
    setReadingModePreferences,
    setProfileMenu,
    setPaletteMenu,
    readingModeMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    settingsQuickMenu,
    setSettingsQuickMenuLoaded,
    setMobilePaletteMenu,
    setNotice,
    isFullscreen,
    setIsFullscreen,
    appliedPaletteRef,
    paletteStyleRequestRef,
    themeRevealOriginRef,
    revertPalettePreviewRef,
    appearanceControlsRef,
    appearanceControlRectsRef,
    appearanceLayoutRef,
    appearanceAnimationsRef,
    toggleAppearanceRef,
    appearanceSwipeConsumedRef,
    dockLongPressConsumedUntilRef,
    appearanceControlsHorizontal,
  });

  const {
    previewAcademyTheme,
    confirmDesktopPaletteTheme,
    cancelDesktopPalettePreview,
    confirmMobilePaletteTheme,
    cancelMobilePalettePreview,
    activateAppearanceOption,
  } = usePalettePreview({
    setTheme,
    academyTheme,
    palettePreviewTheme,
    setPalettePreviewTheme,
    displayedAcademyTheme,
    setPaletteMenu,
    paletteMenuSource,
    setPaletteMenuSource,
    setReadingModeMenu,
    setMobilePaletteMenu,
    paletteStyleRequestRef,
    revertPalettePreviewRef,
    activateAppearanceOptionRef,
    appearanceModeTriggerRef,
    paletteTriggerRef,
    mobileAppearanceModeTriggerRef,
    mobilePaletteTriggerRef,
    commitPalette,
    changePalette,
  });

  const {
    openAppearanceThemeMenu,
    startDockLongPress,
    moveDockLongPress,
    finishDockLongPress,
    startAppearanceSwipe,
    finishAppearanceSwipe,
    cancelAppearanceSwipe,
  } = useDockLongPress({
    theme,
    paletteMenu,
    setPaletteMenu,
    paletteMenuSource,
    setReadingModeMenu,
    mobilePaletteMenu,
    setMobilePaletteMenu,
    themeRevealOriginRef,
    revertPalettePreviewRef,
    acknowledgeLongPressRef,
    appearanceSwipeRef,
    appearanceSwipeConsumedRef,
    dockLongPressRef,
    dockLongPressConsumedUntilRef,
    longPressAudioContextRef,
    activateAppearanceOption,
  });
  const {
    sidebarDraggedToCollapsedWidth,
    sidebarClassName,
    dismissSidebarTooltipImmediately,
    showSidebarTooltip,
    hideCollapsedNavigationTooltip,
  } = useSidebarTooltip({
    sidebarMode,
    sidebarResizing,
    sidebarResizePreviewWidth,
    sidebarOverlaySwipeOffset,
    compactNavigation,
    coarseNavigationInput,
    edgeSidebarOpen,
    setSidebarTooltip,
    isDashboardRoute,
    coursesAppRef,
    activeNavigationSection,
    sidebarResizeRef,
    sidebarTooltipTimerRef,
    showKeyboardShortcuts,
    renderedSidebarWidth,
    sidebarCollapsed,
    sidebarHidden,
    sidebarPresentedAsOverlay,
    sidebarVisuallyCollapsed,
  });

  const {
    commitSidebarWidth,
    resetSidebarWidth,
    createSidebarGesture,
    activateSidebarGesture,
    startSidebarScreenSwipe,
  } = useSidebarGestures({
    renderMain,
    sidebarMode,
    setSidebarWidth,
    sidebarWidth,
    setSidebarResizing,
    setSidebarResizePreviewWidth,
    setSidebarOverlaySwipeOffset,
    compactNavigation,
    edgeSidebarOpen,
    setEdgeSidebarOpen,
    mobileSidebarNavigationActive,
    sidebarMaxWidth,
    sidebarResizeRef,
    sidebarOverlaySwipeConsumedRef,
    sidebarPresentedAsOverlay,
    sidebarVisuallyCollapsed,
    dismissSidebarTooltipImmediately,
  });

  const { startSidebarResize, moveSidebarResize, endSidebarResize } =
    useSidebarResize({
      setSidebarMode,
      setSidebarWidth,
      setSidebarResizing,
      setSidebarResizePreviewWidth,
      setSidebarOverlaySwipeOffset,
      compactNavigation,
      edgeSidebarOpen,
      setEdgeSidebarOpen,
      sidebarPreferences,
      sidebarMaxWidth,
      setPaletteMenu,
      coursesAppRef,
      appearanceControlsRef,
      appearanceControlRectsRef,
      sidebarResizeRef,
      sidebarResizeSyncTimerRef,
      sidebarScreenSwipeStartRef,
      sidebarOverlaySwipeConsumedRef,
      sidebarPresentedAsOverlay,
      dismissSidebarTooltipImmediately,
      commitSidebarWidth,
      createSidebarGesture,
      activateSidebarGesture,
      startSidebarScreenSwipe,
    });
  const {
    handleSidebarResizeKeyDown,
    toggleSidebarWidth,
    sidebarToggleGesture,
    sidebarLogoGesture,
    handleSidebarBrandPress,
    preventSidebarBrandTextSelection,
    mobileNavigation,
    mobileMoreNavigation,
    mobileMoreActive,
  } = useSidebarControls({
    onLogoPress: () =>
      selectNavigation(
        "Home",
        navigation.find(([label]) => label === "Home"),
      ),
    setSidebarMode,
    sidebarWidth,
    compactNavigation,
    setEdgeSidebarOpen,
    sidebarMaxWidth,
    setPaletteMenu,
    effectiveRole,
    coursesAppRef,
    activeNavigationSection,
    isNavigationItemActive,
    sidebarScreenSwipeStartRef,
    sidebarResizeMoveRef,
    sidebarResizeFinishRef,
    navigation,
    sidebarCollapsed,
    sidebarHidden,
    commitSidebarWidth,
    moveSidebarResize,
    endSidebarResize,
  });
  const { currentAcademyThemeIndex } = useShellPageEffects({
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
  });

  const { renderPageContent } = useAcademyPageContent({
    assignmentId,
    couponId,
    courseSlug,
    discussionTab,
    initialCourseCurriculum,
    initialGuestHomeCopy,
    initialGuestHomePage,
    initialPublishedCoursePage,
    navigateBackSection,
    onExitSettings,
    onNavigateBack,
    onNavigatePage,
    onOpenCourse,
    page,
    quizId,
    requestedSection,
    settingsTab,
    platformTab,
    analyticsTab,
    showPageBackButton,
    username,
    prepareCourseEditorEdit,
    role,
    setRole,
    setSidebarMode,
    sidebarWidth,
    setTheme,
    theme,
    resolvedTheme,
    appliedAcademyTheme,
    setSidebarPreferences,
    sidebarPreferences,
    pageTabColors,
    setPageTabColors,
    activeSection,
    search,
    setSearch,
    setStatusFilter,
    statusFilter,
    setSort,
    sort,
    wishlisted,
    courseMenu,
    setCourseMenu,
    mobileBottomNavHidden,
    setNotice,
    isFullscreen,
    authUserFetched,
    hydratedWorkspaceRoleHint,
    sessionPresentAtBoot,
    showGuestHomeWhilePending,
    learnerWasNotEnrolled,
    activeUser,
    isAuthenticated,
    userRoles,
    isAdmin,
    effectiveRole,
    routeContentBlocked,
    isAuthReady,
    shownSignedOut,
    discussionsWhileSessionPending,
    isWorkspaceRoleHydrated,
    dashboardHomeExpected,
    creatorViewExpected,
    routeContentHeld,
    enrollmentFilter,
    needsCompleteCourseList,
    pagedCourseQuery,
    completeCourseQuery,
    myCoursesQuery,
    deletedCoursesQuery,
    isCourseCatalogueLoadError,
    isLoadingCourses,
    handleEnrollmentFilterChange,
    deletingCourseIds,
    shellProfileKnownName,
    themeRevealOriginRef,
    totalCoursesCount,
    handleDeleteCourse,
    handleRestoreCourse,
    quickFilterCounts,
    visibleCourses,
    toggleWishlist,
    resetCatalogue,
    renderedSidebarMode,
    toggleFullscreen,
    changePalette,
    resetSidebarWidth,
  });

  return (
    <div
      ref={coursesAppRef}
      className={sidebarClassName}
      onPointerDownCapture={(event) =>
        startSidebarScreenSwipe({
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          clientX: event.clientX,
          clientY: event.clientY,
          timeStamp: event.timeStamp,
          target: event.target,
          handle: event.currentTarget,
        })
      }
      style={
        {
          "--sidebar-resize-preview-width": `${sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH}px`,
          "--sidebar-overlay-swipe-offset": `${sidebarOverlaySwipeOffset ?? 0}px`,
        } as CSSProperties
      }
    >
      {sidebarAvailable && (
        <>
          {sidebarPresentedAsOverlay && (
            <div
              className="sidebar-edge-trigger"
              aria-hidden="true"
              onPointerEnter={() => setEdgeSidebarOpen(true)}
            />
          )}
          <aside
            // The sidebar toggle's picture and the logo's opacity follow the
            // width a drag is giving the sidebar. Both are written on the
            // shell and are not handed down by themselves (see its registration in
            // foundation.css), so each box on the way to the picture
            // asks for it. The sidebar reads the width itself while floating
            // (foundation.css), so it is also written on it (Safari, see
            // writeSidebarResizeWidth).
            className="courses-sidebar touch-pan-y [--sidebar-resize-preview-width:inherit] [--sidebar-resize-logo-opacity:inherit]"
            data-sidebar-resize-reader=""
            data-header-layout={sidebarHeaderLayout}
            aria-label={`${effectiveRole === "creator" ? "Creator" : "Student"} navigation`}
            aria-hidden={
              sidebarPresentedAsOverlay && !edgeSidebarOpen ? "true" : undefined
            }
            inert={
              sidebarPresentedAsOverlay && !edgeSidebarOpen ? true : undefined
            }
            onPointerEnter={() =>
              sidebarPresentedAsOverlay && setEdgeSidebarOpen(true)
            }
            onPointerLeave={() =>
              sidebarPresentedAsOverlay &&
              !coarseNavigationInput &&
              setEdgeSidebarOpen(false)
            }
            onFocusCapture={() =>
              sidebarPresentedAsOverlay && setEdgeSidebarOpen(true)
            }
            onClickCapture={(event) => {
              if (!sidebarOverlaySwipeConsumedRef.current) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            {...emptyAreaDoubleTapHandlers}
          >
            {/* The background shapes: the inner box draws them, the outer
                one blurs and fades them (see navigation.css). */}
            <span className="courses-sidebar__bokeh" aria-hidden="true">
              <span />
            </span>
            <SidebarResizeHandle
              compactNavigation={compactNavigation}
              sidebarPresentedAsOverlay={sidebarPresentedAsOverlay}
              edgeSidebarOpen={edgeSidebarOpen}
              sidebarControlKey={sidebarControlKey}
              primaryShortcutModifier={primaryShortcutModifier}
              showKeyboardShortcuts={showKeyboardShortcuts}
              sidebarShortcutTitle={sidebarShortcutTitle}
              sidebarMaxWidth={sidebarMaxWidth}
              sidebarResizePreviewWidth={sidebarResizePreviewWidth}
              renderedSidebarWidth={renderedSidebarWidth}
              sidebarCollapsed={sidebarCollapsed}
              handleSidebarResizeKeyDown={handleSidebarResizeKeyDown}
              toggleSidebarWidth={toggleSidebarWidth}
              dismissSidebarTooltipImmediately={
                dismissSidebarTooltipImmediately
              }
              startSidebarResize={startSidebarResize}
              moveSidebarResize={moveSidebarResize}
              endSidebarResize={endSidebarResize}
              sidebarResizeRef={sidebarResizeRef}
            />
            {/* The band the brand stands in, behind everything else in the
                sidebar: a press beside, above or just under the logo counts
                as one on it. */}
            <span
              aria-hidden="true"
              data-sidebar-brand-zone=""
              data-double-tap-ignore
              className="absolute inset-x-0 top-0 -z-10 h-14"
              onMouseDown={preventSidebarBrandTextSelection}
              onPointerUp={handleSidebarBrandPress}
            />
            <SidebarBrand
              sidebarBrandTitle={sidebarBrandTitle}
              preventSidebarBrandTextSelection={
                preventSidebarBrandTextSelection
              }
              handleSidebarBrandPress={handleSidebarBrandPress}
              sidebarLogoGesture={sidebarLogoGesture}
              sidebarControlKey={sidebarControlKey}
              sidebarControlAction={sidebarControlAction}
              compactNavigation={compactNavigation}
              sidebarCollapsed={sidebarCollapsed}
              primaryShortcutModifier={primaryShortcutModifier}
              sidebarControlTitle={sidebarControlTitle}
              sidebarToggleGesture={sidebarToggleGesture}
              sidebarVisuallyCollapsed={sidebarVisuallyCollapsed}
              sidebarPresentedAsOverlay={sidebarPresentedAsOverlay}
              sidebarDraggedToCollapsedWidth={sidebarDraggedToCollapsedWidth}
            />

            <SidebarNavigation
              navigationScrollFade={navigationScrollFade}
              navigationRef={navigationRef}
              setSidebarTooltip={setSidebarTooltip}
              updateNavigationScrollFade={updateNavigationScrollFade}
              navigation={navigation}
              isNavigationItemActive={isNavigationItemActive}
              sidebarPreferences={sidebarPreferences}
              primaryShortcutModifier={primaryShortcutModifier}
              selectNavigation={selectNavigation}
              navigationUsesCompactInteraction={
                navigationUsesCompactInteraction
              }
              showSidebarTooltip={showSidebarTooltip}
              hideCollapsedNavigationTooltip={hideCollapsedNavigationTooltip}
              showKeyboardShortcuts={showKeyboardShortcuts}
              settingsShortcutKeys={settingsShortcutKeys}
              sidebarResizing={sidebarResizing}
              sidebarResizePreviewWidth={sidebarResizePreviewWidth}
              renderedSidebarWidth={renderedSidebarWidth}
            />

            <div className="courses-profile" ref={profileRef}>
              <SidebarProfileMenuLayer
                isAuthenticated={isAuthenticated}
                profileMenuSurfaceMounted={profileMenuSurfaceMounted}
                profileMenu={profileMenu}
                effectiveRole={effectiveRole}
                allowedWorkspaceRoles={allowedWorkspaceRoles}
                userRoles={userRoles}
                activeUser={activeUser}
                shellProfileDisplayName={shellProfileDisplayName}
                shellProfileAvatarUrl={shellProfileAvatarUrl}
                shellProfileAvatarSrcSet={shellProfileAvatarSrcSet}
                unreadNotificationCount={unreadNotificationCount}
                sidebarPresentedAsOverlay={sidebarPresentedAsOverlay}
                compactNavigation={compactNavigation}
                setProfileMenu={setProfileMenu}
                setRole={setRole}
                setEdgeSidebarOpen={setEdgeSidebarOpen}
                dismissProfileMenuThen={dismissProfileMenuThen}
                dismissMobileMenuThen={dismissMobileMenuThen}
                onNavigatePage={onNavigatePage}
                setSidebarMode={setSidebarMode}
                sidebarHidden={sidebarHidden}
                openLogoutConfirm={openLogoutConfirm}
              />
              <SidebarProfileButton
                isAuthenticated={isAuthenticated}
                shellProfileDisplayName={shellProfileDisplayName}
                shellProfileSubtitle={shellProfileSubtitle}
                profileMenu={profileMenu}
                profileMenuSurfaceMounted={profileMenuSurfaceMounted}
                setProfileMenuSurfaceMounted={setProfileMenuSurfaceMounted}
                setPendingProfileMenuOpen={setPendingProfileMenuOpen}
                setProfileMenu={setProfileMenu}
                shellProfileAvatarUrl={shellProfileAvatarUrl}
                shellProfileAvatarSrcSet={shellProfileAvatarSrcSet}
                unreadNotificationCount={unreadNotificationCount}
                canSwitchWorkspace={canSwitchWorkspace}
                ProfileSubtitleIcon={ProfileSubtitleIcon}
                effectiveRole={effectiveRole}
                userRoles={userRoles}
                accountStatusUnknown={accountStatusUnknown}
                authUserFetched={authUserFetched}
                authIdentityHint={authIdentityHint}
                onNavigatePage={onNavigatePage}
              />
              <SidebarAppearanceDock
                appearanceControlsRef={appearanceControlsRef}
                appearanceControlsHorizontal={appearanceControlsHorizontal}
                sidebarPreferences={sidebarPreferences}
                sidebarDockItems={sidebarDockItems}
                appearanceModeTriggerRef={appearanceModeTriggerRef}
                paletteMenu={paletteMenu}
                paletteMenuSource={paletteMenuSource}
                consumeAppearanceGestureClick={consumeAppearanceGestureClick}
                cancelDesktopPalettePreview={cancelDesktopPalettePreview}
                activateAppearanceOption={activateAppearanceOption}
                openAppearanceThemeMenu={openAppearanceThemeMenu}
                startDockLongPress={startDockLongPress}
                moveDockLongPress={moveDockLongPress}
                finishDockLongPress={finishDockLongPress}
                paletteTriggerRef={paletteTriggerRef}
                setReadingModeMenu={setReadingModeMenu}
                setPaletteMenuSource={setPaletteMenuSource}
                setPaletteMenu={setPaletteMenu}
                startAppearanceSwipe={startAppearanceSwipe}
                finishAppearanceSwipe={finishAppearanceSwipe}
                cancelAppearanceSwipe={cancelAppearanceSwipe}
                displayedAcademyTheme={displayedAcademyTheme}
                readingModeEnabled={readingModeEnabled}
                readingModeMenu={readingModeMenu}
                showReadingModeMenu={showReadingModeMenu}
                openReadingModeMenu={openReadingModeMenu}
                page={page}
                settingsControlTitle={settingsControlTitle}
                primaryShortcutModifier={primaryShortcutModifier}
                settingsQuickMenu={settingsQuickMenu}
                toggleSettingsNavigation={toggleSettingsNavigation}
                openSettingsQuickMenu={openSettingsQuickMenu}
                showSettingsQuickMenu={showSettingsQuickMenu}
                isFullscreen={isFullscreen}
                fullscreenActionLabel={fullscreenActionLabel}
                toggleFullscreen={toggleFullscreen}
                sidebarCollapsed={sidebarCollapsed}
                readingModePreferences={readingModePreferences}
                updateReadingMode={updateReadingMode}
                changePalette={changePalette}
                previewAcademyTheme={previewAcademyTheme}
                confirmDesktopPaletteTheme={confirmDesktopPaletteTheme}
                resolvedTheme={resolvedTheme}
                changeAppearanceMode={changeAppearanceMode}
              />
              {settingsQuickMenuLoaded && (
                <Suspense fallback={null}>
                  <SettingsQuickMenu
                    id="desktop-settings-quick-menu"
                    // Rounded rows and a tighter heading inside the menu's
                    // 8px padding (its surface is in courses.css). Its rows
                    // have no trailing column, so none is kept for them: the
                    // collapsed menu is only as wide as its longest row.
                    className="[&_[role=menuitem]]:rounded-[9px]! [&_[role=menuitem]]:grid-cols-[28px_minmax(0,1fr)]! [&>p]:mt-0! [&>p]:pt-1! [&>p]:pb-1.5! [&>p]:pl-3!"
                    isOpen={settingsQuickMenu === "desktop"}
                    activeTab={
                      page === "settings"
                        ? normalizeSettingsTab(settingsTab)
                        : null
                    }
                    onNavigate={navigateSettingsQuickMenu}
                    showSignedInTabs={isAuthenticated}
                  />
                </Suspense>
              )}
            </div>
          </aside>
        </>
      )}

      {sidebarTooltip && (
        <div
          className={`sidebar-nav-tooltip${sidebarTooltip.active ? " is-active" : ""}${sidebarTooltip.focusVisible ? " is-focus-visible" : ""}${sidebarTooltip.preferenceControlled ? " is-preference-controlled" : ""}`}
          aria-hidden="true"
          style={
            {
              "--sidebar-tooltip-top": `${sidebarTooltip.top}px`,
              "--sidebar-tooltip-left": `${sidebarTooltip.left}px`,
            } as CSSProperties
          }
        >
          <SidebarTooltipSurface />
          <span className="sidebar-nav-tooltip__body">
            <span className="sidebar-nav-tooltip__label">
              {sidebarTooltip.label}
            </span>
          </span>
        </div>
      )}

      <ShellDragSurface />
      <ShellMainFrame
        mainScrollportRef={mainScrollportRef}
        onDeepGround={onDeepGround}
        renderMain={renderMain}
        page={page}
        mobileSidebarNavigationActive={mobileSidebarNavigationActive}
        cataloguePathname={cataloguePathname}
        learningMotionStageRef={learningMotionStageRef}
        keepLessonPageBoxes={keepLessonPageBoxes}
        routeContentBlocked={routeContentBlocked}
        effectiveRole={effectiveRole}
        isAdmin={isAdmin}
        analyticsTab={analyticsTab}
        quizId={quizId}
        learningBackground={learningBackground}
        renderPageContent={renderPageContent}
        routeContentHeld={routeContentHeld}
        compactNavigation={compactNavigation}
        mobileBottomNavHidden={mobileBottomNavHidden}
      />

      <FloatingScrollbar
        scrollportRef={mainScrollportRef}
        className={renderMain ? "floating-scrollbar--learning-page" : undefined}
        rightEdgeSelector={
          renderMain ? ".learning-workspace__lesson-column" : undefined
        }
        enableHorizontalDrag={Boolean(renderMain)}
      />

      {compactNavigation && !mobileSidebarNavigationActive && (
        <MobileBottomNavigation
          mobileBottomNavRef={mobileBottomNavRef}
          mobileBottomNavHidden={mobileBottomNavHidden}
          effectiveRole={effectiveRole}
          setMobileBottomNavHidden={setMobileBottomNavHidden}
          mobileNavigation={mobileNavigation}
          isNavigationItemActive={isNavigationItemActive}
          sidebarPreferences={sidebarPreferences}
          selectNavigation={selectNavigation}
          mobileMoreRef={mobileMoreRef}
          mobileMoreActive={mobileMoreActive}
          mobileMenuOpen={mobileMenuOpen}
          openMobileNavigationMenu={openMobileNavigationMenu}
          shellProfileAvatarUrl={shellProfileAvatarUrl}
          shellProfileAvatarSrcSet={shellProfileAvatarSrcSet}
          isAuthenticated={isAuthenticated}
          unreadNotificationCount={unreadNotificationCount}
        />
      )}

      {mobileNavigationSheetMounted ? (
        <Suspense fallback={null}>
          <Drawer
            open={mobileMenuOpen}
            dismissThenRef={mobileMenuDismissThenRef}
            onOpenChange={(open) => {
              if (open) setMobileMenuOpen(true);
              else closeMobileMenu();
            }}
            onOpenChangeComplete={(open) => {
              if (open) return;
              setMobileMenuSnapPoint(mobileMenuCollapsedSnapPoint);
              applyRoleAfterMobileMenuClosed();
            }}
            snapPoints={mobileMenuSnapPoints}
            snapPoint={mobileMenuSnapPoint}
            onSnapPointChange={setMobileMenuSnapPoint}
            snapToSequentialPoints
            showSwipeHandle
            triggerId="mobile-navigation-trigger"
          >
            <DrawerContent
              ref={mobileSheetSizeRef}
              id="mobile-navigation-sheet"
              aria-labelledby="mobile-navigation-title"
              aria-describedby="mobile-navigation-description"
              initialFocus={mobileSheetRef}
              finalFocus={mobileMoreRef}
              tabIndex={-1}
              className="mobile-menu-sheet [--mobile-menu-sheet-top-space:3px] data-expanded:rounded-none data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] rounded-t-[22px] px-3 pb-[max(14px,var(--app-safe-area-bottom))] [&>[data-slot=drawer-content]]:-mb-[max(14px,var(--app-safe-area-bottom))]"
              // The content box clips its overflow; reaching into the bottom
              // padding keeps the dock tiles' shadows whole at full height.
              floatingContent={
                <>
                  {mobilePaletteMenu && (
                    <AcademyPaletteMenu
                      themes={academyThemes}
                      selectedTheme={displayedAcademyTheme}
                      id="mobile-theme-menu"
                      className="sidebar-palette-menu mobile-palette-menu absolute! right-auto bottom-[calc(68px_+_var(--app-viewport-safe-area-bottom))] left-3 z-[190]! w-[min(216px,calc(100vw_-_24px))]! max-h-[calc(100dvh_-_92px_-_env(safe-area-inset-top))] overflow-y-auto"
                      mobile
                      onSelect={changePalette}
                      onPreview={previewAcademyTheme}
                      onConfirm={confirmMobilePaletteTheme}
                      onCancel={cancelMobilePalettePreview}
                      appearanceMode={resolvedTheme}
                      onAppearanceModeChange={changeAppearanceMode}
                    />
                  )}
                  {settingsQuickMenuLoaded && (
                    <Suspense fallback={null}>
                      <SettingsQuickMenu
                        id="mobile-settings-quick-menu"
                        className="settings-quick-menu--mobile absolute! right-3 bottom-[calc(68px_+_var(--app-viewport-safe-area-bottom))] left-auto z-[190]! w-[min(250px,calc(100vw_-_24px))]! min-w-[min(200px,calc(100vw_-_24px))]! max-h-[calc(100dvh_-_92px_-_env(safe-area-inset-top))] overflow-y-auto"
                        isOpen={settingsQuickMenu === "mobile"}
                        activeTab={
                          page === "settings"
                            ? normalizeSettingsTab(settingsTab)
                            : null
                        }
                        onNavigate={navigateSettingsQuickMenu}
                        showSignedInTabs={isAuthenticated}
                      />
                    </Suspense>
                  )}
                  {readingModeMenu === "mobile" && (
                    <Suspense fallback={null}>
                      <ReadingModeQuickMenu
                        id="mobile-reading-mode-quick-settings"
                        className="reading-mode-quick-menu--mobile"
                        preferences={readingModePreferences}
                        onChange={updateReadingMode}
                      />
                    </Suspense>
                  )}
                </>
              }
              data-sidebar-swipe-ignore
              onPointerDownCapture={(event) => {
                if (
                  mobilePaletteMenu &&
                  (!(event.target instanceof Element) ||
                    (!event.target.closest("[data-mobile-palette-menu]") &&
                      !event.target.closest("[data-mobile-palette-trigger]")))
                )
                  setMobilePaletteMenu(false);
              }}
            >
              <div
                className="mobile-menu-sheet__body"
                {...emptyAreaDoubleTapHandlers}
              >
                <DrawerTitle id="mobile-navigation-title" className="sr-only">
                  Profile and navigation
                </DrawerTitle>
                <DrawerDescription
                  id="mobile-navigation-description"
                  className="sr-only"
                >
                  Profile actions, additional navigation, and appearance
                  controls
                </DrawerDescription>
                <MobileSheetProfile
                  isAuthenticated={isAuthenticated}
                  activeUser={activeUser}
                  shellProfileDisplayName={shellProfileDisplayName}
                  shellProfileAvatarUrl={shellProfileAvatarUrl}
                  shellProfileAvatarSrcSet={shellProfileAvatarSrcSet}
                  unreadNotificationCount={unreadNotificationCount}
                  setProfileMenu={setProfileMenu}
                  setEdgeSidebarOpen={setEdgeSidebarOpen}
                  dismissProfileMenuThen={dismissProfileMenuThen}
                  dismissMobileMenuThen={dismissMobileMenuThen}
                  onNavigatePage={onNavigatePage}
                  accountStatusUnknown={accountStatusUnknown}
                  authUserFetched={authUserFetched}
                  authIdentityHint={authIdentityHint}
                />
                <MobileSheetProfileMenu
                  isAuthenticated={isAuthenticated}
                  effectiveRole={effectiveRole}
                  allowedWorkspaceRoles={allowedWorkspaceRoles}
                  userRoles={userRoles}
                  unreadNotificationCount={unreadNotificationCount}
                  mobileMoreNavigation={mobileMoreNavigation}
                  isNavigationItemActive={isNavigationItemActive}
                  sidebarPreferences={sidebarPreferences}
                  selectNavigation={selectNavigation}
                  setProfileMenu={setProfileMenu}
                  setRole={switchRoleFromMobileMenu}
                  setEdgeSidebarOpen={setEdgeSidebarOpen}
                  dismissProfileMenuThen={dismissProfileMenuThen}
                  dismissMobileMenuThen={dismissMobileMenuThen}
                  onNavigatePage={onNavigatePage}
                  setLogoutConfirmOpen={setLogoutConfirmOpen}
                />
                <MobileSheetAppearance
                  mobilePaletteMenu={mobilePaletteMenu}
                  sidebarDockItems={sidebarDockItems}
                  mobileAppearanceModeTriggerRef={
                    mobileAppearanceModeTriggerRef
                  }
                  paletteMenuSource={paletteMenuSource}
                  consumeAppearanceGestureClick={consumeAppearanceGestureClick}
                  cancelMobilePalettePreview={cancelMobilePalettePreview}
                  activateAppearanceOption={activateAppearanceOption}
                  openAppearanceThemeMenu={openAppearanceThemeMenu}
                  startDockLongPress={startDockLongPress}
                  moveDockLongPress={moveDockLongPress}
                  finishDockLongPress={finishDockLongPress}
                  mobilePaletteTriggerRef={mobilePaletteTriggerRef}
                  currentAcademyThemeIndex={currentAcademyThemeIndex}
                  setReadingModeMenu={setReadingModeMenu}
                  setPaletteMenuSource={setPaletteMenuSource}
                  setMobilePaletteMenu={setMobilePaletteMenu}
                  startAppearanceSwipe={startAppearanceSwipe}
                  finishAppearanceSwipe={finishAppearanceSwipe}
                  cancelAppearanceSwipe={cancelAppearanceSwipe}
                  displayedAcademyTheme={displayedAcademyTheme}
                  readingModeEnabled={readingModeEnabled}
                  updateReadingMode={updateReadingMode}
                  readingModeMenu={readingModeMenu}
                  showReadingModeMenu={showReadingModeMenu}
                  openReadingModeMenu={openReadingModeMenu}
                  page={page}
                  sidebarPreferences={sidebarPreferences}
                  settingsControlTitle={settingsControlTitle}
                  primaryShortcutModifier={primaryShortcutModifier}
                  settingsQuickMenu={settingsQuickMenu}
                  toggleSettingsNavigation={toggleSettingsNavigation}
                  openSettingsQuickMenu={openSettingsQuickMenu}
                  showSettingsQuickMenu={showSettingsQuickMenu}
                  isFullscreen={isFullscreen}
                  fullscreenActionLabel={fullscreenActionLabel}
                  toggleFullscreen={toggleFullscreen}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </Suspense>
      ) : null}

      {logoutModalMounted ? (
        <Suspense fallback={null}>
          <LogoutConfirmModal
            isOpen={logoutConfirmOpen}
            isPending={isSigningOut}
            onClose={() => setLogoutConfirmOpen(false)}
            onConfirm={() => void signOutAfterSync()}
          />
        </Suspense>
      ) : null}

      {notice && (
        <ToastNotification
          message={notice}
          type="info"
          onDismiss={() => setNotice(null)}
        />
      )}

      {/* The Settings route's own module and the stylesheets it links,
          asked for ahead of the visit (see the warm-up effect). React puts
          these in the document's head. */}
      {settingsWarmed ? <PrefetchPageLinks page="/settings" /> : null}

      {/* Last, where the shell's `::after` overlay draws it on mouse
          devices: above everything else that shares its level. */}
      <FrameEdge surface="shell" />
    </div>
  );
}
