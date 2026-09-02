import { test, expect } from "./app.fixture.ts";
import {
  getApplicationScrollTop,
  expectStoredValue,
  installBaselineState,
  openApp,
  expectAppearanceSettingsReady,
  setApplicationScrollTop,
  updateSidebarPreferences,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("profile settings validate, autosave, and retain academy-local identity", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");

  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "profile",
  );
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const displayName = page.getByLabel("Display name", { exact: true });
  const email = page.getByLabel("Email address", { exact: true });
  const photoFile = page.getByLabel("Profile photo file");

  await expect(displayName).toHaveValue("Ashi Singh");
  await expect(email).toHaveAttribute("readonly", "");
  await expect(photoFile).toHaveAttribute("tabindex", "-1");

  await displayName.fill("");
  await expect(
    page.getByText("Enter the name you want to use in this academy."),
  ).toBeVisible();
  await expect(displayName).toHaveAttribute("aria-invalid", "true");

  await displayName.fill("Avery Patel");
  await expect(displayName).toHaveValue("Avery Patel");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem("veolms-profile-student");
        return value ? JSON.parse(value).displayName : null;
      }),
    )
    .toBe("Avery Patel");
  await expect(
    page.locator(
      ".courses-profile__button > span:not(.shell-profile-avatar) strong",
    ),
  ).toHaveText("Avery Patel");

  await page.reload();
  await expect(displayName).toHaveValue("Avery Patel");
  await expect(
    page.locator(
      ".courses-profile__button > span:not(.shell-profile-avatar) strong",
    ),
  ).toHaveText("Avery Patel");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  await mobileNavigation
    .getByRole("button", { name: "More navigation options" })
    .click();
  const mobileMenu = page.getByRole("dialog", { name: /More/ });
  const mobileProfile = mobileMenu.locator(".mobile-menu-sheet__profile");
  const mobileNavigationList = mobileMenu.locator(".mobile-menu-sheet__list");
  await expect(mobileProfile).toContainText("Avery Patel");
  await expect(mobileProfile).toHaveAttribute("aria-haspopup", "menu");
  const navigationListBefore = await mobileNavigationList.boundingBox();
  await mobileProfile.click();
  const mobileProfileMenu = page.locator("#mobile-profile-menu");
  await expect(mobileProfileMenu).toBeVisible();
  const [profileBounds, profileMenuBounds] = await Promise.all([
    mobileProfile.boundingBox(),
    mobileProfileMenu.boundingBox(),
  ]);
  expect(profileBounds).not.toBeNull();
  expect(profileMenuBounds).not.toBeNull();
  expect(profileMenuBounds!.x).toBeGreaterThan(profileBounds!.x);
  expect(profileMenuBounds!.width).toBeLessThan(profileBounds!.width);
  expect(profileMenuBounds!.x + profileMenuBounds!.width).toBeCloseTo(
    profileBounds!.x + profileBounds!.width,
    0,
  );
  expect(profileMenuBounds!.y).toBeGreaterThanOrEqual(
    profileBounds!.y + profileBounds!.height,
  );
  const navigationListAfter = await mobileNavigationList.boundingBox();
  expect(navigationListBefore).not.toBeNull();
  expect(navigationListAfter).not.toBeNull();
  expect(navigationListAfter!.y).toBeCloseTo(navigationListBefore!.y, 0);
  await expect(mobileProfileMenu.getByText("Workspace")).toHaveCount(0);
  await expect(
    mobileProfileMenu.getByRole("menuitemradio", { name: "Student" }),
  ).toHaveCount(0);
  await expect(
    mobileProfileMenu.getByRole("menuitemradio", { name: "Creator" }),
  ).toHaveCount(0);
  await expect(
    mobileProfileMenu.getByRole("menuitem", { name: "Hide sidebar" }),
  ).toHaveCount(0);
  await expect(
    mobileProfileMenu.getByRole("menuitem", { name: "Logout" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("profile settings preserve an offline draft and recover autosave", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");

  const displayName = page.getByLabel("Display name", { exact: true });
  const storedNameBeforeDraft = await page.evaluate(() => {
    const value = localStorage.getItem("veolms-profile-student");
    return value ? JSON.parse(value).displayName : null;
  });

  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await displayName.fill("Offline draft");
  await expect(displayName).toHaveValue("Offline draft");

  await page.waitForTimeout(500);
  await expect(
    page.evaluate(() => {
      const value = localStorage.getItem("veolms-profile-student");
      return value ? JSON.parse(value).displayName : null;
    }),
  ).resolves.toBe(storedNameBeforeDraft);

  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem("veolms-profile-student");
        return value ? JSON.parse(value).displayName : null;
      }),
    )
    .toBe("Offline draft");
});

