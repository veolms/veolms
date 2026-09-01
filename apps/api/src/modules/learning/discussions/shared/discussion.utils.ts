import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";
import { httpError } from "../../../../lib/errors.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface DiscussionListCursor {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  repliesCount?: number;
  engagement?: number;
  isAccepted?: boolean;
  sort?: string;
}

/**
 * Discussion text parsing and serialization utilities
 */
export function extractPlainText(content: string): string {
  if (!content) return "";

  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor<T = Record<string, unknown>>(
  cursor: string,
): T | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function normalizeThreadSort(sort?: string): string {
  if (sort === "activity") return "activity";
  if (sort === "replies") return "replies";
  if (sort === "popular" || sort === "highest_engagement") return "popular";
  return "latest";
}

export function decodeDiscussionCursor(
  value: string | undefined,
): DiscussionListCursor | undefined {
  if (!value) return undefined;
  const parsed = decodeCursor<Record<string, unknown>>(value);
  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !UUID_RE.test(parsed.id) ||
    typeof parsed.createdAt !== "string"
  ) {
    throw httpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
  }
  const createdAt = new Date(parsed.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw httpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
  }
  const cursor: DiscussionListCursor = { id: parsed.id, createdAt };
  if (typeof parsed.sort === "string") cursor.sort = parsed.sort;
  if (
    typeof parsed.createdAt === "string" &&
    typeof parsed.updatedAt === "string"
  ) {
    const updatedAt = new Date(parsed.updatedAt);
    if (!Number.isNaN(updatedAt.getTime())) cursor.updatedAt = updatedAt;
  }
  if (typeof parsed.repliesCount === "number") {
    cursor.repliesCount = parsed.repliesCount;
  }
  if (typeof parsed.engagement === "number") {
    cursor.engagement = parsed.engagement;
  }
  if (typeof parsed.isAccepted === "boolean") {
    cursor.isAccepted = parsed.isAccepted;
  }
  return cursor;
}

export function encodeDiscussionCursor(cursor: DiscussionListCursor): string {
  return encodeCursor({
    id: cursor.id,
    createdAt: cursor.createdAt.toISOString(),
    ...(cursor.updatedAt ? { updatedAt: cursor.updatedAt.toISOString() } : {}),
    ...(cursor.repliesCount !== undefined
      ? { repliesCount: cursor.repliesCount }
      : {}),
    ...(cursor.engagement !== undefined
      ? { engagement: cursor.engagement }
      : {}),
    ...(cursor.isAccepted !== undefined
      ? { isAccepted: cursor.isAccepted }
      : {}),
    ...(cursor.sort ? { sort: cursor.sort } : {}),
  });
}

export function takePage<T>(
  rows: T[],
  limit: number,
): { page: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return { page: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function createdAtIdDescSql(
  alias: string,
  cursor: DiscussionListCursor,
) {
  return sql<boolean>`(
    ${sql.raw(`${alias}.created_at`)} < ${cursor.createdAt}
    or (
      ${sql.raw(`${alias}.created_at`)} = ${cursor.createdAt}
      and ${sql.raw(`${alias}.id`)} < ${cursor.id}::uuid
    )
  )`;
}

export function createdAtIdAscSql(alias: string, cursor: DiscussionListCursor) {
  return sql<boolean>`(
    ${sql.raw(`${alias}.created_at`)} > ${cursor.createdAt}
    or (
      ${sql.raw(`${alias}.created_at`)} = ${cursor.createdAt}
      and ${sql.raw(`${alias}.id`)} > ${cursor.id}::uuid
    )
  )`;
}

export function authorRoleSql(userIdColumn: string) {
  return sql<string | null>`(
    select roles.name
    from user_roles
    inner join roles on roles.id = user_roles.role_id
    where user_roles.user_id = ${sql.raw(userIdColumn)}
    order by case roles.name
      when 'admin' then 0
      when 'instructor' then 1
      else 2
    end
    limit 1
  )`.as("authorRole");
}

export function mapAuthorRole(
  roleName?: string | null,
): "Student" | "Instructor" | "Admin" {
  const normalized = (roleName || "").toLowerCase();
  if (normalized === "admin") return "Admin";
  if (normalized === "instructor") return "Instructor";
  return "Student";
}

export async function resolveAcademyId(db: DatabaseExecutor): Promise<string> {
  const academy = await db
    .selectFrom("academy")
    .select("id")
    .executeTakeFirst();
  if (!academy?.id) {
    throw httpError(
      500,
      "ACADEMY_NOT_CONFIGURED",
      "Academy is not configured.",
    );
  }
  return academy.id;
}
