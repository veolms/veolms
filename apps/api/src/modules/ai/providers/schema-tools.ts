/**
 * JSON Schema helpers shared by the adapters. Features write one schema;
 * each provider has its own rules for it.
 */

type Schema = Record<string, unknown>;

const isObject = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * OpenAI-style strict mode: every object lists all its properties as
 * required and allows no others. A property that was optional becomes
 * "this type or null"; `dropNulls` then removes those nulls again, so the
 * feature sees the shape it asked for.
 */
export function strictSchema(schema: Schema): Schema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObject(node)) return node;
    const out: Schema = {};
    for (const [key, value] of Object.entries(node)) out[key] = walk(value);
    if (out.type === "object" && isObject(out.properties)) {
      const required = new Set(
        Array.isArray(node.required) ? (node.required as string[]) : [],
      );
      const properties: Schema = {};
      for (const [key, value] of Object.entries(out.properties)) {
        properties[key] =
          required.has(key) || !isObject(value) ? value : nullable(value);
      }
      out.properties = properties;
      out.required = Object.keys(properties);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(schema) as Schema;
}

function nullable(schema: Schema): Schema {
  const type = schema.type;
  if (typeof type === "string") return { ...schema, type: [type, "null"] };
  if (Array.isArray(type))
    return type.includes("null")
      ? schema
      : { ...schema, type: [...type, "null"] };
  return { anyOf: [schema, { type: "null" }] };
}

/**
 * Removes the nulls strict mode put in place of optional properties
 * (properties the original schema did not require).
 */
export function dropNulls(value: unknown, schema: Schema): unknown {
  if (Array.isArray(value)) {
    const items = isObject(schema.items) ? schema.items : {};
    return value.map((item) => dropNulls(item, items));
  }
  if (!isObject(value) || !isObject(schema.properties)) return value;
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const out: Schema = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null && !required.has(key)) continue;
    const child = schema.properties[key];
    out[key] = isObject(child) ? dropNulls(item, child) : item;
  }
  return out;
}
