import { z } from "zod";

/**
 * Coding practice: a lecture's practice questions, written in the course
 * editor's Practice tab of that lecture; learners practise them in the
 * browser. The code runs on the learner's device (a sandboxed frame); the API
 * stores exercises, drafts and results and never runs code.
 *
 * The file, test and run shapes are kept independent of exercises so a later
 * free playground or project workspace can use the same runner and editor.
 */

/**
 * `function`: a function tested with a table of calls. `web`: an HTML page.
 * `react`: a React component. `node`: Node.js modules (require, events,
 * fs, path…) tested with a test file, run in the browser.
 */
export const codingExerciseKindSchema = z.enum([
  "function",
  "web",
  "react",
  "node",
]);
/** The language a new exercise's files start in. */
export const codingLanguageSchema = z.enum(["javascript", "typescript"]);
export const codingDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const codingExerciseStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);
export const codingSolutionPolicySchema = z.enum([
  "after_pass",
  "after_failed_submits",
  "always",
  "never",
]);
export const codingCompareSchema = z.enum(["deepEqual", "approx"]);

/** Limits shared by the API (validation) and the page (editor hints). */
export const CODING_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 64 * 1024,
  maxSubmissionBytes: 128 * 1024,
  maxPathLength: 120,
  maxTests: 100,
  maxTestSourceBytes: 64 * 1024,
  maxStatementChars: 20_000,
  maxHints: 10,
  maxMocks: 20,
  maxTitleChars: 160,
  defaultTestTimeoutMs: 2_000,
  minTestTimeoutMs: 100,
  maxTestTimeoutMs: 5_000,
  /** Failed submissions per learner per lesson that keep their code. */
  keptFailedSubmissions: 5,
  submitsPerHour: 30,
  draftSavesPerMinute: 6,
} as const;

const uuid = z.uuid();
const shortId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _.");

export const codingFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(CODING_LIMITS.maxPathLength)
  .regex(
    /^(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+$/,
    "Use letters, digits, -, _, . and / only.",
  );

/** One file of a workspace: starter, solution, draft or submission. */
export const codingFileSchema = z.strictObject({
  path: codingFilePathSchema,
  content: z.string().max(CODING_LIMITS.maxFileBytes),
  /** Shown but not editable (e.g. the HTML of a CSS exercise). */
  readOnly: z.boolean().optional(),
  /** Sent with the lesson and used by tests, never shown in the editor. */
  hidden: z.boolean().optional(),
});
export const codingFilesSchema = z
  .array(codingFileSchema)
  .max(CODING_LIMITS.maxFiles)
  .superRefine((files, ctx) => {
    const seen = new Set<string>();
    for (const [index, file] of files.entries()) {
      if (seen.has(file.path))
        ctx.addIssue({
          code: "custom",
          path: [index, "path"],
          message: `Two files are named ${file.path}.`,
        });
      seen.add(file.path);
    }
  });

/**
 * Where the runner starts. `function`: the file and the function the tests
 * call. `web`: the HTML page. `react`: the module that exports the App.
 */
export const codingEntrySchema = z.strictObject({
  file: codingFilePathSchema,
  name: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Not a valid JavaScript name.")
    .optional(),
});

/** One row of a `function` exercise's table: call with args, expect a value. */
export const codingTestCaseSchema = z.strictObject({
  id: shortId,
  name: z.string().trim().min(1).max(160),
  args: z.array(z.unknown()).max(20),
  expected: z.unknown(),
  compare: codingCompareSchema.default("deepEqual"),
  hidden: z.boolean().default(false),
  timeoutMs: z
    .number()
    .int()
    .min(CODING_LIMITS.minTestTimeoutMs)
    .max(CODING_LIMITS.maxTestTimeoutMs)
    .optional(),
});

/** A test the page found in a script suite (names it, says if hidden). */
export const codingScriptTestSchema = z.strictObject({
  id: shortId,
  name: z.string().min(1).max(160),
  hidden: z.boolean(),
});

export const codingTestsSchema = z.discriminatedUnion("format", [
  z.strictObject({
    format: z.literal("cases"),
    cases: z.array(codingTestCaseSchema).max(CODING_LIMITS.maxTests),
  }),
  z.strictObject({
    format: z.literal("script"),
    source: z.string().max(CODING_LIMITS.maxTestSourceBytes),
    /**
     * The tests the author's validation run found, in order. Set by the
     * API at publish from the validation report; submissions are checked
     * against it.
     */
    tests: z.array(codingScriptTestSchema).max(CODING_LIMITS.maxTests),
    timeoutMs: z
      .number()
      .int()
      .min(CODING_LIMITS.minTestTimeoutMs)
      .max(CODING_LIMITS.maxTestTimeoutMs)
      .optional(),
  }),
]);

export const codingHintSchema = z.strictObject({
  id: shortId,
  body: z.string().trim().min(1).max(4_000),
  /** 0: shown on request at once. N: after N failed submits. */
  unlockAfterFailedSubmits: z.number().int().min(0).max(50).default(0),
});

/** A route the sandbox's `fetch` answers instead of the network. */
export const codingMockRouteSchema = z.strictObject({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  path: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^\/[^\s]*$/, "Start with /, no spaces."),
  status: z.number().int().min(100).max(599).default(200),
  body: z.unknown(),
  delayMs: z.number().int().min(0).max(5_000).default(0),
});

