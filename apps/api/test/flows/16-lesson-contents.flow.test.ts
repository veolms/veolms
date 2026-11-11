/**
 * A lesson holds one piece of content per kind (video, audio, image,
 * document) and learners are shown the kind its creator selected, through
 * the real API: switching keeps every kind's content, a file must suit its
 * kind, a reading's text moves out of the description, and an audio or
 * image lesson's file is given to whoever may open the lesson.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LessonContentsResponse } from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

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

function failsWith(
  response: { status: number; body: { error?: { code?: string } } },
  status: number,
  code: string,
) {
  assert.equal(response.status, status, JSON.stringify(response.body.error));
  assert.equal(response.body.error?.code, code);
}

/** A file in the creator's library, as an upload leaves it. */
async function mediaAsset(options: {
  type: "audio" | "image" | "document" | "video";
  mimeType: string;
  sizeBytes?: number;
  status?: "uploading" | "uploaded" | "ready";
}) {
  const id = crypto.randomUUID();
  await flow.database
    .insertInto("media_assets")
    .values({
      id,
      owner_id: FLOW_ADMIN.id,
      type: options.type,
      storage_provider: "s3",
      storage_key: `protected/media/${FLOW_ADMIN.id}/${id}`,
      original_filename: `file-${id.slice(0, 8)}`,
      mime_type: options.mimeType,
      size_bytes: options.sizeBytes ?? 2048,
      width: null,
      height: null,
      duration_seconds: null,
      metadata: JSON.stringify({}),
      status:
        options.status ?? (options.type === "image" ? "ready" : "uploaded"),
      upload_id: null,
      upload_part_size: null,
    })
    .execute();
  return id;
}

const lessonPath = (course: FlowCourse, index = 0) =>
  `/v1/courses/${course.id}/lessons/${course.lessons[index]!.id}`;

function setContent(
  course: FlowCourse,
  kind: string,
  payload: { mediaId?: string | null; body?: string | null },
  index = 0,
) {
  return admin.request<LessonContentsResponse>(
    "PUT",
    `${lessonPath(course, index)}/contents/${kind}`,
    payload,
  );
}

function selectKind(course: FlowCourse, contentType: string, index = 0) {
  return admin.request("PATCH", lessonPath(course, index), { contentType });
}

async function lessonRow(course: FlowCourse, index = 0) {
  return await flow.database
    .selectFrom("course_lessons")
    .select(["content_type", "content_media_id", "description"])
    .where("id", "=", course.lessons[index]!.id)
    .executeTakeFirstOrThrow();
}

async function kindsHeld(course: FlowCourse, index = 0) {
  const rows = await flow.database
    .selectFrom("course_lesson_contents")
    .select(["content_type", "media_id", "body"])
    .where("lesson_id", "=", course.lessons[index]!.id)
    .orderBy("content_type")
    .execute();
  return Object.fromEntries(rows.map((row) => [row.content_type, row]));
}

await test("a creator fills every kind of a lesson and switches between them without losing any", async () => {
  // A video lesson from before kinds existed: its video is on the lesson only.
  const course = await createCourse(flow, { pricing: "free", lessons: [{}] });
  const videoId = course.lessons[0]!.mediaId!;
  const audioId = await mediaAsset({ type: "audio", mimeType: "audio/mpeg" });
  const imageId = await mediaAsset({ type: "image", mimeType: "image/png" });
  const pdfId = await mediaAsset({
    type: "document",
    mimeType: "application/pdf",
  });

  const afterAudio = ok(
    await setContent(course, "audio", { mediaId: audioId }),
  );
  assert.equal(afterAudio.contentType, "video", "the selected kind stays");
  assert.equal(
    afterAudio.contentMediaId,
    videoId,
    "learners still see the video",
  );
  ok(await setContent(course, "image", { mediaId: imageId }));
  ok(await setContent(course, "document", { mediaId: pdfId }));

  ok(await selectKind(course, "audio"));
  assert.deepEqual(await lessonRow(course), {
    content_type: "audio",
    content_media_id: audioId,
    description: "What lesson 1 teaches.",
  });

  ok(await selectKind(course, "document"));
  assert.equal((await lessonRow(course)).content_media_id, pdfId);
  ok(await selectKind(course, "image"));
  assert.equal((await lessonRow(course)).content_media_id, imageId);

  // Back to the video it began with: kept although it was never a row.
  ok(await selectKind(course, "video"));
  assert.equal((await lessonRow(course)).content_media_id, videoId);

  const held = await kindsHeld(course);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(held).map(([kind, row]) => [kind, row.media_id]),
    ),
    { audio: audioId, document: pdfId, image: imageId, video: videoId },
  );

  // The editor's curriculum lists every kind with its file.
  const detail = ok<{
    sections: {
      lessons: {
        id: string;
        contents?: {
          contentType: string;
          media: { originalFilename: string } | null;
        }[];
      }[];
    }[];
  }>(await admin.get(`/v1/courses/${course.id}/editor`));
  const lesson = detail.sections[0]!.lessons[0]!;
  assert.deepEqual(
    lesson.contents?.map((content) => content.contentType).sort(),
    ["audio", "document", "image", "video"],
  );
  assert.ok(lesson.contents?.every((content) => content.media));
});

