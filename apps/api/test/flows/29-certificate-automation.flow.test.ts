/**
 * Certificate automation and staff powers: the academy's default share
 * (95), automatic issue with the PDF emailed when a learner finishes the
 * share, the signature upload, and staff issuing a certificate by hand to
 * a learner at any progress.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import zlib from "node:zlib";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const { config } = await import("../../src/config.ts");
const { createNotificationProcessor } =
  await import("../../src/modules/notifications/index.ts");
const { createCertificateNotificationHooks } =
  await import("../../src/modules/certificates/certificate-notification-hooks.ts");
const { createInvoiceAttachmentResolver } =
  await import("../../src/modules/commerce/invoices/invoice-email-attachment.ts");

const quiet = {
  level: "silent",
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
  silent() {},
  child() {
    return quiet;
  },
} as never;

/** The notification worker, as it runs beside the API. */
const hooks = createCertificateNotificationHooks({
  database: flow.database,
  services: flow.services,
  logger: quiet,
  invoices: createInvoiceAttachmentResolver({
    getOrderInvoicePdf: async () => {
      throw new Error("no invoices here");
    },
  }),
});
const worker = createNotificationProcessor({
  database: flow.database,
  email: flow.email,
  logger: quiet,
  config,
  attachments: hooks.attachments,
  handlers: {
    listActiveCourseRecipientUserIds: async () => [],
    autoIssueCertificate: hooks.autoIssueCertificate,
  },
  recipients: {
    findRecipient: async (id: string) => {
      const user = await flow.database
        .selectFrom("users")
        .select(["id", "email"])
        .where("id", "=", id)
        .executeTakeFirst();
      return user ? { id: user.id, email: user.email } : undefined;
    },
  },
} as never);

async function runWorker() {
  for (let round = 0; round < 50; round += 1) {
    const result = await worker.process();
    if (result.outbox.processed === 0 && result.email.sent === 0) return;
  }
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

async function certificateCourse(lessons: number): Promise<FlowCourse> {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: Array.from({ length: lessons }, () => ({})),
  });
  await flow.database
    .insertInto("course_settings")
    .values({
      id: crypto.randomUUID(),
      course_id: course.id,
      certificate_enabled: true,
    })
    .execute();
  return course;
}

async function finish(client: FlowClient, course: FlowCourse, count: number) {
  const response = await client.post(
    `/v1/learning-progress/${course.slug}/batch`,
    {
      items: course.lessons.slice(0, count).map((lesson) => ({
        lessonId: lesson.id,
        progressPercent: 100,
      })),
      watchedSeconds: 30,
      timeZone: "Asia/Kolkata",
    },
  );
  assert.ok(response.status < 300, `progress answered ${response.status}`);
}

