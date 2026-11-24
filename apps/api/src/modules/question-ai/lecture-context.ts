import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import type { CourseService } from "../courses/course/course.service.ts";

/** How much of each source goes to the AI. */
const COURSE_TEXT_CHARS = 1_500;
const LECTURE_TEXT_CHARS = 10_000;
const TRANSCRIPT_CHARS = 16_000;
/** A subtitle file larger than this is not read (a very long video). */
const TRANSCRIPT_MAX_BYTES = 1_500_000;
/** Lectures listed before and after this one. */
const NEIGHBOURS = 6;

export interface LectureContextDeps {
  database: Kysely<Database>;
  storage: AppServices["storage"] | null;
  courseService: Pick<
    CourseService,
    "findCourseById" | "getCourseContent" | "getLessonDescription"
  >;
}

export interface LectureContext {
  courseTitle: string;
  lessonTitle: string;
  sectionTitle: string | null;
  /** The lecture's number in the course, from 1. */
  number: number;
  /** True when there is little to write questions from. */
  thin: boolean;
  /** The text the AI reads. */
  text: string;
}

const clip = (text: string | null | undefined, chars: number) => {
  const value = (text ?? "").trim();
  return value.length > chars ? `${value.slice(0, chars)}\n[…cut]` : value;
};

/**
 * WebVTT to plain speech: no header, cue numbers, timings or tags, and a
 * line said twice in a row (rolling captions) kept once.
 */
export function vttToText(vtt: string) {
  const lines: string[] = [];
  for (const raw of vtt.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^WEBVTT/u.test(line) || /^(NOTE|STYLE|REGION)\b/u.test(line)) continue;
    if (/-->/u.test(line)) continue;
    if (/^\d+$/u.test(line)) continue;
    const text = line
      .replace(/<[^>]+>/gu, "")
      .replace(/&nbsp;/gu, " ")
      .replace(/&amp;/gu, "&")
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">")
      .replace(/\s+/gu, " ")
      .trim();
    if (text && lines.at(-1) !== text) lines.push(text);
  }
  return lines.join(" ");
}

async function readText(
  storage: AppServices["storage"],
  key: string,
  maxBytes: number,
): Promise<string | null> {
  const file = await storage.getObject(key);
  if (!file) return null;
  if (file.contentLength !== undefined && file.contentLength > maxBytes) {
    file.body.destroy();
    return null;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of file.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      file.body.destroy();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * What the lecture's video says, from its subtitles (English first), when
 * it has any. Nothing when there are none or they cannot be read: the AI
 * then works from the title and the written notes.
 */
async function readTranscript(
  deps: LectureContextDeps,
  lessonId: string,
  mediaId: string | null,
) {
  if (!mediaId || !deps.storage) return "";
  try {
    const tracks = await deps.database
      .selectFrom("lesson_subtitles")
      .select(["language", "storage_key"])
      .where("lesson_id", "=", lessonId)
      .where("media_asset_id", "=", mediaId)
      .execute();
    const track =
      tracks.find((item) => item.language.toLowerCase().startsWith("en")) ??
      tracks[0];
    if (!track) return "";
    const vtt = await readText(
      deps.storage,
      track.storage_key,
      TRANSCRIPT_MAX_BYTES,
    );
    return vtt ? vttToText(vtt) : "";
  } catch {
    return "";
  }
}

/**
 * One lecture as the AI reads it: the course, where the lecture sits
 * (what came before, what comes after: questions test only what has been
 * taught), the lecture's notes and what its video says.
 */
export async function buildLectureContext(
  deps: LectureContextDeps,
  actor: { id: string; roles: readonly string[] },
  courseId: string,
  lessonId: string,
): Promise<LectureContext> {
  const course = await deps.courseService.findCourseById(courseId);
  if (!course) throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
  const content = await deps.courseService.getCourseContent(course);
  const sections = [...content.sections].sort(
    (left, right) => left.position - right.position,
  );
  const sectionOrder = new Map(sections.map((section, at) => [section.id, at]));
  const lessons = [...content.lessons].sort(
    (left, right) =>
      (sectionOrder.get(left.section_id) ?? 1e9) -
        (sectionOrder.get(right.section_id) ?? 1e9) ||
      left.position - right.position,
  );
  const index = lessons.findIndex((item) => item.id === lessonId);
  const lesson = lessons[index];
  if (!lesson)
    throw new AppError(404, "LESSON_NOT_FOUND", "Course lesson not found.");
  const section = sections.find((item) => item.id === lesson.section_id);

  let notes = "";
  try {
    notes =
      (
        await deps.courseService.getLessonDescription(courseId, lesson.id, {
          id: actor.id,
          roles: actor.roles,
        })
      ).description ?? "";
  } catch {
    notes = lesson.description ?? "";
  }
  const transcript = await readTranscript(
    deps,
    lesson.id,
    lesson.content_media_id ?? null,
  );

  const before = lessons
    .slice(Math.max(0, index - NEIGHBOURS), index)
    .map((item) => `- ${item.title}`);
  const after = lessons
    .slice(index + 1, index + 1 + NEIGHBOURS)
    .map((item) => `- ${item.title}`);
  const thin = notes.trim().length < 200 && transcript.length < 400;

  return {
    courseTitle: course.title,
    lessonTitle: lesson.title,
    sectionTitle: section?.title ?? null,
    number: index + 1,
    thin,
    text: [
      `# Course: ${course.title}`,
      clip(course.short_description, 400),
      clip(course.description, COURSE_TEXT_CHARS),
      `\n# This lecture (number ${index + 1} of ${lessons.length})`,
      `Section: ${section?.title ?? "?"}`,
      `Title: ${lesson.title}`,
      `Kind of lesson: ${lesson.content_type}`,
      before.length
        ? `\nLectures just before it (students have seen these):\n${before.join("\n")}`
        : "\nThis is the first lecture of the course.",
      after.length
        ? `\nLectures after it (NOT taught yet: do not ask about them):\n${after.join("\n")}`
        : "",
      `\n## The lecture's notes / description\n${clip(notes, LECTURE_TEXT_CHARS) || "(none written)"}`,
      transcript
        ? `\n## What the teacher says in the video (from its subtitles)\n${clip(transcript, TRANSCRIPT_CHARS)}`
        : "\n(The video has no subtitles: work from the title and the notes.)",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
