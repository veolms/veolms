import type { Selectable } from "kysely";
import type { Database } from "@veolms/database";
import type {
  Course,
  CourseAccessRule,
  CoursePricing,
  CourseSection,
  CourseSettings,
} from "@veolms/contracts";

/**
 * The single place course rows become API objects. A response schema strips
 * (or, when strict, rejects) keys it does not name, so each presenter lists
 * exactly the keys of its contract schema and nothing else.
 */

export interface CourseThumbnailUrls {
  thumbnailUrl: string | null;
  thumbnailSrcSet: { url: string; width: number; height: number }[];
}

type CourseRow = Pick<
  Selectable<Database["courses"]>,
  | "id"
  | "slug"
  | "title"
  | "short_description"
  | "description"
  | "difficulty"
  | "status"
  | "creator_id"
  | "category_id"
  | "thumbnail_media_id"
  | "trailer_media_id"
  | "instructor_alias"
  | "version"
  | "created_at"
  | "updated_at"
  | "published_at"
>;

/** The full authoring view of a course (`courseSchema`). */
export function presentCourse(
  course: CourseRow,
  extras: {
    thumbnail?: CourseThumbnailUrls;
    totalDurationSeconds?: number;
  } = {},
): Course {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    shortDescription: course.short_description,
    description: course.description,
    difficulty: course.difficulty,
    status: course.status,
    creatorId: course.creator_id,
    categoryId: course.category_id,
    thumbnailMediaId: course.thumbnail_media_id,
    trailerMediaId: course.trailer_media_id,
    ...(extras.thumbnail
      ? {
          thumbnailUrl: extras.thumbnail.thumbnailUrl,
          thumbnailSrcSet: extras.thumbnail.thumbnailSrcSet,
        }
      : {}),
    instructorAlias: course.instructor_alias,
    version: course.version,
    createdAt: course.created_at.toISOString(),
    updatedAt: course.updated_at.toISOString(),
    publishedAt: course.published_at?.toISOString() ?? null,
    ...(extras.totalDurationSeconds !== undefined
      ? { totalDurationSeconds: extras.totalDurationSeconds }
      : {}),
  };
}

type SectionRow = Pick<
  Selectable<Database["course_sections"]>,
  "id" | "title" | "position"
>;

type LessonRow = Pick<
  Selectable<Database["course_lessons"]>,
  | "id"
  | "section_id"
  | "title"
  | "description"
  | "content_type"
  | "content_media_id"
  | "position"
  | "is_preview"
  | "is_published"
>;

type ResourceRow = Pick<
  Selectable<Database["lesson_resources"]>,
  "id" | "lesson_id" | "media_asset_id" | "title"
>;

type MediaRow = Pick<
  Selectable<Database["media_assets"]>,
  | "id"
  | "duration_seconds"
  | "original_filename"
  | "mime_type"
  | "size_bytes"
  | "status"
>;

/** Seconds of video a lesson plays; zero when it has no timed media. */
export function getLessonDurationSeconds(
  lesson: Pick<LessonRow, "content_media_id">,
  mediaById: ReadonlyMap<string, Pick<MediaRow, "duration_seconds">>,
): number {
  if (!lesson.content_media_id) return 0;
  return mediaById.get(lesson.content_media_id)?.duration_seconds ?? 0;
}

/**
 * Sections with their lessons and each lesson's resources, in the order the
 * rows were given (repositories return them ordered by position).
 */
export function presentCurriculum({
  sections,
  lessons,
  resources,
  mediaById,
}: {
  sections: readonly SectionRow[];
  lessons: readonly LessonRow[];
  resources: readonly ResourceRow[];
  mediaById: ReadonlyMap<string, MediaRow>;
}): CourseSection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    position: section.position,
    lessons: lessons
      .filter((lesson) => lesson.section_id === section.id)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        contentType: lesson.content_type,
        contentMediaId: lesson.content_media_id,
        durationSeconds: getLessonDurationSeconds(lesson, mediaById),
        position: lesson.position,
        isPreview: lesson.is_preview,
        isPublished: lesson.is_published,
        resources: resources
          .filter((resource) => resource.lesson_id === lesson.id)
          .map((resource) => {
            const media = mediaById.get(resource.media_asset_id);
            return {
              id: resource.id,
              mediaAssetId: resource.media_asset_id,
              title: resource.title,
              mediaAsset: media
                ? {
                    originalFilename: media.original_filename,
                    mimeType: media.mime_type,
                    sizeBytes: Number(media.size_bytes),
                    status: media.status,
                  }
                : undefined,
            };
          }),
      })),
  }));
}

export function presentAccessRule(
  rule: Pick<
    Selectable<Database["course_access_rules"]>,
    "id" | "access_type" | "duration_type" | "duration_days"
  >,
): CourseAccessRule {
  return {
    id: rule.id,
    accessType: rule.access_type,
    durationType: rule.duration_type,
    durationDays: rule.duration_days,
  };
}

export function presentPricing(
  pricing: Pick<
    Selectable<Database["course_pricing"]>,
    "id" | "pricing_type" | "price" | "currency" | "sale_price"
  > & {
    // Absent until the migration that adds the column has run.
    show_discount_badge?: boolean | null;
  },
): CoursePricing {
  return {
    id: pricing.id,
    pricingType: pricing.pricing_type,
    price: pricing.price,
    currency: pricing.currency,
    salePrice: pricing.sale_price,
    showDiscountBadge: pricing.show_discount_badge === true,
  };
}

export function presentSettings(
  settings: Pick<
    Selectable<Database["course_settings"]>,
    | "id"
    | "allow_qa"
    | "allow_comments"
    | "allow_downloads"
    | "allow_notes"
    | "certificate_enabled"
    | "show_instructor_name"
    | "language"
    | "estimated_duration"
  >,
): CourseSettings {
  return {
    id: settings.id,
    allowQa: settings.allow_qa,
    allowComments: settings.allow_comments,
    allowDownloads: settings.allow_downloads,
    allowNotes: settings.allow_notes,
    certificateEnabled: settings.certificate_enabled,
    showInstructorName: settings.show_instructor_name,
    language: settings.language,
    estimatedDuration: settings.estimated_duration,
  };
}
