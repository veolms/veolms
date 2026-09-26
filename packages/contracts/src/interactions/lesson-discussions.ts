import { z } from "zod";
import { learningNoteSchema } from "./notes.ts";
import { learningThreadSchema } from "./threads.ts";

export const lessonDiscussionKindSchema = z.enum([
  "all",
  "comment",
  "question",
  "note",
]);
export type LessonDiscussionKind = z.infer<typeof lessonDiscussionKindSchema>;

export const lessonDiscussionSortSchema = z.enum(["newest", "top"]);
export type LessonDiscussionSort = z.infer<typeof lessonDiscussionSortSchema>;

export const listLessonDiscussionsQuerySchema = z.object({
  kind: lessonDiscussionKindSchema.default("all"),
  sort: lessonDiscussionSortSchema.default("newest"),
  mine: z.stringbool().optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLessonDiscussionsQuery = z.infer<
  typeof listLessonDiscussionsQuerySchema
>;

const lessonDiscussionThreadItemSchema = z.object({
  sourceType: z.literal("thread"),
  identity: z.string().regex(/^thread:[0-9a-f-]{36}$/iu),
  entityId: z.uuid(),
  kind: z.enum(["comment", "question"]),
  thread: learningThreadSchema,
});

const lessonDiscussionNoteItemSchema = z.object({
  sourceType: z.literal("note"),
  identity: z.string().regex(/^note:[0-9a-f-]{36}$/iu),
  entityId: z.uuid(),
  kind: z.literal("note"),
  note: learningNoteSchema,
});

export const lessonDiscussionItemSchema = z.discriminatedUnion("sourceType", [
  lessonDiscussionThreadItemSchema,
  lessonDiscussionNoteItemSchema,
]);
export type LessonDiscussionItem = z.infer<typeof lessonDiscussionItemSchema>;

export const lessonDiscussionsListResponseSchema = z.object({
  items: z.array(lessonDiscussionItemSchema),
  nextCursor: z.string().nullable(),
});
export type LessonDiscussionsListResponse = z.infer<
  typeof lessonDiscussionsListResponseSchema
>;

export const lessonDiscussionCountsResponseSchema = z.object({
  comments: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type LessonDiscussionCountsResponse = z.infer<
  typeof lessonDiscussionCountsResponseSchema
>;
