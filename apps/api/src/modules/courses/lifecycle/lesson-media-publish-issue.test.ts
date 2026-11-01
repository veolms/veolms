import assert from "node:assert/strict";
import { test } from "node:test";
import { lessonMediaPublishIssue } from "./lesson-media-publish-issue.ts";

const CREATOR = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-8222-222222222222";
const MEDIA = "33333333-3333-4333-8333-333333333333";

const lesson = (content_type: string, content_media_id: string | null) => ({
  title: "Intro",
  content_type,
  content_media_id,
});
const issue = (
  content_type: string,
  media: { owner_id: string; status: string } | undefined,
  actorIsAdmin = false,
  content_media_id: string | null = MEDIA,
) =>
  lessonMediaPublishIssue({
    lesson: lesson(content_type, content_media_id),
    media,
    courseCreatorId: CREATOR,
    actorIsAdmin,
  });

await test("a lesson with no media attached does not block publishing", () => {
  // The case that used to answer "does not have media content attached".
  assert.equal(issue("video", undefined, false, null), null);
  assert.equal(issue("document", undefined, false, null), null);
  assert.equal(issue("video", undefined, true, null), null);
});

await test("a quiz lesson is not checked", () => {
  assert.equal(issue("quiz", undefined, false, null), null);
});

await test("attached media that is the creator's and finished is fine", () => {
  assert.equal(issue("video", { owner_id: CREATOR, status: "ready" }), null);
  assert.equal(issue("document", { owner_id: CREATOR, status: "ready" }), null);
  assert.equal(
    issue("document", { owner_id: CREATOR, status: "uploaded" }),
    null,
  );
});

await test("attached media that does not exist is refused", () => {
  assert.equal(
    issue("video", undefined),
    'Media for lesson "Intro" was not found.',
  );
  assert.equal(
    issue("video", undefined, true),
    'Media for lesson "Intro" was not found.',
  );
});

await test("attached media owned by someone else is refused, except for an admin", () => {
  const media = { owner_id: SOMEONE_ELSE, status: "ready" };
  assert.equal(
    issue("video", media),
    'Media for lesson "Intro" was not found.',
  );
  assert.equal(
    issue("document", media),
    'Media for lesson "Intro" was not found.',
  );
  assert.equal(issue("video", media, true), null);
});

await test("an attached video that is not processed is refused", () => {
  for (const status of ["uploading", "uploaded", "processing", "failed"]) {
    assert.equal(
      issue("video", { owner_id: CREATOR, status }),
      'Video for lesson "Intro" is still processing or failed.',
    );
  }
});

await test("an attached document that is not uploaded is refused", () => {
  for (const status of ["uploading", "failed"]) {
    assert.equal(
      issue("document", { owner_id: CREATOR, status }),
      'Document for lesson "Intro" is not completely uploaded.',
    );
  }
});
