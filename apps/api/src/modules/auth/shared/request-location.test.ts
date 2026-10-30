import assert from "node:assert/strict";
import { test } from "node:test";

import { formatSessionLocation, requestLocation } from "./request-location.ts";

await test("a request's place comes from Cloudflare's headers", () => {
  assert.deepEqual(
    requestLocation({
      "cf-ipcity": "S%C3%A3o%20Paulo",
      "cf-region": "Sao Paulo",
      "cf-ipcountry": "br",
    }),
    { city: "São Paulo", region: "Sao Paulo", country: "BR" },
  );
});

await test("an unknown country, Tor, or no headers at all is no place", () => {
  assert.deepEqual(requestLocation({ "cf-ipcountry": "XX" }), {
    city: null,
    region: null,
    country: null,
  });
  assert.equal(requestLocation({ "cf-ipcountry": "T1" }).country, null);
  assert.equal(requestLocation({ "cf-ipcountry": "<b>" }).country, null);
  assert.deepEqual(requestLocation({}), {
    city: null,
    region: null,
    country: null,
  });
});

await test("a place name is kept short and free of control characters", () => {
  const city = requestLocation({
    "cf-ipcity": `A\u0000B${"c".repeat(200)}`,
  }).city;
  assert.equal(city?.startsWith("AB"), true);
  assert.equal(city?.length, 80);
});

await test("a place reads city, region, country, each once", () => {
  assert.equal(
    formatSessionLocation({
      location_city: "Mumbai",
      location_region: "Maharashtra",
      location_country: "IN",
    }),
    "Mumbai, Maharashtra, India",
  );
  assert.equal(
    formatSessionLocation({
      location_city: "Delhi",
      location_region: "Delhi",
      location_country: "IN",
    }),
    "Delhi, India",
  );
  assert.equal(
    formatSessionLocation({
      location_city: null,
      location_region: null,
      location_country: null,
    }),
    null,
  );
});
