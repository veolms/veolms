/**
 * Which permissions open each staff page (any one of them). Pages not listed
 * are open to everyone on the team. The sidebar and the route guard both read
 * this, so a page is never in the menu yet refused, or the other way round.
 *
 * Kept free of imports: the route guard is in the startup path, and the
 * contracts barrel would bring zod with it, hence plain strings.
 */
export const NAVIGATION_PERMISSIONS: Readonly<
  Record<string, readonly string[]>
> = {
  // Home is every team member's: the dashboard shows each person what
  // their permissions allow (see CreatorDashboard).
  "/orders": ["billing.read"],
  "/coupons": ["coupon.read"],
  "/students": ["student.read"],
  // Any one tab opens the page (the list is contracts' analyticsPermissions).
  "/analytics": [
    "analytics.overview.read",
    "analytics.revenue.read",
    "analytics.course.read",
    "analytics.learning.read",
    "analytics.learners.read",
    "analytics.conversion.read",
    "analytics.delivery.read",
    "analytics.storage.read",
    "analytics.video_quality.read",
  ],
  "/platform": [
    "platform.settings.read",
    "platform.settings.update",
    "platform.branding.update",
    "platform.homepage.update",
  ],
  "/team": ["team.read", "role.read"],
};

/**
 * Pages inside a section that take more than reading it: starting a course,
 * creating or editing a coupon.
 */
const ACTION_PAGE_PERMISSIONS: readonly (readonly [string, string])[] = [
  ["/courses/create", "course.create"],
  ["/coupons/", "coupon.manage"],
];

/** "/coupons/abc" → "/coupons". */
export function navigationRoot(path: string): string {
  return `/${path.split(/[?#]/, 1)[0]?.split("/")[1] ?? ""}`;
}

export function canOpenNavigationPath(
  path: string,
  permissions: ReadonlySet<string>,
): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  // "/courses/create?edit=<id>" is the older address of a course's editor.
  const editsCourse = /[?&]edit=/.test(path);
  const action = ACTION_PAGE_PERMISSIONS.find(
    ([prefix]) =>
      pathname.startsWith(prefix) &&
      !(prefix === "/courses/create" && editsCourse),
  );
  if (action) return permissions.has(action[1]);
  const root = navigationRoot(path);
  const required = NAVIGATION_PERMISSIONS[root];
  return !required || required.some((key) => permissions.has(key));
}
