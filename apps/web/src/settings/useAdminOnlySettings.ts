import { useEffect, useState } from "react";
import { useCurrentUser } from "../services/auth";
import { hasAdminRole } from "../shell/workspaceRole";

/**
 * Whether the settings meant for admins alone are shown: the ones that do
 * nothing yet or only part of what they say, and the tools for building the
 * app. Learners are not shown them at all.
 *
 * False until the page has mounted in the browser, whoever is signed in.
 * The settings pages are built ahead of time with nobody signed in, so these
 * settings are never in that HTML; and the first render in the browser draws
 * the same page the HTML holds, then adds them for an admin.
 */
export function useAdminOnlySettings(): boolean {
  const { data: currentUser } = useCurrentUser();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && hasAdminRole(currentUser?.roles);
}
