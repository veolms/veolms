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

export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 });
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
}

export async function getApplicationScrollTop(page: Page) {
  return page.evaluate(() => window.scrollY);
}

export async function setApplicationScrollTop(page: Page, top: number) {
  await page.evaluate(
    (scrollTop) =>
      window.scrollTo({
        top: scrollTop,
        behavior: "instant" as ScrollBehavior,
      }),
    top,
  );
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
