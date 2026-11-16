import assert from "node:assert/strict";
import { test } from "node:test";

import {
  confirmationState,
  firstNameOf,
  maskEmail,
  presentWelcome,
} from "./order-confirmation.service.ts";

await test("each order status reads as one state on the order page", () => {
  assert.equal(confirmationState("paid", 49_900), "paid");
  assert.equal(confirmationState("paid", 0), "free");
  assert.equal(confirmationState("pending", 49_900), "pending");
  assert.equal(confirmationState("payment_processing", 49_900), "pending");
  assert.equal(confirmationState("payment_failed", 49_900), "failed");
  assert.equal(confirmationState("cancelled", 49_900), "failed");
  assert.equal(confirmationState("expired", 49_900), "failed");
  assert.equal(confirmationState("refunded", 49_900), "refunded");
  assert.equal(confirmationState("partially_refunded", 49_900), "refunded");
});

await test("the email hint shows the first letter and the domain only", () => {
  assert.equal(maskEmail("asha@gmail.com"), "a•••@gmail.com");
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail("not-an-email"), null);
});

await test("the first name is the display name's first word", () => {
  assert.equal(
    firstNameOf({ display_name: "Asha Verma", username: "asha" }),
    "Asha",
  );
  assert.equal(firstNameOf({ display_name: null, username: "asha" }), "");
  assert.equal(firstNameOf(undefined), "");
});

await test("the welcome fills in the name and drops a link that is not https", () => {
  assert.deepEqual(
    presentWelcome(
      {
        message: "Hi {first_name}, and {first_name} again",
        linkLabel: "Group",
        linkUrl: "https://chat.whatsapp.com/x",
      },
      "Asha",
    ),
    {
      message: "Hi Asha, and Asha again",
      link: { label: "Group", url: "https://chat.whatsapp.com/x" },
    },
  );
  assert.deepEqual(
    presentWelcome(
      { message: "Hi {first_name}", linkLabel: "Bad", linkUrl: "javascript:x" },
      "",
    ),
    { message: "Hi there", link: null },
  );
  assert.equal(
    presentWelcome({ message: "  ", linkLabel: null, linkUrl: null }, "Asha"),
    null,
  );
});
