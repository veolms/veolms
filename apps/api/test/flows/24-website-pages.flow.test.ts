/**
 * Website pages (creator-features/40): an administrator adds a page from a
 * template, edits its draft (autosaved, with a guard against two tabs),
 * publishes it, changes it again, rolls back, switches the theme and takes
 * it down. Visitors read only the live page, as plain HTML with no script.
 * Learners and visitors cannot change anything.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import {
  signedUpLearner,
  startFlowApp,
  type FlowResponse,
} from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
// An administrator of their own: the main admin's sign-in codes for the day
// are used up by the files before this one.
const adminAccount = await signedUpLearner(flow, "siteadmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);
const { client: learner } = await signedUpLearner(flow, "sitelearner");
const visitor = flow.visitor();

const published = await createCourse(flow, {
  title: "Flow site course",
  price: 499,
});
const unpublished = await createCourse(flow, {
  title: "Flow hidden course",
  status: "draft",
});

const suffix = crypto.randomUUID().slice(0, 8);
const homeSlug = `home-${suffix}`;
const offerSlug = `offer-${suffix}`;

interface Section {
  id: string;
  type: string;
  layout: string;
  settings: Record<string, unknown>;
}
interface Document {
  schemaVersion: 1;
  seo: { title: string; description: string };
  sections: Section[];
}
interface PageResponse {
  page: {
    id: string;
    slug: string;
    status: "draft" | "published" | "changed";
    livePath: string | null;
  };
  document: Document;
  draftUpdatedAt: string;
  versions: { id: string; number: number; isLive: boolean }[];
}

function ok<T>(response: FlowResponse<T>, status = 200): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

async function livePage(slug: string) {
  const response = await visitor.get(`/v1/site/p/${slug}`);
  return {
    status: response.status,
    html: String(response.body.raw ?? ""),
    headers: response.headers,
  };
}

function withHeading(document: Document, heading: string): Document {
  return {
    ...document,
    sections: document.sections.map((section) =>
      section.type === "hero"
        ? { ...section, settings: { ...section.settings, heading } }
        : section,
    ),
  };
}

let home: PageResponse;

test.after(async () => {
  // Leave the site as the other files expect it.
  await admin.put("/v1/site/look", { themeId: "coach", colourMode: "system" });
  await flow.close();
});

test("an administrator adds a home page from its template, as a draft", async () => {
  home = ok(
    await admin.post<PageResponse>("/v1/site/pages", {
      title: "Welcome",
      slug: homeSlug,
      type: "home",
    }),
    201,
  );
  assert.equal(home.page.status, "draft");
  assert.equal(home.page.livePath, null);
  assert.deepEqual(
    home.document.sections.map((section) => section.type),
    ["hero", "features", "courses", "testimonials", "faq", "cta", "footer"],
  );

  const overview = ok(
    await admin.get<{ pages: { id: string }[]; look: { themeId: string } }>(
      "/v1/site",
    ),
  );
  assert.ok(overview.pages.some((page) => page.id === home.page.id));

  // Not live yet.
  assert.equal((await livePage(homeSlug)).status, 404);
});

test("two pages can't share an address", async () => {
  const response = await admin.post("/v1/site/pages", {
    title: "Again",
    slug: homeSlug,
    type: "blank",
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error?.code, "SITE_PAGE_SLUG_TAKEN");
});

test("learners and visitors can't read or change the site", async () => {
  assert.equal((await learner.get("/v1/site")).status, 403);
  assert.equal(
    (await learner.post(`/v1/site/pages/${home.page.id}/publish`)).status,
    403,
  );
  assert.equal(
    (await visitor.get(`/v1/site/pages/${home.page.id}`)).status,
    401,
  );
  assert.equal(
    (
      await visitor.put("/v1/site/look", {
        themeId: "tech",
        colourMode: "dark",
      })
    ).status,
    401,
  );
});

test("the draft autosaves, and a stale tab can't overwrite a newer save", async () => {
  const renamed = withHeading(home.document, "Learn <fast> & well");
  const picked: Document = {
    ...renamed,
    sections: renamed.sections.map((section) =>
      section.type === "courses"
        ? {
            ...section,
            settings: {
              ...section.settings,
              source: "picked",
              courseIds: [published.id, unpublished.id],
            },
          }
        : section,
    ),
  };
  const saved = ok(
    await admin.put<PageResponse>(`/v1/site/pages/${home.page.id}/draft`, {
      document: picked,
      baseUpdatedAt: home.draftUpdatedAt,
    }),
  );
  assert.notEqual(saved.draftUpdatedAt, home.draftUpdatedAt);

  // A second tab still holding the first version.
  const stale = await admin.put(`/v1/site/pages/${home.page.id}/draft`, {
    document: withHeading(home.document, "Old tab"),
    baseUpdatedAt: home.draftUpdatedAt,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error?.code, "SITE_DRAFT_CONFLICT");
  home = saved;
});

test("a link that could run script is refused", async () => {
  const response = await admin.put(`/v1/site/pages/${home.page.id}/draft`, {
    document: {
      ...home.document,
      sections: home.document.sections.map((section) =>
        section.type === "cta"
          ? {
              ...section,
              settings: {
                ...section.settings,
                button: {
                  label: "Click",
                  link: { kind: "url", href: "javascript:alert(1)" },
                },
              },
            }
          : section,
      ),
    },
    baseUpdatedAt: home.draftUpdatedAt,
  });
  assert.equal(response.status, 400);
});

test("publishing makes the page live as plain HTML with its courses", async () => {
  home = ok(
    await admin.post<PageResponse>(`/v1/site/pages/${home.page.id}/publish`),
  );
  assert.equal(home.page.status, "published");
  assert.equal(home.page.livePath, `/site/p/${homeSlug}`);
  assert.deepEqual(
    home.versions.map((version) => [version.number, version.isLive]),
    [[1, true]],
  );

  const live = await livePage(homeSlug);
  assert.equal(live.status, 200);
  assert.match(String(live.headers["content-type"]), /text\/html/u);
  assert.match(
    String(live.headers["content-security-policy"]),
    /default-src 'none'/u,
  );
  assert.ok(!/<script/iu.test(live.html), "no script on the page");
  // The creator's words are escaped, never markup.
  assert.ok(live.html.includes("Learn &lt;fast&gt; &amp; well"));
  // The published course shows with its price; the draft course doesn't.
  assert.ok(live.html.includes("Flow site course"));
  assert.ok(live.html.includes("₹499"));
  assert.ok(!live.html.includes("Flow hidden course"));
  // Testimonials are hidden until marked as real.
  assert.ok(!live.html.includes("vp-testimonials"));
});

test("later edits stay in the draft until published again", async () => {
  home = ok(
    await admin.put<PageResponse>(`/v1/site/pages/${home.page.id}/draft`, {
      document: withHeading(home.document, "Second version"),
      baseUpdatedAt: home.draftUpdatedAt,
    }),
  );
  assert.equal(home.page.status, "changed");
  assert.ok((await livePage(homeSlug)).html.includes("Learn &lt;fast&gt;"));

  home = ok(
    await admin.post<PageResponse>(`/v1/site/pages/${home.page.id}/publish`),
  );
  assert.equal(home.page.status, "published");
  assert.ok((await livePage(homeSlug)).html.includes("Second version"));
  assert.deepEqual(
    home.versions.map((version) => version.number),
    [2, 1],
  );
});

test("rolling back puts the earlier version live and keeps the draft", async () => {
  const first = home.versions.find((version) => version.number === 1)!;
  home = ok(
    await admin.post<PageResponse>(
      `/v1/site/pages/${home.page.id}/versions/${first.id}/restore`,
    ),
  );
  assert.equal(home.page.status, "changed");
  assert.equal(home.versions.find((version) => version.isLive)?.number, 1);
  const live = await livePage(homeSlug);
  assert.ok(live.html.includes("Learn &lt;fast&gt;"));
  assert.ok(!live.html.includes("Second version"));
  // The draft still holds the newest words.
  assert.equal(
    home.document.sections.find((section) => section.type === "hero")?.settings
      .heading,
    "Second version",
  );
});

test("a new theme restyles every live page and keeps its words", async () => {
  ok(await admin.put("/v1/site/look", { themeId: "tech", colourMode: "dark" }));
  const live = await livePage(homeSlug);
  assert.ok(live.html.includes('data-mode="dark"'));
  // The Tech theme's dark page colour.
  assert.ok(live.html.includes("--bg:#0b1020"));
  assert.ok(live.html.includes("Learn &lt;fast&gt;"));
});

test("a button to another page follows it when its address changes", async () => {
  const offer = ok(
    await admin.post<PageResponse>("/v1/site/pages", {
      title: "Diwali offer",
      slug: offerSlug,
      type: "landing",
    }),
    201,
  );
  ok(await admin.post(`/v1/site/pages/${offer.page.id}/publish`));
  const linked: Document = {
    ...home.document,
    sections: home.document.sections.map((section) =>
      section.type === "cta"
        ? {
            ...section,
            settings: {
              ...section.settings,
              button: {
                label: "See the offer",
                link: { kind: "page", pageId: offer.page.id },
              },
            },
          }
        : section,
    ),
  };
  home = ok(
    await admin.put<PageResponse>(`/v1/site/pages/${home.page.id}/draft`, {
      document: linked,
      baseUpdatedAt: home.draftUpdatedAt,
    }),
  );
  ok(await admin.post(`/v1/site/pages/${home.page.id}/publish`));
  assert.ok((await livePage(homeSlug)).html.includes(`href="./${offerSlug}"`));

  const renamed = `${offerSlug}-2`;
  ok(await admin.patch(`/v1/site/pages/${offer.page.id}`, { slug: renamed }));
  assert.ok((await livePage(homeSlug)).html.includes(`href="./${renamed}"`));
  assert.equal((await livePage(renamed)).status, 200);
  assert.equal((await livePage(offerSlug)).status, 404);

  // Deleting the page drops the button that pointed at it.
  ok(await admin.delete(`/v1/site/pages/${offer.page.id}`));
  assert.ok(!(await livePage(homeSlug)).html.includes("See the offer"));
});

test("taking a page down hides it but keeps its versions", async () => {
  home = ok(
    await admin.post<PageResponse>(`/v1/site/pages/${home.page.id}/unpublish`),
  );
  assert.equal(home.page.status, "draft");
  assert.equal((await livePage(homeSlug)).status, 404);
  assert.ok(home.versions.length >= 2);

  ok(await admin.delete(`/v1/site/pages/${home.page.id}`));
  assert.equal((await admin.get(`/v1/site/pages/${home.page.id}`)).status, 404);
});