await test("switching to a kind never filled shows nothing, and filling it while selected shows it", async () => {
  const course = await createCourse(flow, { pricing: "free", lessons: [{}] });
  ok(await selectKind(course, "audio"));
  assert.equal((await lessonRow(course)).content_media_id, null);

  const audioId = await mediaAsset({ type: "audio", mimeType: "audio/mp4" });
  const filled = ok(await setContent(course, "audio", { mediaId: audioId }));
  assert.equal(filled.contentMediaId, audioId);
  assert.equal((await lessonRow(course)).content_media_id, audioId);

  // Removing the selected kind's content leaves the lesson showing none.
  const cleared = ok(
    await admin.request<LessonContentsResponse>(
      "DELETE",
      `${lessonPath(course)}/contents/audio`,
    ),
  );
  assert.equal(cleared.contentMediaId, null);
  assert.equal((await lessonRow(course)).content_media_id, null);
  assert.equal((await kindsHeld(course)).audio, undefined);
  // The video it held before is still its video kind's.
  assert.ok((await kindsHeld(course)).video?.media_id);
});

await test("a file that does not suit its kind is refused", async () => {
  const course = await createCourse(flow, { pricing: "free", lessons: [{}] });
  const pdfId = await mediaAsset({
    type: "document",
    mimeType: "application/pdf",
  });
  failsWith(
    await setContent(course, "audio", { mediaId: pdfId }),
    400,
    "TYPE_MISMATCH",
  );

  const wordFile = await mediaAsset({
    type: "document",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  failsWith(
    await setContent(course, "document", { mediaId: wordFile }),
    400,
    "UNSUPPORTED_FILE",
  );

  const hugePdf = await mediaAsset({
    type: "document",
    mimeType: "application/pdf",
    sizeBytes: 51 * 1024 * 1024,
  });
  failsWith(
    await setContent(course, "document", { mediaId: hugePdf }),
    400,
    "FILE_TOO_LARGE",
  );

  const halfUploaded = await mediaAsset({
    type: "audio",
    mimeType: "audio/mpeg",
    status: "uploading",
  });
  failsWith(
    await setContent(course, "audio", { mediaId: halfUploaded }),
    400,
    "UPLOAD_INCOMPLETE",
  );

  failsWith(
    await setContent(course, "audio", { body: "Some text" }),
    400,
    "BODY_ONLY_DOCUMENT",
  );

  // The old way of changing a lesson's file is held to the same rule.
  failsWith(
    await admin.request("PATCH", lessonPath(course), {
      contentType: "document",
      contentMediaId: wordFile,
    }),
    400,
    "UNSUPPORTED_FILE",
  );
  assert.equal((await lessonRow(course)).content_type, "video");
});

await test("a reading's text moves out of its description, and learners read the new text", async () => {
  const course = await createCourse(flow, { pricing: "free", lessons: [{}] });
  // A reading lesson from before kinds: its text is its description.
  await flow.database
    .updateTable("course_lessons")
    .set({
      content_type: "document",
      content_media_id: null,
      description: "The old reading.",
    })
    .where("id", "=", course.lessons[0]!.id)
    .execute();
  const { client } = await signedUpLearner(flow);
  assert.equal((await enrollForFree(client, course)).status, 200);
  const readDescription = async () =>
    ok<{ description: string | null }>(
      await client.get(`${lessonPath(course)}/description`),
    ).description;

  assert.equal(await readDescription(), "The old reading.");

  ok(await setContent(course, "document", { body: "## The new reading" }));
  assert.equal((await lessonRow(course)).description, null);
  assert.equal(await readDescription(), "## The new reading");
});

await test("an audio or image lesson's file is given to whoever may open the lesson, never cached", async () => {
  const course = await createCourse(flow, {
    pricing: "paid",
    lessons: [{ preview: true }, {}, {}],
  });
  const audioId = await mediaAsset({ type: "audio", mimeType: "audio/mpeg" });
  const imageId = await mediaAsset({ type: "image", mimeType: "image/webp" });
  ok(await setContent(course, "audio", { mediaId: audioId }, 0));
  ok(await selectKind(course, "audio", 0));
  ok(await setContent(course, "image", { mediaId: imageId }, 1));
  ok(await selectKind(course, "image", 1));

  const link = (client = flow.visitor(), index = 0) =>
    client.get<{ url: string; mimeType: string; expiresAt: string }>(
      `${lessonPath(course, index)}/media-link`,
    );

  // A preview lesson is open to a visitor.
  const preview = await link();
  const opened = ok(preview);
  assert.equal(preview.headers["cache-control"], "private, no-store");
  assert.equal(opened.mimeType, "audio/mpeg");
  assert.ok(opened.url.includes(audioId), "the address names the file");
  assert.ok(Date.parse(opened.expiresAt) > Date.now());

  // A locked one asks a visitor to sign in, and a learner without the course
  // is refused.
  failsWith(await link(flow.visitor(), 1), 401, "LESSON_LOGIN_REQUIRED");
  const { client } = await signedUpLearner(flow);
  failsWith(await link(client, 1), 403, "COURSE_ACCESS_DENIED");

  // A video lesson has no such file.
  failsWith(await link(admin, 2), 404, "LESSON_MEDIA_NOT_FOUND");
});

await flow.close();
