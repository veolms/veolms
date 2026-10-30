import assert from "node:assert/strict";
import { test } from "node:test";

import { isUniqueViolation } from "./db-errors.ts";

/** The fields of a pg DatabaseError that the helper reads. */
const violation = (constraint: string) =>
  Object.assign(new Error("duplicate key value"), {
    code: "23505",
    constraint,
  });

await test("any unique violation is one when no constraint is named", () => {
  assert.equal(isUniqueViolation(violation("course_bundles_slug_key")), true);
  assert.equal(isUniqueViolation(violation("anything_else")), true);
});

await test("a named constraint matches only that constraint", () => {
  const slug = violation("course_bundles_slug_key");
  assert.equal(isUniqueViolation(slug, "course_bundles_slug_key"), true);
  assert.equal(isUniqueViolation(slug, "course_bundle_items_unique"), false);
  assert.equal(
    isUniqueViolation(
      violation("payments_gateway_order_id_key"),
      "payments_gateway_payment_id_key",
    ),
    false,
  );
});

await test("other database errors and non-errors are not unique violations", () => {
  const foreignKey = Object.assign(new Error("fk"), {
    code: "23503",
    constraint: "course_bundles_slug_key",
  });
  assert.equal(isUniqueViolation(foreignKey), false);
  assert.equal(isUniqueViolation(foreignKey, "course_bundles_slug_key"), false);
  assert.equal(isUniqueViolation(new Error("plain")), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation("23505"), false);
  assert.equal(isUniqueViolation({ code: "23505" }, "some_key"), false);
});
