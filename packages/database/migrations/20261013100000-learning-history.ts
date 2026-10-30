import { sql, type Kysely } from "kysely";

/**
 * A learner's history, day by day: how long they learned, whether that met
 * their goal, and which courses the time went to.
 *
 * 1. `learning_daily_activity.goal_minutes`: the goal as it stood on that
 *    day. Only the current goal was stored (on user_learning_settings), so
 *    a learner who changed it had every past day judged against the new
 *    one. It is written with the day's activity from now on. Days already
 *    recorded are given the learner's present goal, or the default of 60
 *    minutes (`DEFAULT_DAILY_GOAL_MINUTES` in the contracts): what the goal
 *    was on those days is not known, and this is what they were shown.
 *
 * 2. `learning_daily_course_activity`: the same ledger split by course. It
 *    is written in the same statement as the day's total, so the two agree.
 *    Nothing is recorded for days before it existed: the day's total was
 *    never split, and cannot be now.
 *
 * 3. `user_learning_settings.progress_shared`: the learner's choice to let
 *    other members see their history. Off unless they turn it on.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_daily_activity
      add column if not exists goal_minutes integer
        check (goal_minutes is null
               or (goal_minutes >= 15 and goal_minutes <= 720))
  `.execute(database);

  await sql`
    update learning_daily_activity a
    set goal_minutes = coalesce(
      (
        select s.daily_goal_minutes
        from user_learning_settings s
        where s.user_id = a.user_id
      ),
      60
    )
    where a.goal_minutes is null
  `.execute(database);

  await sql`
    create table if not exists learning_daily_course_activity (
      user_id uuid not null references users(id) on delete cascade,
      activity_date date not null,
      course_id uuid not null references courses(id) on delete cascade,
      seconds integer not null default 0,
      completions integer not null default 0,
      primary key (user_id, activity_date, course_id)
    )
  `.execute(database);

  // Removing a course removes its rows here; without this that is a scan
  // of every learner's history.
  await sql`
    create index if not exists idx_learning_daily_course_activity_course
      on learning_daily_course_activity (course_id)
  `.execute(database);

  await sql`
    alter table user_learning_settings
      add column if not exists progress_shared boolean not null default false
  `.execute(database);

  // The list of members who share is read from here; few learners do.
  await sql`
    create index if not exists idx_user_learning_settings_progress_shared
      on user_learning_settings (user_id)
      where progress_shared
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists idx_user_learning_settings_progress_shared
  `.execute(database);
  await sql`
    alter table user_learning_settings
      drop column if exists progress_shared
  `.execute(database);
  await sql`
    drop index if exists idx_learning_daily_course_activity_course
  `.execute(database);
  await sql`
    drop table if exists learning_daily_course_activity
  `.execute(database);
  await sql`
    alter table learning_daily_activity
      drop column if exists goal_minutes
  `.execute(database);
}
