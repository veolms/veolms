import { z } from "zod";
import { httpError } from "../../../../lib/errors.ts";

const discussionAttachmentUploadContextSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
});

export type DiscussionAttachmentUploadContext = z.infer<
  typeof discussionAttachmentUploadContextSchema
>;

export function readDiscussionAttachmentUploadContext(
  fields: unknown,
): DiscussionAttachmentUploadContext {
  const record = fields && typeof fields === "object" ? (fields as Record<string, unknown>) : {};
  const parsed = discussionAttachmentUploadContextSchema.safeParse({
    courseId: readMultipartText(record.courseId),
    lessonId: readMultipartText(record.lessonId),
  });

  if (!parsed.success) {
    throw httpError(
      400,
      "INVALID_UPLOAD_CONTEXT",
      "A valid course and lesson are required for discussion attachments.",
    );
  }

  return parsed.data;
}

function readMultipartText(field: unknown): string | undefined {
  if (!field || typeof field !== "object") return undefined;
  const value = (field as { value?: unknown }).value;
  return typeof value === "string" ? value.trim() : undefined;
}
