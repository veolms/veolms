import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import type { AppServices } from "../../services/index.ts";
import { createLearningProgressService } from "./learning-progress.service.ts";

// Who may read and record progress on a course. Two findings meet here:
// B1 (an archived course keeps its learners) and section 26.2 item 1 (a
// published course with no pricing row let any signed-in learner in, while
// playback and discussions refused the same learner).

const COURSE = "00000000-0000-4000-8000-000000000002";
const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-0000000000aa";

interface Scenario {
  status: "draft" | "published" | "archived";
  /** `undefined` is a course with no pricing row. */
  pricingType?: "free" | "paid";
  accessType?: "everyone" | "restricted";
  grant?: { status: string; valid_until: Date | null };
}

/**
 * A database that answers each table's single-row read from the scenario
 * and every list with nothing. The access service and this module's own
 * repository run against it unchanged.
 */
function fakeDatabase(scenario: Scenario) {
  const rows: Record<string, unknown> = {
    access_grants: scenario.grant,
  };
  const builder = (table: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === "then") return undefined;
          if (key === "executeTakeFirst") return async () => rows[table];
          if (key === "execute") return async () => [];
          return () => builder(table);
        },
      },
    );
  return {
    selectFrom: (table: string) => builder(table),
  } as unknown as Kysely<Database>;
}

function build(scenario: Scenario) {
  const course = {
    id: COURSE,
    slug: "course-two",
    creator_id: OWNER,
    status: scenario.status,
  };
  return createLearningProgressService({
    database: fakeDatabase(scenario),
    services: {} as AppServices,
    courseService: {
      findCourseById: async () => course,
      findCourseBySlug: async () => course,
      // The course's rules and curriculum, as its shared content holds them.
      getCourseContent: async () => ({
        sections: [],
        lessons: [],
        accessRule: scenario.accessType
          ? { access_type: scenario.accessType }
          : null,
        pricing: scenario.pricingType
          ? { pricing_type: scenario.pricingType }
          : null,
      }),
    } as never,
    quizCompletionService: {
      listPassedLessonIds: async () => new Set<string>(),
    } as never,
  });
}

const learner = { id: LEARNER, roles: ["student"] };
const liveGrant = { status: "active", valid_until: null };

/** What reading, and then recording, progress answers for the viewer. */
async function outcome(scenario: Scenario, viewer = learner) {
  const service = build(scenario);
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      return "OK";
    } catch (error) {
      const { statusCode, code } = error as {
        statusCode?: number;
        code?: string;
      };
      return `${statusCode} ${code}`;
    }
  };
  return {
    read: await run(() => service.getProgress(viewer, COURSE)),
    resume: await run(() => service.getResumeContext(viewer, COURSE)),
    record: await run(() =>
      service.syncProgress(viewer, COURSE, { items: [] }),
    ),
  };
}

const allOk = { read: "OK", resume: "OK", record: "OK" };
const all = (answer: string) => ({
  read: answer,
  resume: answer,
  record: answer,
});

await test("a free, unrestricted published course is open to a signed-in learner without a grant", async () => {
  assert.deepEqual(
    await outcome({
      status: "published",
      pricingType: "free",
      accessType: "everyone",
    }),
    allOk,
  );
  // No access rule at all reads as unrestricted, as everywhere else.
  assert.deepEqual(
    await outcome({ status: "published", pricingType: "free" }),
    allOk,
  );
});

await test("a published course with no pricing row needs a grant, as it does to play its lessons", async () => {
  assert.deepEqual(
    await outcome({ status: "published" }),
    all("403 COURSE_ACCESS_REQUIRED"),
  );
  assert.deepEqual(
    await outcome({ status: "published", grant: liveGrant }),
    allOk,
  );
});

await test("a paid course, and a restricted free one, still need a grant", async () => {
  assert.deepEqual(
    await outcome({ status: "published", pricingType: "paid" }),
    all("403 COURSE_ACCESS_REQUIRED"),
  );
  assert.deepEqual(
    await outcome({
      status: "published",
      pricingType: "free",
      accessType: "restricted",
    }),
    all("403 COURSE_ACCESS_REQUIRED"),
  );
  assert.deepEqual(
    await outcome({
      status: "published",
      pricingType: "paid",
      grant: liveGrant,
    }),
    allOk,
  );
});

await test("an archived course keeps the progress of a learner who holds access, and goes on recording it", async () => {
  for (const pricingType of ["free", "paid", undefined] as const) {
    assert.deepEqual(
      await outcome({ status: "archived", pricingType, grant: liveGrant }),
      allOk,
      `pricing ${String(pricingType)}`,
    );
  }
});

await test("an archived course answers as not found to a learner without access, a free one included", async () => {
  assert.deepEqual(
    await outcome({ status: "archived", pricingType: "paid" }),
    all("404 COURSE_NOT_FOUND"),
  );
  assert.deepEqual(
    await outcome({
      status: "archived",
      pricingType: "free",
      accessType: "everyone",
    }),
    all("404 COURSE_NOT_FOUND"),
  );
  assert.deepEqual(
    await outcome({
      status: "archived",
      pricingType: "paid",
      grant: { status: "revoked", valid_until: null },
    }),
    all("404 COURSE_NOT_FOUND"),
  );
});

await test("a draft is not found for a learner even with a grant", async () => {
  assert.deepEqual(
    await outcome({ status: "draft", pricingType: "free", grant: liveGrant }),
    all("404 COURSE_NOT_FOUND"),
  );
});

await test("the course's creator and an admin are answered whatever its status", async () => {
  for (const status of ["draft", "published", "archived"] as const) {
    assert.deepEqual(
      await outcome(
        { status, pricingType: "paid" },
        { id: OWNER, roles: ["instructor"] },
      ),
      allOk,
      `creator, ${status}`,
    );
    assert.deepEqual(
      await outcome(
        { status, pricingType: "paid" },
        { id: LEARNER, roles: ["admin"] },
      ),
      allOk,
      `admin, ${status}`,
    );
  }
});
