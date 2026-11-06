import assert from "node:assert/strict";
import { test } from "node:test";

import { commentDeepLink } from "../learning/discussions/shared/discussion-notification.context.ts";
import { createNotificationIntents } from "./notifications.handlers.ts";
import { renderNotificationTemplate } from "./notifications.templates.ts";

const recipientUserId = "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b";
const brand = { name: "ProCodrr", logoUrl: null };
const noDependencies = {
  listActiveCourseRecipientUserIds: async () => [],
};

const commentLink = commentDeepLink({
  courseSlug: "the-complete-javascript-course",
  threadId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
});
const replyLink = commentDeepLink({
  courseSlug: "the-complete-javascript-course",
  threadId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
  replyId: "33333333-3333-4333-8333-333333333333",
});

async function render(type: string, payload: Record<string, unknown>) {
  const [intent] = await createNotificationIntents(
    type,
    payload as never,
    noDependencies,
  );
  assert.ok(intent);
  return renderNotificationTemplate(
    intent.templateKey,
    intent.templateData,
    intent.deepLink,
    brand,
  );
}

await test("a comment link opens its lecture with the comment highlighted", () => {
  assert.equal(
    commentLink,
    "/learn/the-complete-javascript-course?lessonId=22222222-2222-4222-8222-222222222222&thread=11111111-1111-4111-8111-111111111111&focus=comment",
  );
  assert.match(replyLink, /&reply=33333333-3333-4333-8333-333333333333&/u);
  assert.match(replyLink, /focus=comment$/u);
});

await test("the mention email names the lecture, quotes the comment and links to it", async () => {
  const { email } = await render("user.mentioned", {
    recipientUserId,
    actorName: "Anurag Singh",
    context: "@nilesh test comment",
    deepLink: commentLink,
    lessonTitle: "2. Download ProCodrr Mobile App",
    courseTitle: "The Complete JavaScript Course",
    occurredAt: "2026-11-02T15:58:00.000Z",
  });

  assert.equal(email.subject, "Anurag Singh mentioned you in a discussion");
  assert.match(email.html, /New mention/u);
  assert.match(
    email.html,
    /On 2\. Download ProCodrr Mobile App · The Complete JavaScript Course/u,
  );
  assert.match(email.html, /View comment →/u);
  assert.match(email.html, />@nilesh<\/span> test comment/u);
  assert.match(email.html, /Nov 2, 2026/u);
  assert.match(email.html, /Notification settings/u);
  assert.match(email.text, /View comment: http\S+&focus=comment&via=email/u);
  assert.doesNotMatch(email.html + email.text, /VeoLMS/u);
});

await test("the reply email says who replied and shows the comment replied to", async () => {
  const rendered = await render("discussion.reply_created", {
    recipientUserId,
    actorName: "Anurag Singh",
    threadTitle: "my question about closures",
    replySnippet: "test reply",
    deepLink: replyLink,
    lessonTitle: "Closures",
    courseTitle: "The Complete JavaScript Course",
    recipientRole: "author",
    originalSnippet: "my question about closures",
  });

  assert.equal(rendered.email.subject, "Anurag Singh replied to your comment");
  assert.equal(rendered.inApp.title, "Anurag Singh replied to your comment");
  assert.match(rendered.email.html, /New reply/u);
  assert.match(rendered.email.html, /Your comment/u);
  assert.match(rendered.email.html, /my question about closures/u);
  assert.match(rendered.email.html, /View reply →/u);
  assert.match(
    rendered.email.text,
    /View reply: http\S+reply=33333333-3333-4333-8333-333333333333\S*&via=email/u,
  );
  assert.doesNotMatch(rendered.email.subject, /Discussion Thread/u);
});

await test("a follower is told the reply is in a discussion they follow", async () => {
  const { email } = await render("discussion.reply_created", {
    recipientUserId,
    actorName: "Anurag Singh",
    threadTitle: "closures",
    replySnippet: "test reply",
    deepLink: replyLink,
    recipientRole: "follower",
  });
  assert.equal(
    email.subject,
    "Anurag Singh replied in a discussion you follow",
  );
});

await test("an event from before the email context still renders", async () => {
  const { email, inApp } = await render("discussion.reply_created", {
    recipientUserId,
    actorName: "Anurag Singh",
    threadTitle: "closures",
    replySnippet: "test reply",
    deepLink:
      "/learn/the-complete-javascript-course?thread=11111111-1111-4111-8111-111111111111",
  });
  assert.equal(inApp.title, "New reply on closures");
  assert.match(email.html, /View reply →/u);
  // Not a comment-focus link: nothing to mark as opened from an email.
  assert.doesNotMatch(email.text, /via=email/u);
});
