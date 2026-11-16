import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fillMarketingVariables,
  marketingBlocksSchema,
} from "@veolms/contracts";
import { marketingEmail } from "@veolms/services/email";

import {
  createTrackingToken,
  readTrackingToken,
} from "./marketing-tracking.ts";

const secret = "a-test-secret-that-is-long-enough-for-hmac";
const emailId = "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b";
const userId = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

await test("a tracking token names the email, the person and the block, and reads back", () => {
  const token = createTrackingToken(
    { kind: "click", emailId, userId, blockIndex: 3 },
    secret,
  );
  assert.deepEqual(readTrackingToken(token, secret), {
    kind: "click",
    emailId,
    userId,
    blockIndex: 3,
  });
});

await test("a changed or foreign tracking token is refused", () => {
  const token = createTrackingToken(
    { kind: "open", emailId, userId, blockIndex: 0 },
    secret,
  );
  assert.equal(
    readTrackingToken(token, "another-secret-entirely-long-enough"),
    null,
  );
  const [payload] = token.split(".");
  const forged = Buffer.from(`c.${emailId}.${userId}.9`).toString("base64url");
  assert.equal(
    readTrackingToken(`${forged}.${token.split(".")[1]}`, secret),
    null,
  );
  assert.equal(readTrackingToken(`${payload}`, secret), null);
  assert.equal(readTrackingToken("not-a-token.at-all", secret), null);
});

await test("variables are filled in, with a friendly word when a value is missing", () => {
  assert.equal(
    fillMarketingVariables("Hi {first_name}, welcome to {academy_name}", {
      first_name: "Asha",
      academy_name: "ProCodrr",
    }),
    "Hi Asha, welcome to ProCodrr",
  );
  assert.equal(
    fillMarketingVariables("Hi {first_name}!", { first_name: "  " }),
    "Hi there!",
  );
  assert.equal(
    fillMarketingVariables("Use {code}", {}),
    "Use {code}",
    "unknown words stay",
  );
});

await test("blocks refuse unsafe links and images", () => {
  assert.equal(
    marketingBlocksSchema.safeParse([
      { id: "a", type: "button", label: "Go", url: "javascript:alert(1)" },
    ]).success,
    false,
  );
  assert.equal(
    marketingBlocksSchema.safeParse([
      { id: "a", type: "image", url: "http://example.com/a.png" },
    ]).success,
    false,
    "images must be https, or mail apps show warnings",
  );
  assert.equal(
    marketingBlocksSchema.safeParse([
      { id: "a", type: "button", label: "Open", url: "{course_link}" },
    ]).success,
    true,
  );
});

await test("the email escapes what the creator typed and tracks only the stored links", () => {
  const content = marketingEmail({
    academyName: "ProCodrr",
    subject: "Hi {first_name}",
    preheader: "Inside: a gift",
    blocks: [
      { id: "h", type: "heading", text: "<script>alert(1)</script>" },
      { id: "t", type: "text", text: "Line one\n\n**Bold** line" },
      {
        id: "b",
        type: "button",
        label: "Start",
        url: "https://example.com/start",
      },
      { id: "x", type: "button", label: "Broken", url: "not a url" },
      { id: "c", type: "button", label: "Course", url: "{course_link}" },
    ],
    recipient: { firstName: "Asha", fullName: "Asha Rao" },
    course: {
      title: "Git Basics",
      url: "https://academy.test/courses/git/overview",
    },
    linkFor: (index) => `https://api.test/v1/email/c/token-${index}`,
    openPixelUrl: "https://api.test/v1/email/o/open",
    unsubscribeUrl: "https://api.test/v1/email/unsubscribe/u?m=1",
    reason: "You're a student of ProCodrr.",
  });
  assert.equal(content.subject, "Hi Asha");
  assert.doesNotMatch(content.html, /<script>/u);
  assert.match(content.html, /<strong[^>]*>Bold<\/strong>/u);
  assert.match(
    content.html,
    /token-2/u,
    "the button's link is tracked by its place",
  );
  assert.match(content.html, /token-4/u, "the course button too");
  assert.doesNotMatch(content.html, /example\.com\/start/u);
  assert.doesNotMatch(
    content.html,
    /Broken/u,
    "a half-written block is left out",
  );
  assert.match(content.html, /email\/o\/open/u);
  assert.match(content.html, /Unsubscribe/u);
  assert.match(content.text, /Unsubscribe: https:\/\/api\.test/u);
});

await test("a preview has the real links and no tracking", () => {
  const content = marketingEmail({
    academyName: "ProCodrr",
    subject: "",
    preheader: "",
    blocks: [
      {
        id: "b",
        type: "button",
        label: "Start",
        url: "https://example.com/start",
      },
    ],
    recipient: { firstName: null, fullName: null },
    reason: "You're a student of ProCodrr.",
  });
  assert.equal(
    content.subject,
    "ProCodrr",
    "an empty subject falls back to the academy's name",
  );
  assert.match(content.html, /example\.com\/start/u);
  assert.doesNotMatch(content.html, /email\/o\//u);
});
