/**
 * Support as the team's queue, through the real API: assigning reports
 * (and the notice the assignee gets), the status, priority and category
 * pickers, the Activity log, the list's filters, and internal notes edited,
 * pinned and deleted by their author or an admin. The learner never sees
 * any of it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const learner = await signedUpLearner(flow, "reporter");

// A team member who can answer reports but is not an admin.
const helper = await signedUpLearner(flow, "helper");
const supportRoleId = crypto.randomUUID();
await flow.database
  .insertInto("roles")
  .values({ id: supportRoleId, name: `support_${Date.now()}` })
  .execute();
for (const key of ["support.read", "support.manage"]) {
  const permission = await flow.database
    .selectFrom("permissions")
    .select("id")
    .where("permission_key", "=", key)
    .executeTakeFirstOrThrow();
  await flow.database
    .insertInto("role_permissions")
    .values({
      role_id: supportRoleId,
      permission_id: permission.id,
      effect: "allow",
    })
    .execute();
}
await flow.database
  .insertInto("user_roles")
  .values({ user_id: helper.userId, role_id: supportRoleId })
  .execute();

interface Person {
  id: string | null;
  name: string;
}
interface Detail {
  id: string;
  status: string;
  category: string;
  messages: {
    id: string;
    internal: boolean;
    content: string;
    editedAt: string | null;
    pinned: boolean;
  }[];
  staff: {
    assignee: Person | null;
    priority: string | null;
    canModerateNotes: boolean;
    events: {
      type: string;
      from: string | null;
      to: string | null;
      assignee: Person | null;
      messageId: string | null;
    }[];
  } | null;
}
interface Summary {
  id: string;
  assignee: Person | null;
  priority: string | null;
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

function refused(
  response: { status: number; body: { error?: { code?: string } } },
  status: number,
  code: string,
) {
  assert.equal(response.status, status, JSON.stringify(response.body.error));
  assert.equal(response.body.error?.code, code);
}

async function report(content: string) {
  return ok<{ id: string; number: number }>(
    await learner.client.post("/v1/support/tickets", {
      kind: "problem",
      category: "video",
      content,
    }),
    201,
  );
}

async function list(client: FlowClient, query: string) {
  return ok<{ tickets: Summary[]; totalCount: number }>(
    await client.get(`/v1/support/admin/tickets?kind=problem&${query}`),
  ).tickets;
}

const first = await report("The video lags even on a good connection");
const second = await report("Certificate shows my email");
const adminId = ok<{ id: string }>(await admin.get("/v1/auth/me")).id;

test.after(async () => {
  await flow.close();
});

test("the team list names everyone who can answer, the caller first", async () => {
  const team = ok<{ members: { id: string; roleLabel: string }[] }>(
    await admin.get("/v1/support/admin/team"),
  );
  assert.equal(team.members[0]?.id, adminId);
  assert.ok(team.members.some((member) => member.id === helper.userId));
  assert.ok(!team.members.some((member) => member.id === learner.userId));
  refused(
    await learner.client.get("/v1/support/admin/team"),
    403,
    "PERMISSION_DENIED",
  );
});

test("assigning a report logs it and tells the assignee; the learner sees none of it", async () => {
  const detail = ok<Detail>(
    await admin.patch(`/v1/support/tickets/${first.id}`, {
      assigneeId: helper.userId,
      priority: "high",
    }),
  );
  assert.equal(detail.staff?.assignee?.id, helper.userId);
  assert.equal(detail.staff?.priority, "high");
  assert.deepEqual(
    detail.staff?.events.map((event) => event.type),
    ["assigned", "priority_changed"],
  );
  assert.equal(detail.staff?.events[0]?.assignee?.id, helper.userId);

  const notice = await flow.database
    .selectFrom("outbox_events")
    .select("payload")
    .where("event_type", "=", "support.assigned")
    .where(
      "dedupe_key",
      "like",
      `support.assigned:${first.id}:${helper.userId}:%`,
    )
    .executeTakeFirst();
  assert.ok(notice, "the assignee is told");

  // Taking one yourself sends nothing.
  ok(
    await admin.patch(`/v1/support/tickets/${second.id}`, {
      assigneeId: adminId,
    }),
  );
  const selfNotice = await flow.database
    .selectFrom("outbox_events")
    .select("id")
    .where("dedupe_key", "like", `support.assigned:${second.id}:%`)
    .executeTakeFirst();
  assert.equal(selfNotice, undefined);

  const asLearner = ok<Detail>(
    await learner.client.get(`/v1/support/tickets/${first.id}`),
  );
  assert.equal(asLearner.staff, null);
});

test("only team members can be assigned", async () => {
  refused(
    await admin.patch(`/v1/support/tickets/${first.id}`, {
      assigneeId: learner.userId,
    }),
    400,
    "INVALID_ASSIGNEE",
  );
});

test("status and category changes are logged with what they were", async () => {
  const detail = ok<Detail>(
    await helper.client.patch(`/v1/support/tickets/${first.id}`, {
      status: "in_progress",
      category: "bug",
    }),
  );
  assert.equal(detail.status, "in_progress");
  assert.equal(detail.category, "bug");
  const status = detail.staff?.events.find(
    (event) => event.type === "status_changed",
  );
  assert.deepEqual([status?.from, status?.to], ["open", "in_progress"]);
  refused(
    await helper.client.patch(`/v1/support/tickets/${first.id}`, {
      status: "planned",
    }),
    400,
    "INVALID_STATUS",
  );
  refused(
    await helper.client.patch(`/v1/support/tickets/${first.id}`, {
      category: "idea",
    }),
    400,
    "INVALID_CATEGORY",
  );
  // Nothing asked is refused before anything is done.
  assert.equal(
    (await helper.client.patch(`/v1/support/tickets/${first.id}`, {})).status,
    400,
  );
});

test("the list filters by assignee and leaves out what is done", async () => {
  const mine = await list(helper.client, "assignee=me");
  assert.deepEqual(
    mine.map((ticket) => ticket.id),
    [first.id],
  );
  assert.equal(mine[0]?.assignee?.id, helper.userId);
  assert.equal(mine[0]?.priority, "high");
  const unassigned = await list(admin, "assignee=none");
  assert.ok(!unassigned.some((ticket) => ticket.id === first.id));

  ok(
    await admin.patch(`/v1/support/tickets/${second.id}`, {
      status: "resolved",
    }),
  );
  const active = await list(admin, "active=true");
  assert.ok(active.some((ticket) => ticket.id === first.id));
  assert.ok(!active.some((ticket) => ticket.id === second.id));

  const stats = ok<{ problems: { assignedToMe: number } }>(
    await helper.client.get("/v1/support/admin/stats"),
  );
  assert.equal(stats.problems.assignedToMe, 1);
});

test("a note is edited, pinned and deleted by its author or an admin", async () => {
  const withNote = ok<Detail>(
    await helper.client.post(`/v1/support/tickets/${first.id}/messages`, {
      content: "Reproduced at 1.5x speed",
      internal: true,
    }),
    201,
  );
  const note = withNote.messages.find((message) => message.internal)!;
  const notePath = `/v1/support/tickets/${first.id}/notes/${note.id}`;

  const edited = ok<Detail>(
    await helper.client.patch(notePath, {
      content: "Reproduced at 1.5x speed on 1080p",
    }),
  );
  const editedNote = edited.messages.find((message) => message.id === note.id);
  assert.equal(editedNote?.content, "Reproduced at 1.5x speed on 1080p");
  assert.ok(editedNote?.editedAt);

  const pinned = ok<Detail>(
    await admin.put(`${notePath}/pin`, { pinned: true }),
  );
  assert.equal(
    pinned.messages.find((message) => message.id === note.id)?.pinned,
    true,
  );
  assert.equal(pinned.staff?.events.at(-1)?.type, "note_pinned");

  // The admin's own note: the helper may not change it.
  const adminNote = ok<Detail>(
    await admin.post(`/v1/support/tickets/${first.id}/messages`, {
      content: "Checking the player config",
      internal: true,
    }),
    201,
  ).messages.findLast((message) => message.internal)!;
  const adminNotePath = `/v1/support/tickets/${first.id}/notes/${adminNote.id}`;
  refused(
    await helper.client.patch(adminNotePath, { content: "Mine now" }),
    403,
    "FORBIDDEN",
  );
  refused(await helper.client.delete(adminNotePath), 403, "FORBIDDEN");

  // An admin may delete anyone's note; it is gone from the Activity.
  const afterDelete = ok<Detail>(await admin.delete(notePath));
  assert.ok(!afterDelete.messages.some((message) => message.id === note.id));
  assert.equal(afterDelete.staff?.events.at(-1)?.type, "note_deleted");
  assert.equal(afterDelete.staff?.canModerateNotes, true);
  refused(await admin.delete(notePath), 404, "SUPPORT_NOTE_NOT_FOUND");

  // A reply to the learner is not a note: it cannot be edited this way.
  const withReply = ok<Detail>(
    await admin.post(`/v1/support/tickets/${first.id}/messages`, {
      content: "Which speed were you on?",
    }),
    201,
  );
  const reply = withReply.messages.findLast((message) => !message.internal)!;
  refused(
    await admin.patch(`/v1/support/tickets/${first.id}/notes/${reply.id}`, {
      content: "Edited",
    }),
    404,
    "SUPPORT_NOTE_NOT_FOUND",
  );
});