test("settings tabs support roving arrow, Home, and End navigation", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");

  const profileTab = page.getByRole("tab", { name: "Profile" });
  await profileTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("tab", { name: "Appearance" })).toBeFocused();

  await page.keyboard.press("End");
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByRole("tab", { name: "Account" })).toBeFocused();

  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(profileTab).toBeFocused();
});

test("creator settings control which sidebar menu items are visible", async ({
  page,
}) => {
  await openApp(page, "/settings/sidebar");
  await page.evaluate(() => localStorage.setItem("veolms-role", "creator"));
  await page.reload();

  await expect(page.getByRole("heading", { name: "Menu items" })).toBeVisible();
  await expect(page.getByText("9 visible")).toBeVisible();

  const analyticsToggle = page.getByRole("switch", {
    name: "Show Analytics in sidebar menu",
  });
  await expect(analyticsToggle).toHaveAttribute("aria-checked", "true");
  await analyticsToggle.click();

  await expect(analyticsToggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("8 visible")).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Creator navigation" })
      .getByRole("button", { name: "Analytics", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem(
          "veolms-navigation-visibility-creator",
        );
        return value ? JSON.parse(value) : null;
      }),
    )
    .toEqual([
      "Dashboard",
      "Courses",
      "Students",
      "Reviews",
      "Wishlist",
      "Discussions",
      "Orders",
      "Settings",
    ]);

  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Show Analytics in sidebar menu" }),
  ).toHaveAttribute("aria-checked", "false");
});

test("student settings control which sidebar menu items are visible", async ({
  page,
}) => {
  await openApp(page, "/settings/sidebar");

  await expect(page.getByRole("heading", { name: "Menu items" })).toBeVisible();
  await expect(page.getByText("7 visible")).toBeVisible();

  const notificationsToggle = page.getByRole("switch", {
    name: "Show Notifications in sidebar menu",
  });
  await notificationsToggle.click();

  await expect(notificationsToggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("6 visible")).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Student navigation" })
      .getByRole("button", { name: "Notifications", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem(
          "veolms-navigation-visibility-student",
        );
        return value ? JSON.parse(value) : null;
      }),
    )
    .toEqual([
      "Home",
      "Courses",
      "Wishlist",
      "Discussions",
      "Order History",
      "Settings",
    ]);
});

test("Escape leaves Settings for the previous non-settings destination", async ({
  page,
}) => {
  await openApp(page, "/notifications");
  const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
  await updateSidebarPreferences(page, "/notifications", {
    dockItems,
    dockOrder: dockItems,
  });
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);

  const paletteTrigger = page
    .getByRole("group", {
      name: "Appearance controls",
    })
    .getByRole("button", { name: "Choose color theme" });
  await paletteTrigger.click();
  await expect(
    page.getByRole("menu", { name: "Choose a color theme" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(
    page.getByRole("menu", { name: "Choose a color theme" }),
  ).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/notifications$/);
});

test("leaving Settings restores the application scroll position", async ({
  page,
}) => {
  await openApp(page, "/courses");
  await setApplicationScrollTop(page, 420);
  const originalScrollTop = await getApplicationScrollTop(page);
  expect(originalScrollTop).toBeGreaterThan(300);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect.poll(() => getApplicationScrollTop(page)).toBe(0);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/courses$/);
  await expect
    .poll(() => getApplicationScrollTop(page))
    .toBe(originalScrollTop);
});