export const codingSettingsSchema = z.strictObject({
  mocks: z.array(codingMockRouteSchema).max(CODING_LIMITS.maxMocks).default([]),
  bestOnDesktop: z.boolean().default(false),
  /** After a failed submit, show a hidden test's input and expected value. */
  showHiddenInputs: z.boolean().default(false),
});

/* ---------------------------------------------------------------- authoring */

export const codingExerciseVersionSchema = z.strictObject({
  id: uuid,
  versionNumber: z.number().int().positive(),
  statement: z.string(),
  starterFiles: codingFilesSchema,
  solutionFiles: codingFilesSchema,
  entry: codingEntrySchema,
  tests: codingTestsSchema,
  hints: z.array(codingHintSchema),
  settings: codingSettingsSchema,
  suiteHash: z.string(),
  validatedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

/** One exercise on the course editor's Practice panel. */
export const courseCodingExerciseSchema = z.strictObject({
  id: uuid,
  title: z.string(),
  kind: codingExerciseKindSchema,
  difficulty: codingDifficultySchema,
  estimatedMinutes: z.number().int().positive(),
  status: codingExerciseStatusSchema,
  latestPublishedVersion: z.number().int().positive().nullable(),
  hasUnpublishedChanges: z.boolean(),
  /** The lecture it belongs to (one row; a list for older data). */
  lectures: z.array(
    z.strictObject({
      assignmentId: uuid,
      lessonId: uuid,
      lessonTitle: z.string(),
    }),
  ),
  updatedAt: z.string(),
});
export const courseCodingExercisesResponseSchema = z.strictObject({
  exercises: z.array(courseCodingExerciseSchema),
});

export const codingAssignmentSchema = z.strictObject({
  id: uuid,
  exerciseId: uuid,
  /** Null while the exercise has no published version: learners don't see it yet. */
  exerciseVersionId: uuid.nullable(),
  versionNumber: z.number().int().positive().nullable(),
  courseId: uuid,
  lessonId: uuid.nullable(),
  required: z.boolean(),
  solutionPolicy: codingSolutionPolicySchema,
  solutionAfterFailedSubmits: z.number().int().min(1).max(50),
});

/** An exercise as its author edits it. */
export const codingExerciseSchema = z.strictObject({
  id: uuid,
  title: z.string(),
  kind: codingExerciseKindSchema,
  difficulty: codingDifficultySchema,
  estimatedMinutes: z.number().int().positive(),
  status: codingExerciseStatusSchema,
  /** The version edits apply to: the draft, or the newest version. */
  editable: codingExerciseVersionSchema,
  versions: z.array(
    z.strictObject({
      id: uuid,
      versionNumber: z.number().int().positive(),
      publishedAt: z.string().nullable(),
    }),
  ),
  assignments: z.array(
    codingAssignmentSchema.extend({
      courseTitle: z.string(),
      lessonTitle: z.string(),
    }),
  ),
  updatedAt: z.string(),
});

export const createCodingExerciseRequestSchema = z.strictObject({
  /** The lecture the question belongs to; learners find it there. */
  lessonId: uuid,
  title: z.string().trim().min(1).max(CODING_LIMITS.maxTitleChars),
  kind: codingExerciseKindSchema,
  language: codingLanguageSchema.optional(),
  difficulty: codingDifficultySchema.optional(),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
});

export const updateCodingExerciseRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(CODING_LIMITS.maxTitleChars).optional(),
  difficulty: codingDifficultySchema.optional(),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
  statement: z.string().max(CODING_LIMITS.maxStatementChars).optional(),
  starterFiles: codingFilesSchema.optional(),
  solutionFiles: codingFilesSchema.optional(),
  entry: codingEntrySchema.optional(),
  tests: codingTestsSchema.optional(),
  hints: z.array(codingHintSchema).max(CODING_LIMITS.maxHints).optional(),
  settings: codingSettingsSchema.optional(),
});

