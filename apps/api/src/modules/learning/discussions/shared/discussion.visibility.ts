import { sql } from "kysely";

export function discussionVisibilityPredicate(
  alias: "t" | "n",
  userId: string,
  mine: boolean,
) {
  const userColumn = sql.ref(`${alias}.user_id`);
  const visibilityColumn = sql.ref(`${alias}.visibility`);
  if (mine) return sql`${userColumn} = ${userId}`;
  return sql`(
    ${visibilityColumn} = 'public'
    or (
      ${visibilityColumn} in ('private', 'unlisted')
      and ${userColumn} = ${userId}
    )
  )`;
}
