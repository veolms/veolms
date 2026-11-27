import assert from "node:assert/strict";
import { test } from "node:test";

import { fileMatchesSearch } from "./file-search.ts";

const photo = {
  name: "IMG_2041.jpg",
  place: "Complete Next.js Course",
  kind: "image",
  source: "chat",
} as const;
const notes = {
  name: "Week 3 notes.pdf",
  place: "Bhupesh Kumar",
  kind: "file",
  source: "chat",
} as const;
const receipt = {
  name: "receipt.png",
  place: "Payment didn't go through",
  kind: "image",
  source: "support",
} as const;

await test("finds a file by part of its name, as typed", () => {
  assert.equal(fileMatchesSearch("img_20", photo), true);
  assert.equal(fileMatchesSearch("notes", notes), true);
  assert.equal(fileMatchesSearch("notes", photo), false);
});

await test("allows a typo in a word of four letters or more", () => {
  assert.equal(fileMatchesSearch("phtoo", photo), true, "photo, two swapped");
  assert.equal(fileMatchesSearch("docment", notes), true);
  assert.equal(fileMatchesSearch("bhupseh", notes), true);
  assert.equal(fileMatchesSearch("vdeo", photo), false, "a photo is no video");
});

await test("every word must be found, in any order, across name, place and kind", () => {
  assert.equal(fileMatchesSearch("course photo", photo), true);
  assert.equal(fileMatchesSearch("photo course", photo), true);
  assert.equal(fileMatchesSearch("nextjs", photo), true, "dots left out");
  assert.equal(fileMatchesSearch("course document", photo), false);
  assert.equal(fileMatchesSearch("support payment", receipt), true);
  assert.equal(fileMatchesSearch("chat payment", receipt), false);
});

await test("an empty search finds everything", () => {
  assert.equal(fileMatchesSearch("", notes), true);
  assert.equal(fileMatchesSearch("   ", notes), true);
});

await test("a few thousand files are searched quickly", () => {
  const files = Array.from({ length: 5_000 }, (_, i) => ({
    name: `recording-${i} final version.mp4`,
    place: i % 2 ? "Complete JavaScript Course" : "Rahul Sharma",
    kind: "video" as const,
    source: "chat" as const,
  }));
  const started = performance.now();
  const found = files.filter((file) =>
    fileMatchesSearch("javscript vdieo", file),
  );
  const took = performance.now() - started;
  assert.equal(found.length, 2_500);
  assert.ok(took < 1_000, `took ${Math.round(took)} ms`);
});
