import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
} from "kysely";

import type { AppServices } from "../../services/index.ts";
import { createLearningProgressService } from "./learning-progress.service.ts";

class MockTimeZoneDriver extends DummyDriver {
  readonly supportedZones: string[];

  constructor(supportedZones: string[]) {
    super();
    this.supportedZones = supportedZones;
  }

  override async acquireConnection() {
    return {
      async *streamQuery() {
        yield* [];
      },
      executeQuery: async <R>(compiledQuery: {
        parameters: readonly unknown[];
      }) => {
        const requested =
          (compiledQuery.parameters[0] as string[] | undefined) ?? [];
        const rows = requested
          .filter((name) => this.supportedZones.includes(name))
          .map((name) => ({ name }));
        return { rows } as QueryResult<R>;
      },
    };
  }
}

function createMockDatabase(supportedZones: string[]): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new MockTimeZoneDriver(supportedZones),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function buildService(supportedZones: string[]) {
  return createLearningProgressService({
    database: createMockDatabase(supportedZones),
    services: {} as AppServices,
    courseService: {} as never,
    curriculumService: {} as never,
    quizCompletionService: {} as never,
  });
}

const ALPINE_PG_ZONES = ["Asia/Kolkata", "America/Los_Angeles", "UTC"];

await test("resolves legacy Asia/Calcutta to modern Asia/Kolkata supported by PostgreSQL", async () => {
  const service = buildService(ALPINE_PG_ZONES);
  const resolved = await service.resolveSupportedTimeZone("Asia/Calcutta");
  assert.equal(resolved, "Asia/Kolkata");
});

await test("resolves modern Asia/Kolkata directly", async () => {
  const service = buildService(ALPINE_PG_ZONES);
  const resolved = await service.resolveSupportedTimeZone("Asia/Kolkata");
  assert.equal(resolved, "Asia/Kolkata");
});

await test("resolves standard canonical zone America/Los_Angeles and US/Pacific alias", async () => {
  const service = buildService(ALPINE_PG_ZONES);
  assert.equal(
    await service.resolveSupportedTimeZone("America/Los_Angeles"),
    "America/Los_Angeles",
  );
  assert.equal(
    await service.resolveSupportedTimeZone("US/Pacific"),
    "America/Los_Angeles",
  );
});

await test("returns null for unsupported or invalid time zones", async () => {
  const service = buildService(ALPINE_PG_ZONES);
  assert.equal(
    await service.resolveSupportedTimeZone("Invalid/NonExistent_Zone"),
    null,
  );
  assert.equal(await service.resolveSupportedTimeZone("CTT"), null);
});
