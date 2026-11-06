/* eslint-disable no-console -- an operator CLI: the terminal is its output */
/**
 * Creates a course from a JSON manifest whose videos and thumbnail are
 * already in storage (for example videos imported earlier by yt-import).
 *
 *   pnpm --filter @veolms/api import:course-manifest -- \
 *     --manifest ./react.json --instructor-email you@example.com [--apply]
 *
 * Without --apply it only reads: it checks the manifest, the database and
 * that every storage object exists, and prints what it would create. With
 * --apply everything is written in one transaction, as a DRAFT course, so
 * a person reviews it and presses Publish (which also refreshes the static
 * course pages). Running it again for a slug that exists changes nothing.
 */
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import { parseArgs } from "node:util";
import { cacheTags, publishCacheInvalidation } from "@veolms/api-core";
import { createDatabase, enqueueImageJob } from "@veolms/database";
import { config } from "../config.ts";
import { createServices } from "../services/index.ts";
import {
  ADMIN_ROLE,
  INSTRUCTOR_ROLE,
} from "../modules/auth/shared/auth.constants.ts";
import * as courseRepo from "../modules/courses/course/course.repository.ts";
import * as configRepo from "../modules/courses/configuration/configuration.repository.ts";
import { seedDefaultIncludes } from "../modules/courses/includes/includes.service.ts";
import * as mediaRepo from "../modules/media/media.repository.ts";
import {
  courseManifestSchema,
  findManifestConflicts,
  manifestDurationSeconds,
  manifestStorageKeys,
  type CourseManifest,
} from "./course-manifest.ts";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const cliLogger = {
  child: () => cliLogger,
  info: () => {},
  warn: (msg: unknown) => console.log(yellow(`  [warn] ${String(msg)}`)),
  error: (obj: unknown, msg?: string) =>
    console.error(red(`  [error] ${msg ?? String(obj)}`)),
  debug: () => {},
  trace: () => {},
  fatal: (obj: unknown, msg?: string) =>
    console.error(red(`  [fatal] ${msg ?? String(obj)}`)),
};

