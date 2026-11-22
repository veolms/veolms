import type { Generated } from "kysely";
import type { Json } from "./json.schema.ts";

export type CodingExerciseKind = "function" | "web" | "react" | "node";
export type CodingDifficulty = "easy" | "medium" | "hard";
export type CodingExerciseStatus = "draft" | "published" | "archived";
export type CodingSolutionPolicy =
  "after_pass" | "after_failed_submits" | "always" | "never";

/** A course's practice exercise. Its content lives in versions. */
export interface CodingExerciseTable {
  id: string;
  academy_id: string;
  course_id: string;
  creator_id: string;
  title: string;
  kind: CodingExerciseKind;
  difficulty: CodingDifficulty;
  estimated_minutes: number;
  status: CodingExerciseStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

/** One version of an exercise; frozen once `published_at` is set. */
export interface CodingExerciseVersionTable {
  id: string;
  exercise_id: string;
  version_number: number;
  statement: string;
  starter_files: Json;
  solution_files: Json;
  entry: Json;
  tests: Json;
  hints: Json;
  settings: Json;
  suite_hash: string;
  validated_at: Date | null;
  published_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One exercise on one lesson; the version is null until it is published. */
export interface CodingAssignmentTable {
  id: string;
  exercise_id: string;
  exercise_version_id: string | null;
  course_id: string;
  /** Null: the course-wide entry (the course's practice list). */
  lesson_id: string | null;
  required: Generated<boolean>;
  solution_policy: Generated<CodingSolutionPolicy>;
  solution_after_failed_submits: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A learner's unsubmitted code for a lesson, saved when they leave it. */
export interface CodingDraftTable {
  user_id: string;
  assignment_id: string;
  exercise_version_id: string;
  files: Json;
  updated_at: Generated<Date>;
}

export interface CodingSubmissionTable {
  id: string;
  user_id: string;
  assignment_id: string;
  exercise_version_id: string;
  suite_hash: string;
  passed: boolean;
  passed_count: number;
  total_count: number;
  failed_test_ids: string[];
  /** Kept on passing submissions and the latest few failed ones. */
  files: Json | null;
  results: Json | null;
  duration_ms: number | null;
  created_at: Generated<Date>;
}

/** Where one learner stands on one lesson's exercise. */
export interface CodingLearnerStateTable {
  user_id: string;
  assignment_id: string;
  attempts_count: Generated<number>;
  failed_attempts_count: Generated<number>;
  first_opened_at: Generated<Date>;
  first_passed_at: Date | null;
  passed_version_id: string | null;
  solution_viewed_at: Date | null;
  solution_viewed_before_pass: Generated<boolean>;
  last_submitted_at: Date | null;
  updated_at: Generated<Date>;
}
