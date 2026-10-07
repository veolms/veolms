import {
  index,
  layout,
  route,
  type RouteConfigEntry,
} from "@veolms/plugin-sdk";

const marker = "routes/academy-marker.tsx";
const homeMarker = "routes/home-marker.tsx";

export function getAcademyRoutes(): RouteConfigEntry {
  return layout("routes/academy-layout.tsx", { id: "academy-layout" }, [
    index(marker, { id: "root-courses" }),
    route("home", homeMarker, { id: "home-alias", caseSensitive: true }),
    route("dashboard", homeMarker, { id: "dashboard", caseSensitive: true }),
    route("courses", marker, { id: "courses", caseSensitive: true }),
    route("courses/create", marker, {
      id: "course-create",
      caseSensitive: true,
    }),
    route("courses/create/:editTab", marker, {
      id: "course-create-tab",
      caseSensitive: true,
    }),
    route("courses/enrolled", marker, {
      id: "courses-enrolled",
      caseSensitive: true,
    }),
    route("courses/not-enrolled", marker, {
      id: "courses-not-enrolled",
      caseSensitive: true,
    }),
    route("courses/free", marker, {
      id: "courses-free",
      caseSensitive: true,
    }),
    route("courses/wishlist", marker, {
      id: "courses-wishlist",
      caseSensitive: true,
    }),
    route("courses/:courseId/edit/:editTab", marker, {
      id: "course-edit",
      caseSensitive: true,
    }),
    route("wishlist", marker, { id: "wishlist", caseSensitive: true }),
    route("students", marker, { id: "students", caseSensitive: true }),
    route("students/:username", marker, {
      id: "student-details",
      caseSensitive: true,
    }),
    route("reviews", marker, { id: "reviews", caseSensitive: true }),
    route("quizzes", marker, { id: "quizzes", caseSensitive: true }),
    route("quizzes/create", marker, {
      id: "quiz-create",
      caseSensitive: true,
    }),
    route("quizzes/attempt/:assignmentId", marker, {
      id: "quiz-attempt",
      caseSensitive: true,
    }),
    route("quizzes/:quizId", marker, {
      id: "quiz-edit",
      caseSensitive: true,
    }),
    route("discussions", marker, { id: "discussions", caseSensitive: true }),
    route("discussions/q-and-a", marker, {
      id: "discussions-q-and-a",
      caseSensitive: true,
    }),
    route("discussions/comments", marker, {
      id: "discussions-comments",
      caseSensitive: true,
    }),
    route("discussions/notes", marker, {
      id: "discussions-notes",
      caseSensitive: true,
    }),
    route("discussions/mentions", marker, {
      id: "discussions-mentions",
      caseSensitive: true,
    }),
    route("discussions/following", marker, {
      id: "discussions-following",
      caseSensitive: true,
    }),
    route("discussions/saved", marker, {
      id: "discussions-saved",
      caseSensitive: true,
    }),
    route("analytics", marker, { id: "analytics", caseSensitive: true }),
    route("orders", marker, { id: "orders", caseSensitive: true }),
    route("messages", marker, { id: "messages", caseSensitive: true }),
    route("purchase-history", marker, {
      id: "purchase-history",
      caseSensitive: true,
    }),
    route("notifications", marker, {
      id: "notifications",
      caseSensitive: true,
    }),
    route("settings/:settingsTab?", "routes/settings-marker.tsx", {
      id: "settings",
      caseSensitive: true,
    }),
    route("coupons", marker, { id: "coupons", caseSensitive: true }),
    route("home-page", marker, {
      id: "home-page-settings",
      caseSensitive: true,
    }),
    route("coupons/create", marker, {
      id: "coupon-create",
      caseSensitive: true,
    }),
    route("coupons/:couponId", marker, {
      id: "coupon-edit",
      caseSensitive: true,
    }),
    route("logout", marker, { id: "logout", caseSensitive: true }),
    route(":username", marker, {
      id: "public-profile",
      caseSensitive: true,
    }),
    route("courses/:courseSlug/overview", marker, {
      id: "course-overview",
      caseSensitive: true,
    }),
    route("learn/:courseSlug/:lectureSlug?", "routes/learning.tsx", {
      id: "learning",
      caseSensitive: true,
    }),
    // Registered after static catalogue filter routes so `/courses/enrolled` et
    // al. are not treated as legacy course slugs when the router rank ties.
    route("courses/:courseSlug/:lectureSlug?", "routes/legacy-learning.tsx", {
      id: "legacy-learning",
      caseSensitive: true,
    }),
    route("*", marker, { id: "home-fallback", caseSensitive: true }),
  ]);
}
