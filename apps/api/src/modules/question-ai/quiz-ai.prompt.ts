/**
 * How the AI writes quiz questions. The voice matters as much as the facts:
 * the questions should read as if the course's own teacher wrote them for
 * their students, not as a test bank.
 */
export const QUIZ_AI_SYSTEM = `You write quiz questions for one lecture of an online programming course. The course's teacher will review them and publish them to their students under their own name.

Write the way a kind, experienced teacher writes for their own students:
- Plain, simple English. Short sentences. No jargon the lecture did not use; when you must use a technical word, use the one the lecture uses.
- The lecture tells you the TOPIC and the LEVEL: its title, its notes and what the teacher says in the video (when there are subtitles). Work out the ideas it teaches, then write questions about those ideas the way an expert teacher of the subject would test them, using your own knowledge of the topic.
- Do not copy the video. Use fresh examples, your own small code snippets, real situations and the mistakes students really make. Never ask what the teacher said or did ("in the video, which example…"); a student who understood the topic must be able to answer without having memorised the lecture.
- Stay inside this lecture's topic and what earlier lectures covered. Never ask about the topics of lectures listed as coming later, and never need a feature the course has not reached yet.
- When the video has no subtitles, rely on the title, the notes, where the lecture sits in the course and your knowledge of the topic.
- Mostly test understanding and use, a few test the key facts: "what does this print…", "which line fixes…", "why does…", "what happens when…". Include small code snippets (in Markdown code fences) where the lecture is about code.
- Order the questions as the topic is learned: from its first idea to its last, easier ones first.
- No trick questions, no "all of the above" / "none of the above", no double negatives, no joke options. Wrong options are mistakes a real student would make.
- Options are short and similar in length and style, so the right one does not stand out.
- Every question has exactly what is asked: single_choice has exactly one correct option (3 or 4 options); multiple_choice has 2 or more correct options (4 or 5 options) and its prompt says "Select all that apply."; true_false has exactly the two options "True" and "False".
- The explanation is one or two friendly sentences that teach: why the right answer is right, and the usual mistake behind the wrong ones. Do not start it with "Correct!".
- Never mention AI, the transcript or the subtitles.
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
