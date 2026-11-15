/**
 * Legal pages (Platform > Legal pages): every visitor reads each page with
 * the academy's details filled in; an administrator rewrites a page, sees
 * what details are missing, and restores the default. Learners and visitors
 * cannot change them.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";

const flow = await startFlowApp();
// An administrator of their own: the main admin's sign-in codes for the day
// are used up by the files before this one.
const adminAccount = await signedUpLearner(flow, "legaladmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);
const { client: learner } = await signedUpLearner(flow, "legal");
const visitor = flow.visitor();

interface Content {
  title: string;
  description: string;
  heading: string;
  effective: string | null;
  markdown: string;
}
interface PublicPage extends Content {
  slug: string;
  customized: boolean;
  updatedAt: string | null;
}
interface AdminPage {
  slug: string;
  content: Content;
  defaultContent: Content;
  customized: boolean;
  values: Record<string, string>;
}
interface AdminList {
  pages: { slug: string; customized: boolean; missing: string[] }[];
  values: Record<string, string>;
}

function ok<T>(
  response: { status: number; body: { data?: T; error?: unknown } },
  status = 200,
): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

test.after(async () => {
  // Leave the academy as the other files expect it.
  await admin.delete("/v1/platform/legal-pages/contact");
  await admin.patch("/v1/platform/settings", {
    legal: {
      companyName: "",
      postalAddress: "",
      contactEmail: "",
      grievanceOfficer: "",
    },
  });
  await flow.close();
});

test("every visitor reads every page, with no placeholder left showing", async () => {
  for (const slug of [
    "terms",
    "privacy",
    "policies",
    "community-guidelines",
    "about",
    "contact",
    "delete-account",
  ]) {
    const page = ok<PublicPage>(await visitor.get(`/v1/legal-pages/${slug}`));
    assert.equal(page.slug, slug);
    assert.equal(page.customized, false);
    assert.ok(page.markdown.includes("## "), `${slug} has sections`);
    assert.ok(!/\{\{\s*[A-Za-z]+\s*\}\}/u.test(page.markdown), slug);
    assert.ok(!/\{\{\s*[A-Za-z]+\s*\}\}/u.test(page.title), slug);
  }
  assert.equal((await visitor.get("/v1/legal-pages/nope")).status, 400);
});

test("only administrators see the editing view or change a page", async () => {
  assert.equal((await visitor.get("/v1/platform/legal-pages")).status, 401);
  assert.equal((await learner.get("/v1/platform/legal-pages")).status, 403);
  const page = {
    title: "T",
    description: "",
    heading: "H",
    effective: null,
    markdown: "x",
  };
  assert.equal(
    (await learner.put("/v1/platform/legal-pages/terms", page)).status,
    403,
  );
  assert.equal(
    (await learner.delete("/v1/platform/legal-pages/terms")).status,
    403,
  );
});

test("the details fill the pages, and the list names those still missing", async () => {
  ok(
    await admin.patch("/v1/platform/settings", {
      legal: {
        companyName: "Flow Labs LLP",
        postalAddress: "1 Test Street\nTestville 560001",
        contactEmail: "hello@flow.example",
        grievanceOfficer: "",
      },
    }),
  );
  const contact = ok<PublicPage>(await visitor.get("/v1/legal-pages/contact"));
  assert.ok(contact.markdown.includes("Flow Labs LLP"));
  assert.ok(contact.markdown.includes("hello@flow.example"));
  assert.ok(contact.markdown.includes("1 Test Street"));

  const list = ok<AdminList>(await admin.get("/v1/platform/legal-pages"));
  assert.equal(list.values.companyName, "Flow Labs LLP");
  const listed = list.pages.find((page) => page.slug === "contact");
  assert.ok(listed?.missing.includes("grievanceOfficer"));
  assert.ok(!listed?.missing.includes("contactEmail"));
});

test("an administrator rewrites a page, and restores its default", async () => {
  const before = ok<AdminPage>(
    await admin.get("/v1/platform/legal-pages/contact"),
  );
  assert.equal(before.customized, false);
  assert.deepEqual(before.content, before.defaultContent);

  const saved = ok<AdminPage>(
    await admin.put("/v1/platform/legal-pages/contact", {
      title: "Write to {{academyName}}",
      description: "How to reach us.",
      heading: "Write to us",
      effective: null,
      markdown: "Say hello.\n\n## Email\n\nWrite to {{contactEmail}}.",
    }),
  );
  assert.equal(saved.customized, true);
  // Saved with its placeholders, so later detail changes reach it.
  assert.ok(saved.content.markdown.includes("{{contactEmail}}"));

  const read = ok<PublicPage>(await visitor.get("/v1/legal-pages/contact"));
  assert.equal(read.customized, true);
  assert.equal(read.heading, "Write to us");
  assert.ok(read.markdown.includes("Write to hello@flow.example."));
  assert.ok(!read.title.includes("{{"));

  const empty = await admin.put("/v1/platform/legal-pages/contact", {
    title: "",
    description: "",
    heading: "H",
    effective: null,
    markdown: "x",
  });
  assert.equal(empty.status, 400);

  const reset = ok<AdminPage>(
    await admin.delete("/v1/platform/legal-pages/contact"),
  );
  assert.equal(reset.customized, false);
  const back = ok<PublicPage>(await visitor.get("/v1/legal-pages/contact"));
  assert.equal(back.customized, false);
  assert.notEqual(back.heading, "Write to us");
});
