import { expect, test } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test("sidebar shortcut hints and positional navigation stay in sync", async ({
  page,
}) => {
  await installBaselineState(page, {
    local: { "veolms-shortcut-platform": "windows" },
  });
  await openApp(page, "/explore-courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  const courses = sidebar.getByRole("button", { name: "Explore Courses" });
  const home = sidebar.getByRole("button", { name: "Home" });
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });
  const settingsShortcut = settings.locator(".courses-nav__shortcut");
  const coursesShortcut = courses.locator(".courses-nav__shortcut");

  await expect(settingsShortcut).toHaveText("Ctrl+,");
  await expect(settingsShortcut).toBeHidden();
  await expect(coursesShortcut).toHaveText("3");
  await expect(coursesShortcut).toBeHidden();
  await expect(settings).toHaveAttribute(
    "aria-keyshortcuts",
    /8 Control\+Comma/,
  );

  await home.focus();
  const focusClearance = await home.evaluate((button) => {
    const navigation = button.closest(".courses-nav");
    if (!navigation) throw new Error("Sidebar navigation container is missing");
    const buttonRect = button.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    return {
      top: buttonRect.top - navigationRect.top,
      left: buttonRect.left - navigationRect.left,
      right: navigationRect.right - buttonRect.right,
    };
  });
  expect(focusClearance.top).toBeGreaterThanOrEqual(4);
  expect(focusClearance.left).toBeGreaterThanOrEqual(4);
  expect(focusClearance.right).toBeGreaterThanOrEqual(4);

  await settings.hover();
  await expect(settingsShortcut).toBeVisible();
  const settingsTooltip = page.locator(".sidebar-nav-tooltip");
  await expect(settingsTooltip).toHaveCount(0);

  await courses.hover();
  await expect(coursesShortcut).toBeVisible();
  await expect(settingsShortcut).toBeHidden();

  await collapse.hover();
  await expect(page.locator(".sidebar-control-tooltip")).toHaveCount(0);
  await expect(collapse).toHaveAttribute(
    "title",
    "Collapse navigation (Ctrl+B)",
  );
  await expect(collapse).toHaveAttribute("aria-keyshortcuts", "Control+B");

  await collapse.click();
  await settings.hover();
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip.locator("kbd")).toHaveText(["Ctrl", ","]);

  await courses.focus();
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip).toContainText("Explore Courses");
  const resizeSidebar = sidebar.getByRole("separator", {
    name: "Resize sidebar",
  });
  await expect(resizeSidebar).toHaveAttribute(
    "title",
    "Resize sidebar | Ctrl+B",
  );
  await expect(resizeSidebar).toHaveAttribute("aria-keyshortcuts", "Control+B");
  await resizeSidebar.hover();
  await expect(settingsTooltip).toHaveCount(0);
  await expect(courses).toBeFocused();

  await sidebar.getByRole("button", { name: "Expand navigation" }).click();

  await page.keyboard.press("2");
  await expect(page).toHaveURL(/\/my-courses$/);
  await expect(
    sidebar.getByRole("button", { name: "My Courses" }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/explore-courses$/);
  await expect(
    sidebar.getByRole("button", { name: "Explore Courses" }),
  ).toHaveAttribute("aria-current", "page");

  const search = page.getByPlaceholder("Search your courses...");
  await search.focus();
  await page.keyboard.press("1");
  await expect(search).toHaveValue("1");
  await expect(page).toHaveURL(/\/explore-courses$/);
  await search.evaluate((element: HTMLInputElement) => element.blur());

  await page.keyboard.press("8");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "profile",
  );
  await page.keyboard.press("Alt+1");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("tab", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("Alt+3");
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
  await expect(page.getByRole("tab", { name: "Sidebar" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Sidebar" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Alt+3",
  );
});

test("Apple platforms receive Command shortcut labels", async ({ page }) => {
  await installBaselineState(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    Object.defineProperty(window.navigator, "userAgentData", {
      configurable: true,
      value: { platform: "macOS" },
    });
  });
  await openApp(page, "/explore-courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });

  await expect(settings.locator(".courses-nav__shortcut")).toHaveText("⌘+,");
  await expect(settings).toHaveAttribute("aria-keyshortcuts", /8 Meta\+Comma/);
  await expect(collapse).toHaveAttribute("title", "Collapse navigation (⌘+B)");
  await expect(collapse).toHaveAttribute("aria-keyshortcuts", "Meta+B");
  const resizeSidebar = sidebar.getByRole("separator", {
    name: "Resize sidebar",
  });
  await expect(resizeSidebar).toHaveAttribute("title", "Resize sidebar | ⌘+B");
  await expect(resizeSidebar).toHaveAttribute("aria-keyshortcuts", "Meta+B");

  await collapse.click();
  await settings.hover();
  const settingsTooltip = page.locator(".sidebar-nav-tooltip");
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip.locator("kbd")).toHaveText(["⌘", ","]);

  await openApp(page, "/settings/profile");
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "£",
        code: "Digit3",
        altKey: true,
        bubbles: true,
      }),
    );
  });
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
});

test("shortcut key style overrides system labels across the application", async ({
  page,
}) => {
  await installBaselineState(page);
  await openApp(page, "/settings/appearance");

  const shortcutStyle = page.getByRole("radiogroup", {
    name: "Shortcut key style",
  });
  await expect(
    shortcutStyle.getByRole("radio", { name: "Follow system" }),
  ).toHaveAttribute("aria-checked", "true");

  await shortcutStyle.getByRole("radio", { name: "Mac" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("veolms-shortcut-platform")),
    )
    .toBe("mac");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  await settings.hover();
  await expect(settings.locator(".courses-nav__shortcut")).toHaveText("⌘+,");
  await expect(
    sidebar.getByRole("button", { name: "Collapse navigation" }),
  ).toHaveAttribute("title", "Collapse navigation (⌘+B)");

  await openApp(page, "/settings/sidebar");
  const hideSidebarRow = page
    .locator(".settings-row")
    .filter({ hasText: "Hide sidebar" });
  await expect(hideSidebarRow.locator("kbd")).toHaveText("⌘+B");
  await expect(hideSidebarRow).not.toContainText("⌥");
  await expect(hideSidebarRow).not.toContainText("Ctrl");

  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("separator", { name: "Resize course curriculum" }),
  ).toHaveAttribute("title", "Resize course content | ⌘+⌥+C");

  await openApp(page, "/settings/appearance");
  await page
    .getByRole("radiogroup", { name: "Shortcut key style" })
    .getByRole("radio", { name: "Windows" })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Student navigation" })
      .getByRole("button", { name: "Settings" })
      .locator(".courses-nav__shortcut"),
  ).toHaveText("Ctrl+,");
});
