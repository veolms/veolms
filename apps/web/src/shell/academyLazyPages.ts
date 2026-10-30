import { lazy } from "react";
import {
  definePrerenderedBody,
  courseCatalogueBody,
  courseOverviewBody,
  creatorDashboardBody,
  authenticatedHomeBody,
  guestHomeBody,
  settingsPageBody,
  workspacePageBody,
} from "../routing/prerenderedBodies";

// The mobile navigation sheet is the only shell consumer of the Base UI
// drawer stack (~70KB). Loading it lazily keeps that out of the startup
// bundle of every page; the sheet is warmed on idle for compact viewports so
// the first tap still opens instantly. All pieces come from one module, so
// the compound-component context stays intact.
// The catalogue is the /courses page body; every other page only pays for
// it on navigation. Static prerender resolves the lazy module, so the
// /courses document still ships with catalogue markup, and an idle warm-up
// keeps client-side navigation instant.
export const loadCourseCatalogueModule = courseCatalogueBody.preload;
export const CourseCatalogue = courseCatalogueBody.Body;

// Profile menu and logout modal open on explicit user actions, so their
// modules load lazily (menu warmed on idle for signed-in sessions) instead
// of riding in the startup bundle of every page.
// Both render at once when the module is already loaded (see the drawer
// parts below): as bare `lazy()` parts the phone sheet rose empty on its
// first open, then grew when they arrived a moment later.
const profileMenuBody = definePrerenderedBody(
  () => import("./ProfileMenu"),
  (module) => module.ProfileMenu,
);
const profileMenuIdentityBody = definePrerenderedBody(
  () => import("./ProfileMenu"),
  (module) => module.ProfileMenuIdentity,
);
export const loadProfileMenuModule = () =>
  Promise.all([profileMenuBody.preload(), profileMenuIdentityBody.preload()]);
export const ProfileMenu = profileMenuBody.Body;
export const ProfileMenuIdentity = profileMenuIdentityBody.Body;
export const LogoutConfirmModal = lazy(() =>
  import("./LogoutConfirmModal").then((module) => ({
    default: module.LogoutConfirmModal,
  })),
);

// The sheet's content, title and description first render when it opens, so
// as bare `lazy()` parts each suspended once on that first open even though
// the module was warm. That hid the whole drawer behind its Suspense boundary
// mid-open, which tore down its Back layer, and in Firefox the history step
// that followed closed the sheet again. Like the page bodies, these render
// at once when the module has already loaded.
const loadDrawerModule = () => import("@/components/ui/drawer");
const drawerBody = definePrerenderedBody(
  loadDrawerModule,
  (module) => module.Drawer,
);
const drawerContentBody = definePrerenderedBody(
  loadDrawerModule,
  (module) => module.DrawerContent,
);
const drawerTitleBody = definePrerenderedBody(
  loadDrawerModule,
  (module) => module.DrawerTitle,
);
const drawerDescriptionBody = definePrerenderedBody(
  loadDrawerModule,
  (module) => module.DrawerDescription,
);
export const loadMobileMenuDrawerModule = () =>
  Promise.all([
    drawerBody.preload(),
    drawerContentBody.preload(),
    drawerTitleBody.preload(),
    drawerDescriptionBody.preload(),
  ]);
export const Drawer = drawerBody.Body;
export const DrawerContent = drawerContentBody.Body;
export const DrawerTitle = drawerTitleBody.Body;
export const DrawerDescription = drawerDescriptionBody.Body;

