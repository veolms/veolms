import { sql, type Kysely } from "kysely";

/**
 * A lesson keeps one piece of content per kind (a video, an audio file, an
 * image, a document) and shows learners the kind its creator selected.
 *
 * `course_lessons.content_type` and `content_media_id` stay what they were:
 * the selected kind and its media, which every reading path uses. Each row
 * here is the content one kind holds, so selecting another kind brings its
 * content back instead of losing it. A document holds a PDF (`media_id`) or
 * text the creator wrote (`body`, Markdown).
 *
 * Existing lessons with media get their row now, so nothing they hold is
 * lost on the first switch.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table course_lessons drop constraint if exists course_lessons_content_type_valid`.execute(
    database,
  );
  await sql`
    alter table course_lessons add constraint course_lessons_content_type_valid
      check (content_type in ('video', 'audio', 'image', 'document', 'quiz'))
  `.execute(database);

  await sql`
    create table if not exists course_lesson_contents (
      lesson_id uuid not null references course_lessons (id) on delete cascade,
      content_type text not null,
      media_id uuid references media_assets (id) on delete set null,
      body text,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      primary key (lesson_id, content_type),
      constraint course_lesson_contents_type_valid
        check (content_type in ('video', 'audio', 'image', 'document')),
      constraint course_lesson_contents_body_only_document
        check (body is null or content_type = 'document')
    )
  `.execute(database);

  await sql`
    create index if not exists course_lesson_contents_media_id_idx
      on course_lesson_contents (media_id)
      where media_id is not null
  `.execute(database);

  await sql`
    insert into course_lesson_contents (lesson_id, content_type, media_id)
    select id, content_type, content_media_id
    from course_lessons
    where content_media_id is not null
      and content_type in ('video', 'document')
    on conflict (lesson_id, content_type) do nothing
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists course_lesson_contents`.execute(database);
  // Audio and image lessons did not exist before: they go back to video
  // lessons without media, as a video lesson with none is shown.
  await sql`
    update course_lessons
      set content_type = 'video', content_media_id = null
      where content_type in ('audio', 'image')
  `.execute(database);
  await sql`alter table course_lessons drop constraint if exists course_lessons_content_type_valid`.execute(
    database,
  );
  await sql`
    alter table course_lessons add constraint course_lessons_content_type_valid
      check (content_type in ('video', 'document', 'quiz'))
  `.execute(database);
}
