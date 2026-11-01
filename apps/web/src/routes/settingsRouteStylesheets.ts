import settingsFoundationStylesheet from "../styles/features/settings/foundation.css?url";
import settingsPreferencesStylesheet from "../styles/features/settings/preferences-responsive.css?url";
import settingsProfileStylesheet from "../styles/features/profile.css?url";
import settingsLearningStylesheet from "../styles/features/settings/learning.css?url";
import workspaceStylesheet from "../styles/features/workspace.css?url";

/**
 * The stylesheets the Settings route links in the document's head, in the
 * order it links them. Kept apart from the route so that the shell can ask
 * for the same files ahead of a visit (see the Settings warm-up in
 * CoursesPage.tsx) without the two lists drifting apart.
 */
export const SETTINGS_ROUTE_STYLESHEETS = [
  settingsFoundationStylesheet,
  settingsPreferencesStylesheet,
  workspaceStylesheet,
  // Settings feature styles are linked in the route head so a direct refresh
  // starts with the active screen styled before the client route is hydrated.
  settingsProfileStylesheet,
  settingsLearningStylesheet,
] as const;

/**
 * The Platform page is laid out with the same sections, rows and tabs as
 * Settings, without the profile and learning screens.
 */
export const PLATFORM_ROUTE_STYLESHEETS = [
  settingsFoundationStylesheet,
  settingsPreferencesStylesheet,
  workspaceStylesheet,
] as const;