test("page tab colors follow the sidebar and keep explicit overrides", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page, "/settings/appearance");
  await expectAppearanceSettingsReady(page);

  const root = page.locator("html");
  const pageTabColorOptions = page.getByRole("radiogroup", {
    name: "Page tab colors",
  });
  const followSidebar = pageTabColorOptions.getByRole("radio", {
    name: "Follow sidebar",
  });
  const pageTabs = page.getByRole("tablist", { name: "Settings sections" });
  const activeTabColor = (name: string) =>
    pageTabs
      .getByRole("tab", { name })
      .evaluate((tab) => getComputedStyle(tab).color);
  const tabToneColor = (name: string) =>
    pageTabs.getByRole("tab", { name }).evaluate((tab) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--page-tab-tone)";
      tab.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });

  await expect(followSidebar).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("data-page-tab-colors", "follow-sidebar");
  const followedMonochromeColor = await activeTabColor("Appearance");

  await page.getByRole("tab", { name: "Sidebar" }).click();
  await page
    .getByRole("radiogroup", { name: "Sidebar icon style" })
    .getByRole("radio", { name: /Multicolor/ })
    .click();
  await expect(root).toHaveAttribute("data-sidebar-icon-style", "multicolor");
  const followedSidebarColor = await tabToneColor("Sidebar");
  await expect.poll(() => activeTabColor("Sidebar")).toBe(followedSidebarColor);
  await page.getByRole("tab", { name: "Appearance" }).click();
  const followedAppearanceColor = await tabToneColor("Appearance");
  await expect
    .poll(() => activeTabColor("Appearance"))
    .toBe(followedAppearanceColor);
  expect(followedSidebarColor).not.toBe(followedAppearanceColor);
  expect(followedAppearanceColor).not.toBe(followedMonochromeColor);

  await pageTabColorOptions.getByRole("radio", { name: "Monochrome" }).click();
  await expect(root).toHaveAttribute("data-page-tab-colors", "monochrome");
  await expectStoredValue(page, "veolms-page-tab-colors", "monochrome");
  await page.reload();
  await expectAppearanceSettingsReady(page);
  await expect(root).toHaveAttribute("data-page-tab-colors", "monochrome");
  expect(await activeTabColor("Appearance")).toBe(followedMonochromeColor);

  await pageTabColorOptions.getByRole("radio", { name: "Multicolor" }).click();
  await page.getByRole("tab", { name: "Sidebar" }).click();
  await page
    .getByRole("radiogroup", { name: "Sidebar icon style" })
    .getByRole("radio", { name: /Monochrome/ })
    .click();
  await expect(root).toHaveAttribute("data-sidebar-icon-style", "monochrome");
  await page.getByRole("tab", { name: "Appearance" }).click();
  await page.reload();
  await expect(root).toHaveAttribute("data-page-tab-colors", "multicolor");
  await expect
    .poll(() => activeTabColor("Appearance"))
    .toBe(followedAppearanceColor);
});

test("profile field and public-visibility labels share one text baseline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1064, height: 753 });
  await openApp(page, "/settings/profile");

  const baselineDeltas = await page
    .locator(".settings-profile__field-heading")
    .evaluateAll((headings) => {
      const textBottom = (element: Element) => {
        const textNode = [...element.childNodes].find(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!textNode) throw new Error("Expected a visible label text node");
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return range.getBoundingClientRect().bottom;
      };

      return headings.map((heading) => {
        const fieldLabel = heading.querySelector(
          ":scope > label:not(.settings-profile__visibility-checkbox)",
        );
        const visibilityLabel = heading.querySelector(
          ".settings-profile__visibility-checkbox > span:first-child",
        );
        if (!fieldLabel || !visibilityLabel)
          throw new Error("Expected both profile field labels");
        return {
          field: fieldLabel.textContent?.trim(),
          delta: textBottom(visibilityLabel) - textBottom(fieldLabel),
        };
      });
    });

  expect(baselineDeltas.map(({ field }) => field)).toEqual([
    "Email address",
    "Mobile number",
    "LinkedIn URL",
    "GitHub URL",
    "Portfolio",
  ]);
  for (const { delta } of baselineDeltas) {
    expect(Math.abs(delta)).toBeLessThan(0.1);
  }

  await page.locator("#profile-mobile").fill("+91 98765 43211");
  const phoneControlAlignment = await page
    .locator(".settings-profile__phone-control")
    .evaluate((control) => {
      const field = control.querySelector(".settings-profile__input-shell");
      const button = control.querySelector(".settings-profile__verify-action");
      if (!field || !button)
        throw new Error("Expected the phone field and verification action");
      const fieldRect = field.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        fieldHeight: fieldRect.height,
        buttonHeight: buttonRect.height,
        topInset: buttonRect.top - fieldRect.top,
        bottomInset: fieldRect.bottom - buttonRect.bottom,
        fontSize: Number.parseFloat(getComputedStyle(button).fontSize),
      };
    });

  expect(phoneControlAlignment.buttonHeight).toBeLessThan(
    phoneControlAlignment.fieldHeight,
  );
  expect(
    Math.abs(
      phoneControlAlignment.topInset - phoneControlAlignment.bottomInset,
    ),
  ).toBeLessThan(0.1);
  expect(phoneControlAlignment.fontSize).toBe(12);
});

