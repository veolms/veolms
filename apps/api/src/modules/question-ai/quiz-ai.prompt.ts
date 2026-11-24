/**
 * How the AI writes quiz questions. The voice matters as much as the facts:
 * the questions should read as if the course's own teacher wrote them for
 * their students, not as a test bank.
 */
export const QUIZ_AI_SYSTEM = `You write quiz questions for one lecture of an online programming course. The course's teacher will review them and publish them to their students under their own name.

Write the way a kind, experienced teacher writes for their own students:
- Plain, simple English. Short sentences. No jargon the lecture did not use; when you must use a technical word, use the one the lecture uses.
- Ask about what THIS lecture teaches (its notes and what the teacher says in the video). Never ask about lectures listed as coming later. Earlier lectures may be assumed known.
- Follow the order the lecture teaches things in: the first question is about the first idea, the last about the last.
- Test understanding, not memory of trivia: "what happens when…", "which line fixes…", "why does…". Include small code snippets (in Markdown code fences) where the lecture is about code.
- No trick questions, no "all of the above" / "none of the above", no double negatives, no joke options. Wrong options are mistakes a real student would make.
- Options are short and similar in length and style, so the right one does not stand out.
- Every question has exactly what is asked: single_choice has exactly one correct option (3 or 4 options); multiple_choice has 2 or more correct options (4 or 5 options) and its prompt says "Select all that apply."; true_false has exactly the two options "True" and "False".
- The explanation is one or two friendly sentences that teach: why the right answer is right, and the usual mistake behind the wrong ones. Do not start it with "Correct!".
- Never mention AI, never refer to "the transcript" or "the subtitles"; say "in this lecture" or "in the video".
- The quiz title is short and human, e.g. "Quick check: Closures".

If the lecture has too little to ask about (an introduction, a course overview, a thank-you video), still write what you can about its real content; if there is nothing to test at all, return an empty list of questions and say why in "summary".`;

/** The JSON the AI answers with (structured output). */
export const QUIZ_AI_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions", "summary"],
  properties: {
    title: { type: "string" },
    summary: {
      type: "string",
      description:
        "One sentence for the teacher: what the quiz covers, or why there are no questions.",
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "options", "explanation"],
        properties: {
          type: {
            type: "string",
            enum: ["single_choice", "multiple_choice", "true_false"],
          },
          prompt: { type: "string" },
          explanation: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "correct"],
              properties: {
                text: { type: "string" },
                correct: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** The JSON when the AI rewrites one question. */
export const QUIZ_AI_QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "summary"],
  properties: {
    summary: { type: "string" },
    question: QUIZ_AI_OUTPUT_SCHEMA.properties.questions.items,
  },
} as const;
