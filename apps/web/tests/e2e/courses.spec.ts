import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
  await openApp(page, "/explore-courses");
});

test("home replaces the duplicate TypeScript card with the enrolled JavaScript course", async ({
  page,
}) => {
  await openApp(page, "/");

  await expect(
    page
      .locator(".home-resume-card")
      .getByRole("heading", { name: "The Ultimate TypeScript Course" }),
  ).toBeVisible();

  const continueLearning = page.locator(".home-continue-panel");
  await expect(
    continueLearning.getByRole("heading", {
      name: "The Complete JavaScript Course",
    }),
  ).toBeVisible();
  await expect(
    continueLearning.getByRole("heading", {
      name: "The Ultimate TypeScript Course",
    }),
  ).toHaveCount(0);

  await continueLearning
    .getByRole("article")
    .filter({ hasText: "The Complete JavaScript Course" })
    .getByRole("button", { name: "Continue Learning" })
    .click();
  await expect(page).toHaveURL(
    /\/learn\/javascript-course\/[^/?]+\?from=home$/,
  );
  await expect(
    page.getByRole("heading", { name: "The Complete JavaScript Course" }),
  ).toBeVisible();
});

test("learning progress follows the selected application theme", async ({
  page,
}) => {
  const themeAccent = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
  const expectThemeProgress = async (selector: string) => {
    const javascriptCourse = page
      .getByRole("article")
      .filter({ hasText: "The Complete JavaScript Course" });
    const progressFill = javascriptCourse.locator(selector);

    await expect
      .poll(() =>
        progressFill.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .toBe(await themeAccent());
  };

  await expectThemeProgress(".course-progress__track > span");

  await openApp(page, "/my-courses");

  await expectThemeProgress(".learning-progress-track > span");

  await page
    .getByRole("button", { name: /mode active\. Switch to .* mode/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectThemeProgress(".learning-progress-track > span");

  await openApp(page, "/explore-courses");
  await expectThemeProgress(".course-progress__track > span");
});

test("course enrollment, search, category, and sort controls derive the visible catalogue", async ({
  page,
}) => {
  const grid = page.getByRole("region", { name: "Explore Courses" });
  await expect(grid.getByRole("article")).toHaveCount(7);

  await page.getByRole("tab", { name: "Enrolled", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(5);
  await page.getByRole("tab", { name: "Not Enrolled" }).click();
  await expect(grid.getByRole("article")).toHaveCount(2);
  await page.getByRole("tab", { name: "All" }).click();

  await page.getByPlaceholder("Search your courses...").fill("mongo");
  await expect(grid.getByRole("article")).toHaveCount(1);
  await expect(
    grid.getByRole("article", { name: /MongoDB & Database Design/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();

  await page.getByRole("button", { name: /^Filter by category:/ }).click();
  await page.getByRole("option", { name: "Development", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(3);
  await expect(
    grid.getByRole("article", { name: /Complete Backend with Node.js/ }),
  ).toBeVisible();
  await expect(
    grid.getByRole("article", { name: /The Ultimate TypeScript Course/ }),
  ).toBeVisible();
  await expect(
    grid.getByRole("article", { name: /The Complete JavaScript Course/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Filter by category:/ }).click();
  await page.getByRole("option", { name: "All Categories" }).click();
  await page.getByRole("button", { name: /^Sort courses:/ }).click();
  const titleSortOption = page.getByRole("option", {
    name: "Sort by: Title",
  });
  await titleSortOption.hover();
  const optionInsets = await titleSortOption.evaluate((option) => {
    const content = option.closest(".themed-select__content");
    if (!(content instanceof HTMLElement)) return null;
    const contentRect = content.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return {
      inlineStart: optionRect.left - contentRect.left,
      inlineEnd: contentRect.right - optionRect.right,
    };
  });
  expect(optionInsets).not.toBeNull();
  expect(optionInsets?.inlineStart).toBeCloseTo(1, 0);
  expect(optionInsets?.inlineEnd).toBeCloseTo(1, 0);
  await titleSortOption.click();
  await expect(grid.getByRole("heading", { level: 2 })).toHaveText([
    "AWS Cloud Practitioner Essentials",
    "Complete Backend with Node.js",
    "Figma UI Essentials",
    "MongoDB & Database Design",
    "The Complete JavaScript Course",
    "The Ultimate TypeScript Course",
    "UI/UX Design Mastery",
  ]);
});

test("wishlist state is shared across catalogue routes and survives reload", async ({
  page,
}) => {
  await page
    .getByRole("button", {
      name: "Add The Ultimate TypeScript Course to wishlist",
    })
    .click();
  await expectStoredValue(page, "veolms-wishlist", '["typescript-course"]');

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await expect(
    navigation.getByRole("button", { name: "Wishlist, 1 saved" }),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Wishlist, 1 saved" }).click();
  await expect(page).toHaveURL(/\/wishlist$/);

  const wishlist = page.getByRole("region", { name: "Wishlist" });
  await expect(wishlist.getByRole("article")).toHaveCount(1);
  await expect(
    wishlist.getByRole("article", { name: /The Ultimate TypeScript Course/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove The Ultimate TypeScript Course from wishlist",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Remove The Ultimate TypeScript Course from wishlist",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your wishlist is empty" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-wishlist", "[]");
});

test("unenrolled courses open their course overview from Explore Course", async ({
  page,
}) => {
  const figmaCourse = page.getByRole("article", {
    name: /Figma UI Essentials/,
  });

  await figmaCourse.getByRole("button", { name: "Explore Course" }).click();

  await expect(page).toHaveURL(
    /\/explore-courses\/figma-ui-essentials\/overview$/,
  );
  await expect(
    page.getByRole("heading", { name: "Course Overview", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
  ).toBeVisible();
});
