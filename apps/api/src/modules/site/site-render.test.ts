import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  SITE_PAGE_TYPES,
  SITE_SECTION_LAYOUTS,
  SITE_SECTION_TYPES,
  SITE_THEME_IDS,
  SITE_THEMES,
  contrastRatio,
  siteHrefSchema,
  sitePageDocumentSchema,
  themeTextPairs,
  type SiteCourseCard,
  type SitePageDocument,
  type SiteSection,
} from "@veolms/contracts";
import {
  MOTION_SCRIPT,
  newSection,
  pageTemplate,
  renderSectionHtml,
  renderSitePage,
  resolveLink,
  type SiteRenderContext,
} from "@veolms/site-render";
import { toCourseCard } from "./site-render-context.ts";
import { pageStatus, pickedCourseIds } from "./site.service.ts";

const COURSE: SiteCourseCard = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "react-basics",
  title: "React basics",
  summary: "Components and hooks.",
  imageUrl: "https://cdn.example.com/react.webp",
  priceLabel: "₹999",
  compareAtLabel: "₹1,999",
  lessons: 12,
};

function context(
  overrides: Partial<SiteRenderContext> = {},
): SiteRenderContext {
  return {
    mode: "live",
    academyName: "Asha Academy",
    year: 2026,
    courses: new Map([[COURSE.id, COURSE]]),
    latestCourses: [COURSE],
    pageSlugs: new Map([["22222222-2222-4222-8222-222222222222", "offer"]]),
    urls: {
      course: (slug) => `https://academy.example/courses/${slug}`,
      page: (slug) => `./${slug}`,
      catalog: "https://academy.example/courses",
      legal: (slug) => `https://academy.example/${slug}`,
    },
    ...overrides,
  };
}

function page(sections: SiteSection[]): SitePageDocument {
  return {
    schemaVersion: 1,
    seo: { title: "Home", description: "" },
    sections,
  };
}

