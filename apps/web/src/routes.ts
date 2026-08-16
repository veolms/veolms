import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

const marker = "routes/academy-marker.tsx";

export default [
  layout("routes/academy-layout.tsx", { id: "academy-layout" }, [
    index(marker, { id: "home" }),
    route("home", marker, { id: "home-alias", caseSensitive: true }),
    route("dashboard", marker, { id: "dashboard", caseSensitive: true }),
    route("my-courses", marker, { id: "my-courses", caseSensitive: true }),
    route("explore-courses", marker, {
      id: "explore-courses",
      caseSensitive: true,
    }),
    route("courses/create", marker, {
      id: "course-create",
      caseSensitive: true,
    }),
    route("wishlist", marker, { id: "wishlist", caseSensitive: true }),
    route("students", marker, { id: "students", caseSensitive: true }),
    route("reviews", marker, { id: "reviews", caseSensitive: true }),
    route("discussions", marker, { id: "discussions", caseSensitive: true }),
    route("discussions/q-and-a", marker, {
      id: "discussions-q-and-a",
      caseSensitive: true,
    }),
    route("discussions/comments", marker, {
      id: "discussions-comments",
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
    route("order-history", marker, {
      id: "order-history",
      caseSensitive: true,
    }),
    route("notifications", marker, {
      id: "notifications",
      caseSensitive: true,
    }),
    route("settings", marker, { id: "settings", caseSensitive: true }),
    route("settings/profile", marker, {
      id: "settings-profile",
      caseSensitive: true,
    }),
    route("settings/appearance", marker, {
      id: "settings-appearance",
      caseSensitive: true,
    }),
    route("settings/sidebar", marker, {
      id: "settings-sidebar",
      caseSensitive: true,
    }),
    route("settings/notifications", marker, {
      id: "settings-notifications",
      caseSensitive: true,
    }),
    route("settings/learning", marker, {
      id: "settings-learning",
      caseSensitive: true,
    }),
    route("settings/security", marker, {
      id: "settings-security",
      caseSensitive: true,
    }),
    route("settings/account", marker, {
      id: "settings-account",
      caseSensitive: true,
    }),
    route("logout", marker, { id: "logout", caseSensitive: true }),
    route("explore-courses/:courseSlug/overview", marker, {
      id: "course-overview",
      caseSensitive: true,
    }),
    route("learn/:courseSlug/:lectureSlug?", "routes/learning.tsx", {
      id: "learning",
      caseSensitive: true,
    }),
    route("courses/:courseSlug/:lectureSlug?", "routes/legacy-learning.tsx", {
      id: "legacy-learning",
      caseSensitive: true,
    }),
    route("*", marker, { id: "home-fallback", caseSensitive: true }),
  ]),
] satisfies RouteConfig;
