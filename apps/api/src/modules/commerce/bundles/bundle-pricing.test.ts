import assert from "node:assert/strict";
import { test } from "node:test";

import { bundleCharge, bundleSaves } from "./bundle-pricing.ts";

const NODE = { courseId: "node", price: 8999 };
const SYSTEM_DESIGN = { courseId: "sd", price: 5999 };
const REACT = { courseId: "react", price: 6999 };

await test("a buyer who owns nothing pays the bundle price and saves the difference", () => {
  assert.deepEqual(
    bundleCharge({
      bundlePrice: 11999,
      courses: [NODE, SYSTEM_DESIGN],
      ownedCourseIds: new Set(),
    }),
    {
      apart: 14998,
      charge: 11999,
      saving: 2999,
      ownedShare: 0,
      ownsAll: false,
    },
  );
});

await test("an owned course takes away its share, so the rest keeps the bundle discount", () => {
  const result = bundleCharge({
    bundlePrice: 11999,
    courses: [NODE, SYSTEM_DESIGN],
    ownedCourseIds: new Set(["sd"]),
  });
  // System Design is 5,999 of 14,998: that share of 11,999 (4,799) comes off.
  assert.equal(result.charge, 7200);
  assert.equal(result.ownedShare, 4799);
  assert.equal(result.saving, 8999 - 7200);
  assert.equal(result.ownsAll, false);
});

await test("owning every course leaves nothing to pay and says so", () => {
  const result = bundleCharge({
    bundlePrice: 15999,
    courses: [NODE, SYSTEM_DESIGN, REACT],
    ownedCourseIds: new Set(["node", "sd", "react"]),
  });
  assert.equal(result.ownsAll, true);
  assert.equal(result.charge, 0);
});

await test("a bundle is offered only with two courses and a real saving", () => {
  assert.equal(
    bundleSaves({ bundlePrice: 11999, courses: [NODE, SYSTEM_DESIGN] }),
    true,
  );
  assert.equal(
    bundleSaves({ bundlePrice: 14998, courses: [NODE, SYSTEM_DESIGN] }),
    false,
  );
  assert.equal(bundleSaves({ bundlePrice: 5000, courses: [NODE] }), false);
});
