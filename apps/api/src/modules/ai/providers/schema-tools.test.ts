import assert from "node:assert/strict";
import { test } from "node:test";
import { dropNulls, strictSchema } from "./schema-tools.ts";

const SCHEMA = {
  type: "object",
  required: ["title", "items"],
  properties: {
    title: { type: "string" },
    note: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, hint: { type: "string" } },
      },
    },
  },
};

void test("strict mode: every property required, optional ones may be null", () => {
  const strict = strictSchema(SCHEMA) as {
    required: string[];
    additionalProperties: boolean;
    properties: {
      title: { type: unknown };
      note: { type: unknown };
      items: {
        items: {
          required: string[];
          additionalProperties: boolean;
          properties: { hint: { type: unknown } };
        };
      };
    };
  };
  assert.deepEqual(strict.required, ["title", "note", "items"]);
  assert.equal(strict.additionalProperties, false);
  assert.equal(strict.properties.title.type, "string");
  assert.deepEqual(strict.properties.note.type, ["string", "null"]);
  assert.deepEqual(strict.properties.items.items.required, ["name", "hint"]);
  assert.equal(strict.properties.items.items.additionalProperties, false);
  assert.deepEqual(strict.properties.items.items.properties.hint.type, [
    "string",
    "null",
  ]);
});

void test("the nulls strict mode adds are taken out again; required nulls stay", () => {
  assert.deepEqual(
    dropNulls(
      {
        title: null,
        note: null,
        items: [
          { name: "a", hint: null },
          { name: "b", hint: "x" },
        ],
      },
      SCHEMA,
    ),
    { title: null, items: [{ name: "a" }, { name: "b", hint: "x" }] },
  );
});
