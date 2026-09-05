import { test, expect } from "./app.fixture.ts";
import {
  clickLearningMinimize,
  installBaselineState,
  openApp,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("Learning Space keeps course sessions usable across desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await openApp(
    page,
    "/learn/typescript-course/the-design-mindset?from=courses",
  );
  const desktopSidebar = page.locator(".courses-sidebar");
  const desktopLearningSpace = desktopSidebar.getByRole("region", {
    name: "Learning Space",
  });
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Collapse Learning Space, 1 open session",
    }),
  ).toBeVisible();
  await expect(
    desktopSidebar.locator(".courses-nav [aria-current='page']"),
  ).toHaveCount(0);
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: /Open The Ultimate TypeScript Course/,
    }),
  ).toHaveAttribute("aria-current", "page");

  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Collapse Learning Space, 2 open sessions",
    }),
  ).toBeVisible();

  await openApp(page, "/learn/javascript-course/tools-overview?from=courses");
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Collapse Learning Space, 3 open sessions",
    }),
  ).toBeVisible();
  await expect(desktopLearningSpace.getByRole("listitem")).toHaveCount(3);
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: /Open The Complete JavaScript Course/,
    }),
  ).toHaveAttribute("aria-current", "page");

  await desktopLearningSpace
    .getByRole("button", { name: /Open The Ultimate TypeScript Course/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=courses$/,
  );
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: /Open The Ultimate TypeScript Course/,
    }),
  ).toHaveAttribute("aria-current", "page");

  await desktopSidebar.getByRole("button", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator("[data-learning-mini-player]")).toBeVisible();
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: /Open The Ultimate TypeScript Course/,
    }),
  ).toHaveAttribute("aria-current", "page");
  await desktopLearningSpace
    .getByRole("button", { name: /Open The Ultimate TypeScript Course/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=courses$/,
  );

  const disclosure = desktopLearningSpace.getByRole("button", {
    name: "Collapse Learning Space, 3 open sessions",
  });
  await disclosure.click();
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Expand Learning Space, 3 open sessions",
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(desktopLearningSpace.getByRole("list")).toHaveCount(0);

  await page.reload();
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Expand Learning Space, 3 open sessions",
    }),
  ).toBeVisible();
  await desktopLearningSpace
    .getByRole("button", {
      name: "Expand Learning Space, 3 open sessions",
    })
    .click();

  await page.setViewportSize({ width: 1180, height: 779 });
  await desktopLearningSpace
    .getByRole("button", {
      name: "More actions for Complete Backend with Node.js",
    })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/typescript-course\/the-design-mindset\?from=courses$/,
  );
  const sessionMenu = page.getByRole("menu", {
    name: "Complete Backend with Node.js session actions",
  });
  await expect(sessionMenu).toBeVisible();
  expect(
    await sessionMenu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        parentIsBody: element.parentElement === document.body,
        position: window.getComputedStyle(element).position,
        zIndex: Number(window.getComputedStyle(element).zIndex),
        insideViewport:
          bounds.top >= 0 &&
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight,
      };
    }),
  ).toEqual({
    parentIsBody: true,
    position: "fixed",
    zIndex: 1_000_000,
    insideViewport: true,
  });

  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(sessionMenu).toBeHidden();

  await desktopLearningSpace
    .getByRole("button", {
      name: "More actions for Complete Backend with Node.js",
    })
    .click();
  await page.getByRole("menuitem", { name: "Close session" }).click();
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: "Collapse Learning Space, 2 open sessions",
    }),
  ).toBeVisible();
  await expect(
    desktopLearningSpace.getByRole("button", {
      name: /Open Complete Backend with Node\.js/,
    }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "More navigation options" }).click();
  const mobileMenu = page.getByRole("dialog", { name: /More/ });
  const mobileLearningSpace = mobileMenu.getByRole("region", {
    name: "Learning Space",
  });
  await expect(mobileLearningSpace).toBeVisible();
  await expect(
    mobileLearningSpace.getByRole("button", {
      name: "Collapse Learning Space, 2 open sessions",
    }),
  ).toBeVisible();

  await mobileLearningSpace
    .getByRole("button", { name: /Open The Complete JavaScript Course/ })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/javascript-course\/tools-overview\?from=courses$/,
  );
  await expect(mobileMenu).toBeHidden();
});

test("Learning Space highlights the course while the mini player is playing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const trigger = page.getByRole("button", { name: /Learning Space,/ });
  await trigger.hover();
  const session = page.getByRole("button", {
    name: /Open Complete Backend with Node\.js/,
  });
  await expect(session).toHaveAttribute("aria-current", "page");

  await clickLearningMinimize(page);
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator("[data-learning-mini-player]")).toBeVisible();

  await trigger.hover();
  await expect(session).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("article", {
      name: /Currently playing, Complete Backend with Node\.js/,
    }),
  ).toBeVisible();
});

test("mini player first section sits flush without rounded corners", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );
  await clickLearningMinimize(page);
  await expect(page.locator("[data-learning-mini-player]")).toBeVisible();

  await page.getByRole("button", { name: "Expand curriculum menu" }).click();
  const curriculum = page.locator(
    "[data-learning-mini-player] .learning-curriculum",
  );
  const firstSection = page
    .locator("[data-learning-mini-player] .learning-curriculum__section-toggle")
    .first();
  await expect(curriculum).toBeVisible();
  await expect(firstSection).toBeVisible();
  await expect(curriculum).toHaveCSS("border-radius", "0px");
  await expect(firstSection).toHaveCSS("border-radius", "0px");
});
