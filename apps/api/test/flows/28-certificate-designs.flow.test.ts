/**
 * Certificate designs (Platform > Certificates): staff upload blank sheets,
 * place the details, preview, finalise one; certificates are then drawn on
 * the finalised design. Files that cannot carry certificates are refused
 * and removed from storage; generated PDFs are never stored.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";
import { PDFDocument, rgb } from "pdf-lib";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

interface Design {
  id: string;
  name: string;
  kind: "builtin" | "upload";
  isActive: boolean;
  pageWidth: number;
  pageHeight: number;
  layout: { name: { x: number; y: number; size: number } } & Record<
    string,
    unknown
  >;
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

const EXTENSIONS = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;

/** A blank sheet made by a design tool: one A4 landscape page with a frame. */
async function blankSheet(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([841.89, 595.28]);
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 801.89,
    height: 555.28,
    borderColor: rgb(0.1, 0.3, 0.7),
    borderWidth: 6,
  });
  return Buffer.from(await doc.save());
}

/** A PNG header for an image far too small to print. */
function tinyPng(): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(300, 16);
  header.writeUInt32BE(200, 20);
  return header;
}

/** Uploads a file as the browser does and saves it as a design. */
async function upload(
  client: FlowClient,
  bytes: Buffer,
  contentType: keyof typeof EXTENSIONS,
  name: string,
) {
  const presigned = ok<{ uploadId: string; uploadUrl: string }>(
    await client.post("/v1/certificates/designs/presign", {
      contentType,
      fileSize: bytes.length,
    }),
  );
  const key = `protected/certificate-designs/${presigned.uploadId}.${EXTENSIONS[contentType]}`;
  flow.storage.put(key, bytes, contentType);
  const response = await client.post<Design>("/v1/certificates/designs", {
    uploadId: presigned.uploadId,
    contentType,
    name,
  });
  return { response, key };
}

const designs = async (client: FlowClient) =>
  ok<{ items: Design[] }>(await client.get("/v1/certificates/designs")).items;

test.after(async () => {
  await flow.close();
});

test("only staff with certificate.issue manage designs; instructors may", async () => {
  const visitor = flow.visitor();
  assert.equal((await visitor.get("/v1/certificates/designs")).status, 401);
  const { client: learner } = await signedUpLearner(flow, "designlearner");
  assert.equal((await learner.get("/v1/certificates/designs")).status, 403);

  const instructorAccount = await signedUpLearner(flow, "designteacher");
  await grantPlatformRole(flow.database, {
    userId: instructorAccount.userId,
    roleId: SYSTEM_ROLES.instructor.id,
  });
  const instructor = flow.visitor();
  await instructor.signIn(instructorAccount.learner.email);
  const items = await designs(instructor);
  assert.equal(items[0]!.kind, "builtin");
});

test("files that cannot carry certificates are refused and removed", async () => {
  const junk = await upload(
    admin,
    Buffer.from("%PDF-1.4 not really a pdf"),
    "application/pdf",
    "Broken",
  );
  assert.equal(junk.response.status, 400);
  assert.equal(flow.storage.has(junk.key), false);

  const small = await upload(admin, tinyPng(), "image/png", "Too small");
  assert.equal(small.response.status, 400);
  assert.match(JSON.stringify(small.response.body.error), /1600 pixels/u);
  assert.equal(flow.storage.has(small.key), false);

  // Says PNG, is a PDF.
  const disguised = await upload(admin, await blankSheet(), "image/png", "Lie");
  assert.equal(disguised.response.status, 400);
});

test("upload, place the details, preview, finalise, and certificates follow", async () => {
  const { response, key } = await upload(
    admin,
    await blankSheet(),
    "application/pdf",
    "Blue frame",
  );
  const design = ok<Design>(response);
  assert.equal(design.kind, "upload");
  assert.equal(design.isActive, false);
  assert.equal(design.pageWidth, 841.89);
  assert.equal(flow.storage.has(key), true);

  // Still the built-in design until this one is finalised.
  let items = await designs(admin);
  assert.equal(items.find((item) => item.isActive)?.kind, "builtin");

  // Move the name; a position off the page is refused.
  const layout = structuredClone(design.layout);
  layout.name = { ...layout.name, y: 0.5, size: 48 };
  const saved = ok<Design>(
    await admin.patch(`/v1/certificates/designs/${design.id}`, { layout }),
  );
  assert.equal(saved.layout.name.y, 0.5);
  const offPage = structuredClone(layout);
  offPage.name = { ...offPage.name, x: 2 };
  assert.equal(
    (
      await admin.patch(`/v1/certificates/designs/${design.id}`, {
        layout: offPage,
      })
    ).status,
    400,
  );

  const preview = await admin.post(
    `/v1/certificates/designs/${design.id}/preview`,
    {},
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers["content-type"], "application/pdf");
  assert.ok(String(preview.body.raw).startsWith("%PDF-"));

  items = ok<{ items: Design[] }>(
    await admin.post(`/v1/certificates/designs/${design.id}/activate`, {}),
  ).items;
  assert.deepEqual(
    items.filter((item) => item.isActive).map((item) => item.id),
    [design.id],
  );

  // A learner's certificate is issued, recorded with the design, and drawn
  // on it.
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{}, {}, {}],
  });
  await flow.database
    .insertInto("course_settings")
    .values({
      id: crypto.randomUUID(),
      course_id: course.id,
      certificate_enabled: true,
    })
    .execute();
  const { client } = await signedUpLearner(flow, "designcert");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await client.patch("/v1/auth/me", { displayName: "Design Learner" });
  await client.post(`/v1/learning-progress/${course.slug}/batch`, {
    items: course.lessons.map((lesson) => ({
      lessonId: lesson.id,
      progressPercent: 100,
    })),
    watchedSeconds: 30,
    timeZone: "Asia/Kolkata",
  });
  const certificate = ok<{ code: string }>(
    await client.post(`/v1/certificates/courses/${course.slug}/claim`, {}),
    201,
  );
  const row = await flow.database
    .selectFrom("certificates")
    .select("design_id")
    .where("public_code", "=", certificate.code)
    .executeTakeFirstOrThrow();
  assert.equal(row.design_id, design.id);
  const pdf = await client.get(`/v1/certificates/${certificate.code}/download`);
  assert.equal(pdf.status, 200);
  assert.match(String(pdf.headers.etag), new RegExp(design.id));
  assert.ok(String(pdf.body.raw).startsWith("%PDF-"));

  // The finalised design cannot be deleted; after finalising the built-in
  // one again it can, and its file goes too.
  assert.equal(
    (await admin.delete(`/v1/certificates/designs/${design.id}`)).status,
    409,
  );
  ok(await admin.post("/v1/certificates/designs/builtin/activate", {}));
  ok(await admin.delete(`/v1/certificates/designs/${design.id}`));
  assert.equal(flow.storage.has(key), false);
  items = await designs(admin);
  assert.ok(!items.some((item) => item.id === design.id));
  assert.equal(items.find((item) => item.isActive)?.kind, "builtin");

  // The certificate still downloads, on the built-in design.
  const again = await client.get(
    `/v1/certificates/${certificate.code}/download`,
  );
  assert.equal(again.status, 200);
  assert.match(String(again.headers.etag), /builtin/u);
});