export const OrdersPageRoute = lazy(() =>
  import("../orders/OrdersPage").then((module) => ({
    default: module.OrdersPage,
  })),
);
export const OrderHistoryPageRoute = lazy(() =>
  import("../order-history/OrderHistoryPage").then((module) => ({
    default: module.OrderHistoryPage,
  })),
);
export const CreatorDashboard = creatorDashboardBody.Body;
export const ReadingModeQuickMenu = lazy(() =>
  import("../reading-mode/ReadingModeQuickMenu").then((module) => ({
    default: module.ReadingModeQuickMenu,
  })),
);
export const SettingsQuickMenu = lazy(() =>
  import("../settings/SettingsQuickMenu").then((module) => ({
    default: module.SettingsQuickMenu,
  })),
);
export const CourseOverviewPage = courseOverviewBody.Body;
export const AnalyticsDashboardPage = lazy(() =>
  import("../analytics/AnalyticsDashboardPage").then((module) => ({
    default: module.AnalyticsDashboardPage,
  })),
);

export const loadCourseCreatePage = () => import("../courses/CourseCreatePage");

export const CourseCreatePage = lazy(() =>
  loadCourseCreatePage().then((module) => ({
    default: module.CourseCreatePage,
  })),
);

// Settings is one click away from every page (the gear, the profile menu,
// its keyboard shortcut) and is a large page: seven sections' worth of code
// and styles that arrive in several round trips. Left to load on the click,
// it opened a second late on an ordinary connection while every other page
// was instant. So it is fetched ahead of time (see the warm-up effect).
export const SettingsPage = settingsPageBody.Body;

export const AuthenticatedHomeBoundary = authenticatedHomeBody.Body;
export const GuestHome = guestHomeBody.Body;
export const PlaceholderPage = lazy(() =>
  import("../courses/PlaceholderPage").then((module) => ({
    default: module.PlaceholderPage,
  })),
);
export const WorkspacePage = workspacePageBody.Body;
export const ReviewsPage = lazy(() =>
  import("../reviews/ReviewsPage").then((module) => ({
    default: module.ReviewsPage,
  })),
);
export const CouponsPage = lazy(() =>
  import("../coupons/CouponsPage").then((module) => ({
    default: module.CouponsPage,
  })),
);
export const NotificationsPage = lazy(() =>
  import("../notifications/NotificationsPage").then((module) => ({
    default: module.NotificationsPage,
  })),
);
export const QuizAnalyticsPage = lazy(() =>
  import("../quizzes/QuizAnalyticsPage").then((module) => ({
    default: module.QuizAnalyticsPage,
  })),
);
export const QuizBuilderPage = lazy(() =>
  import("../quizzes/QuizBuilderPage").then((module) => ({
    default: module.QuizBuilderPage,
  })),
);
export const QuizDirectAttemptPage = lazy(() =>
  import("../quizzes/QuizDirectAttemptPage").then((module) => ({
    default: module.QuizDirectAttemptPage,
  })),
);
export const StudentsPage = lazy(() =>
  import("../students/StudentsPage").then((module) => ({
    default: module.StudentsPage,
  })),
);
export const StudentDetailsPage = lazy(() =>
  import("../students/StudentDetailsPage").then((module) => ({
    default: module.StudentDetailsPage,
  })),
);
export const ProgressPage = lazy(() =>
  import("../progress/ProgressPage").then((module) => ({
    default: module.ProgressPage,
  })),
);
export const PublicProfilePageRoute = lazy(() =>
  import("../profiles/PublicProfilePage").then((module) => ({
    default: module.PublicProfilePage,
  })),
);
export const PlatformPage = lazy(() =>
  import("../platform/PlatformPage").then((module) => ({
    default: module.PlatformPage,
  })),
);
export const CouponBuilderPage = lazy(() =>
  import("../coupons/CouponBuilderPage").then((module) => ({
    default: module.CouponBuilderPage,
  })),
);
export const CouponsAccessDenied = lazy(() =>
  import("../coupons/CouponsAccessDenied").then((module) => ({
    default: module.CouponsAccessDenied,
  })),
);
export const TeamPage = lazy(() =>
  import("../team/TeamPage").then((module) => ({
    default: module.TeamPage,
  })),
);
export const InvitePage = lazy(() =>
  import("../team/invite/InvitePage").then((module) => ({
    default: module.InvitePage,
  })),
);