/** What the author's browser found when it ran the suite. */
export const publishCodingExerciseRequestSchema = z.strictObject({
  suiteHash: z.string().min(1).max(128),
  solutionPassed: z.boolean(),
  starterFailed: z.boolean(),
  /** For a script suite: the tests found, in order. */
  scriptTests: z
    .array(codingScriptTestSchema)
    .max(CODING_LIMITS.maxTests)
    .optional(),
});

/* ------------------------------------------------------------------ learner */

export const codingLearnerStateSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  failedAttempts: z.number().int().nonnegative(),
  passed: z.boolean(),
  firstPassedAt: z.string().nullable(),
  solutionViewed: z.boolean(),
  /** The solution may be fetched now (policy and state allow it). */
  solutionAvailable: z.boolean(),
});

/** Everything a learner's page needs to practise one lesson. */
/** Practice exercises as a learner sees them: the course's list, or a lecture's. */
export const lecturePracticeResponseSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      assignmentId: uuid,
      /** The lecture it belongs to (null: shown for the whole course). */
      lessonId: uuid.nullable(),
      title: z.string(),
      kind: codingExerciseKindSchema,
      difficulty: codingDifficultySchema,
      estimatedMinutes: z.number().int().positive(),
      status: z.enum(["new", "started", "done"]),
    }),
  ),
});

export const codingLessonSchema = z.strictObject({
  assignment: z.strictObject({
    id: uuid,
    courseId: uuid,
    /** Null when opened from the course's practice list. */
    lessonId: uuid.nullable(),
    required: z.boolean(),
    solutionPolicy: codingSolutionPolicySchema,
    solutionAfterFailedSubmits: z.number().int(),
  }),
  exercise: z.strictObject({
    id: uuid,
    versionId: uuid,
    title: z.string(),
    kind: codingExerciseKindSchema,
    difficulty: codingDifficultySchema,
    estimatedMinutes: z.number().int().positive(),
    statement: z.string(),
    /** Editable and read-only files the learner sees. */
    starterFiles: codingFilesSchema,
    /** Files the tests use but the learner never sees. */
    supportFiles: codingFilesSchema,
    entry: codingEntrySchema,
    tests: codingTestsSchema,
    hints: z.array(codingHintSchema),
    settings: codingSettingsSchema,
    suiteHash: z.string(),
  }),
  state: codingLearnerStateSchema,
  draft: z
    .strictObject({
      versionId: uuid,
      files: codingFilesSchema,
      updatedAt: z.string(),
    })
    .nullable(),
});

export const saveCodingDraftRequestSchema = z.strictObject({
  versionId: uuid,
  files: codingFilesSchema,
});
export const saveCodingDraftResponseSchema = z.strictObject({
  savedAt: z.string(),
});

export const codingTestResultSchema = z.strictObject({
  id: shortId,
  passed: z.boolean(),
  ms: z.number().int().min(0).max(60_000).optional(),
  /** What went wrong, shown to staff with the submission. */
  message: z.string().max(500).optional(),
});

export const submitCodingRequestSchema = z.strictObject({
  versionId: uuid,
  suiteHash: z.string().min(1).max(128),
  files: codingFilesSchema,
  results: z.array(codingTestResultSchema).max(CODING_LIMITS.maxTests),
  durationMs: z.number().int().min(0).max(600_000).optional(),
});
export const submitCodingResponseSchema = z.strictObject({
  submissionId: uuid,
  passed: z.boolean(),
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  /** True when this submission completed the lesson for the first time. */
  firstPass: z.boolean(),
  state: codingLearnerStateSchema,
});

