import { sql, type Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("quizzes")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("academy_id", "uuid", (c) =>
      c.notNull().references("academy.id").onDelete("cascade"),
    )
    .addColumn("creator_id", "uuid", (c) =>
      c.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (c) => c.notNull())
    .addColumn("description", "text")
    .addColumn("status", "text", (c) => c.notNull().defaultTo("draft"))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .addCheckConstraint(
      "quizzes_status_valid",
      sql`status in ('draft','published','archived')`,
    )
    .execute();
  await db.schema
    .createIndex("quizzes_academy_idx")
    .on("quizzes")
    .column("academy_id")
    .execute();
  await db.schema
    .createIndex("quizzes_creator_idx")
    .on("quizzes")
    .column("creator_id")
    .execute();
  await db.schema
    .createTable("quiz_versions")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("quiz_id", "uuid", (c) =>
      c.notNull().references("quizzes.id").onDelete("cascade"),
    )
    .addColumn("version_number", "integer", (c) => c.notNull())
    .addColumn("instructions", "text")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("published_at", "timestamptz")
    .addUniqueConstraint("quiz_versions_quiz_version_unique", [
      "quiz_id",
      "version_number",
    ])
    .execute();
  await db.schema
    .createTable("quiz_questions")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("quiz_version_id", "uuid", (c) =>
      c.notNull().references("quiz_versions.id").onDelete("cascade"),
    )
    .addColumn("question_type", "text", (c) => c.notNull())
    .addColumn("prompt", "text", (c) => c.notNull())
    .addColumn("points", "numeric", (c) => c.notNull())
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("configuration", "jsonb", (c) =>
      c.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("explanation", "text")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .addCheckConstraint(
      "quiz_questions_type_valid",
      sql`question_type in ('single_choice','multiple_choice','true_false')`,
    )
    .addCheckConstraint("quiz_questions_points_valid", sql`points >= 0`)
    .addCheckConstraint("quiz_questions_position_valid", sql`position >= 0`)
    .execute();
  await db.schema
    .createIndex("quiz_questions_version_idx")
    .on("quiz_questions")
    .column("quiz_version_id")
    .execute();
  await db.schema
    .createTable("quiz_question_options")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("question_id", "uuid", (c) =>
      c.notNull().references("quiz_questions.id").onDelete("cascade"),
    )
    .addColumn("option_text", "text", (c) => c.notNull())
    .addColumn("is_correct", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("weight", "numeric", (c) => c.notNull().defaultTo(0))
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "quiz_question_options_weight_valid",
      sql`weight >= 0 and weight <= 1`,
    )
    .addCheckConstraint(
      "quiz_question_options_position_valid",
      sql`position >= 0`,
    )
    .execute();
  await db.schema
    .createIndex("quiz_question_options_question_idx")
    .on("quiz_question_options")
    .column("question_id")
    .execute();
  await db.schema
    .createTable("quiz_assignments")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("quiz_id", "uuid", (c) =>
      c.notNull().references("quizzes.id").onDelete("cascade"),
    )
    .addColumn("quiz_version_id", "uuid", (c) =>
      c.notNull().references("quiz_versions.id"),
    )
    .addColumn("course_id", "uuid", (c) =>
      c.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "uuid", (c) =>
      c.notNull().references("course_lessons.id").onDelete("cascade"),
    )
    .addColumn("required", "boolean", (c) => c.notNull().defaultTo(true))
    .addColumn("pass_percentage", "numeric", (c) => c.notNull().defaultTo(70))
    .addColumn("max_attempts", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("time_limit_seconds", "integer")
    .addColumn("shuffle_questions", "boolean", (c) =>
      c.notNull().defaultTo(false),
    )
    .addColumn("shuffle_options", "boolean", (c) =>
      c.notNull().defaultTo(false),
    )
    .addColumn("feedback_mode", "text", (c) =>
      c.notNull().defaultTo("after_submit"),
    )
    .addColumn("available_from", "timestamptz")
    .addColumn("available_until", "timestamptz")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("quiz_assignments_lesson_unique", ["lesson_id"])
    .addCheckConstraint(
      "quiz_assignments_pass_percentage_valid",
      sql`pass_percentage between 0 and 100`,
    )
    .addCheckConstraint(
      "quiz_assignments_attempts_valid",
      sql`max_attempts > 0`,
    )
    .addCheckConstraint(
      "quiz_assignments_time_limit_valid",
      sql`time_limit_seconds is null or time_limit_seconds > 0`,
    )
    .addCheckConstraint(
      "quiz_assignments_feedback_mode_valid",
      sql`feedback_mode in ('after_submit','after_attempt','never')`,
    )
    .addCheckConstraint(
      "quiz_assignments_availability_valid",
      sql`available_from is null or available_until is null or available_until >= available_from`,
    )
    .execute();
  await db.schema
    .createIndex("quiz_assignments_course_idx")
    .on("quiz_assignments")
    .column("course_id")
    .execute();
  await db.schema
    .createIndex("quiz_assignments_quiz_idx")
    .on("quiz_assignments")
    .column("quiz_id")
    .execute();
  await db.schema
    .createTable("quiz_attempts")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("assignment_id", "uuid", (c) =>
      c.notNull().references("quiz_assignments.id").onDelete("cascade"),
    )
    .addColumn("quiz_version_id", "uuid", (c) =>
      c.notNull().references("quiz_versions.id"),
    )
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("attempt_number", "integer", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull().defaultTo("in_progress"))
    .addColumn("started_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("expires_at", "timestamptz")
    .addColumn("submitted_at", "timestamptz")
    .addColumn("score_obtained", "numeric")
    .addColumn("max_score", "numeric")
    .addColumn("score_percentage", "numeric")
    .addColumn("is_passed", "boolean")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "quiz_attempts_attempt_number_valid",
      sql`attempt_number > 0`,
    )
    .addCheckConstraint(
      "quiz_attempts_status_valid",
      sql`status in ('in_progress','submitted','graded','expired')`,
    )
    .addUniqueConstraint("quiz_attempts_assignment_user_number_unique", [
      "assignment_id",
      "user_id",
      "attempt_number",
    ])
    .execute();
  await db.schema
    .createIndex("quiz_attempts_assignment_idx")
    .on("quiz_attempts")
    .column("assignment_id")
    .execute();
  await db.schema
    .createIndex("quiz_attempts_user_idx")
    .on("quiz_attempts")
    .column("user_id")
    .execute();
  await db.schema
    .createIndex("quiz_attempts_version_idx")
    .on("quiz_attempts")
    .column("quiz_version_id")
    .execute();
  await db.schema
    .createIndex("quiz_attempts_one_active")
    .on("quiz_attempts")
    .columns(["assignment_id", "user_id"])
    .where(sql<boolean>`status = 'in_progress'`)
    .unique()
    .execute();
  await db.schema
    .createTable("quiz_attempt_answers")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("attempt_id", "uuid", (c) =>
      c.notNull().references("quiz_attempts.id").onDelete("cascade"),
    )
    .addColumn("question_id", "uuid", (c) =>
      c.notNull().references("quiz_questions.id").onDelete("cascade"),
    )
    .addColumn("response_value", "jsonb", (c) => c.notNull())
    .addColumn("is_correct", "boolean")
    .addColumn("points_awarded", "numeric")
    .addColumn("time_spent_seconds", "integer")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("quiz_attempt_answers_unique", [
      "attempt_id",
      "question_id",
    ])
    .execute();
  await db.schema
    .createIndex("quiz_attempt_answers_question_idx")
    .on("quiz_attempt_answers")
    .column("question_id")
    .execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("quiz_attempt_answers_question_idx")
    .ifExists()
    .execute();
  await db.schema.dropTable("quiz_attempt_answers").execute();
  await db.schema.dropIndex("quiz_attempts_one_active").ifExists().execute();
  await db.schema
    .dropIndex("quiz_attempts_assignment_idx")
    .ifExists()
    .execute();
  await db.schema.dropIndex("quiz_attempts_user_idx").ifExists().execute();
  await db.schema.dropIndex("quiz_attempts_version_idx").ifExists().execute();
  await db.schema.dropTable("quiz_attempts").execute();
  await db.schema.dropIndex("quiz_assignments_course_idx").ifExists().execute();
  await db.schema.dropIndex("quiz_assignments_quiz_idx").ifExists().execute();
  await db.schema.dropTable("quiz_assignments").execute();
  await db.schema
    .dropIndex("quiz_question_options_question_idx")
    .ifExists()
    .execute();
  await db.schema.dropTable("quiz_question_options").execute();
  await db.schema.dropIndex("quiz_questions_version_idx").ifExists().execute();
  await db.schema.dropTable("quiz_questions").execute();
  await db.schema.dropTable("quiz_versions").execute();
  await db.schema.dropIndex("quizzes_academy_idx").ifExists().execute();
  await db.schema.dropIndex("quizzes_creator_idx").ifExists().execute();
  await db.schema.dropTable("quizzes").execute();
}
