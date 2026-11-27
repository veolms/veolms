import type {
  CodingAssignment,
  CodingEntry,
  CodingExerciseVersion,
  CodingFile,
  CodingHint,
  CodingLearnerState,
  CodingSettings,
  CodingSolutionPolicy,
  CodingSubmissionSummary,
  CodingTestResult,
  CodingTests,
} from "@veolms/contracts";
import type {
  CodingExerciseVersionTable,
  CodingLearnerStateTable,
} from "@veolms/database";
import type { Selectable } from "kysely";
import { DEFAULT_CODING_SETTINGS, type CodingContent } from "./coding.suite.ts";

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
    settings: readSettings(row.settings),
    editorial: row.editorial ?? "",
  };
}

/** A version's settings, with the defaults of keys older rows lack. */
export function readSettings(value: unknown): CodingSettings {
  return {
    ...DEFAULT_CODING_SETTINGS,
    ...json<Partial<CodingSettings>>(value, {}),
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
    bestSolveSeconds: state?.best_solve_seconds ?? null,
  };
}

/** Stored test results; older or odd rows give an empty list. */
export function readResults(value: unknown): CodingTestResult[] {
  const rows = json<unknown[]>(value, []);
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.passed !== "boolean")
      return [];
    return [
      {
        id: item.id,
        passed: item.passed,
        ...(typeof item.ms === "number" ? { ms: Math.round(item.ms) } : {}),
        ...(typeof item.message === "string"
          ? { message: item.message.slice(0, 500) }
          : {}),
      },
    ];
  });
}

export function presentSubmission(row: {
  id: string;
  passed: boolean;
  passed_count: number;
  total_count: number;
  failed_test_ids: string[] | null;
  version_number: number;
  created_at: Date;
  files: unknown;
  results: unknown;
  duration_ms: number | null;
  solve_seconds: number | null;
}): CodingSubmissionSummary {
  return {
    id: row.id,
    passed: row.passed,
    passedCount: row.passed_count,
    totalCount: row.total_count,
    failedTestIds: row.failed_test_ids ?? [],
    versionNumber: row.version_number,
    createdAt: row.created_at.toISOString(),
    files: row.files === null ? null : readFiles(row.files),
    results: readResults(row.results),
    durationMs: row.duration_ms,
    solveSeconds: row.solve_seconds,
  };
}
