import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssignQuizRequest, QuizQuestionType } from "@veolms/contracts";
import { Button } from "../components/Button";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle,
  CircleNotch,
  FileText,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  useAddQuizQuestion,
  useAssignQuiz,
  useCreateQuiz,
  useDeleteQuizQuestion,
  usePublishQuiz,
  useUpdateQuizAssignment,
  useUpdateQuiz,
  useUpdateQuizQuestion,
} from "../services/quizzes/quizzes.mutations";
import {
  useCourseQuizAssignments,
  useMyQuizzes,
  useQuiz,
} from "../services/quizzes/quizzes.queries";
import {
  useCourseEditor,
  useMyCourses,
} from "../services/courses/courses.queries";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { QuizRichTextField } from "./QuizRichTextField";

interface Props {
  courseId?: string;
  lessonId?: string;
  lessonTitle?: string;
  initialQuizId?: string | null;
  onBack?: () => void;
  createNew?: boolean;
}

interface OptionDraft {
  id?: string;
  text: string;
  isCorrect: boolean;
}

const initialOptions = (): OptionDraft[] => [
  { text: "Option 1", isCorrect: true },
  { text: "Option 2", isCorrect: false },
];

const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

const textareaClass =
  "rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

const QUESTION_TYPE_OPTIONS: readonly ThemedSelectOption<QuizQuestionType>[] = [
  ["single_choice", "Single choice"],
  ["multiple_choice", "Multiple choice"],
  ["true_false", "True / False"],
];

const FEEDBACK_MODE_OPTIONS: readonly ThemedSelectOption<
  "after_submit" | "after_attempt" | "never"
>[] = [
  ["after_submit", "After submission"],
  ["after_attempt", "After each attempt"],
  ["never", "Never show answer review"],
];

function AutoSaveIndicator({
  status,
}: {
  status: "saving" | "saved" | "failed" | null;
}) {
  if (!status) return null;
  if (status === "saving") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={13}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500"
        aria-live="polite"
      >
        <Check size={13} weight="bold" className="shrink-0" />
        <span>Saved ✓</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle size={13} weight="fill" className="shrink-0" />
        <span>Save failed</span>
      </span>
    );
  }
  return null;
}