void describe("site themes", () => {
  for (const id of SITE_THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      void test(`${id} (${mode}) keeps every text readable (WCAG 4.5:1)`, () => {
        for (const [label, foreground, background] of themeTextPairs(
          SITE_THEMES[id][mode],
        )) {
          const ratio = contrastRatio(foreground, background);
          assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}`);
        }
      });
    }
  }

  void test("every theme's default layouts exist", () => {
    for (const id of SITE_THEME_IDS) {
      for (const type of SITE_SECTION_TYPES) {
        const layout = SITE_THEMES[id].defaultLayouts[type];
        assert.ok(
          (SITE_SECTION_LAYOUTS[type] as readonly string[]).includes(layout),
          `${id} ${type} ${layout}`,
        );
      }
    }
  });
});

void describe("site page links", () => {
  void test("accepts web, mail, phone and same-site addresses", () => {
    for (const href of [
      "https://wa.me/919999999999",
      "http://example.com/a?b=c",
      "mailto:hello@example.com",
      "tel:+91 98765 43210",
      "/courses",
    ]) {
      assert.equal(siteHrefSchema.safeParse(href).success, true, href);
    }
  });

  void test("refuses addresses that could run script or leave quietly", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example",
      'https://example.com/"onmouseover="x',
      "vbscript:x",
    ]) {
      assert.equal(siteHrefSchema.safeParse(href).success, false, href);
    }
  });

  void test("a link that skipped validation still can't become javascript:", () => {
    assert.equal(
      resolveLink({ kind: "url", href: "javascript:alert(1)" }, context()),
      null,
    );
  });

  void test("course and page links follow the course and page, not a stored URL", () => {
    assert.equal(
      resolveLink({ kind: "course", courseId: COURSE.id }, context()),
      "https://academy.example/courses/react-basics",
    );
    assert.equal(
      resolveLink(
        { kind: "page", pageId: "22222222-2222-4222-8222-222222222222" },
        context(),
      ),
      "./offer",
    );
    // A deleted page or unpublished course: the button is left out.
    assert.equal(
      resolveLink(
        { kind: "page", pageId: "33333333-3333-4333-8333-333333333333" },
        context(),
      ),
      null,
    );
  });
});

void describe("site page rendering", () => {
  void test("escapes every word a creator writes", () => {
    const hero = newSection("hero", "coach", {
      heading: '<script>alert("x")</script>',
      subheading: 'Tom & Jerry\'s "best" <b>course</b>',
      image: {
        src: "https://cdn.example.com/a.webp",
        alt: '" onerror="alert(1)',
      },
    });
    const output = renderSectionHtml(hero, context());
    assert.ok(!output.includes("<script>"));
    assert.ok(
      output.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"),
    );
    assert.ok(output.includes("Tom &amp; Jerry&#39;s"));
    assert.ok(output.includes('alt="&quot; onerror=&quot;alert(1)"'));
  });

  void test("a live page's only script is the motion one, and only the CSS of its sections", () => {
    const { html } = renderSitePage({
      document: page([
        newSection("hero", "tech"),
        newSection("footer", "tech"),
      ]),
      look: { themeId: "tech", colourMode: "system" },
      context: context(),
    });
    assert.ok(html.startsWith("<!doctype html>"));
    assert.equal(html.match(/<script/giu)?.length, 1);
    assert.ok(html.includes(MOTION_SCRIPT));
    const still = renderSitePage({
      document: page([newSection("hero", "tech")]),
      look: { themeId: "tech", colourMode: "system", motion: "off" },
      context: context(),
    });
    assert.ok(!/<script/iu.test(still.html), "no script when motion is off");
    assert.ok(html.includes(".vp-hero"));
    assert.ok(!html.includes(".vp-faq"), "FAQ styles are not sent");
    assert.ok(html.includes('data-mode="system"'));
    assert.ok(html.includes("prefers-color-scheme:dark"));
  });

  void test("every template is a valid page, and every layout renders", () => {
    for (const type of SITE_PAGE_TYPES) {
      const document = pageTemplate(type, "Diwali offer", "coach");
      assert.equal(
        sitePageDocumentSchema.safeParse(document).success,
        true,
        type,
      );
    }
    for (const type of SITE_SECTION_TYPES) {
      for (const layout of SITE_SECTION_LAYOUTS[type]) {
        const section = {
          ...newSection(type, "minimal"),
          layout,
        } as SiteSection;
        assert.equal(
          sitePageDocumentSchema.safeParse(page([section])).success,
          true,
          `${type}/${layout}`,
        );
        const output = renderSectionHtml(section, context({ mode: "editor" }));
        assert.ok(
          output.includes(`vp-${type}--${layout}`),
          `${type}/${layout}`,
        );
      }
    }
  });

  void test("testimonials stay hidden until marked as real students' words", () => {
    const items = [{ quote: "Great", name: "Ravi", detail: "" }];
    const unconfirmed = newSection("testimonials", "coach", { items });
    assert.equal(renderSectionHtml(unconfirmed, context()), "");
    assert.match(
      renderSectionHtml(unconfirmed, context({ mode: "editor" })),
      /real students/u,
    );
    const confirmed = newSection("testimonials", "coach", {
      items,
      confirmedReal: true,
    });
    assert.match(renderSectionHtml(confirmed, context()), /Ravi/u);
  });

  void test("a course grid shows published courses and skips the rest", () => {
    const picked = newSection("courses", "coach", {
      source: "picked",
      courseIds: [COURSE.id, "44444444-4444-4444-8444-444444444444"],
    });
    const output = renderSectionHtml(picked, context());
    assert.equal(output.match(/class="vp-course"/gu)?.length, 1);
    assert.ok(output.includes("₹999"));
    const nothing = newSection("courses", "coach", {
      source: "picked",
      courseIds: [],
    });
    assert.equal(renderSectionHtml(nothing, context()), "", "no empty grid");
  });

  void test("records which courses a page shows, to refresh it later", () => {
    const document = page([
      newSection("courses", "coach", { source: "latest", limit: 3 }),
    ]);
    const { courseIds } = renderSitePage({
      document,
      look: { themeId: "coach", colourMode: "light" },
      context: context(),
    });
    assert.deepEqual(courseIds, [COURSE.id]);
  });
});

void describe("site service rules", () => {
  void test("finds courses picked by hand or linked from buttons", () => {
    const linkedId = "55555555-5555-4555-8555-555555555555";
    const document = page([
      newSection("courses", "coach", {
        source: "picked",
        courseIds: [COURSE.id],
      }),
      newSection("cta", "coach", {
        button: { label: "Join", link: { kind: "course", courseId: linkedId } },
      }),
    ]);
    assert.deepEqual(
      pickedCourseIds(document).sort(),
      [COURSE.id, linkedId].sort(),
    );
  });

  void test("a page is a draft, published, or published with changes", () => {
    assert.equal(
      pageStatus({ liveVersionId: null, draftIsLive: false }),
      "draft",
    );
    assert.equal(
      pageStatus({ liveVersionId: "v", draftIsLive: true }),
      "published",
    );
    assert.equal(
      pageStatus({ liveVersionId: "v", draftIsLive: false }),
      "changed",
    );
  });

  void test("course cards show free, sale and full prices", () => {
    const base = {
      id: COURSE.id,
      slug: "s",
      title: "T",
      shortDescription: "",
      totalSections: 1,
      totalLessons: 4,
      totalDurationSeconds: 0,
      certificateEnabled: false,
    };
    const pricing = {
      currency: "INR",
      showDiscountBadge: false,
      international: null,
    };
    const free = toCourseCard({
      ...base,
      pricing: { ...pricing, pricingType: "free", price: 0, salePrice: null },
    } as never);
    assert.equal(free.priceLabel, "Free");
    const sale = toCourseCard({
      ...base,
      pricing: {
        ...pricing,
        pricingType: "paid",
        price: 4999,
        salePrice: 2999,
      },
    } as never);
    assert.equal(sale.priceLabel, "₹2,999");
    assert.equal(sale.compareAtLabel, "₹4,999");
  });
});
