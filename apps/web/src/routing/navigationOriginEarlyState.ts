/**
 * The menu section a page was opened from, shown before the page's scripts
 * have run.
 *
 * A course page opened from Home highlights Home in the menu and its back
 * link says "Home"; opened from the Courses page, Courses and "All
 * courses". Which it was is in the browser's history entry (React Router's
 * `usr` state, `academyNavigationOriginSection`), which a reload keeps. The
 * page is built without it, with Courses, and the app applies the origin
 * only after hydration (see academy-layout.tsx), so this runs in the
 * document's head and does the same before the first paint:
 *
 * - once the menu has been parsed, the item named by the origin takes the
 *   `is-active` class from the others (each menu item draws both its icons
 *   and the class picks one, see SidebarNavigation). React keeps a built
 *   attribute when it hydrates, and sets the class itself in the render
 *   after;
 * - <html> gets `data-navigation-origin` and the back link's words as a
 *   custom property (see CourseOverviewHero).
 *
 * An origin the menu does not list is left alone, as the app does.
 *
 * The history entry's state does not always survive a reload: the hosted
 * site answers an address without a trailing slash with a redirect to the
 * one with it, and the browser drops the state on the way. So the app also
 * keeps each page's origin in the tab's session storage
 * (`rememberNavigationOrigin`), and on a reload that arrives without it
 * this script puts it back into the history entry, before the app reads
 * it.
 */
export const NAVIGATION_ORIGIN_ATTRIBUTE = "data-navigation-origin";

const STORAGE_PREFIX = "veolms-navigation-origin:";

/** The same page whether or not its address ends in a slash. */
const pageKey = (pathname: string) =>
  STORAGE_PREFIX + (pathname.replace(/\/+$/u, "") || "/");

/** Kept for a reload of this page in this tab (see above). */
export function rememberNavigationOrigin(
  pathname: string,
  origin: { section: string; path: string },
) {
  try {
    sessionStorage.setItem(pageKey(pathname), JSON.stringify(origin));
  } catch {
    // Not kept: a reload that loses the history state shows Courses.
  }
}

function applyNavigationOrigin(keys: {
  sectionKey: string;
  pathKey: string;
  attribute: string;
  storagePrefix: string;
}) {
  try {
    let state = history.state && history.state.usr;
    if (!state || typeof state[keys.sectionKey] !== "string") {
      // A reload that lost the history state on a redirect: the origin
      // this tab kept for the page goes back into the entry, where the
      // app's router reads it when it starts.
      const navigation = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      if (navigation && navigation.type === "reload") {
        const saved = JSON.parse(
          sessionStorage.getItem(
            keys.storagePrefix + (location.pathname.replace(/\/+$/, "") || "/"),
          ) || "null",
        );
        if (
          saved &&
          typeof saved.section === "string" &&
          typeof saved.path === "string"
        ) {
          state = {
            ...(state || {}),
            [keys.sectionKey]: saved.section,
            [keys.pathKey]: saved.path,
          };
          history.replaceState({ ...(history.state || {}), usr: state }, "");
        }
      }
    }
    const section = state && state[keys.sectionKey];
    const path = state && state[keys.pathKey];
    if (
      typeof section !== "string" ||
      typeof path !== "string" ||
      path.charAt(0) !== "/" ||
      path.indexOf("//") === 0
    ) {
      return;
    }
    const root = document.documentElement;
    const apply = () => {
      // The menu's last element: every item before it has been parsed.
      if (!document.querySelector("[data-nav-end-space]")) return false;
      const items = document.querySelectorAll(
        "#courses-sidebar-nav-scrollport > button",
      );
      let match: Element | null = null;
      items.forEach((item) => {
        if (item.getAttribute("aria-label") === section) match = item;
      });
      if (!match) return true;
      items.forEach((item) =>
        item.classList.toggle("is-active", item === match),
      );
      const label = section === "Courses" ? "All courses" : section;
      root.style.setProperty(
        "--navigation-origin-label",
        '"' + label.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
      );
      root.setAttribute(keys.attribute, section);
      return true;
    };
    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      observer.disconnect();
      apply();
    });
  } catch {
    // The page shows Courses until the app applies the origin, as before.
  }
}

export const getNavigationOriginBootstrapScript = () =>
  `(${applyNavigationOrigin.toString()})(${JSON.stringify({
    sectionKey: "academyNavigationOriginSection",
    pathKey: "academyNavigationOriginPath",
    attribute: NAVIGATION_ORIGIN_ATTRIBUTE,
    storagePrefix: STORAGE_PREFIX,
  })});`;
