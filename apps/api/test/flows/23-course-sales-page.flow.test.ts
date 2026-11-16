/**
 * The course page's ready sections (creator-features/39-sales-page-sections-plan.md):
 * only staff who may edit the course's details change them; what a visitor's
 * page gets (the public curriculum, which the pre-built page is made from)
 * holds only switched-on sections with something in them, in the creator's
 * order; testimonials wait for "these are real"; text that breaks the rules
 * is refused; the search title and description reach the page.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { createCourse } from "./setup/flow-courses.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";
import {
  signedUpLearner,
  startFlowApp,
  type FlowResponse,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const adminAccount = await signedUpLearner(flow, "salesadmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);
const learner = await signedUpLearner(flow, "salesviewer");
const visitor = flow.visitor();
const course = await createCourse(flow, { title: "Sales Page Flow Course" });

interface PublicSection {
  kind: string;
  items?: unknown[];
}
interface SalesPage {
  sections: PublicSection[];
  seo: { title: string | null; description: string | null };
}

function ok<T>(response: FlowResponse<T>, status = 200): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

const sectionsPath = `/v1/courses/${course.id}/page-sections`;

/** What a visitor's course page is built from. */
async function publicSalesPage(): Promise<SalesPage> {
  const data = ok<{ salesPage?: SalesPage }>(
    await visitor.get(`/v1/courses/${course.slug}/curriculum`),
  );
  assert.ok(data.salesPage, "the public curriculum carries the sales page");
  return data.salesPage;
}

test.after(async () => {
  await flow.close();
});

test("only staff who may edit the course's details change its sales page", async () => {
  assert.equal((await visitor.get(sectionsPath)).status, 401);
  assert.equal((await learner.client.get(sectionsPath)).status, 403);
  assert.equal(
    (
      await learner.client.put(`${sectionsPath}/faq`, {
        content: { items: [] },
      })
    ).status,
    403,
  );
  ok(await admin.get(sectionsPath));
});

test("a course nobody has touched keeps today's page: the curriculum, then About", async () => {
  const page = await publicSalesPage();
  assert.deepEqual(
    page.sections.map((section) => section.kind),
    ["curriculum", "about"],
  );
  assert.deepEqual(page.seo, { title: null, description: null });
});

test("filled, switched-on sections reach the page in the creator's order", async () => {
  ok(
    await admin.put(`${sectionsPath}/outcomes`, {
      content: { items: ["Build a REST API", "", "Deploy it"] },
    }),
  );
  ok(
    await admin.put(`${sectionsPath}/faq`, {
      content: {
        items: [
          { id: "q1", question: "Do I get a certificate?", answer: "Yes." },
          { id: "q2", question: "Half-written", answer: "" },
        ],
      },
    }),
  );
  ok(
    await admin.put(`${sectionsPath}/requirements`, {
      content: { items: ["A laptop"] },
    }),
  );
  ok(await admin.put(`${sectionsPath}/requirements`, { isVisible: false }));

  const testimonial = {
    id: "t1",
    name: "Ravi",
    detail: "Got a job",
    quote: "It changed how I code.",
    photoUrl: null,
  };
  ok(
    await admin.put(`${sectionsPath}/testimonials`, {
      content: { items: [testimonial], confirmedGenuine: false },
    }),
  );

  let page = await publicSalesPage();
  assert.deepEqual(
    page.sections.map((section) => section.kind),
    ["outcomes", "curriculum", "about", "faq"],
    "hidden requirements, unconfirmed testimonials and empty sections stay off",
  );
  assert.deepEqual(page.sections[0]?.items, ["Build a REST API", "Deploy it"]);
  assert.equal(
    page.sections.at(-1)?.items?.length,
    1,
    "only answered questions",
  );

  ok(
    await admin.put(`${sectionsPath}/testimonials`, {
      content: { items: [testimonial], confirmedGenuine: true },
    }),
  );
  const editor = ok<{ sections: { kind: string }[] }>(
    await admin.put(`/v1/courses/${course.id}/page-sections-order`, {
      kinds: [
        "faq",
        "testimonials",
        "outcomes",
        "curriculum",
        "about",
        "audience",
        "requirements",
        "instructor",
        "guarantee",
      ],
    }),
  );
  assert.equal(editor.sections[0]?.kind, "faq");

  page = await publicSalesPage();
  assert.deepEqual(
    page.sections.map((section) => section.kind),
    ["faq", "testimonials", "outcomes", "curriculum", "about"],
  );
});

test("the instructor's section waits to be switched on, then shows their name and bio", async () => {
  // The course's creator's profile bio, which the section shows unless the
  // creator writes one just for this page.
  await flow.database
    .updateTable("users")
    .set({ bio: "Teaches backend for a living." })
    .where("id", "=", FLOW_ADMIN.id)
    .execute();
  try {
    let page = await publicSalesPage();
    assert.ok(!page.sections.some((section) => section.kind === "instructor"));
    ok(await admin.put(`${sectionsPath}/instructor`, { isVisible: true }));
    page = await publicSalesPage();
    const instructor = page.sections.find(
      (section) => section.kind === "instructor",
    ) as { instructor?: { name: string; bio: string } } | undefined;
    assert.equal(instructor?.instructor?.name, FLOW_ADMIN.display_name);
    assert.equal(instructor?.instructor?.bio, "Teaches backend for a living.");

    ok(
      await admin.put(`${sectionsPath}/instructor`, {
        content: { headline: "", bio: "Written for this course." },
      }),
    );
    page = await publicSalesPage();
    const written = page.sections.find(
      (section) => section.kind === "instructor",
    ) as { instructor?: { bio: string } } | undefined;
    assert.equal(written?.instructor?.bio, "Written for this course.");
  } finally {
    await flow.database
      .updateTable("users")
      .set({ bio: null })
      .where("id", "=", FLOW_ADMIN.id)
      .execute();
  }
});

test("text that breaks the rules is refused, and nothing changes", async () => {
  const tooLong = "x".repeat(200);
  assert.equal(
    (
      await admin.put(`${sectionsPath}/outcomes`, {
        content: { items: [tooLong] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin.put(`${sectionsPath}/testimonials`, {
        content: {
          items: [
            {
              id: "t2",
              name: "A",
              detail: "",
              quote: "B",
              photoUrl: "http://example.com/a.png",
            },
          ],
          confirmedGenuine: true,
        },
      })
    ).status,
    400,
    "photos must be https",
  );
  assert.equal(
    (await admin.put(`${sectionsPath}/curriculum`, { isVisible: false }))
      .status,
    400,
    "the curriculum can move but not hide",
  );
  assert.equal(
    (
      await admin.put(`/v1/courses/${course.id}/page-sections-order`, {
        kinds: ["faq", "about"],
      })
    ).status,
    400,
    "a new order names every section",
  );
  const page = await publicSalesPage();
  const outcomes = page.sections.find((section) => section.kind === "outcomes");
  assert.deepEqual(outcomes?.items, ["Build a REST API", "Deploy it"]);
});

test("the search title and description reach the page", async () => {
  ok(
    await admin.put(`${sectionsPath}/seo`, {
      content: {
        title: "Node.js Backend Course",
        description: "Learn backend with Node.js.",
      },
    }),
  );
  assert.equal(
    (
      await admin.put(`${sectionsPath}/seo`, {
        content: { title: "x".repeat(71), description: "" },
      })
    ).status,
    400,
  );
  const page = await publicSalesPage();
  assert.deepEqual(page.seo, {
    title: "Node.js Backend Course",
    description: "Learn backend with Node.js.",
  });
});
