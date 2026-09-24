import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawDir = join(repoRoot, "performance", "raw");
const reportsDir = join(repoRoot, "performance", "reports");
const modulesDir = join(reportsDir, "modules");
const queryLogPath = resolve(process.env.PERF_QUERY_PATH ?? join(rawDir, "sql-query-observer.jsonl"));
const markerPath = resolve(process.env.PERF_QUERY_MARKERS ?? join(rawDir, "sql-query-markers.jsonl"));
const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/u, "");

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function appendMarker(value) {
  return appendFile(markerPath, `${JSON.stringify(value)}\n`, "utf8");
}

function queryStatus(queryCount, queryDurations, outcome) {
  if (outcome === "AUTH_REQUIRED") return "NOT_MEASURED_AUTH";
  if (outcome === "SERVER_ERROR" || outcome === "TIMEOUT" || outcome === "NETWORK_ERROR") return "PROBLEM";
  if (queryCount > 1 || Math.max(0, ...queryDurations) > 100) return "MULTI_QUERY_REVIEW";
  if (queryCount === 1) return "NO_N_PLUS_ONE_SIGN";
  return "NO_QUERY_OBSERVED";
}

function outcomeFor(status, error) {
  if (error) return error.name === "TimeoutError" || error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
  if (status >= 500) return "SERVER_ERROR";
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  if (status >= 200 && status < 300) return "SUCCESS";
  return "CLIENT_RESPONSE";
}

function isBackgroundQuery(query) {
  const text = query.text ?? "";
  return text.includes('"webhook_events"') ||
    text.includes('"payments"') ||
    text.includes('"refunds"') ||
    (text.includes('"orders"') && text.includes('"expires_at"'));
}

const baseline = JSON.parse(await readFile(join(rawDir, "api-baseline-results.json"), "utf8"));
const fixtures = baseline.fixtureValues ?? {};
function fixtureValue(name) {
  const lower = name.toLowerCase();
  if (lower === "slug" || lower.includes("courseslug")) return fixtures.courseSlug;
  if (lower.includes("courseid") || lower === "course") return fixtures.courseId;
  if (lower.includes("sectionid")) return fixtures.sectionId;
  if (lower.includes("lessonid")) return fixtures.lessonId;
  if (lower.includes("creatorid")) return fixtures.creatorId;
  if (lower.includes("userid")) return fixtures.userId;
  if (lower.endsWith("id") || lower === "id" || lower.includes("idorslug")) return fixtures.id;
  if (lower.includes("username")) return "perf-user-0001";
  if (lower.includes("filename")) return "perf-placeholder.txt";
  if (lower.includes("width")) return "320";
  return "test";
}
function operationUrl(operation) {
  if (operation.url) return operation.url;
  const path = operation.path.replace(/\{([^}]+)\}/gu, (_match, name) => encodeURIComponent(String(fixtureValue(name))));
  return `${baseUrl}${path}`;
}
const operations = baseline.operations.map((operation) => ({
  ...operation,
  url: operationUrl(operation),
}));
await writeFile(queryLogPath, "", "utf8");
await writeFile(markerPath, "", "utf8");

const traces = [];
for (let index = 0; index < operations.length; index += 1) {
  const operation = operations[index];
  const traceId = `${index + 1}-${Date.now()}`;
  const start = new Date().toISOString();
  await appendMarker({ marker: true, traceId, phase: "start", operationId: operation.operationId, path: operation.path, timestamp: start });
  const started = performance.now();
  let status = 0;
  let bytes = 0;
  let error;
  try {
    const response = await fetch(operation.url, { signal: AbortSignal.timeout(15000), redirect: "manual" });
    status = response.status;
    bytes = (await response.arrayBuffer()).byteLength;
  } catch (caught) {
    error = caught;
  }
  const durationMs = performance.now() - started;
  const end = new Date().toISOString();
  await sleep(100);
  await appendMarker({ marker: true, traceId, phase: "end", operationId: operation.operationId, path: operation.path, timestamp: end });
  traces.push({ traceId, operationId: operation.operationId, path: operation.path, tag: operation.tag, status, bytes, durationMs, outcome: outcomeFor(status, error), error: error ? String(error.message ?? error) : null, start, end });
}

