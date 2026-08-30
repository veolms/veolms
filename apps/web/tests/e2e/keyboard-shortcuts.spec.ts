import { expect, test } from "./app.fixture.ts";
import {
  installBaselineState,
  openApp,
  expectAppearanceSettingsReady,
} from "./support.ts";

test("sidebar shortcut hints and positional navigation stay in sync", async ({
  page,
}) => {
  await installBaselineState(page, {
    local: { "veolms-shortcut-platform": "windows" },
  });
  await openApp(page, "/courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  const courses = sidebar.getByRole("button", { name: "Courses" });
  const home = sidebar.getByRole("button", { name: "Home" });
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });
  const settingsShortcut = settings.locator(".courses-nav__shortcut");
  const coursesShortcut = courses.locator(".courses-nav__shortcut");

  await expect(settingsShortcut).toHaveText("Ctrl+,");
  await expect(settingsShortcut).toBeHidden();
  await expect(coursesShortcut).toHaveText("2");
  await expect(coursesShortcut).toBeHidden();
  await expect(settings).toHaveAttribute(
    "aria-keyshortcuts",
    /7 Control\+Comma/,
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
  const multiKeyShortcutBox = await settingsShortcut.boundingBox();
  expect(multiKeyShortcutBox).not.toBeNull();
  expect(multiKeyShortcutBox!.width).toBeGreaterThan(
    multiKeyShortcutBox!.height,
  );
  const settingsTooltip = page.locator(".sidebar-nav-tooltip");
  await expect(settingsTooltip).toHaveCount(0);

  await courses.hover();
  await expect(coursesShortcut).toBeVisible();
  const singleKeyShortcutBox = await coursesShortcut.boundingBox();
  expect(singleKeyShortcutBox).not.toBeNull();
  expect(singleKeyShortcutBox!.width).toBeGreaterThanOrEqual(
    singleKeyShortcutBox!.height,
  );
  await expect(settingsShortcut).toBeHidden();

  await collapse.hover();
  await expect(page.locator(".sidebar-control-tooltip")).toHaveCount(0);
  await expect(collapse).toHaveAttribute("title", "Collapse (Ctrl+B)");
  await expect(collapse).toHaveAttribute("aria-keyshortcuts", "Control+B");

  await collapse.click();
  await expect(
    sidebar.getByRole("button", { name: "Expand navigation" }),
  ).toHaveAttribute("title", "Expand (Ctrl+B)");
  await settings.hover();
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip).toHaveCSS("color", "rgb(17, 24, 39)");
  const tooltipElevation = await settingsTooltip.evaluate((tooltip) => {
    const filter = getComputedStyle(tooltip).filter;
    return {
      dropShadowCount: filter.match(/drop-shadow/g)?.length ?? 0,
      filter,
    };
  });
  expect(tooltipElevation.dropShadowCount).toBe(3);
  expect(tooltipElevation.filter).not.toBe("none");
  const tooltipSurface = settingsTooltip.locator(
    ".sidebar-nav-tooltip__surface",
  );
  await expect(tooltipSurface).toHaveCSS("height", "38px");
  await expect(tooltipSurface).toHaveAttribute(
    "preserveAspectRatio",
    "xMinYMid meet",
  );
  await expect(tooltipSurface.locator("path")).toHaveAttribute(
    "d",
    /^M 51 1 H .* C .* 1 .* 10 .* 21 V 156 C .* 167 .* 176 .* 176 H 51 C 40 176 34 167 34 156 V 132/,
  );
  await expect(tooltipSurface.locator("path")).not.toHaveCSS("stroke", "none");
  await expect(tooltipSurface.locator("path")).toHaveCSS(
    "fill",
    /url\(["']?#sidebar-tooltip-material["']?\)/,
  );
  await expect(
    tooltipSurface.locator(".sidebar-nav-tooltip__surface-start"),
  ).not.toHaveCSS("stop-color", "rgba(0, 0, 0, 0)");
  await expect(settingsTooltip.locator(".sidebar-nav-tooltip__body")).toHaveCSS(
    "height",
    "38px",
  );
  await expect(settingsTooltip.locator(".sidebar-nav-tooltip__body")).toHaveCSS(
    "padding-left",
    "17px",
  );
  await expect(settingsTooltip.locator(".sidebar-nav-tooltip__body")).toHaveCSS(
    "padding-right",
    "11px",
  );
  await expect(settingsTooltip.locator("kbd")).toHaveCount(0);
  const labelTypography = await settingsTooltip
    .locator(".sidebar-nav-tooltip__label")
    .evaluate((label) => {
      const styles = getComputedStyle(label);
      return {
        fontSize: Number.parseFloat(styles.fontSize),
        lineHeight: Number.parseFloat(styles.lineHeight),
      };
    });
  expect(labelTypography.lineHeight).toBeGreaterThan(labelTypography.fontSize);
  await courses.focus();
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip).toContainText("Courses");

  await sidebar
    .getByRole("button", {
      name: "Dark mode active. Switch to light mode",
    })
    .click();
  await settings.hover();
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip).toHaveCSS("color", "rgb(255, 255, 255)");
  await courses.focus();
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
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    sidebar.getByRole("button", { name: "Courses" }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(
    sidebar.getByRole("button", { name: "Wishlist" }),
  ).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("2");
  await expect(page).toHaveURL(/\/courses$/);

  const search = page.getByPlaceholder("Search courses...");
  await search.focus();
  await page.keyboard.press("1");
  await expect(search).toHaveValue("1");
  await expect(page).toHaveURL(/\/courses$/);
  await search.evaluate((element: HTMLInputElement) => element.blur());

  await page.keyboard.press("7");
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

test("search shortcut labels and focuses the active search field", async ({
  page,
}) => {
  await installBaselineState(page, {
    local: { "veolms-shortcut-platform": "windows" },
  });
  await openApp(page, "/courses");

  const search = page.getByPlaceholder("Search courses...");
  await expect(search).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
  await expect(search.locator("xpath=..//kbd")).toHaveText("Ctrl K");

  await page.keyboard.press("Control+K");
  await expect(search).toBeFocused();

  await search.fill("typescript");
  await expect(search).toHaveValue("typescript");
  await search.fill("");

  await page.setViewportSize({ width: 412, height: 779 });
  await openApp(page, "/courses");
  await expect(
    page.getByText("Explore courses and continue where you left off.", {
      exact: true,
    }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Sort courses:/ }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Filter course status:/ }),
  ).toBeHidden();
  const mobileSearch = page.getByPlaceholder("Search courses...");
  const mobileSearchToggle = page.locator(
    'button[aria-controls="courses-search-input"]',
  );
  await expect(page.locator("main#courses-main-scrollport header")).toHaveCSS(
    "padding-bottom",
    "0px",
  );
  await expect(page.locator("[data-courses-toolbar]")).toHaveCSS(
    "margin-top",
    "8px",
  );
  await expect(page.locator("[data-course-grid-section]")).toHaveCSS(
    "margin-top",
    "16px",
  );
  await expect(mobileSearchToggle).toHaveCSS("border-top-width", "0px");
  await expect(mobileSearchToggle).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(mobileSearch).toBeHidden();
  await mobileSearchToggle.click();
  await expect(mobileSearch).toBeFocused();
  await expect(page.locator("#courses-search kbd")).toBeHidden();
  await expect(page.locator("#courses-search")).toHaveCSS("height", "40px");
  const mobileSearchRadius = await page
    .locator("#courses-search")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderRadius),
    );
  expect(mobileSearchRadius).toBeGreaterThanOrEqual(20);
  await expect(mobileSearch).toHaveCSS("font-size", "15px");
  await expect(mobileSearch).toHaveCSS("line-height", "24px");
  await expect(mobileSearch).toHaveCSS("border-radius", "0px");
  await expect(page.locator("[data-mobile-search-icon]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Courses" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Back from search" }),
  ).toBeVisible();
  await mobileSearch.fill("node");
  await expect(
    page.getByRole("button", { name: "Clear search" }),
  ).toBeVisible();
  await expect(page.locator("[data-mobile-search-icon]")).toBeHidden();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(mobileSearch).toHaveValue("");
  await expect(mobileSearch).toBeFocused();
  await expect(page.getByRole("button", { name: "Clear search" })).toBeHidden();
  await expect(page.locator("[data-mobile-search-icon]")).toBeVisible();
  await page.getByRole("button", { name: "Back from search" }).click();
  await expect(mobileSearch).toBeHidden();
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await page.keyboard.press("Control+K");
  await expect(mobileSearchToggle).toHaveAttribute("aria-expanded", "true");
  await expect(mobileSearch).toBeFocused();
  const searchAlignment = await mobileSearch.evaluate((input) => {
    const field = input.closest("[data-mobile-search-shell]");
    const searchBox = input.closest("#courses-search");
    const header = input.closest("header");
    return {
      fieldBackground: field ? getComputedStyle(field).backgroundColor : "",
      searchBoxBackground: searchBox
        ? getComputedStyle(searchBox).backgroundColor
        : "",
      searchBoxBorder: searchBox
        ? getComputedStyle(searchBox).borderTopColor
        : "",
      fieldTop: field?.getBoundingClientRect().top ?? -1,
      headerTop: header?.getBoundingClientRect().top ?? -2,
    };
  });
  expect(searchAlignment.fieldBackground).toBe("rgba(0, 0, 0, 0)");
  expect(searchAlignment.searchBoxBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(searchAlignment.searchBoxBorder).toBe("rgba(0, 0, 0, 0)");
  expect(
    Math.abs(searchAlignment.fieldTop - searchAlignment.headerTop),
  ).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Back from search" }).click();
  await expect(mobileSearchToggle).toHaveAttribute("aria-expanded", "false");
  await expect(mobileSearch).toBeHidden();
});

