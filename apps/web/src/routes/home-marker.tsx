import { getRouteMeta } from "../routing/routeDescriptors";
import creatorDashboardStylesheet from "../styles/features/creator-dashboard.css?url";
import dashboardDiscussionPreviewStylesheet from "../styles/features/dashboard-discussion-preview.css?url";
import homeStylesheet from "../styles/features/home.css?url";
import studentLearningStylesheet from "../styles/features/student-learning.css?url";

import type { Route } from "./+types/home-marker";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: creatorDashboardStylesheet },
  { rel: "stylesheet", href: dashboardDiscussionPreviewStylesheet },
  { rel: "stylesheet", href: homeStylesheet },
  { rel: "stylesheet", href: studentLearningStylesheet },
];

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(getRouteMeta(matches.at(-1)?.id, params, location.pathname)).map(
    ([name, content]) => (name === "title" ? { title: content } : { name, content }),
  );
}

export default function HomeMarker() {
  return null;
}
