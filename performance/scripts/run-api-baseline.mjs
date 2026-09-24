import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const reportsDir = join(repoRoot, "performance", "reports");
const modulesDir = join(reportsDir, "modules");
const rawDir = join(repoRoot, "performance", "raw");
const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/u, "");
const levels = (process.env.USER_LEVELS ?? "5,10")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const durationSeconds = Number(process.env.DURATION_SECONDS ?? 15);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);
const thinkMs = Number(process.env.THINK_MS ?? 250);

await mkdir(modulesDir, { recursive: true });
await mkdir(rawDir, { recursive: true });

const methods = ["get", "post", "put", "patch", "delete"];

function title(value) {
  return String(value ?? "Other")
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isExcluded(path, operation) {
  const text = `${path} ${operation.operationId ?? ""} ${(operation.tags ?? []).join(" ")}`.toLowerCase();
  return /playback|stream|hls|segment|transcod|video-processing|video_processing/u.test(text);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return await response.json();
}

async function discoverOpenApi() {
  const candidates = ["/api/docs/json", "/api/docs/openapi.json", "/api/openapi.json"];
  let lastError;
  for (const path of candidates) {
    try {
      const document = await getJson(`${baseUrl}${path}`);
      if (document?.paths) return { path, document };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not load OpenAPI JSON from ${candidates.join(", ")}: ${lastError}`);
}

function unwrap(body) {
  return body?.data ?? body;
}

async function discoverFixtures() {
  const fixtures = {
    courseId: "00000000-0000-4000-8000-000000000001",
    courseSlug: "perf-course-0001",
    sectionId: "00000000-0000-4000-8000-000000000001",
    lessonId: "00000000-0000-4000-8000-000000000001",
    creatorId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000001",
    id: "00000000-0000-4000-8000-000000000001",
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/courses`, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.ok) {
      const courses = unwrap(await response.json())?.courses;
      const first = Array.isArray(courses) ? courses[0] : undefined;
      if (first?.id) fixtures.courseId = first.id;
      if (first?.slug) fixtures.courseSlug = first.slug;
    }
  } catch {}

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/courses/${encodeURIComponent(fixtures.courseSlug)}/overview`,
      { signal: AbortSignal.timeout(requestTimeoutMs) },
    );
    if (response.ok) {
      const overview = unwrap(await response.json());
      const section = overview?.sections?.[0];
      const lesson = section?.lessons?.[0];
      if (section?.id) fixtures.sectionId = section.id;
      if (lesson?.id) fixtures.lessonId = lesson.id;
    }
  } catch {}

  return fixtures;
}

function exampleFromSchema(schema, name) {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "boolean") return "false";
  if (schema.type === "integer" || schema.type === "number") return "1";
  if (name.toLowerCase().includes("email")) return "perf@example.com";
  if (name.toLowerCase().includes("slug")) return "perf-course-0001";
  return "test";
}

function valueForParameter(parameter, fixtures) {
  const name = String(parameter.name ?? "");
  const lower = name.toLowerCase();
  if (parameter.example !== undefined) return parameter.example;
  if (lower === "slug" || lower.includes("courseslug")) return fixtures.courseSlug;
  if (lower.includes("courseid") || lower === "course") return fixtures.courseId;
  if (lower.includes("sectionid")) return fixtures.sectionId;
  if (lower.includes("lessonid")) return fixtures.lessonId;
  if (lower.includes("creatorid")) return fixtures.creatorId;
  if (lower.includes("userid")) return fixtures.userId;
  if (lower.endsWith("id") || lower === "id" || lower.includes("idorslug")) return fixtures.id;
  return exampleFromSchema(parameter.schema, name);
}

function makeRequest(operation, templatePath, fixtures) {
  const parameters = operation.parameters ?? [];
  let path = templatePath;
  const query = new URLSearchParams();
  for (const parameter of parameters) {
    const value = valueForParameter(parameter, fixtures);
    if (value === undefined) continue;
    if (parameter.in === "path") {
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(value)));
    } else if (parameter.in === "query" && parameter.required) {
      query.set(parameter.name, String(value));
    }
  }
  const suffix = query.toString() ? `?${query}` : "";
  return `${baseUrl}${path}${suffix}`;
}

function classify(status, error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "TIMEOUT";
  if (error) return "NETWORK_ERROR";
  if (status >= 500) return "SERVER_ERROR";
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  if (status >= 200 && status < 300) return "SUCCESS";
  if (status >= 300 && status < 400) return "REDIRECT";
  if (status >= 400) return "CLIENT_RESPONSE";
  return "UNKNOWN";
}

async function requestOperation(operation) {
  const started = performance.now();
  try {
    const response = await fetch(operation.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    return {
      durationMs: performance.now() - started,
      status: response.status,
      bytes,
      outcome: classify(response.status),
    };
  } catch (error) {
    return {
      durationMs: performance.now() - started,
      status: 0,
      bytes: 0,
      outcome: classify(0, error),
      error: String(error?.message ?? error),
    };
  }
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function aggregate(records) {
  const durations = records.map((record) => record.durationMs);
  const bytes = records.map((record) => record.bytes);
  const outcomes = Object.fromEntries(
    ["SUCCESS", "AUTH_REQUIRED", "CLIENT_RESPONSE", "SERVER_ERROR", "TIMEOUT", "NETWORK_ERROR", "REDIRECT"]
      .map((key) => [key, records.filter((record) => record.outcome === key).length]),
  );
  return {
    requests: records.length,
    outcomes,
    avgMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.length ? Math.max(...durations) : 0,
    avgBytes: bytes.length ? bytes.reduce((sum, value) => sum + value, 0) / bytes.length : 0,
    maxBytes: bytes.length ? Math.max(...bytes) : 0,
  };
}

function statusFor(aggregateResult) {
  const realFailures = aggregateResult.outcomes.SERVER_ERROR + aggregateResult.outcomes.TIMEOUT + aggregateResult.outcomes.NETWORK_ERROR;
  if (realFailures > 0) return "PROBLEM";
  if (aggregateResult.p95Ms > 1000) return "PROBLEM";
  if (aggregateResult.p95Ms > 300 || aggregateResult.maxBytes > 100000) return "REVIEW";
  if (aggregateResult.outcomes.AUTH_REQUIRED === aggregateResult.requests) return "AUTH_REQUIRED";
  return "GOOD";
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function formatBytes(value) {
  if (value < 1024) return `${Math.round(value)} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function moduleNotes(tag, aggregateResult) {
  const notes = [];
  if (aggregateResult.outcomes.AUTH_REQUIRED === aggregateResult.requests) {
    notes.push("This module needs login; anonymous timing is only an auth-protection check.");
  }
  if (aggregateResult.p95Ms > 300) notes.push("Review the slowest endpoints first.");
  if (aggregateResult.maxBytes > 100000) notes.push("Payload may be larger than necessary; check list fields and pagination.");
  notes.push("N+1 status: not proven by Swagger timing; requires SQL query-count measurement.");
  notes.push("Index status: not proven by Swagger timing; requires EXPLAIN on the slow SQL query.");
  if (tag === "Courses") notes.push("Courses should also be checked for repeated correlated aggregates and large catalogue responses.");
  return notes;
}

const { path: openApiPath, document } = await discoverOpenApi();
const fixtures = await discoverFixtures();
const operations = [];
const mutations = [];
const excluded = [];

for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of methods) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    const item = {
      method: method.toUpperCase(),
      path,
      operationId: operation.operationId ?? `${method.toUpperCase()} ${path}`,
      tag: title(operation.tags?.[0] ?? "Other"),
      description: operation.summary ?? operation.description ?? "",
    };
    if (isExcluded(path, operation)) {
      excluded.push({ ...item, reason: "video processing/streaming scope excluded" });
      continue;
    }
    if (method !== "get") {
      mutations.push({ ...item, reason: "not executed automatically because it changes data" });
      continue;
    }
    operations.push({ ...item, url: makeRequest(operation, path, fixtures) });
  }
}

