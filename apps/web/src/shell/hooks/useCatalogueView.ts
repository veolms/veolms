import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  UseMutationResult,
} from "@tanstack/react-query";
import type { CourseSummary } from "@veolms/contracts";
import type { ToastMessage } from "../../ToastNotification";
import {
  getCourseQuickFilterCounts,
  getVisibleCourses,
  type CourseQuickFilterCounts,
} from "../../courses/catalogue";
import { useToggleWishlistCourse } from "../../wishlist";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "../../courses/catalogue";
import { forgetLegacyLearningProgress } from "../../store/accountBrowserState";
import {
  adaptApiCourseToCatalogueCourse,
  adaptCourseSummaryToCatalogueCourse,
  adaptDeletedCourseToCatalogueCourse,
} from "../../courses/courseAdapter";
import type { NavigationItem } from "../navigation";
import type { SidebarMode } from "../../settings/settingsPreferences";
import type { NavigateTo } from "../../routing/navigation";
import { getCatalogueCardProgressPercent } from "../../learning/catalogueCardProgress";
import { hasStartedCourse } from "@veolms/contracts/learner-home-plan";
import { readLearningProgress } from "../../learning/learningProgressStorage";
import {
  cardPriceStatus,
  coursePriceState,
  useCoursePrices,
} from "../../courses/liveCoursePrices";
import type { useCurrentUser } from "../../services/auth";
import type { useEnrolledCourses } from "../../services/enrollments";
import type { useMyCourses } from "../../services/courses";
import type { ApiError } from "../../lib/api-error";

export interface UseCatalogueViewArgs {
  onNavigatePage: NavigateTo;
  sidebarMode: SidebarMode;
  compactNavigation: boolean;
  settingsInSidebarDock: boolean;
  setCreatorEnrollmentFilter: Dispatch<SetStateAction<CourseEnrollmentFilter>>;
  setSearch: Dispatch<SetStateAction<string>>;
  debouncedSearch: string;
  setStatusFilter: Dispatch<SetStateAction<CourseStatusFilter>>;
  statusFilter: CourseStatusFilter;
  sort: CourseSort;
  wishlisted: ReadonlySet<string>;
  setNavigationScrollFade: Dispatch<
    SetStateAction<{ top: boolean; bottom: boolean; overflow: boolean }>
  >;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  authUser: ReturnType<typeof useCurrentUser>["data"];
  effectiveRole: CourseRole;
  roleNavigationItems: readonly NavigationItem[];
  isCourseCataloguePage: boolean;
  isStudentCatalogueRoute: boolean;
  enrollmentFilter: CourseEnrollmentFilter;
  needsCompleteCourseList: boolean;
  pagedCourseQuery: DefinedUseInfiniteQueryResult<
    InfiniteData<
      { courses: CourseSummary[]; nextCursor?: string | undefined },
      unknown
    >,
    ApiError
  >;
  publishedCourses: CourseSummary[];
  enrolledCoursesData: ReturnType<typeof useEnrolledCourses>["data"];
  learnerStateKnown: boolean;
  learnerStateFailed: boolean;
  /** The shell's own word on whether someone is signed in. */
  signedIn: boolean;
  myCoursesData: ReturnType<typeof useMyCourses>["data"];
  deletedCoursesData:
    | {
        courses: {
          id: string;
          slug: string;
          title: string;
          status: "published" | "draft" | "archived";
          creatorId: string | null;
          deletedAt: string;
        }[];
        nextCursor: string | null;
      }
    | undefined;
  deleteCourseMutation: UseMutationResult<
    { slug?: string | undefined },
    ApiError,
    string,
    unknown
  >;
  restoreCourseMutation: UseMutationResult<
    { course: { id: string; slug: string } },
    ApiError,
    string,
    unknown
  >;
  setDeletingCourseIds: Dispatch<SetStateAction<Set<string>>>;
  navigationRef: RefObject<HTMLElement | null>;
}

export interface UseCatalogueViewResult {
  navigation: NavigationItem[];
  updateNavigationScrollFade: () => void;
  totalCoursesCount: number;
  handleDeleteCourse: (course: Course) => Promise<void>;
  handleRestoreCourse: (course: Course) => Promise<void>;
  quickFilterCounts: CourseQuickFilterCounts;
  visibleCourses: Course[];
  toggleWishlist: (course: Pick<Course, "id" | "slug">) => void;
  resetCatalogue: () => void;
}

