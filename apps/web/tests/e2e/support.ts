import { expect, type Page } from "@playwright/test";

type StorageName = "localStorage" | "sessionStorage";

interface BaselineState {
  local?: Record<string, string>;
  session?: Record<string, string>;
}

export const baselinePreferences: Readonly<Record<string, string>> = {
  "veolms-role": "student",
  "veolms-sidebar-mode": "expanded",
  "veolms-sidebar-collapsed": "false",
  "veolms-sidebar-width": "300",
  "veolms-theme": "dark",
  "veolms-academy-theme": "graphite",
  "veolms-academy-theme-version": "veo-onyx-default-v2",
  "veolms-wishlist": "[]",
  "veolms-reduce-animations": "true",
  "veolms-player-ambient": "off",
  "veolms-page-tab-colors": "follow-sidebar",
};

export async function installBaselineState(
  page: Page,
  overrides: BaselineState = {},
) {
  await page.addInitScript(
    (preferences) => {
      if (
        window.sessionStorage.getItem("veolms-test-baseline-ready") === "true"
      )
        return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      for (const [key, value] of Object.entries(preferences.local)) {
        window.localStorage.setItem(key, value);
      }
      for (const [key, value] of Object.entries(preferences.session)) {
        window.sessionStorage.setItem(key, value);
      }
      window.sessionStorage.setItem("veolms-test-baseline-ready", "true");
    },
    {
      local: { ...baselinePreferences, ...overrides.local },
      session: { ...overrides.session },
    },
  );
}

export async function activateDeferredVideo(page: Page) {
  const deferredPlay = page.locator(
    'button.youtube-player[aria-label^="Play "]',
  );
  if ((await deferredPlay.count()) === 0) return;
  await deferredPlay.first().click();
  await expect(deferredPlay).toHaveCount(0, { timeout: 15_000 });
}

export async function openApp(
  page: Page,
  path = "/",
  options: { activateVideo?: boolean } = {},
) {
  await page.goto(path);
  await expect(page.locator("[data-app-loading]")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator(".courses-app")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => image.currentSrc || image.src)
        .map((image) =>
          image.complete
            ? Promise.resolve()
            : image.decode?.().catch(() => undefined),
        ),
    );
  });

  if (options.activateVideo !== false && path.startsWith("/learn/")) {
    await activateDeferredVideo(page);
  }
}

export async function updateSidebarPreferences(
  page: Page,
  path: string,
  patch: Record<string, unknown>,
) {
  await page.evaluate((nextPatch) => {
    const current = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ ...current, ...nextPatch }),
    );
  }, patch);
  await openApp(page, path);
}

export async function expectAppearanceSettingsReady(page: Page) {
  await expect(page.getByRole("heading", { name: "Interface" })).toBeAttached({
    timeout: 15_000,
  });
  await expect(page.locator(".settings-reading-mode")).toBeAttached({
    timeout: 15_000,
  });
}

export async function clickLearningBack(page: Page, label: string) {
  await page.locator(".learning-workspace__player-wrap").hover();
  await page.getByRole("button", { name: label }).click();
}

type ApplicationScrollOperation =
  { kind: "read" } | { kind: "write"; top: number };

async function accessApplicationScrollTarget(
  page: Page,
  operation: ApplicationScrollOperation,
) {
  return page.evaluate((input) => {
    const main = document.querySelector<HTMLElement>("main.courses-main");
    const scrollTarget =
      main &&
      ["auto", "scroll", "overlay"].includes(getComputedStyle(main).overflowY)
        ? main
        : window;
    if (input.kind === "read") {
      return scrollTarget instanceof HTMLElement
        ? scrollTarget.scrollTop
        : scrollTarget.scrollY;
    }
    scrollTarget.scrollTo({
      top: input.top,
      behavior: "instant" as ScrollBehavior,
    });
  }, operation);
}

export async function getApplicationScrollTop(page: Page) {
  return (await accessApplicationScrollTarget(page, { kind: "read" })) ?? 0;
}

export async function setApplicationScrollTop(page: Page, top: number) {
  await accessApplicationScrollTarget(page, { kind: "write", top });
}

export async function expectStoredValue(
  page: Page,
  key: string,
  value: string,
  storage: StorageName = "localStorage",
) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageName, storageKey }) =>
          window[storageName].getItem(storageKey),
        { storageName: storage, storageKey: key },
      ),
    )
    .toBe(value);
}

export async function prepareVisualPage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
      video, .ambient-canvas { visibility: hidden !important; }
    `,
  });
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}
