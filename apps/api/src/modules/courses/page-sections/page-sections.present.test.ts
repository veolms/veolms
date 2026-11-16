import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_COURSE_PAGE_ORDER } from "@veolms/contracts";

import {
  presentEditorSections,
  presentPublicSalesPage,
} from "./page-sections.present.ts";
import type { SectionRow } from "./page-sections.repository.ts";

const at = new Date("2026-11-16T10:00:00Z");
const row = (
  kind: SectionRow["kind"],
  content: Record<string, unknown>,
  extra: Partial<SectionRow> = {},
): SectionRow => ({
  kind,
  position: 0,
  is_visible: true,
  content,
  updated_at: at,
  ...extra,
});

const instructor = {
  name: "Asha Rao",
  headline: "",
  bio: "Teaches backend.",
  avatarUrl: null,
};

await test("a course with nothing saved gets every section, in the default order", () => {
  const { sections, seo } = presentEditorSections([]);
  assert.deepEqual(
    sections.map((section) => section.kind),
    [...DEFAULT_COURSE_PAGE_ORDER],
  );
  assert.deepEqual(seo, { title: "", description: "" });
});

await test("the public page shows only switched-on sections with something in them", () => {
  const page = presentPublicSalesPage(
    [
      row("outcomes", { items: ["Build an API", "  ", ""] }),
      row("requirements", { items: ["A laptop"] }, { is_visible: false }),
      row("faq", {
        items: [{ id: "a", question: "Certificate?", answer: "" }],
      }),
      row("guarantee", { title: "7-day refund", text: "" }),
    ],
    instructor,
  );
  assert.deepEqual(
    page.sections.map((section) => section.kind),
    // The instructor's section waits to be switched on.
    ["outcomes", "curriculum", "about", "guarantee"],
  );
  const outcomes = page.sections[0];
  assert.deepEqual(outcomes, { kind: "outcomes", items: ["Build an API"] });
});

await test("testimonials stay off the page until the creator confirms they are real", () => {
  const items = [
    { id: "t", name: "Ravi", detail: "", quote: "Loved it", photoUrl: null },
  ];
  const unconfirmed = presentPublicSalesPage(
    [row("testimonials", { items, confirmedGenuine: false })],
    instructor,
  );
  assert.ok(
    !unconfirmed.sections.some((section) => section.kind === "testimonials"),
  );
  const confirmed = presentPublicSalesPage(
    [row("testimonials", { items, confirmedGenuine: true })],
    instructor,
  );
  assert.ok(
    confirmed.sections.some((section) => section.kind === "testimonials"),
  );
});

await test("the instructor section follows the instructor: hidden name, no section", () => {
  const page = presentPublicSalesPage(
    [row("instructor", { headline: "Engineer", bio: "" })],
    null,
  );
  assert.ok(!page.sections.some((section) => section.kind === "instructor"));
  const shown = presentPublicSalesPage(
    [row("instructor", { headline: "Engineer", bio: "" })],
    instructor,
  );
  const section = shown.sections.find((item) => item.kind === "instructor");
  assert.deepEqual(section, {
    kind: "instructor",
    instructor: {
      ...instructor,
      headline: "Engineer",
      bio: "Teaches backend.",
    },
  });
});

await test("a creator's order wins over the default, and stored rubbish is ignored", () => {
  const kinds = [
    "faq",
    "about",
    "curriculum",
    "outcomes",
    "audience",
    "requirements",
    "instructor",
    "testimonials",
    "guarantee",
  ] as const;
  const rows = kinds.map((kind, position) =>
    row(kind, kind === "faq" ? { items: "not a list" } : {}, { position }),
  );
  const { sections } = presentEditorSections(rows);
  assert.deepEqual(
    sections.map((section) => section.kind),
    [...kinds],
  );
  const faq = sections.find((section) => section.kind === "faq");
  assert.deepEqual(faq?.content, { items: [] });
});

await test("search fields are offered only when filled in", () => {
  const page = presentPublicSalesPage(
    [row("seo", { title: "  Node.js Backend  ", description: "" })],
    instructor,
  );
  assert.deepEqual(page.seo, { title: "Node.js Backend", description: null });
});
