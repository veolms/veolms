import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_MARKETING_DESIGN,
  fillMarketingVariables,
  MARKETING_THEME_COLORS,
  marketingBlocksSchema,
  marketingLinkNumber,
  readMarketingDesign,
} from "@veolms/contracts";
import { marketingEmail, marketingLinkAt } from "@veolms/services/email";

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

await test("links written in text are tracked, and each tracked number finds its address again", () => {
  const blocks = marketingBlocksSchema.parse([
    { id: "h", type: "heading", text: "News" },
    {
      id: "t",
      type: "text",
      text: "Read [the guide](https://example.com/guide) and [the notes](https://example.com/notes).\n\nBye [bad](javascript:alert(1))",
    },
    {
      id: "b",
      type: "button",
      label: "Go",
      url: "https://example.com/go",
    },
  ]);
  const content = marketingEmail({
    academyName: "ProCodrr",
    subject: "Hi",
    preheader: "",
    blocks,
    recipient: { firstName: "Asha", fullName: null },
    linkFor: (number) => `https://api.test/c/${number}`,
    reason: "You're a student.",
  });
  const first = marketingLinkNumber(1, 0);
  const second = marketingLinkNumber(1, 1);
  assert.match(content.html, new RegExp(`/c/${first}"`, "u"));
  assert.match(content.html, new RegExp(`/c/${second}"`, "u"));
  assert.match(content.html, /\/c\/2"/u, "the button keeps its place");
  assert.doesNotMatch(
    content.html,
    /href="javascript:/u,
    "an unsafe link stays plain text",
  );
  assert.equal(
    marketingLinkAt(blocks, first, null),
    "https://example.com/guide",
  );
  assert.equal(
    marketingLinkAt(blocks, second, null),
    "https://example.com/notes",
  );
  assert.equal(marketingLinkAt(blocks, 2, null), "https://example.com/go");
  assert.equal(marketingLinkAt(blocks, 0, null), null, "a heading has none");
  assert.equal(
    marketingLinkAt(blocks, marketingLinkNumber(1, 5), null),
    null,
    "past the last link in the text",
  );
  assert.match(content.text, /the guide \(https:\/\/example\.com\/guide\)/u);
});

await test("the theme and accent colour the email, and the button text stays readable", () => {
  const blocks = [
    { id: "b", type: "button", label: "Go", url: "https://example.com/go" },
  ];
  const render = (design: Parameters<typeof marketingEmail>[0]["design"]) =>
    marketingEmail({
      academyName: "ProCodrr",
      subject: "Hi",
      preheader: "",
      blocks,
      design,
      recipient: { firstName: null, fullName: null },
      reason: "You're a student.",
    }).html;
  const clean = render({
    theme: "clean",
    accent: null,
    font: "classic",
    headerAlign: "center",
  });
  assert.match(clean, new RegExp(MARKETING_THEME_COLORS.clean.page, "u"));
  assert.match(clean, /content="light"/u);
  assert.match(clean, /Georgia/u);
  const yellow = render({
    theme: "midnight",
    accent: "#FACC15",
    font: "modern",
    headerAlign: "left",
  });
  assert.match(yellow, /background-color:#FACC15/u);
  assert.match(
    yellow,
    /color:#111827;text-decoration:none">Go/u,
    "dark text on a light button",
  );
  assert.match(render(undefined), /content="dark"/u, "the default stays dark");
});

await test("coupon, card and quote blocks show what the creator wrote, escaped", () => {
  const content = marketingEmail({
    academyName: "ProCodrr",
    subject: "Offer",
    preheader: "",
    blocks: [
      {
        id: "k",
        type: "coupon",
        code: "SAVE20",
        title: "Your code",
        note: "Ends <b>soon</b>",
      },
      { id: "bad", type: "coupon", code: "has space" },
      {
        id: "c",
        type: "card",
        source: "course",
        sourceId: null,
        title: "Git Basics",
        meta: "Online course",
        text: "Learn **Git**",
        imageUrl: "https://cdn.test/git.png",
        url: "{course_link}",
        buttonLabel: "See it",
      },
      { id: "q", type: "quote", text: "Loved it", name: "Ravi" },
    ],
    recipient: { firstName: "Asha", fullName: null },
    course: { title: "Git", url: "https://academy.test/courses/git/overview" },
    reason: "You're a student.",
  });
  assert.match(content.html, />SAVE20</u);
  assert.match(content.html, /Ends &lt;b&gt;soon&lt;\/b&gt;/u);
  assert.doesNotMatch(content.html, /has space/u, "a bad code is left out");
  assert.match(
    content.html,
    /https:\/\/academy\.test\/courses\/git\/overview/u,
  );
  assert.match(content.html, /cdn\.test\/git\.png/u);
  assert.match(content.html, /<strong[^>]*>Git<\/strong>/u);
  assert.match(content.html, /Loved it/u);
  assert.match(content.html, /— Ravi/u);
  assert.match(content.text, /Your code — SAVE20/u);
});

await test("blocks saved before styles existed still read, with the old look", () => {
  const [heading, image] = marketingBlocksSchema.parse([
    { id: "h", type: "heading", text: "Old" },
    { id: "i", type: "image", url: "https://cdn.test/a.png" },
  ]);
  assert.equal(heading?.type === "heading" && heading.size, "large");
  assert.equal(heading?.type === "heading" && heading.align, "left");
  assert.equal(image?.type === "image" && image.size, "full");
  assert.deepEqual(readMarketingDesign(undefined), DEFAULT_MARKETING_DESIGN);
  assert.deepEqual(
    readMarketingDesign({ theme: "nope" }),
    DEFAULT_MARKETING_DESIGN,
  );
});