test("bottom navigation keeps course search compact for both roles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 677, height: 779 });
  await installBaselineState(page, {
    local: { "veolms-shortcut-platform": "windows" },
  });
  await openApp(page, "/courses");

  const searchInput = page.getByPlaceholder("Search courses...");
  const searchToggle = page.locator(
    'button[aria-controls="courses-search-input"]',
  );
  const sort = page.getByRole("button", { name: /Sort courses:/ });
  const status = page.getByRole("button", {
    name: /Filter course status:/,
  });

  await expect(
    page.getByRole("navigation", { name: "Student mobile navigation" }),
  ).toBeVisible();
  await expect(searchToggle).toBeVisible();
  await expect(searchInput).toBeHidden();
  await expect(sort).toBeHidden();
  await expect(status).toBeHidden();

  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await openApp(page, "/courses");

  await expect(
    page.getByRole("navigation", { name: "Creator mobile navigation" }),
  ).toBeVisible();
  const create = page.getByRole("button", { name: "Create", exact: true });
  await expect(create).toBeVisible();
  await expect(searchToggle).toBeVisible();
  await expect(searchInput).toBeHidden();
  await expect(sort).toBeHidden();
  await expect(status).toBeHidden();

  const headerActionOrder = await Promise.all([
    searchToggle.boundingBox(),
    create.boundingBox(),
  ]);
  expect(headerActionOrder[0]).not.toBeNull();
  expect(headerActionOrder[1]).not.toBeNull();
  expect(headerActionOrder[0]!.x).toBeLessThan(headerActionOrder[1]!.x);
  expect(
    Math.abs(headerActionOrder[0]!.y - headerActionOrder[1]!.y),
  ).toBeLessThanOrEqual(1);

  await searchToggle.click();
  await expect(searchInput).toBeFocused();
  await expect(create).toBeHidden();
  await expect(page.locator("#courses-search kbd")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Back from search" }),
  ).toBeVisible();
});

