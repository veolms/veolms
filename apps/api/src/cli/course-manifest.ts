import { z } from "zod";

/**
 * A course whose media is already in storage, described as data: the
 * `import:course-manifest` command creates it from this. Nothing here is
 * uploaded; every storage key must already exist in the bucket.
 */

const uuid = z.string().uuid();
const storageKey = z
  .string()
  .min(1)
  .refine((key) => !key.startsWith("/") && !key.includes(".."), {
    message: "Storage keys are bucket-relative and may not contain '..'.",
  });

const imageVariantSchema = z.object({
  key: storageKey,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

const thumbnailSchema = z.strictObject({
  mediaId: uuid,
  storageKey,
  originalFilename: z.string().min(1),
  mimeType: z.string().startsWith("image/"),
  sizeBytes: z.number().int().positive(),
  /** Processed variants as the image worker stores them; left out, they are made again. */
  metadata: z
    .strictObject({
      full: imageVariantSchema,
      original: imageVariantSchema.extend({
        filename: z.string().optional(),
        mimeType: z.string().optional(),
      }),
      variants: z.array(imageVariantSchema),
    })
    .optional(),
});

const videoSchema = z.strictObject({
  mediaId: uuid,
  /** The HLS master playlist; playback reads it through video_outputs. */
  masterPlaylistPath: storageKey.refine((key) => key.endsWith(".m3u8"), {
    message: "masterPlaylistPath must be an .m3u8 playlist.",
  }),
  originalFilename: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  qualities: z.array(z.string().regex(/^\d{3,4}p$/u)).min(1),
  source: z
    .strictObject({
      provider: z.literal("youtube"),
      externalId: z.string().min(1),
      url: z.string().url(),
    })
    .optional(),
});

const lessonSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  description: z.string().nullable(),
  isPreview: z.boolean(),
  video: videoSchema,
});

const sectionSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  lessons: z.array(lessonSchema).min(1),
});

export const courseManifestSchema = z.strictObject({
  version: z.literal(1),
  course: z.strictObject({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Use a lowercase-hyphenated slug."),
    title: z.string().trim().min(1).max(200),
    shortDescription: z.string().max(160).nullable(),
    description: z.string().nullable(),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    language: z.string().min(2).max(10),
    instructorAlias: z.string().min(1).nullable(),
    thumbnail: thumbnailSchema.nullable(),
    pricing: z
      .strictObject({
        currency: z.string().length(3),
        /** The marked price, shown struck through when it sells for less. */
        price: z.number().int().nonnegative(),
        /** What it sells for; 0 makes the course free. */
        salePrice: z.number().int().nonnegative(),
        showDiscountBadge: z.boolean(),
      })
      .refine((p) => p.salePrice <= p.price, {
        message: "salePrice cannot be above price.",
      }),
  }),
  sections: z.array(sectionSchema).min(1),
});

export type CourseManifest = z.infer<typeof courseManifestSchema>;

/** Problems a schema cannot see: ids or files used twice. */
export function findManifestConflicts(manifest: CourseManifest): string[] {
  const problems: string[] = [];
  const mediaIds = new Map<string, string>();
  const playlists = new Set<string>();
  const note = (id: string, where: string) => {
    const earlier = mediaIds.get(id);
    if (earlier)
      problems.push(`Media id ${id} is used by ${earlier} and ${where}.`);
    else mediaIds.set(id, where);
  };

  if (manifest.course.thumbnail) {
    note(manifest.course.thumbnail.mediaId, "the thumbnail");
  }
  manifest.sections.forEach((section, s) => {
    section.lessons.forEach((lesson, l) => {
      const where = `section ${s + 1} lesson ${l + 1} ("${lesson.title}")`;
      note(lesson.video.mediaId, where);
      if (playlists.has(lesson.video.masterPlaylistPath)) {
        problems.push(
          `${where} reuses playlist ${lesson.video.masterPlaylistPath}.`,
        );
      }
      playlists.add(lesson.video.masterPlaylistPath);
    });
  });
  return problems;
}

/** Every object the course needs to find in storage. */
export function manifestStorageKeys(manifest: CourseManifest): string[] {
  const keys: string[] = [];
  const thumb = manifest.course.thumbnail;
  if (thumb) {
    keys.push(thumb.storageKey);
    if (thumb.metadata) {
      keys.push(
        thumb.metadata.full.key,
        ...thumb.metadata.variants.map((v) => v.key),
      );
    }
  }
  for (const section of manifest.sections) {
    for (const lesson of section.lessons) {
      keys.push(lesson.video.masterPlaylistPath);
    }
  }
  return [...new Set(keys)];
}

export function manifestDurationSeconds(
  lessons: ReadonlyArray<{ video: { durationSeconds: number | null } }>,
): number {
  return lessons.reduce((sum, l) => sum + (l.video.durationSeconds ?? 0), 0);
}
