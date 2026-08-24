export type ShellRouteModuleKey =
  "my-courses" | "settings" | "catalogue" | "placeholder" | "workspace";

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
    await loadShellRouteModule("settings", () => import("../SettingsPage"));
    return;
  }

  if (pathname === "/my-courses") {
    await loadShellRouteModule("my-courses", () => import("../StudentPages"));
    return;
  }

  if (pathname === "/explore-courses" || pathname === "/wishlist") {
    await loadShellRouteModule(
      "catalogue",
      () => import("../courses/CourseCatalogue"),
    );
    return;
  }

  if (pathname === "/courses/create") {
    await loadShellRouteModule(
      "placeholder",
      () => import("../courses/PlaceholderPage"),
    );
    return;
  }

  if (pathname === "/discussions" || pathname.startsWith("/discussions/")) {
    await loadShellRouteModule(
      "workspace",
      () => import("../workspace/WorkspacePages"),
    );
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