await sleep(500);
const queries = (await readFile(queryLogPath, "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

for (const trace of traces) {
  const startMs = Date.parse(trace.start);
  const endMs = Date.parse(trace.end) + 250;
  const within = queries.filter((query) => {
    const timestamp = Date.parse(query.timestamp);
    return timestamp >= startMs && timestamp <= endMs && !isBackgroundQuery(query);
  });
  trace.queryCount = within.length;
  trace.queryDurations = within.map((query) => query.durationMs);
  trace.queryMaxMs = within.length ? Math.max(...trace.queryDurations) : 0;
  trace.queryTexts = within.map((query) => query.text).slice(0, 8);
  trace.sqlStatus = queryStatus(trace.queryCount, trace.queryDurations, trace.outcome);
  trace.payloadStatus = trace.bytes > 100000 ? "PAYLOAD_HEAVY" : trace.bytes > 50000 ? "PAYLOAD_CHECK" : "PAYLOAD_OK";
  trace.indexStatus = trace.queryCount > 0 && trace.queryMaxMs > 100 ? "EXPLAIN_REQUIRED" : "NOT_CHECKED";
}

await writeFile(join(rawDir, "api-query-trace.json"), `${JSON.stringify(traces, null, 2)}\n`, "utf8");

const modules = new Map();
for (const trace of traces) {
  if (!modules.has(trace.tag)) modules.set(trace.tag, []);
  modules.get(trace.tag).push(trace);
}

const summaryLines = [];
summaryLines.push("VEOLMS API SQL / PAYLOAD CHECK");
summaryLines.push(`Generated: ${new Date().toISOString()}`);
summaryLines.push("One safe GET request was sent to each documented GET operation.");
summaryLines.push("This is a diagnostic check, not a load test.");
summaryLines.push("");
summaryLines.push("STATUS KEY");
summaryLines.push("NO_N_PLUS_ONE_SIGN = one or zero SQL round-trips observed; not proof of perfect SQL.");
summaryLines.push("MULTI_QUERY_REVIEW = several SQL statements; this is not automatically N+1 and needs scale testing.");
summaryLines.push("EXPLAIN_REQUIRED = slow SQL was observed; run EXPLAIN before adding an index.");
summaryLines.push("PAYLOAD_HEAVY = response over 100 KB; check pagination and returned fields.");
summaryLines.push("");
summaryLines.push("ENDPOINT RESULTS");

for (const trace of traces.sort((a, b) => b.durationMs - a.durationMs)) {
  summaryLines.push(`${trace.operationId} | GET ${trace.path} | HTTP=${trace.status || trace.outcome} | total=${Math.round(trace.durationMs)}ms | SQL=${trace.queryCount} | SQL max=${Math.round(trace.queryMaxMs)}ms | bytes=${trace.bytes} | multi-query=${trace.sqlStatus} | index=${trace.indexStatus} | payload=${trace.payloadStatus}`);
}

for (const [tag, entries] of modules.entries()) {
  const path = join(modulesDir, `${slug(tag)}.txt`);
  const lines = [];
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {}
  const previousSqlSection = existing.indexOf("\nSQL / PAYLOAD CHECK");
  if (previousSqlSection >= 0) existing = existing.slice(0, previousSqlSection);
  if (existing.trim()) lines.push(existing.trimEnd(), "");
  lines.push("SQL / PAYLOAD CHECK");
  lines.push("One safe GET request per documented GET endpoint; background jobs can add small noise.");
  lines.push("");
  for (const trace of entries.sort((a, b) => b.durationMs - a.durationMs)) {
    lines.push(`${trace.operationId} | GET ${trace.path} | HTTP=${trace.status || trace.outcome} | total=${Math.round(trace.durationMs)}ms | SQL=${trace.queryCount} | SQL max=${Math.round(trace.queryMaxMs)}ms | multi-query=${trace.sqlStatus} | index=${trace.indexStatus} | payload=${trace.payloadStatus}`);
  }
  lines.push("");
  lines.push("SIMPLE ACTION");
  if (entries.some((entry) => entry.sqlStatus === "MULTI_QUERY_REVIEW")) lines.push("- Review multi-query endpoints; this check does not prove N+1. Compare query count as data grows.");
  else lines.push("- No multi-query endpoint was observed in this check.");
  if (entries.some((entry) => entry.indexStatus === "EXPLAIN_REQUIRED")) lines.push("- Run EXPLAIN for endpoints marked EXPLAIN_REQUIRED.");
  else lines.push("- No slow query crossed the EXPLAIN trigger in this small test.");
  if (entries.some((entry) => entry.payloadStatus === "PAYLOAD_HEAVY")) lines.push("- Reduce fields or paginate endpoints marked PAYLOAD_HEAVY.");
  else lines.push("- No response over 100 KB was observed in this module.");
  await appendFile(path, `${lines.join("\n")}\n`, "utf8");
}

await writeFile(join(reportsDir, "SQL_PAYLOAD_STATUS.txt"), `${summaryLines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({
  tracedOperations: traces.length,
  confirmedNPlusOne: 0,
  multiQueryReview: traces.filter((trace) => trace.sqlStatus === "MULTI_QUERY_REVIEW").length,
  explainRequired: traces.filter((trace) => trace.indexStatus === "EXPLAIN_REQUIRED").length,
  payloadHeavy: traces.filter((trace) => trace.payloadStatus === "PAYLOAD_HEAVY").length,
}, null, 2));
