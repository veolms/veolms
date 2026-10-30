import { readFile } from "node:fs/promises";

import { sql, type Kysely } from "kysely";

interface SeedQuote {
  text: string;
  author: string;
  source?: string;
}

/**
 * The quotes the learner's home page shows, one a day.
 *
 * A quote is never deleted to retire it: `is_active` takes it out of the
 * rotation. The unique index on the text is what lets a later migration load
 * another file of quotes without checking what is already there.
 *
 * The first set comes from `data/quotes-20261012.json`. Add more with a new
 * migration and a new file; do not edit that one.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists quotes (
      id integer generated always as identity primary key,
      text text not null check (length(btrim(text)) > 0),
      author text not null check (length(btrim(author)) > 0),
      source text,
      is_active boolean not null default true,
      created_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  await sql`
    create unique index if not exists quotes_text_key on quotes (md5(text))
  `.execute(database);

  const quotes = JSON.parse(
    await readFile(
      new URL("./data/quotes-20261012.json", import.meta.url),
      "utf8",
    ),
  ) as SeedQuote[];

  for (const quote of quotes) {
    await sql`
      insert into quotes (text, author, source)
      values (${quote.text}, ${quote.author}, ${quote.source ?? null})
      on conflict do nothing
    `.execute(database);
  }
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists quotes`.execute(database);
}
