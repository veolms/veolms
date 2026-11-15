import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

export interface ShortLinkRow {
  id: string;
  path: string;
  destination: string;
  mode: "redirect" | "rewrite";
  redirect_status: 301 | 302;
  is_active: boolean;
  visit_count: string;
  last_visited_at: Date | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

function selectLinks(database: DatabaseExecutor) {
  return database
    .selectFrom("short_links")
    .leftJoin("users", "users.id", "short_links.created_by")
    .select([
      "short_links.id",
      "short_links.path",
      "short_links.destination",
      "short_links.mode",
      "short_links.redirect_status",
      "short_links.is_active",
      "short_links.visit_count",
      "short_links.last_visited_at",
      "short_links.created_by",
      "users.display_name as created_by_name",
      "short_links.created_at",
      "short_links.updated_at",
    ]);
}

export async function listLinks(
  database: DatabaseExecutor,
): Promise<ShortLinkRow[]> {
  return (await selectLinks(database)
    .orderBy("short_links.created_at", "desc")
    .execute()) as ShortLinkRow[];
}

export async function findLinkById(
  database: DatabaseExecutor,
  id: string,
): Promise<ShortLinkRow | undefined> {
  return (await selectLinks(database)
    .where("short_links.id", "=", id)
    .executeTakeFirst()) as ShortLinkRow | undefined;
}

/** The active link at a (normalised) path, for the website Worker. */
export async function findActiveLinkByPath(
  database: DatabaseExecutor,
  path: string,
) {
  return await database
    .selectFrom("short_links")
    .select(["id", "path", "destination", "mode", "redirect_status"])
    .where("path", "=", path)
    .where("is_active", "=", true)
    .executeTakeFirst();
}

/** Which of these paths other links already use (paused ones too). */
export async function findTakenLinkPaths(
  database: DatabaseExecutor,
  paths: readonly string[],
  exceptLinkId?: string,
): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  let query = database
    .selectFrom("short_links")
    .select("path")
    .where("path", "in", paths);
  if (exceptLinkId) query = query.where("id", "!=", exceptLinkId);
  const rows = await query.execute();
  return new Set(rows.map((row) => row.path));
}

/** Which of these names are usernames (compared without case). */
export async function findTakenUsernames(
  database: DatabaseExecutor,
  names: readonly string[],
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await database
    .selectFrom("users")
    .select(sql<string>`lower(username)`.as("name"))
    .where(sql<string>`lower(username)`, "in", names)
    .execute();
  return new Set(rows.map((row) => row.name));
}

export async function insertLink(
  database: DatabaseExecutor,
  link: {
    path: string;
    destination: string;
    mode: "redirect" | "rewrite";
    redirectStatus: 301 | 302;
    createdBy: string | null;
  },
): Promise<string> {
  const row = await database
    .insertInto("short_links")
    .values({
      path: link.path,
      destination: link.destination,
      mode: link.mode,
      redirect_status: link.redirectStatus,
      created_by: link.createdBy,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function updateLink(
  database: DatabaseExecutor,
  id: string,
  changes: {
    path?: string;
    destination?: string;
    mode?: "redirect" | "rewrite";
    redirectStatus?: 301 | 302;
    isActive?: boolean;
  },
): Promise<boolean> {
  const result = await database
    .updateTable("short_links")
    .set({
      ...(changes.path !== undefined ? { path: changes.path } : {}),
      ...(changes.destination !== undefined
        ? { destination: changes.destination }
        : {}),
      ...(changes.mode !== undefined ? { mode: changes.mode } : {}),
      ...(changes.redirectStatus !== undefined
        ? { redirect_status: changes.redirectStatus }
        : {}),
      ...(changes.isActive !== undefined
        ? { is_active: changes.isActive }
        : {}),
      updated_at: sql`current_timestamp`,
    })
    .where("id", "=", id)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

export async function deleteLink(
  database: DatabaseExecutor,
  id: string,
): Promise<string | null> {
  const row = await database
    .deleteFrom("short_links")
    .where("id", "=", id)
    .returning("path")
    .executeTakeFirst();
  return row?.path ?? null;
}

export async function recordVisit(
  database: DatabaseExecutor,
  id: string,
): Promise<void> {
  await database
    .updateTable("short_links")
    .set({
      visit_count: sql`visit_count + 1`,
      last_visited_at: sql`current_timestamp`,
    })
    .where("id", "=", id)
    .where("is_active", "=", true)
    .execute();
}
