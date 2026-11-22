import type {
  CodingAssignment,
  CodingEntry,
  CodingExerciseVersion,
  CodingFile,
  CodingHint,
  CodingLearnerState,
  CodingSettings,
  CodingSolutionPolicy,
  CodingTests,
} from "@veolms/contracts";
import type {
  CodingExerciseVersionTable,
  CodingLearnerStateTable,
} from "@veolms/database";
import type { Selectable } from "kysely";
import type { CodingContent } from "./coding.suite.ts";

export type VersionRow = Selectable<CodingExerciseVersionTable>;
export type StateRow = Selectable<CodingLearnerStateTable>;
export interface AssignmentRow {
  id: string;
  exercise_id: string;
  exercise_version_id: string | null;
  course_id: string;
  lesson_id: string | null;
  required: boolean;
  solution_policy: CodingSolutionPolicy;
  solution_after_failed_submits: number;
  version_number: number | null;
}

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

/** jsonb comes back parsed; older drivers or raw rows may give text. */
function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function readContent(row: VersionRow): CodingContent {
  return {
    statement: row.statement,
    starterFiles: json<CodingFile[]>(row.starter_files, []),
    solutionFiles: json<CodingFile[]>(row.solution_files, []),
    entry: json<CodingEntry>(row.entry, { file: "index.js" }),
    tests: json<CodingTests>(row.tests, { format: "cases", cases: [] }),
    hints: json<CodingHint[]>(row.hints, []),
    settings: {
      mocks: [],
      bestOnDesktop: false,
      showHiddenInputs: false,
      ...json<Partial<CodingSettings>>(row.settings, {}),
    },
  };
}

export function readFiles(value: unknown): CodingFile[] {
  return json<CodingFile[]>(value, []);
}

export function presentVersion(row: VersionRow): CodingExerciseVersion {
  const content = readContent(row);
  return {
    id: row.id,
    versionNumber: row.version_number,
    ...content,
    suiteHash: row.suite_hash,
    validatedAt: iso(row.validated_at),
    publishedAt: iso(row.published_at),
  };
}

export function presentAssignment(row: AssignmentRow): CodingAssignment {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseVersionId: row.exercise_version_id,
    versionNumber: row.version_number,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    required: row.required,
    solutionPolicy: row.solution_policy,
    solutionAfterFailedSubmits: row.solution_after_failed_submits,
  };
}

/** Whether the learner may fetch the solution now. */
export function solutionAllowed(
  assignment: Pick<
    AssignmentRow,
    "solution_policy" | "solution_after_failed_submits"
  >,
  state: Pick<StateRow, "first_passed_at" | "failed_attempts_count"> | null,
) {
  const passed = Boolean(state?.first_passed_at);
  switch (assignment.solution_policy) {
    case "always":
      return true;
    case "never":
      return false;
    case "after_pass":
      return passed;
    case "after_failed_submits":
      return (
        passed ||
        (state?.failed_attempts_count ?? 0) >=
          assignment.solution_after_failed_submits
      );
  }
}

export function presentState(
  assignment: Pick<
    AssignmentRow,
    "solution_policy" | "solution_after_failed_submits"
  >,
  state: StateRow | null | undefined,
): CodingLearnerState {
  return {
    attempts: state?.attempts_count ?? 0,
    failedAttempts: state?.failed_attempts_count ?? 0,
    passed: Boolean(state?.first_passed_at),
    firstPassedAt: iso(state?.first_passed_at),
    solutionViewed: Boolean(state?.solution_viewed_at),
    solutionAvailable: solutionAllowed(assignment, state ?? null),
  };
}
