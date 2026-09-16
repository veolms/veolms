import type { Generated } from "kysely";
export type QuizStatus = "draft" | "published" | "archived";
export type QuizAttemptStatus =
  "in_progress" | "submitted" | "graded" | "expired";
export type QuizQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer";
export interface QuizTable {
  id: string;
  academy_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}
export interface QuizVersionTable {
  id: string;
  quiz_id: string;
  version_number: number;
  instructions: string | null;
  created_at: Generated<Date>;
  published_at: Date | null;
}
export interface QuizQuestionTable {
  id: string;
  quiz_version_id: string;
  question_type: QuizQuestionType;
  prompt: string;
  points: number;
  position: number;
  configuration: unknown;
  explanation: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}
export interface QuizQuestionOptionTable {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  weight: number;
  position: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
export interface QuizAssignmentTable {
  id: string;
  quiz_id: string;
  quiz_version_id: string;
  course_id: string;
  lesson_id: string;
  required: boolean;
  pass_percentage: number;
  max_attempts: number;
  time_limit_seconds: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  feedback_mode: "after_submit" | "after_attempt" | "never";
  available_from: Date | null;
  available_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
export interface QuizAttemptTable {
  id: string;
  assignment_id: string;
  quiz_version_id: string;
  user_id: string;
  attempt_number: number;
  status: QuizAttemptStatus;
  started_at: Generated<Date>;
  expires_at: Date | null;
  submitted_at: Date | null;
  score_obtained: number | null;
  max_score: number | null;
  score_percentage: number | null;
  is_passed: boolean | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
export interface QuizAttemptAnswerTable {
  id: string;
  attempt_id: string;
  question_id: string;
  response_value: unknown;
  is_correct: boolean | null;
  points_awarded: number | null;
  time_spent_seconds: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