test("sidebar toggle responds immediately and the brand owns floating", async ({
  page,
}) => {
  await installBaselineState(page, {
    local: { "veolms-shortcut-platform": "windows" },
  });
  await openApp(page, "/courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const app = page.locator(".courses-app");
  const brand = sidebar.locator(".courses-sidebar__brand");
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });
  await expect(collapse).toHaveAttribute("title", "Collapse (Ctrl+B)");
  await expect(brand).toHaveAttribute("title", "Double-click to float sidebar");

  await collapse.click();
  await expect(app).toHaveClass(/courses-app--collapsed/, { timeout: 200 });
  const expand = sidebar.getByRole("button", { name: "Expand navigation" });
  await expect(expand).toHaveAttribute("title", "Expand (Ctrl+B)");

  await expand.click();
  await expect(app).not.toHaveClass(/courses-app--collapsed/, {
    timeout: 200,
  });
  await brand.dblclick({ position: { x: 120, y: 2 } });
  await expect(app).toHaveClass(/courses-app--hidden/);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe("");
  await expect(brand).toHaveAttribute("title", "Double-click to pin sidebar");
  const pin = sidebar.getByRole("button", { name: "Pin navigation" });
  await expect(pin).toHaveAttribute("title", "Pin (Ctrl+B)");

  await pin.click();
  await expect(app).not.toHaveClass(/courses-app--hidden/, { timeout: 200 });
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
  await openApp(page, "/courses");

  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  const collapse = sidebar.getByRole("button", {
    name: "Collapse navigation",
  });

  const search = page.getByPlaceholder("Search courses...");
  await expect(search.locator("xpath=..//kbd")).toHaveText("⌘ K");
  await page.keyboard.press("Meta+K");
  await expect(search).toBeFocused();

  await expect(settings.locator(".courses-nav__shortcut")).toHaveText("⌘+,");
  await expect(settings).toHaveAttribute("aria-keyshortcuts", /7 Meta\+Comma/);
  await expect(collapse).toHaveAttribute("title", "Collapse (⌘+B)");
  await expect(collapse).toHaveAttribute("aria-keyshortcuts", "Meta+B");
  const resizeSidebar = sidebar.getByRole("separator", {
    name: "Resize sidebar",
  });
  await expect(resizeSidebar).toHaveAttribute("title", "Resize sidebar | ⌘+B");
  await expect(resizeSidebar).toHaveAttribute("aria-keyshortcuts", "Meta+B");

  await collapse.click();
  await expect(
    sidebar.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await settings.hover();
  const settingsTooltip = page.locator(".sidebar-nav-tooltip");
  await expect(settingsTooltip).toBeVisible();
  await expect(settingsTooltip).toHaveText("Settings");
  await expect(settingsTooltip.locator("kbd")).toHaveCount(0);

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
  await expectAppearanceSettingsReady(page);

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
  ).toHaveAttribute("title", "Collapse (⌘+B)");

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
  ).toHaveAttribute("title", "Resize course content | ⌥+C");

  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);
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
