import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../..");
process.loadEnvFile(path.join(workspaceRoot, ".env"));

const slug = "local-performance-800-lessons-20260926";
const sourceSlug = "performance-500-lessons-course";
const sectionCount = 20;
const lessonsPerSection = 40;

if (!process.argv.includes("--apply")) {
  throw new Error("Refusing to write without the explicit --apply flag.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");

const databaseUrl = new URL(connectionString);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (
  !localHosts.has(databaseUrl.hostname) ||
  databaseUrl.port !== "5433" ||
  databaseUrl.pathname !== "/veolms"
) {
  throw new Error(
    "Safety check failed: this script only permits localhost:5433/veolms.",
  );
}

const isPrivateIpv4 = (address) => {
  if (!address) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168
  );
};

const client = new Client({ connectionString });
await client.connect();

try {
  const server = await client.query(
    "select current_database() as name, inet_server_addr()::text as address, inet_server_port() as port",
  );
  const target = server.rows[0];
  if (
    target.name !== "veolms" ||
    !isPrivateIpv4(target.address) ||
    Number(target.port) !== 5432
  ) {
    throw new Error("Safety check failed: PostgreSQL is not the expected local Docker database.");
  }

  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [slug]);
    const existing = await client.query(
      "select id from courses where slug = $1",
      [slug],
    );

    if (existing.rowCount) {
      const counts = await client.query(
        `select
           (select count(*)::int from course_sections where course_id = $1 and deleted_at is null) as sections,
           (select count(*)::int from course_lessons where course_id = $1 and deleted_at is null) as lessons`,
        [existing.rows[0].id],
      );
      const result = counts.rows[0];
      if (result.sections !== sectionCount || result.lessons !== sectionCount * lessonsPerSection) {
        throw new Error(`Existing fixture has ${result.sections} sections/${result.lessons} lessons; refusing to alter it.`);
      }
      const normalizedIncludes = await client.query(
        `update course_includes
         set text = case position
                      when 1 then '20 sections'
                      when 2 then '800 placeholder video lessons'
                    end,
             icon = null,
             updated_at = now()
         where course_id = $1 and position in (1, 2)`,
        [existing.rows[0].id],
      );
      if (normalizedIncludes.rowCount !== 2) {
        throw new Error("Expected two local fixture course-includes rows to normalize.");
      }
      await client.query("commit");
      console.log(`Local fixture already exists: ${slug} (${result.sections} sections, ${result.lessons} lessons).`);
    } else {
      const source = await client.query(
        "select id from courses where slug = $1 and status = 'published' and deleted_at is null",
        [sourceSlug],
      );
      if (!source.rowCount) throw new Error(`Required local template course '${sourceSlug}' was not found.`);
      const sourceId = source.rows[0].id;
      const access = await client.query(
        "select access_type, duration_type, duration_days from course_access_rules where course_id = $1",
        [sourceId],
      );
      const pricing = await client.query(
        "select pricing_type, price, currency, sale_price from course_pricing where course_id = $1",
        [sourceId],
      );
      if (access.rowCount !== 1 || pricing.rowCount !== 1) {
        throw new Error("Local template course is missing its access or pricing configuration.");
      }

      const courseId = randomUUID();
      await client.query(
        `insert into courses (
           id, slug, title, short_description, description, status, difficulty,
           version, published_at, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, 'published', 'beginner', 1, now(), now(), now())`,
        [
          courseId,
          slug,
          "Local Performance Test Course — 800 Lessons",
          "Synthetic local-only course used to check large-curriculum behavior.",
          "This local test fixture contains 20 sections and 800 placeholder video lessons. Lesson rows intentionally have no media attached.",
        ],
      );

      const accessRule = access.rows[0];
      await client.query(
        `insert into course_access_rules
           (id, course_id, access_type, duration_type, duration_days, created_at, updated_at)
         values ($1, $2, $3, $4, $5, now(), now())`,
        [randomUUID(), courseId, accessRule.access_type, accessRule.duration_type, accessRule.duration_days],
      );

      const price = pricing.rows[0];
      await client.query(
        `insert into course_pricing
           (id, course_id, pricing_type, price, currency, sale_price, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, now(), now())`,
        [randomUUID(), courseId, price.pricing_type, price.price, price.currency, price.sale_price],
      );

      for (const [index, text] of [
        "20 sections",
        "800 placeholder video lessons",
      ].entries()) {
        await client.query(
          `insert into course_includes
             (id, course_id, text, icon, position, created_at, updated_at)
           values ($1, $2, $3, $4, $5, now(), now())`,
          [randomUUID(), courseId, text, null, index + 1],
        );
      }

      const sectionIds = Array.from({ length: sectionCount }, () => randomUUID());
      const sectionTitles = sectionIds.map((_, index) => `Performance Test Section ${String(index + 1).padStart(2, "0")}`);
      const sectionPositions = sectionIds.map((_, index) => index + 1);
      await client.query(
        `insert into course_sections (id, course_id, title, position, created_at, updated_at)
         select id::uuid, $1, title, position, now(), now()
         from unnest($2::uuid[], $3::text[], $4::int[]) as rows(id, title, position)`,
        [courseId, sectionIds, sectionTitles, sectionPositions],
      );

      const lessonIds = [];
      const lessonSectionIds = [];
      const lessonTitles = [];
      const lessonDescriptions = [];
      const lessonPositions = [];
      for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
        for (let lessonIndex = 0; lessonIndex < lessonsPerSection; lessonIndex += 1) {
          const number = sectionIndex * lessonsPerSection + lessonIndex + 1;
          lessonIds.push(randomUUID());
          lessonSectionIds.push(sectionIds[sectionIndex]);
          lessonTitles.push(`Lecture ${String(number).padStart(3, "0")}`);
          lessonDescriptions.push("Synthetic placeholder for local performance testing; no video asset is attached.");
          lessonPositions.push(lessonIndex + 1);
        }
      }
      await client.query(
        `insert into course_lessons (
           id, course_id, section_id, title, description, content_type,
           content_media_id, position, is_preview, is_published, created_at, updated_at
         )
         select id::uuid, $1, section_id::uuid, title, description, 'video',
                null, position, false, true, now(), now()
         from unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::int[])
           as rows(id, section_id, title, description, position)`,
        [courseId, lessonIds, lessonSectionIds, lessonTitles, lessonDescriptions, lessonPositions],
      );

      const counts = await client.query(
        `select
           (select count(*)::int from course_sections where course_id = $1 and deleted_at is null) as sections,
           (select count(*)::int from course_lessons where course_id = $1 and deleted_at is null) as lessons`,
        [courseId],
      );
      const result = counts.rows[0];
      if (result.sections !== sectionCount || result.lessons !== sectionCount * lessonsPerSection) {
        throw new Error(`Post-insert validation failed: found ${result.sections} sections/${result.lessons} lessons.`);
      }
      await client.query("commit");
      console.log(`Created local fixture: ${slug} (${result.sections} sections, ${result.lessons} placeholder lessons).`);
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(`Database verified: ${target.name} at local Docker endpoint ${databaseUrl.hostname}:${databaseUrl.port} (server ${target.address}:${target.port}).`);
} finally {
  await client.end();
}
