import assert from "node:assert/strict";
import { test } from "node:test";
import { quizSubmissionSchema } from "@veolms/contracts";
import { presentQuizSubmission } from "./submission.presenter.ts";

const ids = {
  assignment: "00000000-0000-4000-8000-000000000001",
  student: "00000000-0000-4000-8000-000000000002",
  attempt: "00000000-0000-4000-8000-000000000003",
  older: "00000000-0000-4000-8000-000000000004",
  single: "00000000-0000-4000-8000-000000000010",
  multi: "00000000-0000-4000-8000-000000000011",
  written: "00000000-0000-4000-8000-000000000012",
  skipped: "00000000-0000-4000-8000-000000000013",
  a: "00000000-0000-4000-8000-000000000020",
  b: "00000000-0000-4000-8000-000000000021",
  c: "00000000-0000-4000-8000-000000000022",
  d: "00000000-0000-4000-8000-000000000023",
  e: "00000000-0000-4000-8000-000000000024",
  f: "00000000-0000-4000-8000-000000000025",
  accepted: "00000000-0000-4000-8000-000000000026",
};

const questions = [
  {
    id: ids.single,
    question_type: "single_choice" as const,
    points: 1,
    prompt: "Pick one",
    explanation: "Because",
  },
  {
    id: ids.multi,
    question_type: "multiple_choice" as const,
    points: 2,
    prompt: "Pick two",
    explanation: null,
  },
  {
    id: ids.written,
    question_type: "short_answer" as const,
    points: 5,
    prompt: "Explain",
    explanation: null,
  },
  {
    id: ids.skipped,
    question_type: "single_choice" as const,
    points: 1,
    prompt: "Skipped",
    explanation: null,
  },
];
const options = [
  { id: ids.a, question_id: ids.single, option_text: "A", is_correct: true },
  { id: ids.b, question_id: ids.single, option_text: "B", is_correct: false },
  { id: ids.c, question_id: ids.multi, option_text: "C", is_correct: true },
  { id: ids.d, question_id: ids.multi, option_text: "D", is_correct: true },
  { id: ids.e, question_id: ids.skipped, option_text: "E", is_correct: true },
  { id: ids.f, question_id: ids.skipped, option_text: "F", is_correct: false },
  // An accepted answer left on a short answer from before it became free text.
  {
    id: ids.accepted,
    question_id: ids.written,
    option_text: "old key",
    is_correct: true,
  },
];
const answers = [
  {
    question_id: ids.single,
    response_value: { selectedOptionIds: [ids.a] },
    is_correct: true,
    points_awarded: 1,
  },
  {
    question_id: ids.multi,
    response_value: { selectedOptionIds: [ids.c] },
    is_correct: false,
    points_awarded: 0,
  },
  // Imported with the platform's marks: written, but marked wrong.
  {
    question_id: ids.written,
    response_value: { textResponse: "let x = 1\nx++" },
    is_correct: false,
    points_awarded: 0,
  },
];
type Attempt = Parameters<typeof presentQuizSubmission>[0]["attempt"];

const graded: Attempt = {
  id: ids.attempt,
  attempt_number: 2,
  status: "graded",
  started_at: new Date("2024-08-11T07:50:00.000Z"),
  submitted_at: new Date("2024-08-11T08:03:50.609Z"),
  score_obtained: 1,
  max_score: null,
  score_percentage: 11.11,
};
const older: Attempt = {
  ...graded,
  id: ids.older,
  attempt_number: 1,
  score_obtained: 9,
  score_percentage: 100,
};

function present(
  attempt: Attempt = graded,
  attempts = [graded, older],
  savedAnswers = answers,
) {
  return presentQuizSubmission({
    assignment: { id: ids.assignment, pass_percentage: 50 },
    quizTitle: "6 Questions",
    lessonTitle: "JavaScript Variables Explained in Depth",
    student: { id: ids.student, name: "Deep Gandhi" },
    attempts,
    attempt,
    questions,
    options,
    answers: savedAnswers,
  });
}

await test("a graded attempt lists every question with the student's answer and its marks", () => {
  const submission = present();
  assert.doesNotThrow(() => quizSubmissionSchema.parse(submission));
  const [single, multi, written, skipped] = submission.attempt.questions;

  assert.deepEqual(
    single!.options.map(({ text, isCorrect, selected }) => [
      text,
      isCorrect,
      selected,
    ]),
    [
      ["A", true, true],
      ["B", false, false],
    ],
  );
  assert.equal(single!.isCorrect, true);
  assert.equal(single!.pointsAwarded, 1);
  assert.equal(single!.explanation, "Because");

  assert.equal(multi!.isCorrect, false);
  assert.equal(multi!.pointsAwarded, 0);

  assert.equal(written!.textResponse, "let x = 1\nx++");
  assert.equal(
    written!.isCorrect,
    false,
    "stored marks win over a fresh grade",
  );
  assert.deepEqual(written!.options, [], "a short answer shows no key");

  assert.equal(skipped!.answered, false);
  assert.equal(skipped!.isCorrect, false);
  assert.equal(skipped!.pointsAwarded, 0);
});