const allRecords = [];
const levelResults = {};
let sequence = 0;

for (const users of levels) {
  const records = [];
  const endAt = Date.now() + durationSeconds * 1000;
  async function worker(workerId) {
    while (Date.now() < endAt) {
      const operation = operations[sequence++ % operations.length];
      const result = await requestOperation(operation);
      records.push({ users, workerId, operationId: operation.operationId, path: operation.path, tag: operation.tag, ...result });
      if (thinkMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, thinkMs));
    }
  }
  await Promise.all(Array.from({ length: users }, (_, index) => worker(index + 1)));
  levelResults[users] = records;
  allRecords.push(...records);
}

const byOperation = new Map();
for (const record of allRecords) {
  const key = `${record.operationId} ${record.path}`;
  if (!byOperation.has(key)) byOperation.set(key, { operationId: record.operationId, path: record.path, tag: record.tag, levels: {} });
  const entry = byOperation.get(key);
  if (!entry.levels[record.users]) entry.levels[record.users] = [];
  entry.levels[record.users].push(record);
}

const operationResults = [...byOperation.values()].map((entry) => ({
  ...entry,
  levels: Object.fromEntries(Object.entries(entry.levels).map(([users, records]) => [users, { ...aggregate(records), status: statusFor(aggregate(records)) }])),
}));

