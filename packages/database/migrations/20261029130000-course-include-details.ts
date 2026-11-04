import { sql, type Kysely } from "kysely";

/**
 * "This course includes" becomes fully the course editor's: every line has
 * a title (`text`), a quieter line under it (`detail`), an icon and its
 * colour, and the lines every course used to get from the web app are now
 * rows of the course like any other, so they can be changed or removed.
 *
 * `kind` 'video' is the line about the course's video: its words are
 * written from the curriculum (length, sections, lessons) when shown.
 *
 * Every course gets the standard lines first, in the order the web app
 * drew them, and keeps its own lines after them with the check mark and
 * teal they were drawn with, so no course page changes.
 */
const STANDARD_LINES: ReadonlyArray<{
  kind: "custom" | "video";
  text: string;
  detail: string | null;
  icon: string;
  color: string;
}> = [
  {
    kind: "custom",
    text: "3 years of access",
    detail: "Watch every lesson as often as you like",
    icon: "calendar-check",
    color: "#5da9ff",
  },
  {
    kind: "video",
    text: "On-demand video",
    detail: null,
    icon: "monitor-play",
    color: "#f472b6",
  },
  {
    kind: "custom",
    text: "Certificate of completion",
    detail: "Yours once you finish the course",
    icon: "certificate",
    color: "#fbbf24",
  },
  {
    kind: "custom",
    text: "Doubt support in Discussions",
    detail: "Ask under any lesson and get answers",
    icon: "chats-circle",
    color: "#4ade80",
  },
  {
    kind: "custom",
    text: "Smooth player on any device",
    detail: "Phone, tablet or laptop, no distractions",
    icon: "devices",
    color: "#a16cff",
  },
];

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_includes
      add column if not exists detail text,
      add column if not exists color text,
      add column if not exists kind text not null default 'custom'
  `.execute(database);
  await sql`
    alter table course_includes
      drop constraint if exists course_includes_kind_valid
  `.execute(database);
  await sql`
    alter table course_includes
      add constraint course_includes_kind_valid
      check (kind in ('custom', 'video'))
  `.execute(database);

  // The course's own lines: after the standard ones, drawn as before.
  await sql`
    update course_includes
      set position = position + ${STANDARD_LINES.length},
          icon = coalesce(icon, 'check-circle'),
          color = coalesce(color, '#2dd4bf')
  `.execute(database);

  for (const [position, line] of STANDARD_LINES.entries()) {
    await sql`
      insert into course_includes
        (id, course_id, text, detail, icon, color, kind, position,
         created_at, updated_at)
      select gen_random_uuid(), c.id, ${line.text}, ${line.detail},
        ${line.icon}, ${line.color}, ${line.kind}, ${position}, now(), now()
      from courses c
    `.execute(database);
  }
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // The standard lines are drawn by the web app again; rows that match them
  // go, and the course's own lines move back up.
  for (const line of STANDARD_LINES) {
    await sql`
      delete from course_includes
      where text = ${line.text} and kind = ${line.kind}
    `.execute(database);
  }
  await sql`
    update course_includes
      set position = greatest(0, position - ${STANDARD_LINES.length})
  `.execute(database);
  await sql`
    alter table course_includes
      drop constraint if exists course_includes_kind_valid
  `.execute(database);
  await sql`
    alter table course_includes
      drop column if exists kind,
      drop column if exists color,
      drop column if exists detail
  `.execute(database);
}