await test("totals use the recorded score and the question points", () => {
  const { attempt } = present();
  assert.equal(attempt.score, 1);
  assert.equal(attempt.maxScore, 9);
  assert.equal(attempt.percentage, 11.11);
  assert.equal(attempt.passed, false);
  assert.equal(attempt.questionCount, 4);
  assert.equal(attempt.answeredCount, 3);
  assert.equal(attempt.correctCount, 1);
  assert.equal(attempt.submittedAt, "2024-08-11T08:03:50.609Z");
});

await test("every attempt is summarised with the analytics pass rule", () => {
  const submission = present();
  assert.deepEqual(
    submission.attempts.map(({ attemptNumber, percentage, passed }) => [
      attemptNumber,
      percentage,
      passed,
    ]),
    [
      [2, 11.11, false],
      [1, 100, true],
    ],
  );
});

await test("an imported score above the total is kept as recorded", () => {
  const over = { ...graded, score_obtained: 24, score_percentage: 266.67 };
  const submission = present(over, [over]);
  assert.doesNotThrow(() => quizSubmissionSchema.parse(submission));
  assert.equal(submission.attempt.percentage, 266.67);
  assert.equal(submission.attempt.passed, true);
});

await test("an open attempt shows its answers so far without grading", () => {
  const open = {
    ...graded,
    status: "in_progress" as const,
    submitted_at: null,
    score_obtained: null,
    score_percentage: null,
  };
  const submission = present(open, [open]);
  assert.doesNotThrow(() => quizSubmissionSchema.parse(submission));
  assert.equal(submission.attempt.score, null);
  assert.equal(submission.attempt.percentage, null);
  assert.equal(submission.attempt.passed, null);
  assert.equal(submission.attempt.correctCount, null);
  assert.equal(submission.attempt.answeredCount, 3);
  assert.equal(submission.attempt.answersRecorded, true);
  assert.ok(
    submission.attempt.questions.every(
      (question) =>
        question.isCorrect === null && question.pointsAwarded === null,
    ),
  );
  assert.equal(submission.attempts[0]!.passed, null);
});

await test("a graded attempt imported without answers keeps its score but marks nothing", () => {
  // A retake imported with its score and dates only: 7 of 28.
  const retake: Attempt = {
    ...graded,
    score_obtained: 7,
    score_percentage: 25,
  };
  const submission = present(retake, [retake, older], []);
  assert.doesNotThrow(() => quizSubmissionSchema.parse(submission));
  const { attempt } = submission;
  assert.equal(attempt.answersRecorded, false);
  assert.equal(attempt.score, 7);
  assert.equal(attempt.percentage, 25);
  assert.equal(attempt.passed, false);
  assert.equal(attempt.correctCount, null);
  assert.equal(attempt.answeredCount, 0);
  assert.ok(
    attempt.questions.every(
      (question) =>
        question.isCorrect === null && question.pointsAwarded === null,
    ),
    "unknown answers are not reported as wrong",
  );
});

await test("an attempt that expired with nothing saved reads as unanswered", () => {
  const expired: Attempt = {
    ...graded,
    status: "expired",
    score_obtained: 0,
    score_percentage: 0,
  };
  const { attempt } = present(expired, [expired], []);
  assert.equal(attempt.answersRecorded, true);
  assert.equal(attempt.correctCount, 0);
  assert.ok(
    attempt.questions.every(
      (question) =>
        question.isCorrect === false && question.pointsAwarded === 0,
    ),
  );
});

await test("each attempt in the picker carries its marks out of its total", () => {
  // The caller fills a missing maximum from the attempt's own version.
  const scored: Attempt = { ...older, score_obtained: 6, max_score: 21 };
  const open: Attempt = {
    ...graded,
    id: "00000000-0000-4000-8000-000000000005",
    attempt_number: 3,
    status: "in_progress",
    submitted_at: null,
    score_obtained: null,
    score_percentage: null,
    max_score: 21,
  };
  const submission = present(graded, [open, graded, scored]);
  assert.doesNotThrow(() => quizSubmissionSchema.parse(submission));
  assert.deepEqual(
    submission.attempts.map(({ attemptNumber, score, maxScore }) => [
      attemptNumber,
      score,
      maxScore,
    ]),
    [
      [3, null, 21],
      // The attempt shown falls back to its questions' points (9).
      [2, 1, 9],
      [1, 6, 21],
    ],
  );
});
