import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../packages/database/package.json", import.meta.url));
const { Client } = require("pg");
const outputPath = resolve(process.env.PERF_QUERY_PATH ?? "performance/raw/sql-query-observer.jsonl");
await mkdir(dirname(outputPath), { recursive: true });

let writeChain = Promise.resolve();
function record(value) {
  writeChain = writeChain.then(() => appendFile(outputPath, `${JSON.stringify(value)}\n`, "utf8"));
}

const originalQuery = Client.prototype.query;
Client.prototype.query = function observedQuery(...args) {
  const startedAt = process.hrtime.bigint();
  const first = args[0];
  const text = (typeof first === "string" ? first : first?.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
  const values = typeof first === "string" ? args[1] : first?.values;
  const result = originalQuery.apply(this, args);
  if (!result || typeof result.then !== "function") return result;

  return result.then(
    (response) => {
      record({
        timestamp: new Date().toISOString(),
        ok: true,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        rowCount: response?.rowCount ?? null,
        parameterCount: Array.isArray(values) ? values.length : 0,
        text,
      });
      return response;
    },
    (error) => {
      record({
        timestamp: new Date().toISOString(),
        ok: false,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        error: String(error?.message ?? error),
        parameterCount: Array.isArray(values) ? values.length : 0,
        text,
      });
      throw error;
    },
  );
};