function quizErrorMessage(error: unknown) {
  if (!error) return null;
  const apiError = error as { code?: unknown; message?: unknown };
  if (apiError.code === "ACADEMY_NOT_CONFIGURED") {
    return "Academy setup is incomplete. Complete academy setup before creating quizzes.";
  }
  return typeof apiError.message === "string"
    ? apiError.message
    : "Please try again.";
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function QuizAuthoringPanel({
  courseId,
  lessonId,
  lessonTitle,
  initialQuizId = null,
  onBack,
  createNew = false,
}: Props) {
  const quizzes = useMyQuizzes();
  const myCourses = useMyCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");

  const effectiveCourseId = courseId || selectedCourseId || null;
  const effectiveLessonId = lessonId || selectedLessonId || null;

  const courseEditor = useCourseEditor(effectiveCourseId);
  const assignments = useCourseQuizAssignments(effectiveCourseId);
  const [quizId, setQuizId] = useState<string | null>(initialQuizId);
  const [quizTitle, setQuizTitle] = useState(lessonTitle ?? "");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [prompt, setPrompt] = useState("");
  const [questionType, setQuestionType] =
    useState<QuizQuestionType>("single_choice");
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<OptionDraft[]>(initialOptions);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );
  const [explanation, setExplanation] = useState("");
  const [passPercentage, setPassPercentage] = useState(70);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [assignmentVersionId, setAssignmentVersionId] = useState<string | null>(
    null,
  );
  const [feedbackMode, setFeedbackMode] = useState<
    "after_submit" | "after_attempt" | "never"
  >("after_submit");
  const [required, setRequired] = useState(true);

  // Auto-save states
  const [detailsSaveStatus, setDetailsSaveStatus] = useState<
    "saving" | "saved" | "failed" | null
  >(null);
  const detailsTimerRef = useRef<number | null>(null);
  const lastSavedDetailsRef = useRef<{
    title: string;
    description: string;
    instructions: string;
  }>({ title: "", description: "", instructions: "" });

  const [assignmentSaveStatus, setAssignmentSaveStatus] = useState<
    "saving" | "saved" | "failed" | null
  >(null);
  const assignmentTimerRef = useRef<number | null>(null);

  const [createSaveStatus, setCreateSaveStatus] = useState<
    "saving" | "saved" | "failed" | null
  >(null);
  const createDebounceRef = useRef<number | null>(null);
  const isCreatingRef = useRef(false);

  const [questionSaveStatus, setQuestionSaveStatus] = useState<
    "saving" | "saved" | "failed" | null
  >(null);
  const questionDebounceRef = useRef<number | null>(null);

  const create = useCreateQuiz();
  const addQuestion = useAddQuizQuestion();
  const updateQuestion = useUpdateQuizQuestion();
  const deleteQuestion = useDeleteQuizQuestion();
  const publish = usePublishQuiz();
  const assign = useAssignQuiz();
  const updateAssignment = useUpdateQuizAssignment();
  const updateQuiz = useUpdateQuiz();
  const quiz = useQuiz(quizId);
  const assignment = useMemo(() => {
    if (effectiveLessonId) {
      return (
        assignments.data?.find((item) => item.lessonId === effectiveLessonId) ??
        quiz.data?.assignments?.find(
          (item) => item.lessonId === effectiveLessonId,
        )
      );
    }
    if (effectiveCourseId) {
      return (
        assignments.data?.find((item) => item.courseId === effectiveCourseId) ??
        quiz.data?.assignments?.find(
          (item) => item.courseId === effectiveCourseId,
        )
      );
    }
    return quiz.data?.assignments?.[0];
  }, [
    assignments.data,
    effectiveLessonId,
    effectiveCourseId,
    quiz.data?.assignments,
  ]);
  const version = useMemo(
    () =>
      quiz.data?.versions.find((item) => !item.publishedAt) ??
      quiz.data?.versions.at(-1),
    [quiz.data],
  );

  useEffect(() => {
    if (!createNew && !quizId && quizzes.data?.[0]) {
      setQuizId(quizzes.data[0].id);
    }
  }, [createNew, quizId, quizzes.data]);

  useEffect(() => {
    if (!assignment) return;
    setAssignmentVersionId(assignment.quizVersionId);
    if (assignment.quizId !== quizId) setQuizId(assignment.quizId);
    setRequired(assignment.required);
    setPassPercentage(assignment.passPercentage);
    setMaxAttempts(assignment.maxAttempts);
    setTimeLimitMinutes(
      assignment.timeLimitSeconds ? assignment.timeLimitSeconds / 60 : 0,
    );
    setShuffleQuestions(assignment.shuffleQuestions);
    setShuffleOptions(assignment.shuffleOptions);
    setAvailableFrom(toDateTimeLocal(assignment.availableFrom));
    setAvailableUntil(toDateTimeLocal(assignment.availableUntil));
    setFeedbackMode(assignment.feedbackMode);
  }, [assignment, quizId]);

  useEffect(() => {
    if (!quiz.data || quiz.data.id !== quizId) return;
    setQuizTitle(quiz.data.title);
    setDescription(quiz.data.description ?? "");
    const currentVersion =
      quiz.data.versions.find((item) => !item.publishedAt) ??
      quiz.data.versions.at(-1);
    const instr = currentVersion?.instructions ?? "";
    setInstructions(instr);
    lastSavedDetailsRef.current = {
      title: quiz.data.title,
      description: quiz.data.description ?? "",
      instructions: instr,
    };

    if (
      !courseId &&
      quiz.data.assignments &&
      quiz.data.assignments.length > 0
    ) {
      const primaryAssignment = quiz.data.assignments[0];
      if (primaryAssignment) {
        setSelectedCourseId((prev) => prev || primaryAssignment.courseId);
        setSelectedLessonId((prev) => prev || primaryAssignment.lessonId);
      }
    }
  }, [quiz.data, quizId, courseId]);

  const resetEditor = () => {
    setPrompt("");
    setQuestionType("single_choice");
    setPoints(1);
    setExplanation("");
    setOptions(initialOptions());
    setEditingQuestionId(null);
  };

  const executeCreateQuiz = useCallback(
    (overrideTitle?: string, overrideDesc?: string) => {
      const title =
        (overrideTitle !== undefined ? overrideTitle : quizTitle).trim() ||
        lessonTitle?.trim();
      if (!title || isCreatingRef.current || create.isPending) return;
      isCreatingRef.current = true;
      setCreateSaveStatus("saving");
      const desc = (
        overrideDesc !== undefined ? overrideDesc : description
      ).trim();
      create.mutate(
        {
          title,
          description: desc || null,
          instructions: null,
        },
        {
          onSuccess: (next) => {
            isCreatingRef.current = false;
            setCreateSaveStatus("saved");
            setQuizId(next.id);
            lastSavedDetailsRef.current = {
              title,
              description: desc,
              instructions: "",
            };
          },
          onError: () => {
            isCreatingRef.current = false;
            setCreateSaveStatus("failed");
          },
        },
      );
    },
    [quizTitle, description, lessonTitle, create],
  );

  const scheduleCreateDebounce = useCallback(
    (overrideTitle?: string, overrideDesc?: string) => {
      if (createDebounceRef.current) {
        window.clearTimeout(createDebounceRef.current);
      }
      const t =
        (overrideTitle !== undefined ? overrideTitle : quizTitle).trim() ||
        lessonTitle?.trim();
      if (!t) return;
      createDebounceRef.current = window.setTimeout(() => {
        executeCreateQuiz(overrideTitle, overrideDesc);
      }, 1000);
    },
    [quizTitle, lessonTitle, executeCreateQuiz],
  );

  const flushDetailsPersistence = useCallback(
    (overrideTitle?: string, overrideDesc?: string, overrideInstr?: string) => {
      if (!quizId) return;
      const t = (
        overrideTitle !== undefined ? overrideTitle : quizTitle
      ).trim();
      const d = (
        overrideDesc !== undefined ? overrideDesc : description
      ).trim();
      const i = (
        overrideInstr !== undefined ? overrideInstr : instructions
      ).trim();

      if (!t) return;
      const last = lastSavedDetailsRef.current;
      if (
        t === last.title &&
        d === last.description &&
        i === last.instructions
      ) {
        return;
      }

      if (detailsTimerRef.current !== null) {
        window.clearTimeout(detailsTimerRef.current);
        detailsTimerRef.current = null;
      }

      setDetailsSaveStatus("saving");
      updateQuiz.mutate(
        {
          id: quizId,
          payload: {
            title: t,
            description: d || null,
            instructions: i || null,
          },
        },
        {
          onSuccess: () => {
            lastSavedDetailsRef.current = {
              title: t,
              description: d,
              instructions: i,
            };
            setDetailsSaveStatus("saved");
            window.setTimeout(() => {
              setDetailsSaveStatus((curr) => (curr === "saved" ? null : curr));
            }, 2500);
          },
          onError: () => {
            setDetailsSaveStatus("failed");
          },
        },
      );
    },
    [quizId, quizTitle, description, instructions, updateQuiz],
  );

  const scheduleAutoSaveDetails = useCallback(
    (overrideTitle?: string, overrideDesc?: string, overrideInstr?: string) => {
      if (detailsTimerRef.current !== null) {
        window.clearTimeout(detailsTimerRef.current);
      }
      detailsTimerRef.current = window.setTimeout(() => {
        flushDetailsPersistence(overrideTitle, overrideDesc, overrideInstr);
      }, 750);
    },
    [flushDetailsPersistence],
  );

  const selectType = (nextType: QuizQuestionType) => {
    setQuestionType(nextType);
    if (nextType === "true_false") {
      setOptions([
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ]);
    } else if (options.length < 2) {
      setOptions(initialOptions());
    }
  };

  const setCorrect = (index: number, checked: boolean) => {
    setOptions((current) =>
      current.map((option, optionIndex) => ({
        ...option,
        isCorrect:
          questionType === "multiple_choice"
            ? optionIndex === index
              ? checked
              : option.isCorrect
            : optionIndex === index
              ? checked
              : false,
      })),
    );
  };

  const editQuestion = (
    question: NonNullable<typeof version>["questions"][number],
  ) => {
    setEditingQuestionId(question.id);
    setPrompt(question.prompt);
    setQuestionType(question.questionType);
    setPoints(question.points);
    setExplanation(question.explanation ?? "");
    setOptions(
      question.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    );
  };

  const flushQuestionSave = useCallback(() => {
    if (
      !quizId ||
      !editingQuestionId ||
      !prompt.trim() ||
      options.some((option) => !option.text.trim()) ||
      !options.some((option) => option.isCorrect) ||
      updateQuestion.isPending
    )
      return;
    const payload = {
      questionType,
      prompt: prompt.trim(),
      points: Math.max(0.01, points),
      explanation: explanation.trim() || null,
      options: options.map(({ id, text, isCorrect }, position) => ({
        id,
        text: text.trim(),
        isCorrect,
        position,
      })),
    } as const;
    setQuestionSaveStatus("saving");
    updateQuestion.mutate(
      { quizId, questionId: editingQuestionId, payload },
      {
        onSuccess: () => {
          setQuestionSaveStatus("saved");
          setTimeout(() => {
            setQuestionSaveStatus((curr) => (curr === "saved" ? null : curr));
          }, 1500);
        },
        onError: () => {
          setQuestionSaveStatus("failed");
        },
      },
    );
  }, [
    quizId,
    editingQuestionId,
    prompt,
    options,
    questionType,
    points,
    explanation,
    updateQuestion,
  ]);

  const scheduleAutoSaveQuestion = useCallback(() => {
    if (!editingQuestionId) return;
    if (questionDebounceRef.current) {
      window.clearTimeout(questionDebounceRef.current);
    }
    questionDebounceRef.current = window.setTimeout(() => {
      flushQuestionSave();
    }, 800);
  }, [editingQuestionId, flushQuestionSave]);

  const handleAddQuestion = () => {
    if (
      !quizId ||
      !prompt.trim() ||
      options.some((option) => !option.text.trim()) ||
      !options.some((option) => option.isCorrect) ||
      addQuestion.isPending
    )
      return;
    const payload = {
      questionType,
      prompt: prompt.trim(),
      points: Math.max(0.01, points),
      explanation: explanation.trim() || null,
      options: options.map(({ id, text, isCorrect }, position) => ({
        id,
        text: text.trim(),
        isCorrect,
        position,
      })),
    } as const;
    addQuestion.mutate({ id: quizId, payload }, { onSuccess: resetEditor });
  };

  const assignmentPayload = useCallback(
    (): Omit<AssignQuizRequest, "quizVersionId"> => ({
      required,
      passPercentage,
      maxAttempts,
      timeLimitSeconds:
        timeLimitMinutes > 0 ? Math.round(timeLimitMinutes * 60) : null,
      shuffleQuestions,
      shuffleOptions,
      feedbackMode,
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableUntil: availableUntil ? new Date(availableUntil) : null,
    }),
    [
      required,
      passPercentage,
      maxAttempts,
      timeLimitMinutes,
      shuffleQuestions,
      shuffleOptions,
      feedbackMode,
      availableFrom,
      availableUntil,
    ],
  );

  const flushAssignmentPersistence = useCallback(() => {
    if (!assignment) return;
    if (assignmentTimerRef.current !== null) {
      window.clearTimeout(assignmentTimerRef.current);
      assignmentTimerRef.current = null;
    }
    setAssignmentSaveStatus("saving");
    updateAssignment.mutate(
      {
        id: assignment.id,
        payload: {
          ...assignmentPayload(),
          ...(assignmentVersionId
            ? { quizVersionId: assignmentVersionId }
            : {}),
        },
      },
      {
        onSuccess: () => {
          setAssignmentSaveStatus("saved");
          window.setTimeout(() => {
            setAssignmentSaveStatus((curr) => (curr === "saved" ? null : curr));
          }, 2500);
        },
        onError: () => {
          setAssignmentSaveStatus("failed");
        },
      },
    );
  }, [assignment, assignmentPayload, assignmentVersionId, updateAssignment]);

  const scheduleAutoSaveAssignment = useCallback(() => {
    if (!assignment) return;
    if (assignmentTimerRef.current !== null) {
      window.clearTimeout(assignmentTimerRef.current);
    }
    assignmentTimerRef.current = window.setTimeout(() => {
      flushAssignmentPersistence();
    }, 750);
  }, [assignment, flushAssignmentPersistence]);

  const assignPublishedVersion = (
    publishedQuiz: NonNullable<typeof quiz.data>,
  ) => {
    if (!effectiveCourseId || !effectiveLessonId) return;
    const published = publishedQuiz.versions
      .filter((item) => item.publishedAt)
      .at(-1);
    if (!published) return;
    assign.mutate(
      {
        courseId: effectiveCourseId,
        lessonId: effectiveLessonId,
        payload: { quizVersionId: published.id, ...assignmentPayload() },
      },
      {
        onSuccess: (assignedData) => {
          setSelectedCourseId(assignedData.courseId);
          setSelectedLessonId(assignedData.lessonId);
          setAssignmentSaveStatus("saved");
        },
      },
    );
  };

  const publishAndAssign = () => {
    if (!quizId || !version) return;
    if (
      version.publishedAt &&
      quiz.data &&
      effectiveCourseId &&
      effectiveLessonId
    ) {
      assignPublishedVersion(quiz.data);
    } else {
      publish.mutate(
        quizId,
        effectiveCourseId && effectiveLessonId
          ? { onSuccess: assignPublishedVersion }
          : undefined,
      );
    }
  };

  const courseOptions: readonly ThemedSelectOption<string>[] = useMemo(() => {
    const list = (myCourses.data?.courses ?? []).map(
      (c) => [c.id, c.title] as const,
    );
    return [["", "Select a course..."] as const, ...list];
  }, [myCourses.data?.courses]);

  const courseSections = courseEditor.data?.sections;
  const lessonOptions: readonly ThemedSelectOption<string>[] = useMemo(() => {
    if (!selectedCourseId) {
      return [["", "Select a course first"] as const];
    }
    if (!courseSections) {
      if (selectedLessonId) {
        return [
          [selectedLessonId, "Attached lesson..."] as const,
          ["", "Loading lessons..."] as const,
        ];
      }
      return [["", "Loading lessons..."] as const];
    }
    const options: ThemedSelectOption<string>[] = [
      ["", "Select a lesson..."] as const,
    ];
    courseSections.forEach((sec, secIdx) => {
      (sec.lessons ?? []).forEach((les, lesIdx) => {
        const typeBadge =
          les.contentType === "quiz"
            ? "Quiz"
            : les.contentType === "video"
              ? "Video"
              : "Doc";
        options.push([
          les.id,
          `S${secIdx + 1}:L${lesIdx + 1} - ${les.title} (${typeBadge})`,
        ]);
      });
    });
    return options;
  }, [courseSections, selectedCourseId, selectedLessonId]);

  const quizOptions: readonly ThemedSelectOption[] = useMemo(() => {
    return (quizzes.data ?? []).map((item) => [item.id, item.title] as const);
  }, [quizzes.data]);

  const versionOptions: readonly ThemedSelectOption[] = useMemo(() => {
    return (quiz.data?.versions ?? [])
      .filter((item) => item.publishedAt)
      .map((item) => [item.id, `Version ${item.versionNumber}`] as const);
  }, [quiz.data?.versions]);

  const anyError =
    create.error ||
    addQuestion.error ||
    updateQuestion.error ||
    deleteQuestion.error ||
    publish.error ||
    assign.error ||
    updateAssignment.error ||
    updateQuiz.error ||
    quiz.error;
  const errorMessage = quizErrorMessage(anyError);
  const savingQuestion = addQuestion.isPending || updateQuestion.isPending;

  // Render: Initial Creation View (Single-focus clean card)
  // Render: Initial Creation View (Single-focus clean card with autosave)
  if (!quizId) {
    return (
      <div className="mx-auto w-full max-w-2xl py-2 sm:py-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) px-3 py-1.5 text-xs font-semibold text-(--muted) hover:text-(--text) transition-all cursor-pointer"
            style={{ boxShadow: "var(--card-compact-shadow)" }}
          >
            <ArrowLeft size={15} weight="bold" />
            <span>Back to quizzes</span>
          </button>
        )}

        <div
          className="rounded-[14px] sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-7"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-(--accent)/15 text-(--accent)">
                <BookOpen size={22} weight="duotone" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-(--text)">
                  Create assessment
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-(--muted) leading-relaxed">
                  Start typing a title. Your draft assessment will automatically
                  save.
                </p>
              </div>
            </div>
            <AutoSaveIndicator status={createSaveStatus} />
          </div>

          <div className="space-y-4">
            <label className="block">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-(--text-secondary)">
                  Quiz title <span className="text-(--accent)">*</span>
                </span>
                <AutoSaveIndicator status={createSaveStatus} />
              </div>
              <input
                value={quizTitle}
                onChange={(event) => {
                  setQuizTitle(event.target.value);
                  scheduleCreateDebounce(event.target.value);
                }}
                onBlur={() => {
                  if (createDebounceRef.current) {
                    window.clearTimeout(createDebounceRef.current);
                  }
                  if (quizTitle.trim()) executeCreateQuiz();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && quizTitle.trim()) {
                    event.preventDefault();
                    if (createDebounceRef.current) {
                      window.clearTimeout(createDebounceRef.current);
                    }
                    executeCreateQuiz();
                  }
                }}
                placeholder="e.g. JavaScript Fundamentals Assessment"
                className={`${inputClass} w-full`}
                autoFocus
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                Description{" "}
                <span className="text-(--muted) font-normal">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  scheduleCreateDebounce(undefined, event.target.value);
                }}
                onBlur={() => {
                  if (createDebounceRef.current) {
                    window.clearTimeout(createDebounceRef.current);
                  }
                  if (quizTitle.trim()) executeCreateQuiz();
                }}
                placeholder="Tell learners what this assessment measures and what skills will be tested..."
                rows={3}
                className={`${textareaClass} w-full resize-y`}
              />
            </label>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <span className="inline-flex items-center gap-1.5 text-xs text-(--muted)">
                {createSaveStatus === "saving" ? (
                  <>
                    <CircleNotch
                      size={13}
                      className="animate-spin text-(--accent)"
                    />
                    <span className="text-(--accent)">
                      Auto-saving draft assessment...
                    </span>
                  </>
                ) : (
                  <span>Draft assessment auto-saves as you type.</span>
                )}
              </span>
              <span className="text-xs text-(--muted)">
                Saved as draft · Not visible to learners until published
              </span>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 text-xs sm:text-sm text-rose-500 font-medium"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  // Render: Full Quiz Authoring Panel with 3D Depth
  return (
    <div className="space-y-3 sm:space-y-5 text-(--text)">
      {/* Top Header Card with Quiz Selector and Back Action */}
      <div
        className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) px-2.5 py-2 sm:p-5"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to quizzes"
                className="rounded-lg p-1.5 sm:p-2 text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft size={18} weight="bold" />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="text-[0.65rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.18em] text-(--accent)">
                Quiz builder
              </p>
              <h2 className="mt-0.5 text-base sm:text-2xl font-bold tracking-tight text-(--text) truncate">
                {quizTitle || lessonTitle || "Untitled quiz"}
              </h2>
              <p className="mt-0.5 text-xs text-(--muted) hidden sm:block">
                Build questions, set scoring, and publish versions for course
                delivery.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {quizzes.isLoading ? (
              <span className="text-xs text-(--muted)">Loading quizzes...</span>
            ) : quizOptions.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-(--muted) hidden md:inline">
                  Active quiz:
                </span>
                <div className="w-44 sm:w-60">
                  <ThemedSelect
                    value={quizId ?? ""}
                    onValueChange={(val) => {
                      resetEditor();
                      setQuizId(val);
                    }}
                    options={quizOptions}
                    ariaLabel="Select active quiz"
                    triggerClassName="!h-8.5 sm:!h-9 !rounded-[8px] sm:!rounded-[9px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] !px-2.5 sm:!px-3 !text-xs sm:!text-sm !font-semibold !text-(--text) shadow-[var(--card-compact-shadow)] hover:!border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {quiz.isLoading ? (
        <div className="my-8 flex items-center justify-center gap-2 text-sm text-(--muted)">
          <CircleNotch size={18} className="animate-spin text-(--accent)" />
          <span>Loading quiz details...</span>
        </div>
      ) : null}

      {quiz.data ? (
        <div className="space-y-3 sm:space-y-5">
          {/* Card 1: Quiz Details with Debounced Auto-Save */}
          <div
            className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-6"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-(--text) tracking-tight">
                  Assessment details
                </h3>
                <p className="mt-0.5 text-xs text-(--muted)">
                  Title, description, and student instructions auto-save as you
                  type.
                </p>
              </div>
              <AutoSaveIndicator status={detailsSaveStatus} />
            </div>

            <div className="space-y-3 sm:space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Quiz title
                </span>
                <input
                  value={quizTitle}
                  onChange={(event) => {
                    setQuizTitle(event.target.value);
                    scheduleAutoSaveDetails(
                      event.target.value,
                      undefined,
                      undefined,
                    );
                  }}
                  onBlur={() => flushDetailsPersistence()}
                  className={`${inputClass} w-full`}
                  placeholder="Quiz title"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Description{" "}
                  <span className="text-(--muted) font-normal">(optional)</span>
                </span>
                <textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    scheduleAutoSaveDetails(
                      undefined,
                      event.target.value,
                      undefined,
                    );
                  }}
                  onBlur={() => flushDetailsPersistence()}
                  rows={2}
                  className={`${textareaClass} w-full resize-y`}
                  placeholder="Tell learners what this assessment covers"
                />
              </label>

              <div>
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Instructions{" "}
                  <span className="text-(--muted) font-normal">(optional)</span>
                </span>
                <QuizRichTextField
                  label="Quiz instructions"
                  value={instructions}
                  onChange={(val) => {
                    setInstructions(val);
                    scheduleAutoSaveDetails(undefined, undefined, val);
                  }}
                  documentId={`quiz-${quizId}-instructions`}
                  placeholder="Tell learners how to complete this quiz"
                  minHeight="min-h-20"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Question Authoring Area with Live Auto-Save */}
          <div
            className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-6"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <span className="flex size-6.5 sm:size-7 items-center justify-center rounded-lg bg-(--accent)/15 text-xs font-bold text-(--accent)">
                  <FileText size={15} />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-(--text) tracking-tight">
                    {editingQuestionId ? "Edit question" : "Add question"}
                  </h3>
                  <p className="mt-0.5 text-xs text-(--muted)">
                    {version?.versionNumber
                      ? `Targeting Version ${version.versionNumber}`
                      : "Draft version"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editingQuestionId ? (
                  <AutoSaveIndicator status={questionSaveStatus} />
                ) : null}
                <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-2.5 py-0.5 sm:py-1 text-[0.7rem] sm:text-[0.72rem] font-semibold text-(--text-secondary)">
                  {version?.publishedAt ? "Published version" : "Draft version"}
                </span>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Question prompt <span className="text-(--accent)">*</span>
                </span>
                <QuizRichTextField
                  label="Question prompt"
                  value={prompt}
                  onChange={(val) => {
                    setPrompt(val);
                    scheduleAutoSaveQuestion();
                  }}
                  documentId={`quiz-${quizId}-question-${editingQuestionId ?? "new"}`}
                  placeholder="Write a clear, unambiguous question..."
                />
              </div>

              <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-[1fr_9rem]">
                <div>
                  <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                    Question type
                  </span>
                  <ThemedSelect
                    value={questionType}
                    onValueChange={(val) => selectType(val as QuizQuestionType)}
                    options={QUESTION_TYPE_OPTIONS}
                    ariaLabel="Question type"
                    triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                  />
                </div>

                <label className="block">
                  <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                    Points
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={points}
                    onChange={(event) => {
                      setPoints(Number(event.target.value));
                      scheduleAutoSaveQuestion();
                    }}
                    onBlur={flushQuestionSave}
                    className={`${inputClass} w-full !h-9.5 sm:!h-10`}
                  />
                </label>
              </div>

              <div>
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Explanation shown in feedback{" "}
                  <span className="text-(--muted) font-normal">(optional)</span>
                </span>
                <QuizRichTextField
                  label="Answer explanation"
                  value={explanation}
                  onChange={(val) => {
                    setExplanation(val);
                    scheduleAutoSaveQuestion();
                  }}
                  documentId={`quiz-${quizId}-explanation-${editingQuestionId ?? "new"}`}
                  placeholder="Explain why the correct answer is right..."
                  minHeight="min-h-20"
                />
              </div>

              {/* Options & Answer Key Inset Container */}
              <div className="rounded-[10px] sm:rounded-[12px] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] p-2 sm:p-4 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-[inset_0_1px_3px_color-mix(in_srgb,black_10%,transparent)]">
                <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
                  <span className="text-xs font-bold text-(--text) tracking-tight">
                    Options & Answer Key
                  </span>
                  {questionType !== "true_false" && (
                    <button
                      type="button"
                      onClick={() => {
                        setOptions((current) => [
                          ...current,
                          {
                            text: `Option ${current.length + 1}`,
                            isCorrect: false,
                          },
                        ]);
                        scheduleAutoSaveQuestion();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-(--accent) hover:underline cursor-pointer"
                    >
                      <Plus size={13} weight="bold" />
                      <span>Add option</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 sm:space-y-2.5">
                  {options.map((option, index) => (
                    <div
                      key={option.id ?? index}
                      className="flex items-center gap-1.5 sm:gap-2.5 min-w-0"
                    >
                      <label className="flex items-center cursor-pointer p-0.5 sm:p-1">
                        <input
                          type={
                            questionType === "multiple_choice"
                              ? "checkbox"
                              : "radio"
                          }
                          name={`correct-${quizId}-${editingQuestionId ?? "new"}`}
                          checked={option.isCorrect}
                          onChange={(event) =>
                            setCorrect(index, event.target.checked)
                          }
                          aria-label={`Mark option ${index + 1} as correct`}
                          className="size-4 sm:size-4.5 accent-(--accent) cursor-pointer"
                        />
                      </label>
                      <input
                        value={option.text}
                        onChange={(event) => {
                          setOptions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, text: event.target.value }
                                : item,
                            ),
                          );
                          scheduleAutoSaveQuestion();
                        }}
                        onBlur={flushQuestionSave}
                        className={`${inputClass} flex-1 min-w-0 !h-9 sm:!h-10`}
                        aria-label={`Option ${index + 1}`}
                        placeholder={`Option ${index + 1}`}
                      />
                      <button
                        type="button"
                        disabled={
                          options.length <= 2 || questionType === "true_false"
                        }
                        onClick={() => {
                          setOptions((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          );
                          scheduleAutoSaveQuestion();
                        }}
                        title={`Remove option ${index + 1}`}
                        aria-label={`Remove option ${index + 1}`}
                        className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Area: No manual Save button */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                {editingQuestionId ? (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        flushQuestionSave();
                        resetEditor();
                      }}
                      className="h-8.5 sm:h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      Done editing
                    </Button>
                    <button
                      type="button"
                      onClick={resetEditor}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <Button
                    onClick={handleAddQuestion}
                    disabled={
                      !prompt.trim() ||
                      options.some((option) => !option.text.trim()) ||
                      !options.some((option) => option.isCorrect) ||
                      addQuestion.isPending
                    }
                    className="h-8.5 sm:h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {addQuestion.isPending ? (
                      <>
                        <CircleNotch
                          size={13}
                          className="animate-spin mr-1.5"
                        />
                        Adding question...
                      </>
                    ) : (
                      <>
                        <Plus size={14} weight="bold" className="mr-1.5" />
                        Add question
                      </>
                    )}
                  </Button>
                )}

                <span className="text-xs text-(--muted)">
                  {editingQuestionId
                    ? "Question auto-saves as you edit."
                    : "Add question to include it in this assessment."}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Questions List */}
          <div
            className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-6"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base font-bold text-(--text) tracking-tight">
                Questions ({version?.questions.length ?? 0})
              </h3>
              <span className="text-xs text-(--muted)">
                {version?.questions.reduce((sum, q) => sum + q.points, 0) ?? 0}{" "}
                total points
              </span>
            </div>

            <div className="space-y-2 sm:space-y-2.5">
              {version?.questions.map((question, index) => {
                const isCurrentlyEditing = editingQuestionId === question.id;
                return (
                  <div
                    key={question.id}
                    className={`flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 rounded-[10px] sm:rounded-[12px] border p-2 sm:p-4 shadow-[var(--card-compact-shadow)] transition-all ${
                      isCurrentlyEditing
                        ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 sm:gap-2.5">
                        <span className="flex size-5.5 sm:size-6 shrink-0 items-center justify-center rounded-full bg-(--accent)/15 text-[0.7rem] sm:text-xs font-bold text-(--accent)">
                          {index + 1}
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-(--text) truncate">
                          {question.prompt}
                        </p>
                        {isCurrentlyEditing && (
                          <span className="rounded-full bg-(--accent)/15 px-2 py-0.5 text-[0.65rem] sm:text-[0.68rem] font-bold text-(--accent)">
                            Editing
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[0.72rem] sm:text-xs text-(--muted)">
                        <span className="rounded-md bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-1.5 sm:px-2 py-0.5 font-medium text-(--text-secondary) capitalize">
                          {question.questionType.replaceAll("_", " ")}
                        </span>
                        <span>•</span>
                        <span>
                          {question.points}{" "}
                          {question.points === 1 ? "point" : "points"}
                        </span>
                        <span>•</span>
                        <span>
                          {
                            question.options.filter(
                              (option) => option.isCorrect,
                            ).length
                          }{" "}
                          correct choice(s)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => editQuestion(question)}
                        aria-label={`Edit question ${index + 1}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
                      >
                        <PencilSimple size={14} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        disabled={deleteQuestion.isPending}
                        onClick={() =>
                          quizId &&
                          deleteQuestion.mutate({
                            quizId,
                            questionId: question.id,
                          })
                        }
                        aria-label={`Delete question ${index + 1}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <Trash size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {!version?.questions.length && (
                <div className="py-6 sm:py-8 text-center text-xs sm:text-sm text-(--muted)">
                  No questions added yet. Use the question editor above to add
                  your first question.
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Course Assignment & Delivery Rules */}
          <div
            className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-6"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-(--text) tracking-tight">
                  Course assignment & delivery rules
                </h3>
                <p className="mt-0.5 text-xs text-(--muted)">
                  Attach this quiz to a course lesson and configure assessment
                  delivery rules. Changes auto-save as you type.
                </p>
              </div>
              <AutoSaveIndicator status={assignmentSaveStatus} />
            </div>

            {/* Target Course & Lesson Pickers (when in standalone mode) */}
            {!courseId || !lessonId ? (
              <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-3 sm:p-4">
                <span className="block text-xs font-bold text-(--text) mb-2.5 uppercase tracking-wider">
                  Attach to Course & Lesson
                </span>
                <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Target course
                    </span>
                    <ThemedSelect
                      value={selectedCourseId}
                      onValueChange={(val) => {
                        setSelectedCourseId(val);
                        setSelectedLessonId("");
                      }}
                      options={courseOptions}
                      ariaLabel="Target course"
                      triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Target lesson
                    </span>
                    <ThemedSelect
                      value={selectedLessonId}
                      onValueChange={(val) => {
                        setSelectedLessonId(val);
                      }}
                      options={lessonOptions}
                      disabled={!selectedCourseId || lessonOptions.length === 0}
                      ariaLabel="Target lesson"
                      triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2 text-xs font-medium text-(--text)">
                <BookOpen size={15} className="text-(--accent) shrink-0" />
                <span>
                  Attached to lesson:{" "}
                  <strong className="font-semibold text-(--text)">
                    {lessonTitle || "Course Lesson"}
                  </strong>
                </span>
              </div>
            )}

            {effectiveCourseId && effectiveLessonId ? (
              <div className="space-y-3 sm:space-y-4">
                {assignment ? (
                  assignment.quizId === quizId ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-500">
                      <CheckCircle
                        size={15}
                        weight="bold"
                        className="shrink-0"
                      />
                      <span>
                        This quiz is currently assigned to this lesson. Delivery
                        rules are active and auto-saving.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-500">
                      <WarningCircle
                        size={15}
                        weight="fill"
                        className="shrink-0"
                      />
                      <span>
                        This lesson currently has &quot;
                        {"quizTitle" in assignment &&
                        typeof assignment.quizTitle === "string"
                          ? assignment.quizTitle
                          : "another quiz"}
                        &quot; assigned. Assigning this quiz will replace it.
                      </span>
                    </div>
                  )
                ) : null}

                <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Pass percentage
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={passPercentage}
                      onChange={(event) => {
                        setPassPercentage(Number(event.target.value));
                        scheduleAutoSaveAssignment();
                      }}
                      onBlur={flushAssignmentPersistence}
                      className={`${inputClass} w-full !h-9.5 sm:!h-10`}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Maximum attempts
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={maxAttempts}
                      onChange={(event) => {
                        setMaxAttempts(Number(event.target.value));
                        scheduleAutoSaveAssignment();
                      }}
                      onBlur={flushAssignmentPersistence}
                      className={`${inputClass} w-full !h-9.5 sm:!h-10`}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Time limit (minutes)
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      value={timeLimitMinutes}
                      onChange={(event) => {
                        setTimeLimitMinutes(Number(event.target.value));
                        scheduleAutoSaveAssignment();
                      }}
                      onBlur={flushAssignmentPersistence}
                      className={`${inputClass} w-full !h-9.5 sm:!h-10`}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-(--text) cursor-pointer">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(event) => {
                      setRequired(event.target.checked);
                      scheduleAutoSaveAssignment();
                    }}
                    className="size-4 sm:size-4.5 accent-(--accent) cursor-pointer"
                  />
                  <span>Required course assessment to complete lesson</span>
                </label>

                {assignment && versionOptions.length > 0 ? (
                  <div>
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Assigned published version
                    </span>
                    <ThemedSelect
                      value={assignmentVersionId ?? ""}
                      onValueChange={(val) => {
                        setAssignmentVersionId(val);
                        scheduleAutoSaveAssignment();
                      }}
                      options={versionOptions}
                      ariaLabel="Assigned published version"
                      triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                    />
                  </div>
                ) : null}

                <div>
                  <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                    Result feedback mode
                  </span>
                  <ThemedSelect
                    value={feedbackMode}
                    onValueChange={(val) => {
                      setFeedbackMode(val as typeof feedbackMode);
                      scheduleAutoSaveAssignment();
                    }}
                    options={FEEDBACK_MODE_OPTIONS}
                    ariaLabel="Result feedback mode"
                    triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                  />
                </div>

                <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
                  <div>
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Available from{" "}
                      <span className="text-(--muted) font-normal">
                        (optional)
                      </span>
                    </span>
                    <ThemedDateTimePicker
                      value={availableFrom}
                      onChange={(val) => {
                        setAvailableFrom(val);
                        scheduleAutoSaveAssignment();
                      }}
                      ariaLabel="Available from"
                      placeholder="dd/mm/yyyy --:--"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                      Available until{" "}
                      <span className="text-(--muted) font-normal">
                        (optional)
                      </span>
                    </span>
                    <ThemedDateTimePicker
                      value={availableUntil}
                      onChange={(val) => {
                        setAvailableUntil(val);
                        scheduleAutoSaveAssignment();
                      }}
                      ariaLabel="Available until"
                      placeholder="dd/mm/yyyy --:--"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-(--text) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(event) => {
                        setShuffleQuestions(event.target.checked);
                        scheduleAutoSaveAssignment();
                      }}
                      className="size-4 sm:size-4.5 accent-(--accent) cursor-pointer"
                    />
                    <span>Shuffle questions for each student attempt</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-(--text) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleOptions}
                      onChange={(event) => {
                        setShuffleOptions(event.target.checked);
                        scheduleAutoSaveAssignment();
                      }}
                      className="size-4 sm:size-4.5 accent-(--accent) cursor-pointer"
                    />
                    <span>Shuffle answer options for each student attempt</span>
                  </label>
                </div>

                <div className="pt-2 sm:pt-3 flex flex-wrap items-center gap-3">
                  {assignment && assignment.quizId === quizId ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-500">
                      <CheckCircle size={16} weight="bold" />
                      <span>Assigned to lesson</span>
                    </span>
                  ) : (
                    <Button
                      onClick={publishAndAssign}
                      disabled={
                        !version ||
                        !version.questions.length ||
                        publish.isPending ||
                        assign.isPending
                      }
                      className="h-9.5 sm:h-10 px-4 sm:px-5 font-semibold text-xs sm:text-sm"
                    >
                      {publish.isPending || assign.isPending ? (
                        <>
                          <CircleNotch
                            size={15}
                            className="animate-spin mr-2"
                          />
                          Assigning...
                        </>
                      ) : version?.publishedAt ? (
                        "Assign to lesson"
                      ) : (
                        "Publish & assign"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_15%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-4 sm:p-5 text-center">
                <p className="text-xs sm:text-sm text-(--muted)">
                  Select a course and lesson above to attach this quiz and
                  configure delivery rules (passing score, attempts, timer,
                  etc.).
                </p>
                {!version?.publishedAt && (
                  <div className="mt-3">
                    <Button
                      onClick={publishAndAssign}
                      disabled={
                        !version ||
                        !version.questions.length ||
                        publish.isPending
                      }
                      className="h-9 px-4 text-xs font-semibold"
                    >
                      {publish.isPending ? (
                        <>
                          <CircleNotch
                            size={14}
                            className="animate-spin mr-1.5"
                          />
                          Publishing...
                        </>
                      ) : (
                        "Publish version without attaching"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="text-xs sm:text-sm text-rose-500 font-medium"
        >
          Unable to save quiz changes: {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
