/**
 * Configuration entry for an individual route in React Router.

 * Matches React Router's internal RouteConfigEntry schema without depending
 * on `@react-router/dev` (which pulls in Node-only CJS lodash/pick into browser bundles).
 */
export interface RouteConfigEntry {
  id?: string;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  file: string;
  children?: RouteConfigEntry[];
}

export type RouteConfig = RouteConfigEntry[] | Promise<RouteConfigEntry[]>;

export interface CreateRouteOptions {
  id?: string;
  index?: boolean;
  caseSensitive?: boolean;
}

export interface CreateIndexOptions {
  id?: string;
}

export interface CreateLayoutOptions {
  id?: string;
}

/**
 * Creates a route config entry for use in route configurations.
 */
export function route(
  path: string | null | undefined,
  file: string,
  children?: RouteConfigEntry[],
): RouteConfigEntry;
export function route(
  path: string | null | undefined,
  file: string,
  options: CreateRouteOptions,
  children?: RouteConfigEntry[],
): RouteConfigEntry;
export function route(
  path: string | null | undefined,
  file: string,
  optionsOrChildren?: CreateRouteOptions | RouteConfigEntry[],
  children?: RouteConfigEntry[],
): RouteConfigEntry {
  const isChildrenArray = Array.isArray(optionsOrChildren);
  const options = isChildrenArray || !optionsOrChildren ? undefined : optionsOrChildren;
  const childRoutes = isChildrenArray ? optionsOrChildren : children;

  const result: RouteConfigEntry = {
    file,
    path: path ?? undefined,
    children: childRoutes,
  };

  if (options?.id !== undefined) result.id = options.id;
  if (options?.index !== undefined) result.index = options.index;
  if (options?.caseSensitive !== undefined) result.caseSensitive = options.caseSensitive;

  return result;
}

/**
 * Creates an index route config entry.
 */
export function index(file: string, options?: CreateIndexOptions): RouteConfigEntry {
  const result: RouteConfigEntry = {
    file,
    index: true,
  };
  if (options?.id !== undefined) result.id = options.id;
  return result;
}

/**
 * Creates a layout route config entry.
 */
export function layout(file: string, children?: RouteConfigEntry[]): RouteConfigEntry;
export function layout(
  file: string,
  options: CreateLayoutOptions,
  children?: RouteConfigEntry[],
): RouteConfigEntry;
export function layout(
  file: string,
  optionsOrChildren?: CreateLayoutOptions | RouteConfigEntry[],
  children?: RouteConfigEntry[],
): RouteConfigEntry {
  const isChildrenArray = Array.isArray(optionsOrChildren);
  const options = isChildrenArray || !optionsOrChildren ? undefined : optionsOrChildren;
  const childRoutes = isChildrenArray ? optionsOrChildren : children;

  const result: RouteConfigEntry = {
    file,
    children: childRoutes,
  };

  if (options?.id !== undefined) result.id = options.id;

  return result;
}

/**
 * Prefixes a list of routes with a base path.
 */
export function prefix(prefixPath: string, routes: RouteConfigEntry[]): RouteConfigEntry[] {
  return routes.map((entry) => {
    if (entry.index || typeof entry.path === "string") {
      return {
        ...entry,
        path: entry.path
          ? `${prefixPath.replace(/\/+$/, "")}/${entry.path.replace(/^\/+/, "")}`
          : prefixPath,
      };
    }
    if (entry.children) {
      return {
        ...entry,
        children: prefix(prefixPath, entry.children),
      };
    }
    return entry;
  });
}

/**
 * Extension that adds pages / routes to the VeoLMS web app.
 * Passed via createVeoLMSWeb({ extensions }).
 */
export interface WebExtension {
  name: string;
  /** Additional React Router routes to merge into the route tree. */
  routes?: RouteConfigEntry[];
}

/**
 * Resolves a path relative to the given plugin source file into an absolute
 * OS path suitable for use in React Router route() definitions.
 *
 * Use this in `extension.ts` instead of repeating the
 * `fileURLToPath(new URL(...))` pattern in every plugin:
 *
 * ```ts
 * import { pluginFile } from "@veolms/plugin-sdk";
 *
 * route("my/path", pluginFile(import.meta.url, "./pages/MyPage.tsx"), { id: "my-route" })
 * ```
 *
 * @param importMetaUrl - Pass `import.meta.url` from the extension file.
 * @param relativePath  - Path to the page component relative to that file.
 */
export function pluginFile(importMetaUrl: string, relativePath: string): string {
  const url = new URL(relativePath, importMetaUrl);
  let pathname = decodeURIComponent(url.pathname);
  // On Windows, strip the leading slash before drive letters (e.g. /C:/path -> C:/path)
  if (/^\/[a-zA-Z]:\//.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathname;
}
