import assert from "node:assert/strict";
import { test } from "node:test";

import { orderItemSummarySchema } from "@veolms/contracts";

import { orderItemInvoiceTitle, toOrderItemDisplay } from "./order.mapper.ts";

const partRow = {
  title_snapshot: "Master TypeScript Core Concepts",
  course_id: "00000000-0000-4000-8000-000000000001",
  course_title: "Master TypeScript Core Concepts",
  opens_course_id: "00000000-0000-4000-8000-000000000002",
  opens_course_title: "The Ultimate TypeScript Course",
  open_sections: 15,
  total_sections: 24,
  completes_part: false,
};

await test("part of a course is named by the course it opens, and how much of it", () => {
  const display = toOrderItemDisplay(partRow);
  assert.deepEqual(display, {
    kind: "partial_access",
    courseTitle: "The Ultimate TypeScript Course",
    openSections: 15,
    totalSections: 24,
  });
  assert.equal(
    orderItemInvoiceTitle(partRow),
    "The Ultimate TypeScript Course — Partial access (15 of 24 sections)",
  );
  assert.ok(
    orderItemSummarySchema.safeParse({
      titleSnapshot: partRow.title_snapshot,
      courseId: partRow.course_id,
      display,
    }).success,
  );
});

await test("the course bought after part of it is named by the course, as an upgrade", () => {
  const row = {
    title_snapshot:
      "The Ultimate TypeScript Course (upgrade from Master TypeScript Core Concepts)",
    course_id: "00000000-0000-4000-8000-000000000002",
    course_title: "The Ultimate TypeScript Course",
    opens_course_id: null,
    opens_course_title: null,
    open_sections: null,
    total_sections: null,
    completes_part: true,
  };
  assert.deepEqual(toOrderItemDisplay(row), {
    kind: "upgrade",
    courseTitle: "The Ultimate TypeScript Course",
  });
  assert.equal(
    orderItemInvoiceTitle(row),
    "The Ultimate TypeScript Course — Upgrade to full access",
  );
});

await test("any other item keeps its stored title", () => {
  const row = {
    title_snapshot: "Complete Backend with Node.js",
    course_id: "00000000-0000-4000-8000-000000000003",
    course_title: "Complete Backend with Node.js",
    opens_course_id: null,
    opens_course_title: null,
    open_sections: null,
    total_sections: null,
    completes_part: false,
  };
  assert.equal(toOrderItemDisplay(row), undefined);
  assert.equal(orderItemInvoiceTitle(row), "Complete Backend with Node.js");
});

await test("an unlisted course that opens a whole course is not called partial", () => {
  const row = { ...partRow, open_sections: null, total_sections: null };
  assert.equal(toOrderItemDisplay(row), undefined);
  assert.equal(orderItemInvoiceTitle(row), partRow.title_snapshot);
});
