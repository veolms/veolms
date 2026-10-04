import { sql } from "kysely";
import type { RawBuilder } from "kysely";

export function discussionVisibilityPredicate(
  alias: "t" | "n",
  userId: string | null | undefined,
  mine: boolean,
): RawBuilder<boolean> {
  const userColumn = sql.ref(`${alias}.user_id`);
  const visibilityColumn = sql.ref(`${alias}.visibility`);
  if (mine && userId) return sql`${userColumn} = ${userId}`;
  if (!userId) return sql`${visibilityColumn} = 'public'`;
  return sql`(
    ${visibilityColumn} = 'public'
    or (
      ${visibilityColumn} in ('private', 'unlisted')
      and ${userColumn} = ${userId}
    )
  )`;
}