test("appearance and sidebar preferences persist through their direct settings routes", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");

  const colorThemeSection = page
    .locator(".settings-section")
    .filter({ has: page.getByRole("heading", { name: "Color theme" }) });
  const colorThemeOptions = colorThemeSection.getByRole("radio");
  await expect(colorThemeOptions.nth(0)).toContainText("Veo Onyx");
  await expect(colorThemeOptions.nth(1)).toContainText("Ocean Blue");
  await expect(colorThemeOptions.nth(2)).toContainText("Midnight Azure");
  const previewTone = (themeName: RegExp) =>
    colorThemeOptions
      .filter({ hasText: themeName })
      .locator(".settings-mini-surface")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--mini-tone").trim(),
      );
  await expect.poll(() => previewTone(/Brainwave Slate/)).toBe("#0085ff");
  await expect.poll(() => previewTone(/Velvet Lilac/)).toBe("#c18cff");
  await expect.poll(() => previewTone(/Champagne Noir/)).toBe("#e6c98a");
  await expect.poll(() => previewTone(/Electric Lime/)).toBe("#a3e635");
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-icon-style",
    "monochrome",
  );

  await expectAppearanceSettingsReady(page);
  const appearanceHeadings = await page
    .locator(".settings-content--appearance:visible > .settings-section > h2")
    .allTextContents();
  expect(appearanceHeadings.indexOf("Theme rotation")).toBe(
    appearanceHeadings.indexOf("Color theme") + 1,
  );
  const randomTheme = page.getByRole("switch", {
    name: "Random theme on app open",
  });
  await randomTheme.click();
  await expect(randomTheme).toHaveAttribute("aria-checked", "true");
  const graphitePoolOption = page.getByRole("checkbox", {
    name: /Graphite Studio/,
  });
  await graphitePoolOption.click();
  await expect(graphitePoolOption).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pool = localStorage.getItem("veolms-random-academy-theme-pool");
        return pool ? JSON.parse(pool) : null;
      }),
    )
    .not.toContain("graphite");

  await page.setViewportSize({ width: 350, height: 780 });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ viewport: 350, content: 350 });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await randomTheme.click();
  await expect(randomTheme).toHaveAttribute("aria-checked", "false");

  await page
    .getByRole("radio", { name: "Light Use a light color scheme" })
    .click();
  await page.getByRole("radio", { name: /Ocean Blue/ }).click();
  await page.getByRole("switch", { name: "Reduce animations" }).click();
  await page.getByRole("radio", { name: "Extra large" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduce-animations",
    "false",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-text-size",
    "extra-large",
  );
  await expectStoredValue(page, "veolms-theme", "light");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");

  await page.getByRole("tab", { name: "Sidebar" }).click();
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
  const iconStyleSection = page
    .locator(".settings-section")
    .filter({ has: page.getByRole("heading", { name: "Icon style" }) });
  await expect(iconStyleSection.getByText("Recommended")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Monochrome/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("radio", { name: "Follow color theme" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("heading", { name: "Sidebar header" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sidebar menus" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sidebar dock" }),
  ).toBeVisible();

  const themeDockControl = page.getByRole("switch", {
    name: "Show Color theme in sidebar dock",
  });
  const fullscreenDockControl = page.getByRole("switch", {
    name: "Show Fullscreen in sidebar dock",
  });
  const readingModeDockControl = page.getByRole("switch", {
    name: "Show Reading mode in sidebar dock",
  });
  const sidebarThemePicker = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Choose color theme" });
  const sidebarAppearance = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("group", { name: "Appearance controls" });
  await expect(themeDockControl).toHaveAttribute("aria-checked", "false");
  await expect(readingModeDockControl).toBeEnabled();
  await expect(readingModeDockControl).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("3 visible")).toBeVisible();
  await expect(sidebarThemePicker).toHaveCount(0);

  await expect
    .poll(() =>
      sidebarAppearance.evaluate((group) =>
        [...group.children].map((child) =>
          child.getAttribute("data-dock-item"),
        ),
      ),
    )
    .toEqual(["appearance", "reading-mode", "fullscreen"]);

  const readingModeReorderHandle = page.getByRole("button", {
    name: "Reorder Reading mode",
  });
  const themeDockRow = page.locator(
    '[data-dock-item="theme"].settings-sidebar-dock-row',
  );
  const readingModeHandleBox = await readingModeReorderHandle.boundingBox();
  const themeRowBox = await themeDockRow.boundingBox();
  if (!readingModeHandleBox || !themeRowBox) {
    throw new Error("Expected dock controls to have measurable drag geometry");
  }
  await page.mouse.move(
    readingModeHandleBox.x + readingModeHandleBox.width / 2,
    readingModeHandleBox.y + readingModeHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    readingModeHandleBox.x + readingModeHandleBox.width / 2,
    readingModeHandleBox.y + readingModeHandleBox.height / 2 - 10,
  );
  await page.mouse.move(
    themeRowBox.x + themeRowBox.width / 2,
    themeRowBox.y + 2,
  );
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const storedPreferences = localStorage.getItem(
          "veolms-sidebar-preferences",
        );
        return storedPreferences
          ? JSON.parse(storedPreferences).dockOrder
          : null;
      }),
    )
    .toEqual(["appearance", "reading-mode", "theme", "fullscreen", "settings"]);
  await expect
    .poll(() =>
      sidebarAppearance.evaluate((group) =>
        [...group.children].map((child) =>
          child.getAttribute("data-dock-item"),
        ),
      ),
    )
    .toEqual(["appearance", "reading-mode", "fullscreen"]);

  const settingsDockControl = page.getByRole("switch", {
    name: "Show Settings in sidebar dock",
  });
  const settingsReorderHandle = page.getByRole("button", {
    name: "Reorder Settings",
  });
  const fullscreenDockRow = page.locator(
    '[data-dock-item="fullscreen"].settings-sidebar-dock-row',
  );
  await settingsReorderHandle.scrollIntoViewIfNeeded();
  const settingsHandleBox = await settingsReorderHandle.boundingBox();
  const fullscreenRowBox = await fullscreenDockRow.boundingBox();
  if (!settingsHandleBox || !fullscreenRowBox) {
    throw new Error("Expected Settings to have draggable dock geometry");
  }
  await page.mouse.move(
    settingsHandleBox.x + settingsHandleBox.width / 2,
    settingsHandleBox.y + settingsHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    settingsHandleBox.x + settingsHandleBox.width / 2,
    settingsHandleBox.y + settingsHandleBox.height / 2 - 10,
  );
  await page.mouse.move(
    fullscreenRowBox.x + fullscreenRowBox.width / 2,
    fullscreenRowBox.y + 2,
  );
  await page.mouse.up();

  await expect(settingsDockControl).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("4 visible")).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Student navigation" })
      .getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebarAppearance.getByRole("button", { name: "Open settings" }),
  ).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() =>
      sidebarAppearance.evaluate((group) =>
        [...group.children].map((child) =>
          child.getAttribute("data-dock-item"),
        ),
      ),
    )
    .toEqual(["appearance", "reading-mode", "settings", "fullscreen"]);

  await page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await sidebarAppearance
    .getByRole("button", { name: "Open settings" })
    .click();
  await expect(page).toHaveURL(/\/settings\/sidebar$/);

  await settingsDockControl.click();
  await expect(page.getByText("3 visible")).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Student navigation" })
      .getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();

  await fullscreenDockControl.click();
  await expect(page.getByText("2 visible")).toBeVisible();

  await themeDockControl.click();
  await expect(themeDockControl).toHaveAttribute("aria-checked", "true");
  await expect(sidebarThemePicker).toBeVisible();
  await expect(page.getByText("3 visible")).toBeVisible();
  await themeDockControl.click();
  await expect(themeDockControl).toHaveAttribute("aria-checked", "false");
  await expect(sidebarThemePicker).toHaveCount(0);
  await expect(page.getByText("2 visible")).toBeVisible();
  await sidebarAppearance
    .getByRole("button", { name: /mode active\. Switch/ })
    .click({ button: "right" });
  const fallbackThemeMenu = page.getByRole("menu", {
    name: "Choose a color theme",
  });
  await expect(fallbackThemeMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fallbackThemeMenu).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const storedPreferences = localStorage.getItem(
          "veolms-sidebar-preferences",
        );
        return storedPreferences
          ? JSON.parse(storedPreferences).dockItems
          : null;
      }),
    )
    .toEqual(["appearance", "reading-mode"]);

  await expect(
    sidebarAppearance.getByRole("button", { name: "Turn reading mode on" }),
  ).toBeVisible();
  await expect(
    sidebarAppearance.getByRole("button", { name: /Fullscreen/ }),
  ).toHaveCount(0);
  await sidebarAppearance
    .getByRole("button", { name: "Turn reading mode on" })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reading-mode",
    "true",
  );

  const fixedHeader = page.getByRole("switch", {
    name: "Fixed collapse control",
  });
  await expect(fixedHeader).toHaveAttribute("aria-checked", "false");
  await fixedHeader.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-header-layout",
    "fixed",
  );
  await fixedHeader.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-header-layout",
    "inline",
  );
  const inlineHeaderGeometry = await page.evaluate(() => {
    const logo = document.querySelector(".courses-logo-clip");
    const collapse = document.querySelector(".sidebar-collapse");
    if (!logo || !collapse) throw new Error("Expected sidebar header controls");
    return {
      logoLeft: logo.getBoundingClientRect().left,
      collapseLeft: collapse.getBoundingClientRect().left,
    };
  });
  expect(inlineHeaderGeometry.logoLeft).toBeLessThan(
    inlineHeaderGeometry.collapseLeft,
  );
  const widthInput = page.getByRole("spinbutton", {
    name: "Sidebar max width in pixels",
  });
  await widthInput.fill("420");
  await widthInput.press("Enter");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const storedPreferences = localStorage.getItem(
          "veolms-sidebar-preferences",
        );
        return storedPreferences
          ? JSON.parse(storedPreferences).sidebarMaxWidth
          : null;
      }),
    )
    .toBe(420);

  await page.reload();
  await expect(widthInput).toHaveValue("420");
  await expect(themeDockControl).toHaveAttribute("aria-checked", "false");
  await expect(readingModeDockControl).toHaveAttribute("aria-checked", "true");
  await expect(sidebarThemePicker).toHaveCount(0);
  await expect(fixedHeader).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
});