const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)} h`;

class ImportRefused extends Error {}

async function readManifest(path: string): Promise<CourseManifest> {
  const raw: unknown = JSON.parse(await fsp.readFile(path, "utf8"));
  const parsed = courseManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ImportRefused(
      `${path} is not a valid course manifest:\n${issues}`,
    );
  }
  const conflicts = findManifestConflicts(parsed.data);
  if (conflicts.length > 0) {
    throw new ImportRefused(
      `${path} has conflicts:\n${conflicts.map((c) => `  - ${c}`).join("\n")}`,
    );
  }
  return parsed.data;
}

/** HEADs every key, a few at a time; returns the missing ones. */
async function findMissingObjects(
  keys: readonly string[],
  head: (key: string) => Promise<unknown>,
): Promise<string[]> {
  const missing: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++]!;
      if (!(await head(key))) missing.push(key);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return missing;
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string", multiple: true },
      "instructor-email": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const manifestPaths = values.manifest ?? [];
  const email = values["instructor-email"]?.trim().toLowerCase();
  if (manifestPaths.length === 0 || !email) {
    throw new ImportRefused(
      "Usage: import:course-manifest --manifest <file.json> [--manifest ...] --instructor-email <email> [--apply]",
    );
  }

  const manifests = await Promise.all(manifestPaths.map(readManifest));
  const slugs = manifests.map((m) => m.course.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new ImportRefused("Two manifests use the same course slug.");
  }

  const database = createDatabase(config.DATABASE_URL);
  const services = createServices({ config, logger: cliLogger as never });

  try {
    const instructor = await database
      .selectFrom("users")
      .innerJoin("user_roles", "user_roles.user_id", "users.id")
      .innerJoin("roles", "roles.id", "user_roles.role_id")
      .where("roles.name", "in", [INSTRUCTOR_ROLE, ADMIN_ROLE])
      .where("users.is_deleted", "=", false)
      .where("users.email", "=", email)
      .select(["users.id", "users.display_name"])
      .executeTakeFirst();
    if (!instructor) {
      throw new ImportRefused(
        `No instructor or admin with email ${email}. The course needs an owner.`,
      );
    }

    console.log(
      bold(values.apply ? "Importing (writes)" : "Dry run (reads only)"),
      dim(`— owner ${instructor.display_name}`),
    );

    let failed = false;
    for (const manifest of manifests) {
      const ok = await importOne(manifest, {
        apply: values.apply,
        instructor,
        database,
        head: (key) => services.storage.headObject(key),
      });
      if (!ok) failed = true;
    }

    if (!values.apply && !failed) {
      console.log(
        `\n${yellow("Nothing was written.")} Run again with ${bold("--apply")} to create the draft course(s).`,
      );
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    await database.destroy();
  }
}

async function importOne(
  manifest: CourseManifest,
  ctx: {
    apply: boolean;
    instructor: { id: string; display_name: string };
    database: ReturnType<typeof createDatabase>;
    head: (key: string) => Promise<unknown>;
  },
): Promise<boolean> {
  const { course, sections } = manifest;
  const { database } = ctx;
  const lessons = sections.flatMap((s) => s.lessons);
  console.log(`\n${bold(course.title)} ${dim(`(${course.slug})`)}`);

  const existing = await courseRepo.findCourseBySlugIncludingDeleted(
    database,
    course.slug,
  );
  if (existing) {
    console.log(
      `  ${green("✓")} Already exists (id ${existing.id}); left as it is.`,
    );
    return true;
  }

  // A media id already in the database is reused only if it is the same file.
  const mediaIds = [
    ...(course.thumbnail ? [course.thumbnail.mediaId] : []),
    ...lessons.map((l) => l.video.mediaId),
  ];
  const expectedKey = new Map<string, string>([
    ...(course.thumbnail
      ? [[course.thumbnail.mediaId, course.thumbnail.storageKey] as const]
      : []),
    ...lessons.map(
      (l) => [l.video.mediaId, l.video.masterPlaylistPath] as const,
    ),
  ]);
  const existingMedia = await database
    .selectFrom("media_assets")
    .select(["id", "storage_key"])
    .where("id", "in", mediaIds)
    .execute();
  const reuse = new Set<string>();
  for (const row of existingMedia) {
    if (row.storage_key !== expectedKey.get(row.id)) {
      console.log(
        `  ${red("✘")} Media ${row.id} exists with another file (${row.storage_key}).`,
      );
      return false;
    }
    reuse.add(row.id);
  }

  const keys = manifestStorageKeys(manifest);
  const missing = await findMissingObjects(keys, ctx.head);
  if (missing.length > 0) {
    console.log(`  ${red("✘")} ${missing.length} storage object(s) missing:`);
    for (const key of missing.slice(0, 20)) console.log(`    - ${key}`);
    return false;
  }
  console.log(
    `  ${green("✓")} ${keys.length} storage objects found; ${reuse.size} media row(s) already present`,
  );

  const free = course.pricing.salePrice === 0;
  console.log(
    `  Pricing: ${free ? "free" : "paid"}, ${course.pricing.currency} ${course.pricing.salePrice} (marked ${course.pricing.price})`,
  );
  sections.forEach((section, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${section.title} ${dim(
        `— ${section.lessons.length} lessons, ${hours(manifestDurationSeconds(section.lessons))}`,
      )}`,
    );
  });
  console.log(
    `  ${dim(`${sections.length} sections, ${lessons.length} lessons, ${hours(manifestDurationSeconds(lessons))}`)}`,
  );

  if (!ctx.apply) return true;

  const courseId = crypto.randomUUID();
  const now = new Date();
  await database.transaction().execute(async (trx) => {
    const thumb = course.thumbnail;
    if (thumb && !reuse.has(thumb.mediaId)) {
      await mediaRepo.insertMediaAsset(trx, {
        id: thumb.mediaId,
        owner_id: ctx.instructor.id,
        type: "image",
        storage_provider: "s3",
        storage_key: thumb.storageKey,
        original_filename: thumb.originalFilename,
        mime_type: thumb.mimeType,
        size_bytes: thumb.sizeBytes,
        // With its processed variants it is ready; without, the image
        // worker makes them.
        status: thumb.metadata ? "ready" : "uploaded",
        ...(thumb.metadata ? { metadata: thumb.metadata } : {}),
      });
      if (!thumb.metadata) {
        await enqueueImageJob(trx, {
          id: crypto.randomUUID(),
          media_id: thumb.mediaId,
        });
      }
    }

    for (const lesson of lessons) {
      const video = lesson.video;
      if (reuse.has(video.mediaId)) continue;
      await trx
        .insertInto("media_assets")
        .values({
          id: video.mediaId,
          owner_id: ctx.instructor.id,
          type: "video",
          storage_provider: "s3",
          storage_key: video.masterPlaylistPath,
          original_filename: video.originalFilename,
          mime_type: "application/vnd.apple.mpegurl",
          size_bytes: video.sizeBytes,
          width: video.width,
          height: video.height,
          duration_seconds: video.durationSeconds,
          status: "ready",
        })
        .execute();
      await trx
        .insertInto("video_outputs")
        .values({
          id: crypto.randomUUID(),
          video_id: video.mediaId,
          master_playlist_path: video.masterPlaylistPath,
          created_at: now,
        })
        .execute();
      await trx
        .insertInto("video_jobs")
        .values({
          id: crypto.randomUUID(),
          video_id: video.mediaId,
          video_key: video.masterPlaylistPath,
          output_prefix: video.masterPlaylistPath.replace(/\/[^/]+$/u, ""),
          video_size: video.sizeBytes,
          qualities: video.qualities as never,
          status: "completed",
          progress_percent: 100,
          completed_at: now,
          created_at: now,
        })
        .execute();
      if (video.source) {
        await mediaRepo.insertMediaSource(trx, {
          media_id: video.mediaId,
          provider: video.source.provider,
          external_id: video.source.externalId,
          source_url: video.source.url,
          title: lesson.title,
          channel: null,
          recorded_via: "cli",
        });
      }
    }

    await courseRepo.insertCourse(trx, {
      id: courseId,
      slug: course.slug,
      title: course.title,
      short_description: course.shortDescription,
      description: course.description,
      creator_id: ctx.instructor.id,
      category_id: null,
      difficulty: course.difficulty,
      thumbnail_media_id: course.thumbnail?.mediaId ?? null,
      trailer_media_id: null,
      instructor_alias: course.instructorAlias ?? ctx.instructor.display_name,
      status: "draft",
      version: 1,
      created_at: now,
      updated_at: now,
    });
    await seedDefaultIncludes(trx, courseId);
    await configRepo.upsertSettings(trx, {
      id: crypto.randomUUID(),
      course_id: courseId,
      allow_qa: true,
      allow_comments: true,
      allow_notes: true,
      allow_downloads: false,
      certificate_enabled: false,
      show_instructor_name: true,
      language: course.language,
      estimated_duration: null,
      created_at: now,
      updated_at: now,
    });
    await configRepo.upsertAccessRule(trx, {
      id: crypto.randomUUID(),
      course_id: courseId,
      access_type: "everyone",
      duration_type: "lifetime",
      duration_days: null,
      created_at: now,
      updated_at: now,
    });
    await configRepo.upsertPricing(trx, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: free ? "free" : "paid",
      price: course.pricing.price,
      currency: course.pricing.currency,
      sale_price: course.pricing.salePrice,
      show_discount_badge:
        course.pricing.showDiscountBadge &&
        course.pricing.price > course.pricing.salePrice,
      created_at: now,
      updated_at: now,
    });

    for (const [sectionIndex, section] of sections.entries()) {
      const sectionId = crypto.randomUUID();
      await trx
        .insertInto("course_sections")
        .values({
          id: sectionId,
          course_id: courseId,
          title: section.title,
          position: sectionIndex,
          created_at: now,
          updated_at: now,
        })
        .execute();
      for (const [lessonIndex, lesson] of section.lessons.entries()) {
        await trx
          .insertInto("course_lessons")
          .values({
            id: crypto.randomUUID(),
            course_id: courseId,
            section_id: sectionId,
            title: lesson.title,
            description: lesson.description?.trim() || null,
            content_type: "video",
            content_media_id: lesson.video.mediaId,
            position: lessonIndex,
            is_preview: lesson.isPreview,
            is_published: true,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
    }
  });

  await publishCacheInvalidation(database, [
    cacheTags.course(courseId),
    cacheTags.catalog,
  ]);
  console.log(
    `  ${green("✓")} Created DRAFT course ${courseId}. Review it at ${config.WEB_URL}/instructor/courses/${courseId}, then Publish.`,
  );
  return true;
}

main().catch((error: unknown) => {
  if (error instanceof ImportRefused) {
    console.error(red(error.message));
  } else {
    console.error(
      red("Import failed; nothing was written for the course being imported."),
    );
    console.error(error);
  }
  process.exitCode = 1;
});
