import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAllCaches } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { ADMIN_ROLE, STUDENT_ROLE } from "../shared/auth.constants.ts";
import { createSessionService } from "./session.service.ts";

interface MockSession {
  id: string;
  user_id: string;
  user_agent: string | null;
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
  playing_lesson_id: string | null;
  playing_claimed_at: Date | null;
  playing_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date;
  lesson_title?: string | null;
}

interface FakeDbOptions {
  maxStreams?: number | null;
  sessions?: MockSession[];
}

function createFakeDatabase(options: FakeDbOptions = {}) {
  clearAllCaches();

  const sessions: MockSession[] = (options.sessions ?? []).map((s) => ({
    ...s,
  }));
  const writes: Array<{
    type: "set" | "clear";
    sessionId: string;
    data?: unknown;
  }> = [];

  const platformSettingsRow =
    options.maxStreams !== undefined
      ? {
          settings: {
            security: { maxSimultaneousStreams: options.maxStreams },
          },
          updated_at: new Date(),
        }
      : null;

  function executeQuery(
    table: string,
    op: string,
    values?: unknown,
    filters?: Record<string, unknown>,
  ) {
    if (table === "platform_settings") {
      return platformSettingsRow;
    }
    if (table === "users") {
      return { id: filters?.userId ?? "user-1" };
    }
    return undefined;
  }

  // Create a builder proxy that handles Kysely query chains
  const createBuilder = (
    table: string,
    op: string,
    updateValues?: Record<string, unknown>,
  ): unknown => {
    let targetSessionId: string | null = null;

    const proxy: unknown = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "then") return undefined;

          if (prop === "forUpdate") return () => proxy;

          if (prop === "where") {
            return (col: string, opStr: string, val: unknown) => {
              if (col === "id" && opStr === "=" && typeof val === "string") {
                targetSessionId = val;
              }
              return proxy;
            };
          }

          if (prop === "set") {
            return (vals: Record<string, unknown>) => {
              return createBuilder(table, "update", vals);
            };
          }

          if (
            prop === "leftJoin" ||
            prop === "select" ||
            prop === "selectAll"
          ) {
            return () => proxy;
          }

          if (
            prop === "executeTakeFirst" ||
            prop === "executeTakeFirstOrThrow"
          ) {
            return async () => executeQuery(table, op);
          }

          if (prop === "execute") {
            return async () => {
              if (table === "sessions" && op === "update") {
                const s = sessions.find((x) => x.id === targetSessionId);
                if (
                  updateValues?.playing_lesson_id !== undefined ||
                  updateValues?.playing_at !== undefined
                ) {
                  if (
                    updateValues.playing_lesson_id === null &&
                    updateValues.playing_at === null
                  ) {
                    writes.push({ type: "clear", sessionId: targetSessionId! });
                    if (s) {
                      s.playing_lesson_id = null;
                      s.playing_claimed_at = null;
                      s.playing_at = null;
                    }
                  } else {
                    writes.push({
                      type: "set",
                      sessionId: targetSessionId!,
                      data: updateValues,
                    });
                    if (s) {
                      s.playing_lesson_id =
                        updateValues.playing_lesson_id as string;
                      s.playing_claimed_at =
                        updateValues.playing_claimed_at as Date;
                      s.playing_at = updateValues.playing_at as Date;
                    }
                  }
                }
                return { numUpdatedRows: 1n };
              }

              if (table === "sessions") {
                // Return live sessions matching standard criteria
                const now = new Date();
                const staleThreshold = new Date(now.getTime() - 40_000);
                return sessions.filter(
                  (s) =>
                    s.revoked_at === null &&
                    s.expires_at > now &&
                    s.playing_at !== null &&
                    s.playing_at > staleThreshold &&
                    s.playing_claimed_at !== null,
                );
              }

              return [];
            };
          }

          return () => proxy;
        },
      },
    );

    return proxy;
  };

  const db = {
    selectFrom: (table: string) => createBuilder(table, "select"),
    updateTable: (table: string) => createBuilder(table, "update"),
    transaction: () => ({
      execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> =>
        cb(db),
    }),
  } as unknown as Kysely<Database>;

  return { db, sessions, writes };
}

const LESSON_1 = "11111111-1111-4111-8111-111111111111";
const LESSON_2 = "22222222-2222-4222-8222-222222222222";