test("sidebar logo stays on one anchor while the rail reveals it", async ({
  page,
}) => {
  await openApp(page, "/settings/sidebar");

  const fixedHeader = page.getByRole("switch", {
    name: "Fixed collapse control",
  });
  if ((await fixedHeader.getAttribute("aria-checked")) === "true") {
    await fixedHeader.click();
  }

  const collapsedLogo = page.getByRole("switch", {
    name: "Show logo when collapsed",
  });
  if ((await collapsedLogo.getAttribute("aria-checked")) !== "true") {
    await collapsedLogo.click();
  }

  const measureLogoAnchor = () =>
    page.evaluate(() => {
      const logo = document.querySelector(".courses-logo-clip");
      const logoSvg = logo?.querySelector("svg");
      const logoMark = logoSvg?.querySelectorAll("path");
      const logoVertical = logoSvg?.querySelectorAll("path")[1];
      const collapseSurface = document.querySelector(
        ".sidebar-collapse svg rect",
      );
      const homeSvg = document.querySelector(
        '.courses-nav button[data-navigation-label="Home"] > svg',
      );
      const homeShapes = homeSvg?.querySelectorAll(
        "path, rect, line, polyline, polygon, circle",
      );
      if (
        !logo ||
        !logoMark?.length ||
        !logoVertical ||
        !collapseSurface ||
        !homeShapes?.length
      ) {
        throw new Error("Expected measurable sidebar logo and Home glyphs");
      }

      const logoRect = logoVertical.getBoundingClientRect();
      const logoMarkRects = [...logoMark]
        .slice(0, 2)
        .map((path) => path.getBoundingClientRect());
      const logoMarkLeft = Math.min(...logoMarkRects.map((rect) => rect.left));
      const logoMarkRight = Math.max(
        ...logoMarkRects.map((rect) => rect.right),
      );
      const collapseSurfaceRect = collapseSurface.getBoundingClientRect();
      const homeLeft = Math.min(
        ...[...homeShapes].map((shape) => shape.getBoundingClientRect().left),
      );
      return {
        collapseSurfaceCenter:
          (collapseSurfaceRect.left + collapseSurfaceRect.right) / 2,
        logoLeft: logoRect.left,
        logoMarkCenter: (logoMarkLeft + logoMarkRight) / 2,
        homeLeft,
        transitionProperty: getComputedStyle(logo).transitionProperty,
      };
    });

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--collapsed/,
  );
  const compact = await measureLogoAnchor();
  expect(
    Math.abs(compact.logoMarkCenter - compact.collapseSurfaceCenter),
  ).toBeLessThan(1);

  const resizeRail = page.getByRole("separator", { name: "Resize sidebar" });
  const resizeRailBox = await resizeRail.boundingBox();
  if (!resizeRailBox)
    throw new Error("Expected a measurable sidebar resize rail");

  const railX = resizeRailBox.x + resizeRailBox.width / 2;
  const railY = resizeRailBox.y + Math.min(280, resizeRailBox.height / 2);
  await page.mouse.move(railX, railY);
  await page.mouse.down();
  await page.mouse.move(railX + 40, railY, { steps: 4 });
  await expect(page.locator(".courses-app")).toHaveClass(
    /courses-app--resize-content-visible/,
  );
  const dragging = await measureLogoAnchor();
  await page.mouse.move(railX + 170, railY, { steps: 4 });
  await page.mouse.up();

  await expect(page.locator(".courses-app")).not.toHaveClass(
    /courses-app--collapsed/,
  );
  const expanded = await measureLogoAnchor();

  for (const state of [compact, dragging, expanded]) {
    expect(Math.abs(state.logoLeft - state.homeLeft)).toBeLessThan(1);
    expect(state.transitionProperty).toBe("none");
  }
  expect(Math.abs(dragging.logoLeft - compact.logoLeft)).toBeLessThan(1);
  expect(Math.abs(expanded.logoLeft - compact.logoLeft)).toBeLessThan(1);
});

