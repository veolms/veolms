import type { Route } from "./+types/settings-marker";
import settingsFoundationStylesheet from "../styles/features/settings/foundation.css?url";
import settingsPreferencesStylesheet from "../styles/features/settings/preferences-responsive.css?url";
import settingsProfileStylesheet from "../styles/features/profile.css?url";
import settingsLearningStylesheet from "../styles/features/settings/learning.css?url";
import workspaceStylesheet from "../styles/features/workspace.css?url";
import { getRouteMeta } from "../routing/routeDescriptors";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: settingsFoundationStylesheet },
  { rel: "stylesheet", href: settingsPreferencesStylesheet },
  { rel: "stylesheet", href: workspaceStylesheet },
  // Link Settings feature styles in the route head so a direct refresh starts
  // with the active screen styled before the client route is hydrated.
  { rel: "stylesheet", href: settingsProfileStylesheet },
  { rel: "stylesheet", href: settingsLearningStylesheet },
];

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(getRouteMeta(matches.at(-1)?.id, params, location.pathname)).map(
    ([name, content]) => (name === "title" ? { title: content } : { name, content }),
  );
}

export default function SettingsMarker() {
  return null;
}
