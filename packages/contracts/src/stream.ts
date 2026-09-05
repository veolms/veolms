import { z } from "zod";

export const streamLectureParamsSchema = z.strictObject({
  lectureId: z.uuid().meta({
    description: "Stable identifier of the lecture/lesson to stream.",
  }),
});

export type StreamLectureParams = z.infer<typeof streamLectureParamsSchema>;

export const streamCourseLectureParamsSchema = z.strictObject({
  courseId: z.uuid().meta({
    description: "Stable identifier of the course.",
  }),
  lectureId: z.uuid().meta({
    description: "Stable identifier of the lecture/lesson to stream.",
  }),
});

export type StreamCourseLectureParams = z.infer<
  typeof streamCourseLectureParamsSchema
>;

export const streamResponseSchema = z.strictObject({
  streamUrl: z.string().meta({
    description: "Direct streaming URL or media path for video playback.",
  }),
  lectureId: z.uuid().meta({ description: "Lecture / Lesson UUID." }),
  courseId: z.uuid().meta({ description: "Parent Course UUID." }),
  mediaAssetId: z
    .uuid()
    .nullable()
    .optional()
    .meta({ description: "Associated media asset UUID." }),
  contentType: z
    .string()
    .meta({ description: "Content media type, typically 'video'." }),
  format: z.enum(["hls", "mp4", "direct"]).default("mp4").meta({
    description:
      "Playback stream format (HLS adaptive master playlist or progressive MP4).",
  }),
  expiresIn: z
    .number()
    .int()
    .positive()
    .optional()
    .meta({ description: "Expiration time in seconds for the streaming URL." }),
});

export type StreamResponse = z.infer<typeof streamResponseSchema>;

// Register response schema with OpenAPI registry
z.globalRegistry.add(streamResponseSchema, {
  id: "StreamResponse",
  description: "Streaming response containing playback URL and metadata.",
});
