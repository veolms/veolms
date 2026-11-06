import { AppError } from "../../../lib/errors.ts";
import { UNPLACED_SORT_POSITION } from "./course.repository.ts";

/**
 * The catalogue's keyset cursor: "<value>~<id>", the value being the last
 * course's title (sort "title") or its place and time (sort "latest").
 */
export function decodePublishedCourseCursor(
  cursor: string,
  sort: "latest" | "title",
) {
  const separator = cursor.lastIndexOf("~");
  if (separator <= 0) {
    throw new AppError(400, "INVALID_COURSE_CURSOR", "Invalid course cursor.");
  }

  let value: string;
  try {
    value = decodeURIComponent(cursor.slice(0, separator));
  } catch {
    throw new AppError(400, "INVALID_COURSE_CURSOR", "Invalid course cursor.");
  }
  const id = cursor.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/iu.test(id)) {
    throw new AppError(400, "INVALID_COURSE_CURSOR", "Invalid course cursor.");
  }
  if (sort === "title") return { value, id };

  // "latest" follows the admin's order first: its cursor is the course's
  // place, then its time ("<place>|<time>"). A cursor from before courses
  // had places carries the time alone and counts as not placed.
  const placeEnd = value.indexOf("|");
  const placeText = placeEnd >= 0 ? value.slice(0, placeEnd) : null;
  const time = placeEnd >= 0 ? value.slice(placeEnd + 1) : value;
  const position = placeText === null ? undefined : Number(placeText);
  if (
    (position !== undefined &&
      (!/^\d{1,10}$/u.test(placeText!) || position > UNPLACED_SORT_POSITION)) ||
    !Number.isFinite(Date.parse(time))
  ) {
    throw new AppError(400, "INVALID_COURSE_CURSOR", "Invalid course cursor.");
  }

  return { value: time, id, ...(position !== undefined ? { position } : {}) };
}

export function encodePublishedCourseCursor(
  row: {
    created_at_cursor: string;
    id: string;
    title: string;
    sort_position: number | null;
  },
  sort: "latest" | "title",
) {
  const value =
    sort === "title"
      ? row.title
      : `${row.sort_position ?? UNPLACED_SORT_POSITION}|${row.created_at_cursor}`;
  return `${encodeURIComponent(value)}~${row.id}`;
}