export function useCatalogueView({
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
  learnerStateFailed,
  signedIn,
  myCoursesData,
  deletedCoursesData,
  deleteCourseMutation,
  restoreCourseMutation,
  setDeletingCourseIds,
  navigationRef,
}: UseCatalogueViewArgs): UseCatalogueViewResult {
  const navigation = roleNavigationItems.filter(
    ([label]) => label !== "Settings" || !settingsInSidebarDock,
  );
  const updateNavigationScrollFade = () => {
    const nav = navigationRef.current;
    if (!nav) return;

    const maxScrollTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
    const hasOverflow = maxScrollTop > 2;
    const hasScrolled = hasOverflow && nav.scrollTop > 2;
    // Whether the menu items alone are taller than the list. The blank room
    // kept below them (and the gap before it) is left out of the sum, or the
    // room would be the very thing that keeps itself shown.
    const endSpace = nav.querySelector<HTMLElement>("[data-nav-end-space]");
    const endSpaceHeight = endSpace?.offsetHeight ?? 0;
    const endSpaceExtent =
      endSpaceHeight > 0
        ? endSpaceHeight +
          (Number.parseFloat(getComputedStyle(nav).rowGap) || 0)
        : 0;
    const next = {
      top: hasScrolled,
      bottom: hasScrolled && nav.scrollTop < maxScrollTop - 2,
      overflow: maxScrollTop - endSpaceExtent > 2,
    };

    setNavigationScrollFade((current) =>
      current.top === next.top &&
      current.bottom === next.bottom &&
      current.overflow === next.overflow
        ? current
        : next,
    );
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateNavigationScrollFade);
    const handleResize = () => updateNavigationScrollFade();
    window.addEventListener("resize", handleResize);
    // The list also changes height without the window doing so (the dock
    // below it turning vertical, the profile menu), which decides whether
    // its items still fit.
    const nav = navigationRef.current;
    const observer =
      nav && typeof ResizeObserver === "function"
        ? new ResizeObserver(handleResize)
        : null;
    if (nav) observer?.observe(nav);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as in CoursesPage, the effect re-runs on these values only: updateNavigationScrollFade is a new function each render and reads only a ref and a state setter
  }, [
    compactNavigation,
    effectiveRole,
    navigation,
    sidebarMode,
    navigationRef,
  ]);

  // The course cards no longer read the player's old browser-wide progress
  // maps; what earlier visits left behind is removed.
  useEffect(() => {
    forgetLegacyLearningProgress();
  }, []);

  // The prices in force: never the ones the list was built with (see
  // liveCoursePrices.ts).
  const coursePrices = useCoursePrices();

  const allCourses = useMemo(() => {
    if (effectiveRole !== "creator") {
      const enrolledSet = new Set<string>();
      // Courses the learner has watched any of, even while they still show
      // 0.00% (see `hasStartedCourse`).
      const startedSet = new Set<string>();
      const progressMap = new Map<string, number | null>();
      if (enrolledCoursesData?.courses) {
        for (const ec of enrolledCoursesData.courses) {
          enrolledSet.add(ec.courseId);
          if (ec.courseSlug) enrolledSet.add(ec.courseSlug);
          if (hasStartedCourse(ec)) {
            startedSet.add(ec.courseId);
            if (ec.courseSlug) startedSet.add(ec.courseSlug);
          }
          progressMap.set(ec.courseId, ec.progress);
          if (ec.courseSlug) progressMap.set(ec.courseSlug, ec.progress);
        }
      }
      if (typeof window !== "undefined") {
        const signedInUserId = authUser?.id;
        for (const ec of enrolledCoursesData?.courses || []) {
          // The server's figure, plus what this account has watched here
          // and not sent yet (see `getCatalogueCardProgressPercent`).
          //
          // The last-opened lesson is a resume pointer, not progress. It
          // used to stand in for it: opening lesson 45 of 50 showed 90%
          // on a course the learner had barely started.
          const nextProgress = getCatalogueCardProgressPercent({
            signedIn: Boolean(signedInUserId),
            serverPercent: ec.progress,
            totalLessons: ec.totalLessons,
            localItems: readLearningProgress(signedInUserId, ec.courseSlug)
              .items,
          });

          if (nextProgress != null) {
            progressMap.set(ec.courseId, nextProgress);
            if (ec.courseSlug) progressMap.set(ec.courseSlug, nextProgress);
          }
          // Watched here and not sent yet still counts as begun.
          if (nextProgress != null && nextProgress > 0) {
            startedSet.add(ec.courseId);
            if (ec.courseSlug) startedSet.add(ec.courseSlug);
          }
        }
      }
      return publishedCourses.map((summary) => {
        const price = coursePriceState(coursePrices, summary.id);
        const priceStatus = cardPriceStatus(price, signedIn);
        const course = adaptCourseSummaryToCatalogueCourse(
          price.status === "known"
            ? { ...summary, pricing: price.pricing }
            : summary,
          enrolledSet,
          progressMap,
        );
        return {
          ...course,
          started:
            startedSet.has(course.id) ||
            (course.slug ? startedSet.has(course.slug) : false),
          viewerStatePending: !learnerStateKnown,
          viewerStateFailed: learnerStateFailed,
          ...(priceStatus ? { priceStatus } : {}),
        };
      });
    }
    if (enrollmentFilter === "bin") {
      return (deletedCoursesData?.courses || []).map(
        adaptDeletedCourseToCatalogueCourse,
      );
    }
    return (myCoursesData?.courses || []).map(adaptApiCourseToCatalogueCourse);
  }, [
    authUser?.id,
    deletedCoursesData?.courses,
    effectiveRole,
    enrollmentFilter,
    enrolledCoursesData,
    coursePrices,
    learnerStateFailed,
    learnerStateKnown,
    signedIn,
    myCoursesData?.courses,
    publishedCourses,
  ]);

  const totalCoursesCount = useMemo(() => {
    if (effectiveRole !== "creator") {
      return publishedCourses.length;
    }
    return (
      (myCoursesData?.courses?.length ?? 0) +
      (deletedCoursesData?.courses?.length ?? 0)
    );
  }, [
    deletedCoursesData?.courses?.length,
    effectiveRole,
    myCoursesData?.courses?.length,
    publishedCourses.length,
  ]);

  const handleDeleteCourse = async (course: Course) => {
    setDeletingCourseIds((prev) => new Set(prev).add(course.id));
    try {
      await deleteCourseMutation.mutateAsync(course.id);
      setNotice(`${course.title} moved to Bin.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setNotice(
        apiError?.message ||
          `Failed to move "${course.title}" to Bin. Please try again.`,
      );
      throw err;
    } finally {
      setDeletingCourseIds((prev) => {
        const next = new Set(prev);
        next.delete(course.id);
        return next;
      });
    }
  };

  const handleRestoreCourse = async (course: Course) => {
    try {
      await restoreCourseMutation.mutateAsync(course.id);
      setNotice(`${course.title} was restored.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setNotice(
        apiError?.message ||
          `Failed to restore "${course.title}". Please try again.`,
      );
      throw err;
    }
  };

  const catalogueForQuickFilterCounts = useMemo(() => {
    if (effectiveRole === "creator") {
      return (myCoursesData?.courses || []).map(
        adaptApiCourseToCatalogueCourse,
      );
    }
    return allCourses;
  }, [allCourses, effectiveRole, myCoursesData?.courses]);

  const quickFilterCounts = useMemo(() => {
    const counts = getCourseQuickFilterCounts(catalogueForQuickFilterCounts, {
      wishlisted,
      role: effectiveRole,
      statusFilter,
      // See visibleCourses below: the student "All" list arrives already
      // searched, so the count must not narrow it a second time.
      search:
        !needsCompleteCourseList && effectiveRole === "student"
          ? ""
          : debouncedSearch,
    });
    if (effectiveRole === "creator") {
      return {
        ...counts,
        bin: deletedCoursesData?.courses?.length ?? 0,
      };
    }
    return counts;
  }, [
    catalogueForQuickFilterCounts,
    debouncedSearch,
    deletedCoursesData?.courses?.length,
    effectiveRole,
    needsCompleteCourseList,
    statusFilter,
    wishlisted,
  ]);

  // Latch whether enrollment data was already present when the catalogue
  // page first rendered this visit. When it arrives later (the prerendered
  // public grid has painted and /auth/me resolved seconds after), the
  // contrasting-enrollment promotion would reorder painted cards and score
  // a large layout shift, so it is suppressed until the next visit.
  const enrollmentPromotionAllowedRef = useRef<boolean | null>(null);
  if (isCourseCataloguePage) {
    enrollmentPromotionAllowedRef.current ??= Boolean(enrolledCoursesData);
  } else {
    enrollmentPromotionAllowedRef.current = null;
  }
  const enrollmentPromotionAllowed = isCourseCataloguePage
    ? (enrollmentPromotionAllowedRef.current ?? true)
    : true;

  const visibleCourses = useMemo(
    () =>
      getVisibleCourses(allCourses, {
        wishlisted,
        role: effectiveRole,
        enrollmentFilter,
        statusFilter,
        // The student "All" list is searched by the server, which also
        // matches the full description. Filtering it again here on title
        // and short description hid a course found only by its long
        // description. Lists the server does not search keep this filter:
        // a creator's own courses are one. (Whether the student list is
        // showing its previous page meanwhile says nothing about them: the
        // creator's search changed its key too, and left it showing a
        // placeholder, which had turned their search off.)
        search:
          !needsCompleteCourseList && effectiveRole === "student"
            ? ""
            : debouncedSearch,
        sort,
        enrollmentPromotionAllowed,
      }),
    [
      allCourses,
      effectiveRole,
      enrollmentFilter,
      enrollmentPromotionAllowed,
      debouncedSearch,
      needsCompleteCourseList,
      sort,
      statusFilter,
      wishlisted,
    ],
  );

  const toggleWishlist = useToggleWishlistCourse();

  const resetCatalogue = () => {
    setSearch("");
    setStatusFilter("all");
    if (isStudentCatalogueRoute) {
      onNavigatePage?.("/courses");
    } else {
      setCreatorEnrollmentFilter("all");
    }
  };
  return {
    navigation,
    updateNavigationScrollFade,
    totalCoursesCount,
    handleDeleteCourse,
    handleRestoreCourse,
    quickFilterCounts,
    visibleCourses,
    toggleWishlist,
    resetCatalogue,
  };
}