const modules = new Map();
for (const entry of operationResults) {
  if (!modules.has(entry.tag)) modules.set(entry.tag, []);
  modules.get(entry.tag).push(entry);
}

const moduleResults = Object.fromEntries([...modules.entries()].map(([tag, entries]) => {
  const levelsResult = {};
  for (const users of levels) {
    const records = entries.flatMap((entry) => {
      const level = entry.levels[String(users)];
      return level ? allRecords.filter((record) => record.operationId === entry.operationId && record.users === users) : [];
    });
    levelsResult[users] = { ...aggregate(records), status: statusFor(aggregate(records)) };
  }
  return [tag, { operations: entries, levels: levelsResult, notes: moduleNotes(tag, levelsResult[levels.at(-1)]) }];
}));

const payload = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  openApiPath,
  users: levels,
  durationSeconds,
  thinkMs,
  fixtureValues: fixtures,
  counts: {
    totalDocumentedOperations: operations.length + mutations.length + excluded.length,
    getOperationsExecuted: operations.length,
    mutationsNotExecuted: mutations.length,
    excludedVideoOrStreaming: excluded.length,
  },
  operations: operationResults,
  modules: moduleResults,
  mutations,
  excluded,
};

await writeFile(join(rawDir, "openapi.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
await writeFile(join(rawDir, "api-baseline-results.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(join(rawDir, "mutation-inventory.json"), `${JSON.stringify(mutations, null, 2)}\n`, "utf8");
await writeFile(join(rawDir, "excluded-video-streaming.json"), `${JSON.stringify(excluded, null, 2)}\n`, "utf8");

for (const [tag, result] of Object.entries(moduleResults)) {
  const lines = [];
  lines.push(`MODULE: ${tag}`);
  lines.push(`BASE URL: ${baseUrl}`);
  lines.push(`TEST: GET endpoints from Swagger; ${durationSeconds}s per level; ${levels.join(" and ")} active users.`);
  lines.push("");
  lines.push("STATUS BY USER LEVEL");
  for (const users of levels) {
    const level = result.levels[users];
    lines.push(`${users} users: ${level.status} | requests=${level.requests} | p50=${formatMs(level.p50Ms)} | p95=${formatMs(level.p95Ms)} | p99=${formatMs(level.p99Ms)} | max=${formatMs(level.maxMs)} | avg response=${formatBytes(level.avgBytes)} | 5xx=${level.outcomes.SERVER_ERROR} | timeout=${level.outcomes.TIMEOUT}`);
  }
  lines.push("");
  lines.push("ENDPOINTS");
  for (const entry of result.operations.sort((a, b) => (b.levels[String(levels.at(-1))]?.p95Ms ?? 0) - (a.levels[String(levels.at(-1))]?.p95Ms ?? 0))) {
    const level = entry.levels[String(levels.at(-1))];
    lines.push(`${entry.operationId} | GET ${entry.path} | status=${level.status} | p95=${formatMs(level.p95Ms)} | p99=${formatMs(level.p99Ms)} | max=${formatMs(level.maxMs)} | avg bytes=${formatBytes(level.avgBytes)} | success=${level.outcomes.SUCCESS} | auth=${level.outcomes.AUTH_REQUIRED} | 4xx=${level.outcomes.CLIENT_RESPONSE} | 5xx=${level.outcomes.SERVER_ERROR}`);
  }
  lines.push("");
  lines.push("WHAT IS GOOD");
  lines.push("- GOOD means no timeout/5xx was seen and p95 was below the baseline threshold.");
  lines.push("- AUTH_REQUIRED means the endpoint correctly protected anonymous access; it is not a backend failure.");
  lines.push("");
  lines.push("WHAT TO CHECK/FIX");
  for (const note of result.notes) lines.push(`- ${note}`);
  await writeFile(join(modulesDir, `${tag.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}.txt`), `${lines.join("\n")}\n`, "utf8");
}

const allLevelLines = [];
allLevelLines.push("VEOLMS API PERFORMANCE SUMMARY");
allLevelLines.push(`Generated: ${payload.generatedAt}`);
allLevelLines.push(`Base URL: ${baseUrl}`);
allLevelLines.push("");
allLevelLines.push("WHAT WAS TESTED");
allLevelLines.push(`- Documented operations found: ${payload.counts.totalDocumentedOperations}`);
allLevelLines.push(`- Safe GET operations executed: ${payload.counts.getOperationsExecuted}`);
allLevelLines.push(`- POST/PUT/PATCH/DELETE operations listed but not executed: ${payload.counts.mutationsNotExecuted}`);
allLevelLines.push(`- Video/streaming operations excluded: ${payload.counts.excludedVideoOrStreaming}`);
allLevelLines.push(`- User levels: ${levels.join(", ")}`);
allLevelLines.push("");
allLevelLines.push("MODULE SUMMARY");
for (const [tag, result] of Object.entries(moduleResults)) {
  const level = result.levels[String(levels.at(-1))];
  allLevelLines.push(`${tag}: ${level.status} | requests=${level.requests} | p95=${formatMs(level.p95Ms)} | p99=${formatMs(level.p99Ms)} | 5xx=${level.outcomes.SERVER_ERROR} | timeout=${level.outcomes.TIMEOUT}`);
}
allLevelLines.push("");
allLevelLines.push("TOP SLOW ENDPOINTS AT HIGHEST TEST LEVEL");
for (const entry of [...operationResults].sort((a, b) => (b.levels[String(levels.at(-1))]?.p95Ms ?? 0) - (a.levels[String(levels.at(-1))]?.p95Ms ?? 0)).slice(0, 20)) {
  const level = entry.levels[String(levels.at(-1))];
  allLevelLines.push(`${entry.operationId} | GET ${entry.path} | p95=${formatMs(level.p95Ms)} | p99=${formatMs(level.p99Ms)} | status=${level.status}`);
}
allLevelLines.push("");
allLevelLines.push("IMPORTANT LIMITATION");
allLevelLines.push("- Swagger/API timing can identify slow endpoints and large responses.");
allLevelLines.push("- It cannot prove N+1 or missing indexes by itself.");
allLevelLines.push("- N+1/index findings require SQL query count and EXPLAIN for endpoints marked REVIEW/PROBLEM.");
allLevelLines.push("- Mutation endpoints were not called because automatic testing could change or delete data.");
allLevelLines.push("");
allLevelLines.push("RECOMMENDED ORDER");
allLevelLines.push("1. Fix PROBLEM endpoints.");
allLevelLines.push("2. Review REVIEW endpoints and payload sizes.");
allLevelLines.push("3. Capture SQL count and EXPLAIN for the slow endpoints.");
allLevelLines.push("4. Repeat at 5 and 10 users in development.");
allLevelLines.push("5. Run the same approved test at up to 300 active users only in a production-like environment.");
await writeFile(join(reportsDir, "API_SUMMARY.txt"), `${allLevelLines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  reports: reportsDir,
  raw: rawDir,
  counts: payload.counts,
  modules: Object.fromEntries(Object.entries(moduleResults).map(([tag, result]) => [tag, result.levels[String(levels.at(-1))].status])),
}, null, 2));