/** A PNG of the given size: transparent, with a dark diagonal stroke. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const x = Math.round((y / height) * width);
    for (let dx = -4; dx <= 4; dx += 1) {
      const px = x + dx;
      if (px < 0 || px >= width) continue;
      rows[y * (width * 4 + 1) + 1 + px * 4 + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

interface Settings {
  thresholdPercent: number;
  autoIssue: boolean;
  signature: { contentType: string } | null;
}

test.after(async () => {
  await flow.close();
});

test("the academy asks for 95% by default; staff change it, learners cannot", async () => {
  const settings = ok<Settings>(await admin.get("/v1/certificates/settings"));
  assert.equal(settings.thresholdPercent, 95);
  assert.equal(settings.autoIssue, true);

  const { client: learner } = await signedUpLearner(flow, "autolearner");
  assert.equal((await learner.get("/v1/certificates/settings")).status, 403);

  // An instructor may change it too.
  const account = await signedUpLearner(flow, "autoteacher");
  await grantPlatformRole(flow.database, {
    userId: account.userId,
    roleId: SYSTEM_ROLES.instructor.id,
  });
  const instructor = flow.visitor();
  await instructor.signIn(account.learner.email);
  const changed = ok<Settings>(
    await instructor.put("/v1/certificates/settings", { thresholdPercent: 90 }),
  );
  assert.equal(changed.thresholdPercent, 90);
  ok(await admin.put("/v1/certificates/settings", { thresholdPercent: 95 }));
  assert.equal(
    (await admin.put("/v1/certificates/settings", { thresholdPercent: 30 }))
      .status,
    400,
  );
});

test("finishing the share issues the certificate and emails the PDF", async () => {
  const course = await certificateCourse(20);
  const { client, learner } = await signedUpLearner(flow, "autoissue");
  ok(await client.patch("/v1/auth/me", { displayName: "Auto Learner" }));
  assert.equal((await enrollForFree(client, course)).status, 200);

  // 18 of 20 lessons is 90%: under the academy's 95.
  await finish(client, course, 18);
  await runWorker();
  let rows = await flow.database
    .selectFrom("certificates")
    .select("public_code")
    .where("course_id", "=", course.id)
    .execute();
  assert.equal(rows.length, 0);

  // 19 of 20 is 95%: issued without the learner doing anything, and the
  // email carries the PDF.
  await finish(client, course, 19);
  await runWorker();
  rows = await flow.database
    .selectFrom("certificates")
    .select("public_code")
    .where("course_id", "=", course.id)
    .execute();
  assert.equal(rows.length, 1);
  const email = flow.email.sent.findLast(
    (mail) => mail.to === learner.email.toLowerCase(),
  );
  assert.ok(email, "the learner was emailed");
  assert.match(email.subject, /certificate/iu);
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0]!.contentType, "application/pdf");
  assert.equal(
    email.attachments[0]!.content.subarray(0, 5).toString("latin1"),
    "%PDF-",
  );

  // More lessons later issue nothing new.
  await finish(client, course, 20);
  await runWorker();
  const again = await flow.database
    .selectFrom("certificates")
    .select("id")
    .where("course_id", "=", course.id)
    .execute();
  assert.equal(again.length, 1);
});

test("with automatic issue off, the learner claims it", async () => {
  ok(await admin.put("/v1/certificates/settings", { autoIssue: false }));
  try {
    const course = await certificateCourse(4);
    const { client } = await signedUpLearner(flow, "autooff");
    ok(await client.patch("/v1/auth/me", { displayName: "Manual Claimer" }));
    assert.equal((await enrollForFree(client, course)).status, 200);
    await finish(client, course, 4);
    await runWorker();
    const status = ok<{ state: string }>(
      await client.get(`/v1/certificates/courses/${course.slug}`),
    );
    assert.equal(status.state, "unlocked");
    ok(
      await client.post(`/v1/certificates/courses/${course.slug}/claim`, {}),
      201,
    );
  } finally {
    ok(await admin.put("/v1/certificates/settings", { autoIssue: true }));
  }
});

test("staff issue a certificate by hand at any progress", async () => {
  const course = await certificateCourse(10);
  const { client, userId } = await signedUpLearner(flow, "manualcert");
  ok(await client.patch("/v1/auth/me", { displayName: "Partly Done" }));
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, 3);

  const candidates = ok<{
    items: {
      userId: string;
      progressPercent: number;
      hasCertificate: boolean;
    }[];
  }>(
    await admin.get(
      `/v1/certificates/admin/courses/${course.id}/candidates?q=Partly`,
    ),
  );
  const candidate = candidates.items.find((item) => item.userId === userId);
  assert.ok(candidate);
  assert.equal(candidate.progressPercent, 30);
  assert.equal(candidate.hasCertificate, false);

  // A learner cannot issue one to themself.
  assert.equal(
    (
      await client.post(`/v1/certificates/admin/courses/${course.id}/issue`, {
        userId,
      })
    ).status,
    403,
  );
  const issued = ok<{ code: string; recipientName: string; status: string }>(
    await admin.post(`/v1/certificates/admin/courses/${course.id}/issue`, {
      userId,
    }),
  );
  assert.equal(issued.recipientName, "Partly Done");
  assert.equal(issued.status, "active");
  const row = await flow.database
    .selectFrom("certificates")
    .select(["issued_by"])
    .where("public_code", "=", issued.code)
    .executeTakeFirstOrThrow();
  assert.ok(row.issued_by, "recorded who issued it");

  // Issuing again gives the same certificate.
  const twice = ok<{ code: string }>(
    await admin.post(`/v1/certificates/admin/courses/${course.id}/issue`, {
      userId,
    }),
  );
  assert.equal(twice.code, issued.code);

  // A profile name that cannot be printed is refused, with the reason.
  const { client: other, userId: otherId } = await signedUpLearner(
    flow,
    "manualhindi",
  );
  ok(await other.patch("/v1/auth/me", { displayName: "प्रशांत" }));
  assert.equal((await enrollForFree(other, course)).status, 200);
  const refused = await admin.post(
    `/v1/certificates/admin/courses/${course.id}/issue`,
    { userId: otherId },
  );
  assert.equal(refused.status, 422);
  assert.match(JSON.stringify(refused.body.error), /English letters/u);
});

test("the academy's signature is uploaded, checked and printed", async () => {
  const tiny = png(120, 40);
  const presignTiny = ok<{ uploadId: string }>(
    await admin.post("/v1/certificates/settings/signature/presign", {
      contentType: "image/png",
      fileSize: tiny.length,
    }),
  );
  flow.storage.put(
    `protected/certificate-signatures/${presignTiny.uploadId}.png`,
    tiny,
    "image/png",
  );
  const refused = await admin.post("/v1/certificates/settings/signature", {
    uploadId: presignTiny.uploadId,
    contentType: "image/png",
  });
  assert.equal(refused.status, 400);

  const signature = png(900, 300);
  const presign = ok<{ uploadId: string }>(
    await admin.post("/v1/certificates/settings/signature/presign", {
      contentType: "image/png",
      fileSize: signature.length,
    }),
  );
  const key = `protected/certificate-signatures/${presign.uploadId}.png`;
  flow.storage.put(key, signature, "image/png");
  const saved = ok<Settings>(
    await admin.post("/v1/certificates/settings/signature", {
      uploadId: presign.uploadId,
      contentType: "image/png",
    }),
  );
  assert.equal(saved.signature?.contentType, "image/png");

  const file = await admin.get("/v1/certificates/settings/signature/file");
  assert.equal(file.status, 200);
  const preview = await admin.post(
    "/v1/certificates/designs/builtin/preview",
    {},
  );
  assert.equal(preview.status, 200);

  const removed = ok<Settings>(
    await admin.delete("/v1/certificates/settings/signature"),
  );
  assert.equal(removed.signature, null);
});
