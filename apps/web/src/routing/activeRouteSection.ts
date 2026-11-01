import type { NavigationItemWithMetadata } from "../shell/navigation";
import { NOT_FOUND_SECTION, normalizeNavigationPath } from "./routeDescriptors";

export interface NavigationMatch {
  label: string;
  path: string;
  exact: boolean;
  length: number;
}

/**
 * The sidebar entry an address sits under: the entry's own address (`exact`)
 * or any address below it. This says where in the menu an address belongs,
 * not that a page answers to it.
 */
export function getNavigationMatch(
  pathname: string,
  items: readonly NavigationItemWithMetadata[],
): NavigationMatch | undefined {
  const path = normalizeNavigationPath(pathname.split(/[?#]/, 1)[0] || "/");
  let bestMatch: NavigationMatch | undefined;

  for (const [label, , metadata] of items) {
    const itemPath = normalizeNavigationPath(metadata?.routeLink ?? "/");
    // The Discussions and Platform menus resolve to the last tab visited in
    // this session, so their tab URLs are still the menu's destination rather
    // than a detail page that should inherit the previously selected section.
    // (Platform's tabs used to keep the section navigated from lit: arriving
    // from Coupons left Coupons highlighted on the Platform page.)
    const isMenuTab =
      (itemPath === "/discussions" || itemPath === "/platform") &&
      path.startsWith(`${itemPath}/`);
    const exact = path === itemPath || isMenuTab;
    const isChild =
      itemPath !== "/" && path.startsWith(`${itemPath.replace(/\/$/, "")}/`);
    if (!exact && !isChild) continue;
    if (!bestMatch || itemPath.length > bestMatch.length) {
      bestMatch = { label, path: itemPath, exact, length: itemPath.length };
    }
  }

  return bestMatch;
}

/**
 * The section the page is told it is showing.
 *
 * An address no page answers to is "Not Found" whatever else is known about
 * it. Both other sources used to be asked first, and both can name a real
 * section for such an address: the sidebar entry it sits under (`/orders/abc`
 * showed the whole Orders page, `/settings/privacy` "Settings are not
 * implemented yet") and the section the visitor navigated from (an in-app
 * link to a missing page showed the page they had just left).
 *
 * For an address a page does answer to, the order is unchanged: the section
 * navigated from, then the sidebar entry the address sits under, then the
 * route's own section when it is a sidebar entry, then the first entry.
 * The first entry is left out while `navigationItems` is only a stand-in for
 * a menu not known yet (see `menuKnown`).
 */
export function resolveActiveRouteSection(input: {
  routeSection: string | undefined;
  /** The section navigated from, when the navigation carried a valid one. */
  originSection: string | undefined;
  navigationMatch: Pick<NavigationMatch, "label"> | undefined;
  navigationItems: readonly NavigationItemWithMetadata[];
  /**
   * False while the signed-in user is still being fetched and the menu is
   * the signed-out one: a reload of /orders then matched no entry and lit
   * the first one, Home, until the user arrived.
   */
  menuKnown?: boolean;
}): string | undefined {
  const {
    routeSection,
    originSection,
    navigationMatch,
    navigationItems,
    menuKnown = true,
  } = input;
  if (routeSection === NOT_FOUND_SECTION) return NOT_FOUND_SECTION;
  if (originSection !== undefined) return originSection;
  return (
    navigationMatch?.label ??
    (navigationItems.some(([label]) => label === routeSection)
      ? routeSection
      : menuKnown
        ? navigationItems[0]?.[0]
        : undefined)
  );
}