export const codingSubmissionSummarySchema = z.strictObject({
  id: uuid,
  passed: z.boolean(),
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  failedTestIds: z.array(z.string()),
  versionNumber: z.number().int().positive(),
  createdAt: z.string(),
  /** Null when the code was not kept (older failed attempts). */
  files: codingFilesSchema.nullable(),
});
export const codingSubmissionsResponseSchema = z.strictObject({
  submissions: z.array(codingSubmissionSummarySchema),
});

export const codingSolutionResponseSchema = z.strictObject({
  files: codingFilesSchema,
  state: codingLearnerStateSchema,
});

/* -------------------------------------------------------------------- staff */

export const codingAssignmentAnalyticsSchema = z.strictObject({
  exerciseTitle: z.string(),
  lessonTitle: z.string(),
  learnersWithAccess: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  medianAttemptsToPass: z.number().nonnegative().nullable(),
  solutionViewedBeforePass: z.number().int().nonnegative(),
  /** Tests ordered by how many learners' latest attempt failed them. */
  tests: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      hidden: z.boolean(),
      failedBy: z.number().int().nonnegative(),
    }),
  ),
  learners: z.array(
    z.strictObject({
      userId: uuid,
      name: z.string(),
      email: z.string().nullable(),
      attempts: z.number().int().nonnegative(),
      passed: z.boolean(),
      firstPassedAt: z.string().nullable(),
      solutionViewedBeforePass: z.boolean(),
      lastSubmittedAt: z.string().nullable(),
    }),
  ),
});

export type CodingExerciseKind = z.infer<typeof codingExerciseKindSchema>;
export type CodingDifficulty = z.infer<typeof codingDifficultySchema>;
export type CodingExerciseStatus = z.infer<typeof codingExerciseStatusSchema>;
export type CodingSolutionPolicy = z.infer<typeof codingSolutionPolicySchema>;
export type CodingCompare = z.infer<typeof codingCompareSchema>;
export type CodingFile = z.infer<typeof codingFileSchema>;
export type CodingEntry = z.infer<typeof codingEntrySchema>;
export type CodingTestCase = z.infer<typeof codingTestCaseSchema>;
export type CodingScriptTest = z.infer<typeof codingScriptTestSchema>;
export type CodingTests = z.infer<typeof codingTestsSchema>;
export type CodingHint = z.infer<typeof codingHintSchema>;
export type CodingMockRoute = z.infer<typeof codingMockRouteSchema>;
export type CodingSettings = z.infer<typeof codingSettingsSchema>;
export type CodingExerciseVersion = z.infer<typeof codingExerciseVersionSchema>;
export type CourseCodingExercise = z.infer<typeof courseCodingExerciseSchema>;
export type CourseCodingExercisesResponse = z.infer<
  typeof courseCodingExercisesResponseSchema
>;
export type LecturePracticeResponse = z.infer<
  typeof lecturePracticeResponseSchema
>;
export type CodingExercise = z.infer<typeof codingExerciseSchema>;
export type CodingAssignment = z.infer<typeof codingAssignmentSchema>;
export type CreateCodingExerciseRequest = z.infer<
  typeof createCodingExerciseRequestSchema
>;
export type UpdateCodingExerciseRequest = z.infer<
  typeof updateCodingExerciseRequestSchema
>;
export type PublishCodingExerciseRequest = z.infer<
  typeof publishCodingExerciseRequestSchema
>;
export type CodingLanguage = z.infer<typeof codingLanguageSchema>;
export type CodingLearnerState = z.infer<typeof codingLearnerStateSchema>;
export type CodingLesson = z.infer<typeof codingLessonSchema>;
export type SaveCodingDraftRequest = z.infer<
  typeof saveCodingDraftRequestSchema
>;
export type CodingTestResult = z.infer<typeof codingTestResultSchema>;
export type SubmitCodingRequest = z.infer<typeof submitCodingRequestSchema>;
export type SubmitCodingResponse = z.infer<typeof submitCodingResponseSchema>;
export type CodingSubmissionSummary = z.infer<
  typeof codingSubmissionSummarySchema
>;
export type CodingSolutionResponse = z.infer<
  typeof codingSolutionResponseSchema
>;
export type CodingAssignmentAnalytics = z.infer<
  typeof codingAssignmentAnalyticsSchema
>;
