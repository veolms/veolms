import { isCourseEditorPath } from "../courses/courseEditorRouting";
import { settingsPageBody, workspacePageBody } from "./prerenderedBodies";

export type ShellRouteModuleKey =
  "settings" | "catalogue" | "placeholder" | "workspace";

const routeModuleCache = new Map<ShellRouteModuleKey, unknown>();
const routeModulePromises = new Map<ShellRouteModuleKey, Promise<unknown>>();

export function readShellRouteModule<Module>(key: ShellRouteModuleKey) {
  return (routeModuleCache.get(key) as Module | undefined) ?? null;
}

export function loadShellRouteModule<Module>(
  key: ShellRouteModuleKey,
  loader: () => Promise<Module>,
) {
  const cached = routeModuleCache.get(key) as Module | undefined;
  if (cached) return Promise.resolve(cached);

  let pending = routeModulePromises.get(key) as Promise<Module> | undefined;
  if (!pending) {
    pending = loader().then(
      (module) => {
        routeModuleCache.set(key, module);
        routeModulePromises.delete(key);
        return module;
      },
      (error: unknown) => {
        routeModulePromises.delete(key);
        throw error;
      },
    );
    routeModulePromises.set(key, pending);
  }
  return pending;
}

/**
 * Optionally fetch the route module needed by a prerendered document before
 * hydration. The current shell keeps route imports eager for immediate
 * interactivity; callers that opt into route-level loading still get cached,
 * retryable imports through this helper.
 */
export async function preloadActiveRouteForHydration(pathname: string) {
  if (pathname.startsWith("/settings")) {
    // Through the page's own body, so that it renders with the first
    // render instead of after a placeholder.
    await loadShellRouteModule("settings", () => settingsPageBody.preload());
    return;
  }

  if (
    pathname === "/courses" ||
    pathname === "/courses/enrolled" ||
    pathname === "/courses/not-enrolled" ||
    pathname === "/courses/free" ||
    pathname === "/courses/wishlist" ||
    pathname === "/wishlist"
  ) {
    await loadShellRouteModule(
      "catalogue",
      () => import("../courses/CourseCatalogue"),
    );
    return;
  }

  if (isCourseEditorPath(pathname)) {
    await loadShellRouteModule(
      "placeholder",
      () => import("../courses/PlaceholderPage"),
    );
    return;
  }

  if (pathname === "/discussions" || pathname.startsWith("/discussions/")) {
    // Both of the page's pieces, for the same reason: its heading, tabs and
    // filters are then there from the first render.
    await loadShellRouteModule("workspace", async () => {
      const module = await import("../workspace/WorkspacePages");
      await Promise.all([
        workspacePageBody.preload(),
        module.preloadDiscussionsWorkspace(),
      ]);
      return module;
    });
    return;
  }

  if (pathname === "/logout") {
    await loadShellRouteModule(
      "workspace",
      () => import("../workspace/WorkspacePages"),
    );
    return;
  }

  if (
    pathname !== "/" &&
    pathname !== "/home" &&
    pathname !== "/dashboard" &&
    !pathname.startsWith("/learn/") &&
    !pathname.startsWith("/courses/")
  ) {
    await loadShellRouteModule(
      "placeholder",
      () => import("../courses/PlaceholderPage"),
    );
  }
}