test("learning settings save a coherent preference object", async ({
  page,
}) => {
  await openApp(page, "/settings/learning");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "learning",
  );

  await expect(
    page.getByRole("switch", { name: "Autoplay next lecture" }),
  ).toHaveCount(0);

  const lessonPageScrollbar = page.getByRole("switch", {
    name: "Show lesson page scrollbar",
  });
  const curriculumScrollbar = page.getByRole("switch", {
    name: "Show course content scrollbar",
  });
  const skipInterval = page.getByRole("button", {
    name: "Skip interval: 10 seconds (Default)",
  });
  await skipInterval.click();
  await page.getByRole("option", { name: "30 seconds" }).click();
  await expect(lessonPageScrollbar).toHaveAttribute("aria-checked", "true");
  await expect(curriculumScrollbar).toHaveAttribute("aria-checked", "true");
  await lessonPageScrollbar.click();
  await curriculumScrollbar.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-lesson-page-scrollbar",
    "hidden",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-curriculum-scrollbar",
    "hidden",
  );

  const reminders = page.getByRole("switch", { name: "Learning reminders" });
  if ((await reminders.getAttribute("aria-checked")) !== "true")
    await reminders.click();
  await page.getByRole("button", { name: "Sat", exact: true }).click();

  const stored = await page.evaluate(() => {
    const storedPreferences = localStorage.getItem(
      "veolms-learning-preferences",
    );
    return storedPreferences ? JSON.parse(storedPreferences) : null;
  });
  expect(stored).not.toBeNull();
  if (!stored) throw new Error("Expected learning preferences to be stored");
  expect(stored).not.toHaveProperty("autoplayNextLecture");
  expect(stored.learningReminders).toBe(true);
  expect(stored.reminderDays).toContain("sat");
  expect(stored.showLessonPageScrollbar).toBe(false);
  expect(stored.showCurriculumScrollbar).toBe(false);
  expect(stored.seekIntervalSeconds).toBe(30);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(lessonPageScrollbar).toHaveAttribute("aria-checked", "false");
  await expect(curriculumScrollbar).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("button", { name: "Skip interval: 30 seconds" }),
  ).toBeVisible();
});
