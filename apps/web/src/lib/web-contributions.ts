import { useSyncExternalStore } from "react";
import {
  getShellPage,
  getWebContributions,
  subscribeWebContributions,
  type ShellPageContribution,
  type WebContributions,
} from "@veolms/web-core";

/** A plugin page shown inside the shell, by its route id. */
export function getShellPageContribution(
  routeId: string,
): ShellPageContribution | undefined {
  return getShellPage(routeId);
}

/**
 * UI pieces plugins have added to core screens (see `contributions.ts` in
 * web-core). Re-renders when a plugin registers or removes one; the static
 * build and the first client render see none, so hydration matches.
 */
export function useWebContributions(): WebContributions {
  return useSyncExternalStore(
    subscribeWebContributions,
    getWebContributions,
    getServerWebContributions,
  );
}

const SERVER_CONTRIBUTIONS: WebContributions = {
  lessonCardActions: [],
  profileMenuLinks: [],
  analyticsTabs: [],
  courseEditorSections: [],
  settingsRows: [],
};

function getServerWebContributions(): WebContributions {
  return SERVER_CONTRIBUTIONS;
}