await test("unlimited setting and staff: allowed, no repository writes", async () => {
  // Staff account
  const { db: staffDb, writes: staffWrites } = createFakeDatabase({
    maxStreams: 1,
  });
  const staffService = createSessionService({ database: staffDb });

  const staffRes = await staffService.reportPlayback(
    { id: "u-staff", roles: [ADMIN_ROLE] },
    "sess-staff",
    { lessonId: LESSON_1, event: "play" },
  );
  assert.deepEqual(staffRes, { allowed: true });
  assert.equal(
    staffWrites.length,
    0,
    "Staff must trigger zero repository writes",
  );

  // Student account with unlimited setting (null)
  const { db: unlimDb, writes: unlimWrites } = createFakeDatabase({
    maxStreams: null,
  });
  const unlimService = createSessionService({ database: unlimDb });

  const unlimRes = await unlimService.reportPlayback(
    { id: "u-student", roles: [STUDENT_ROLE] },
    "sess-student",
    { lessonId: LESSON_1, event: "play" },
  );
  assert.deepEqual(unlimRes, { allowed: true });
  assert.equal(
    unlimWrites.length,
    0,
    "Unlimited setting must trigger zero repository writes",
  );
});

await test("first play on one device: allowed and stored", async () => {
  const { db, writes, sessions } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        id: "sess-1",
        user_id: "u-1",
        user_agent: "Chrome on macOS",
        location_city: "Mumbai",
        location_region: "Maharashtra",
        location_country: "IN",
        playing_lesson_id: null,
        playing_claimed_at: null,
        playing_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-1",
    { lessonId: LESSON_1, event: "play" },
  );

  assert.deepEqual(res, { allowed: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.type, "set");
  assert.equal(writes[0]?.sessionId, "sess-1");
  assert.equal(sessions[0]?.playing_lesson_id, LESSON_1);
});

await test("heartbeat after another device pressed play: denied, playingOn filled, own claim cleared", async () => {
  const t0 = new Date(Date.now() - 20_000); // 20s ago
  const t1 = new Date(Date.now() - 5_000); // 5s ago (newer play)

  const { db, writes, sessions } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        id: "sess-1",
        user_id: "u-1",
        user_agent: "Chrome on Windows",
        location_city: "Delhi",
        location_region: "Delhi",
        location_country: "IN",
        playing_lesson_id: LESSON_1,
        playing_claimed_at: t0,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
        lesson_title: "Lesson 1",
      },
      {
        id: "sess-2",
        user_id: "u-1",
        user_agent: "Safari on iPhone",
        location_city: "Pune",
        location_region: "Maharashtra",
        location_country: "IN",
        playing_lesson_id: LESSON_2,
        playing_claimed_at: t1,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
        lesson_title: "Lesson 2",
      },
    ],
  });
  const service = createSessionService({ database: db });

  // sess-1 sends regular heartbeat (keeps its claimedAt of t0)
  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-1",
    { lessonId: LESSON_1, event: "heartbeat" },
  );

  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.playingOn.userAgent, "Safari on iPhone");
    assert.equal(res.playingOn.location, "Pune, Maharashtra, India");
    assert.equal(res.playingOn.lessonTitle, "Lesson 2");
    assert.equal(res.playingOn.since, t1.toISOString());
  }

  // sess-1 claim should have been cleared
  const clearWrite = writes.find(
    (w) => w.type === "clear" && w.sessionId === "sess-1",
  );
  assert.ok(clearWrite, "sess-1 must be cleared when denied");
  assert.equal(sessions[0]?.playing_at, null);
});

await test("own claim stale, another device live, heartbeat => denied", async () => {
  // Scenario from reviewer comment: laptop A goes offline for > 40 s while
  // its buffer keeps the video playing. Phone B presses play. When A comes
  // back online it sends a heartbeat. With the old ?? now fallback, A would
  // get claimedAt = now and beat B. With ?? new Date(0), A ranks last.
  const t1 = new Date(Date.now() - 5_000); // phone B pressed play 5 s ago

  const { db, writes } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        // sess-laptop-a: its claim went stale (no row in listLivePlaybackClaims)
        // so mine will be undefined inside the transaction.
        id: "sess-laptop-a",
        user_id: "u-1",
        user_agent: "Chrome on Windows",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        // playing_at is old enough to be excluded by listLivePlaybackClaims
        playing_claimed_at: new Date(Date.now() - 60_000),
        playing_at: new Date(Date.now() - 60_000),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
      {
        // sess-phone-b: has a live, fresh claim from t1
        id: "sess-phone-b",
        user_id: "u-1",
        user_agent: "Safari on iPhone",
        location_city: "Pune",
        location_region: "Maharashtra",
        location_country: "IN",
        playing_lesson_id: LESSON_2,
        playing_claimed_at: t1,
        playing_at: new Date(), // fresh within 40 s
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  // laptop-a comes back online and sends a heartbeat
  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-laptop-a",
    { lessonId: LESSON_1, event: "heartbeat" },
  );

  // Must be denied: phone B's live claim (t1) beats epoch-zero
  assert.equal(res.allowed, false, "stale laptop heartbeat must be denied");
  if (!res.allowed) {
    assert.equal(res.playingOn.userAgent, "Safari on iPhone");
  }
  // laptop-a claim must have been cleared
  const clearWrite = writes.find(
    (w) => w.type === "clear" && w.sessionId === "sess-laptop-a",
  );
  assert.ok(clearWrite, "stale laptop claim must be cleared when denied");
});

