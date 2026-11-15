import assert from "node:assert/strict";
import { validateHeaderValue } from "node:http";
import { test } from "node:test";

import { getDiscussionAttachmentDisposition } from "./discussion-upload.storage.ts";

// macOS names screenshots with a narrow no-break space (U+202F) before "PM".
const MAC_SCREENSHOT = "Screenshot 2026-11-15 at 10.50.24 PM.png";

test("a file name with characters beyond ASCII still makes a valid header", () => {
  const disposition = getDiscussionAttachmentDisposition(
    "image/png",
    MAC_SCREENSHOT,
  );
  // What Node checks before sending a header (it refused the old value).
  assert.doesNotThrow(() =>
    validateHeaderValue("Content-Disposition", disposition),
  );
  assert.equal(
    disposition,
    `inline; filename="Screenshot 2026-11-15 at 10.50.24_PM.png"; filename*=UTF-8''Screenshot%202026-11-15%20at%2010.50.24%E2%80%AFPM.png`,
  );
});

test("documents download and quotes in names cannot break the header", () => {
  const disposition = getDiscussionAttachmentDisposition(
    "application/pdf",
    'notes "final".pdf',
  );
  assert.match(disposition, /^attachment; filename="notes _final_\.pdf"; /);
  assert.doesNotThrow(() =>
    validateHeaderValue("Content-Disposition", disposition),
  );
});

test("a missing name falls back to a plain one", () => {
  assert.equal(
    getDiscussionAttachmentDisposition("image/jpeg"),
    `inline; filename="attachment"; filename*=UTF-8''attachment`,
  );
});