await test("a play event always wins against an existing stream", async () => {
  const t0 = new Date(Date.now() - 10_000);

  const { db, writes } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        id: "sess-1",
        user_id: "u-1",
        user_agent: "Chrome on Windows",
        location_city: "Delhi",
        location_region: "Delhi",
        location_country: "IN",
        playing_lesson_id: LESSON_1,
        playing_claimed_at: t0,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
      {
        id: "sess-2",
        user_id: "u-1",
        user_agent: "Firefox on Linux",
        location_city: "Bengaluru",
        location_region: "Karnataka",
        location_country: "IN",
        playing_lesson_id: null,
        playing_claimed_at: null,
        playing_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  // sess-2 presses play now
  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-2",
    { lessonId: LESSON_2, event: "play" },
  );

  assert.deepEqual(res, { allowed: true }, "New play must always win");
  const setWrite = writes.find(
    (w) => w.type === "set" && w.sessionId === "sess-2",
  );
  assert.ok(setWrite, "sess-2 must have claim set");
});

await test("a stale claim (older than 40 s) is ignored", async () => {
  const staleTime = new Date(Date.now() - 50_000); // 50s ago (> 40s stale threshold)

  const { db, writes } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        id: "sess-stale",
        user_id: "u-1",
        user_agent: "Chrome on Windows",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        playing_claimed_at: staleTime,
        playing_at: staleTime,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
      {
        id: "sess-fresh",
        user_id: "u-1",
        user_agent: "Chrome on Android",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: null,
        playing_claimed_at: null,
        playing_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-fresh",
    { lessonId: LESSON_2, event: "play" },
  );

  assert.deepEqual(res, { allowed: true });
});

await test("limit 2 lets two devices play and pauses the third oldest", async () => {
  const t0 = new Date(Date.now() - 30_000); // oldest
  const t1 = new Date(Date.now() - 20_000); // middle
  const t2 = new Date(Date.now() - 10_000); // newest

  const { db } = createFakeDatabase({
    maxStreams: 2,
    sessions: [
      {
        id: "sess-1",
        user_id: "u-1",
        user_agent: "Device 1",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        playing_claimed_at: t0,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
      {
        id: "sess-2",
        user_id: "u-1",
        user_agent: "Device 2",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        playing_claimed_at: t1,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
      {
        id: "sess-3",
        user_id: "u-1",
        user_agent: "Device 3",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        playing_claimed_at: t2,
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  // sess-2 (t1) sends heartbeat: it is among the 2 newest (t2, t1), so allowed
  const res2 = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-2",
    { lessonId: LESSON_1, event: "heartbeat" },
  );
  assert.equal(res2.allowed, true);

  // sess-1 (t0) sends heartbeat: it is the 3rd oldest (t2 > t1 > t0), so denied
  const res1 = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-1",
    { lessonId: LESSON_1, event: "heartbeat" },
  );
  assert.equal(res1.allowed, false);
});

await test("a batch without playing clears the claim", async () => {
  const { db, writes, sessions } = createFakeDatabase({
    maxStreams: 1,
    sessions: [
      {
        id: "sess-1",
        user_id: "u-1",
        user_agent: "Chrome on macOS",
        location_city: null,
        location_region: null,
        location_country: null,
        playing_lesson_id: LESSON_1,
        playing_claimed_at: new Date(),
        playing_at: new Date(),
        revoked_at: null,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    ],
  });
  const service = createSessionService({ database: db });

  // playing is undefined (paused or ended)
  const res = await service.reportPlayback(
    { id: "u-1", roles: [STUDENT_ROLE] },
    "sess-1",
    undefined,
  );

  assert.deepEqual(res, { allowed: true });
  const clearWrite = writes.find(
    (w) => w.type === "clear" && w.sessionId === "sess-1",
  );
  assert.ok(clearWrite, "Claim must be cleared when playing is undefined");
  assert.equal(sessions[0]?.playing_lesson_id, null);
});
