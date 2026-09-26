import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssignQuizRequest,
  QuizQuestionType,
} from "@veolms/contracts";
import { Button } from "../components/Button";
import {
  ArrowLeft,
  BookOpen,
  CaretDown,
  Check,
  CheckCircle,
  CircleNotch,
  DotsSixVertical,
  FileText,
  Info,
  ListBullets,
  PencilSimple,
  Plus,
  Question,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { quizKeys } from "../services/quizzes/quizzes.keys";
import {
  useAddQuizQuestion,
  useAssignQuiz,
  useCreateQuizWithQuestions,
  useDeleteQuiz,
  useDeleteQuizAssignment,
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
  useCourseOverview,
  useMyCourses,
  useUpdateLesson,
} from "../services/courses";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { SettingsToggle } from "../settings/SettingsControls";
import { QuizRichTextField } from "./QuizRichTextField";
import { selectQuizAssignment } from "./quizAssignmentSelection";
import { AutosaveStatus } from "../lib/autosync";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import {
  browserDraftStorageKey,
  parseQuizBuilderBrowserDraft,
  toCreateQuizQuestionRequest,
  type QuizBuilderBrowserDraft,
  type QuizBuilderQuestionDraft,
  type QuizBuilderOptionDraft,
} from "./quizBuilderDraft";

interface Props {
  courseId?: string;
  lessonId?: string;
  lessonTitle?: string;
  initialQuizId?: string | null;
  onBack?: () => void;
  onQuizDeleted?: () => void;
}

type OptionDraft = QuizBuilderOptionDraft;

interface EditableQuestion {
  id: string;
  questionType: QuizQuestionType;
  prompt: string;
  points: number;
  position: number;
  explanation: string | null;
  options: readonly OptionDraft[];
}

const initialOptions = (): OptionDraft[] => [
  { text: "Option 1", isCorrect: true },
  { text: "Option 2", isCorrect: false },
];

const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

const textareaClass =
  "rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

function QuizAuthoringLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading quiz section"
      className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-5"
    >
      <div className="animate-pulse motion-reduce:animate-none space-y-3">
        <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
        <div className="h-9 w-full rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
        <div className="h-24 w-full rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
      </div>
      <span className="sr-only">Loading quiz data…</span>
    </div>
  );
}

const QUESTION_TYPES: readonly {
  type: QuizQuestionType;
  label: string;
  description: string;
  icon: typeof ListBullets;
}[] = [
  {
    type: "single_choice",
    label: "Single Choice",
    description: "Only one correct answer",
    icon: ListBullets,
  },
  {
    type: "multiple_choice",
    label: "Multiple Choice",
    description: "One or more correct answers",
    icon: CheckCircle,
  },
  {
    type: "true_false",
    label: "True / False",
    description: "Binary true or false choice",
    icon: Question,
  },
  {
    type: "short_answer",
    label: "Short Answer",
    description: "Learners type exact answer",
    icon: FileText,
  },
];

function getQuestionTypeMeta(type: QuizQuestionType) {
  return (
    QUESTION_TYPES.find((qt) => qt.type === type) ?? {
      type,
      label: type.replaceAll("_", " "),
      description: "",
      icon: Question,
    }
  );
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

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
  const syncStatus =
    status === "saving" ? "syncing" : status === "saved" ? "saved" : "error";
  return <AutosaveStatus status={syncStatus} />;
}

function quizErrorMessage(error: unknown) {
  if (!error) return null;
  const apiError = error as {
    code?: unknown;
    message?: unknown;
    details?: {
      error?: {
        message?: string;
        issues?: Array<{ message?: string; path?: string[] }>;
      };
      message?: string;
      issues?: Array<{ message?: string; path?: string[] }>;
    };
  };
  if (apiError.code === "ACADEMY_NOT_CONFIGURED") {
    return "Academy setup is incomplete. Complete academy setup before creating quizzes.";
  }
  const issues = apiError.details?.error?.issues ?? apiError.details?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const firstIssue = issues[0]?.message;
    if (firstIssue) return firstIssue;
  }
  const detailsMessage =
    apiError.details?.error?.message ?? apiError.details?.message;
  if (
    typeof detailsMessage === "string" &&
    detailsMessage.trim() &&
    detailsMessage !==
      "Something went wrong on our end. Please try again later."
  ) {
    return detailsMessage;
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
  onQuizDeleted,
}: Props) {
  const isEmbeddedAuthoring = Boolean(courseId && lessonId);
  const quizzes = useMyQuizzes();
  const myCourses = useMyCourses({ enabled: !isEmbeddedAuthoring });
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");

  const effectiveCourseId = courseId || selectedCourseId || null;
  const effectiveLessonId = lessonId || selectedLessonId || null;

  const courseEditor = useCourseEditor(effectiveCourseId);
  const courseOverview = useCourseOverview(effectiveCourseId, {
    enabled: Boolean(effectiveCourseId && !courseEditor.data),
  });
  const updateLessonMutation = useUpdateLesson();
  const currentLesson = useMemo(() => {
    if (!effectiveLessonId || !courseEditor.data?.sections) return null;
    for (const section of courseEditor.data.sections) {
      const found = section.lessons?.find((l) => l.id === effectiveLessonId);
      if (found) return found;
    }
    return null;
  }, [courseEditor.data, effectiveLessonId]);
  const assignments = useCourseQuizAssignments(effectiveCourseId);
  const [quizId, setQuizId] = useState<string | null>(initialQuizId);
  const lastLoadedQuizIdRef = useRef<string | null>(null);
  const [quizTitle, setQuizTitle] = useState(lessonTitle ?? "");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<
    QuizBuilderQuestionDraft[]
  >([]);
  const draftStorageKey = useMemo(
    () => browserDraftStorageKey({ courseId, lessonId }),
    [courseId, lessonId],
  );
  const browserDraftHydratedRef = useRef(Boolean(initialQuizId));
  const [prompt, setPrompt] = useState("");
  const [questionType, setQuestionType] =
    useState<QuizQuestionType>("single_choice");
  const [points, setPoints] = useState(1);
  const [pointsInput, setPointsInput] = useState("1");
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

  const [questionSaveStatus, setQuestionSaveStatus] = useState<
    "saving" | "saved" | "failed" | null
  >(null);
  const questionDebounceRef = useRef<number | null>(null);
  const pendingSaveAfterCreateRef = useRef(false);

  const create = useCreateQuizWithQuestions();
  const addQuestion = useAddQuizQuestion();
  const updateQuestion = useUpdateQuizQuestion();
  const deleteQuestion = useDeleteQuizQuestion();
  const publish = usePublishQuiz();
  const assign = useAssignQuiz();
  const updateAssignment = useUpdateQuizAssignment();
  const updateQuiz = useUpdateQuiz();
  const qc = useQueryClient();
  const hasExplicitlyDeletedOrDetachedRef = useRef(false);
  const deleteQuizMutation = useDeleteQuiz();
  const deleteAssignmentMutation = useDeleteQuizAssignment();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetachConfirm, setShowDetachConfirm] = useState(false);
  const quiz = useQuiz(quizId);
  const assignment = useMemo(() => {
    return selectQuizAssignment({
      assignments: [
        ...(assignments.data ?? []),
        ...(quiz.data?.assignments ?? []),
      ],
      activeQuizId: quizId,
      targetCourseId: effectiveCourseId,
      targetLessonId: effectiveLessonId,
      allowEmbeddedInitialResolution:
        Boolean(courseId && lessonId) &&
        !hasExplicitlyDeletedOrDetachedRef.current,
    });
  }, [
    assignments.data,
    effectiveLessonId,
    effectiveCourseId,
    quiz.data?.assignments,
    quizId,
    courseId,
    lessonId,
  ]);
  const version = useMemo(
    () =>
      quiz.data?.versions.find((item) => !item.publishedAt) ??
      quiz.data?.versions.at(-1),
    [quiz.data],
  );

  useEffect(() => {
    if (initialQuizId) return;

    browserDraftHydratedRef.current = true;
    let savedDraft: QuizBuilderBrowserDraft | null = null;
    try {
      savedDraft = parseQuizBuilderBrowserDraft(
        window.localStorage.getItem(draftStorageKey),
      );
    } catch {
      // The in-memory editor remains usable when browser storage is unavailable.
    }
    if (!savedDraft) return;

    setQuizTitle(savedDraft.title || lessonTitle || "");
    setDescription(savedDraft.description);
    setInstructions(savedDraft.instructions);
    setDraftQuestions(savedDraft.questions);
    setRequired(savedDraft.assignment.required);
    setPassPercentage(savedDraft.assignment.passPercentage);
    setMaxAttempts(savedDraft.assignment.maxAttempts);
    setTimeLimitMinutes(savedDraft.assignment.timeLimitMinutes);
    setShuffleQuestions(savedDraft.assignment.shuffleQuestions);
    setShuffleOptions(savedDraft.assignment.shuffleOptions);
    setAvailableFrom(savedDraft.assignment.availableFrom);
    setAvailableUntil(savedDraft.assignment.availableUntil);
    setFeedbackMode(savedDraft.assignment.feedbackMode);
  }, [draftStorageKey, initialQuizId, lessonTitle]);

  useEffect(() => {
    if (!browserDraftHydratedRef.current || quizId) return;

    const draft: QuizBuilderBrowserDraft = {
      title: quizTitle,
      description,
      instructions,
      questions: draftQuestions,
      assignment: {
        required,
        passPercentage,
        maxAttempts,
        timeLimitMinutes,
        shuffleQuestions,
        shuffleOptions,
        availableFrom,
        availableUntil,
        feedbackMode,
      },
    };
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // The in-memory editor remains the source of truth for this session.
    }
  }, [
    description,
    draftQuestions,
    draftStorageKey,
    feedbackMode,
    instructions,
    maxAttempts,
    passPercentage,
    required,
    shuffleOptions,
    shuffleQuestions,
    timeLimitMinutes,
    availableFrom,
    availableUntil,
    quizId,
    quizTitle,
  ]);

  useEffect(() => {
    if (!assignment || hasExplicitlyDeletedOrDetachedRef.current) return;

    // Only the embedded course-editor flow is allowed to discover a quiz from
    // an assignment. In standalone authoring, changing the target course is
    // not a request to switch the quiz currently being edited.
    if (!quizId) {
      if (
        courseId &&
        lessonId &&
        assignment.courseId === courseId &&
        assignment.lessonId === lessonId
      ) {
        setQuizId(assignment.quizId);
      }
      return;
    }
    if (assignment.quizId !== quizId) return;

    setAssignmentVersionId(assignment.quizVersionId);
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
  }, [assignment, courseId, lessonId, quizId]);

  useEffect(() => {
    if (!quiz.data || quiz.data.id !== quizId) return;

    if (lastLoadedQuizIdRef.current !== quizId) {
      lastLoadedQuizIdRef.current = quizId;
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

  const handleResetAfterDelete = useCallback(() => {
    hasExplicitlyDeletedOrDetachedRef.current = true;
    if (detailsTimerRef.current) {
      window.clearTimeout(detailsTimerRef.current);
      detailsTimerRef.current = null;
    }
    if (assignmentTimerRef.current) {
      window.clearTimeout(assignmentTimerRef.current);
      assignmentTimerRef.current = null;
    }
    resetEditor();
    setDraftQuestions([]);
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // Nothing to clear when browser storage is unavailable.
    }
    lastLoadedQuizIdRef.current = null;
    setQuizId(null);
    setQuizTitle(lessonTitle ?? "");
    setDescription("");
    setInstructions("");
    setAssignmentVersionId(null);
    setDetailsSaveStatus(null);
    setCreateSaveStatus(null);
    setAssignmentSaveStatus(null);
    setShowDeleteConfirm(false);
    setShowDetachConfirm(false);
    lastSavedDetailsRef.current = {
      title: lessonTitle ?? "",
      description: "",
      instructions: "",
    };
    if (courseId) {
      qc.setQueryData(quizKeys.courseAssignments(courseId), (old: unknown) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.filter(
            (a: { lessonId?: string }) => a.lessonId !== lessonId,
          );
        }
        if (
          typeof old === "object" &&
          old !== null &&
          "assignments" in old &&
          Array.isArray((old as { assignments: unknown[] }).assignments)
        ) {
          return {
            ...(old as object),
            assignments: (
              old as { assignments: { lessonId?: string }[] }
            ).assignments.filter((a) => a.lessonId !== lessonId),
          };
        }
        return old;
      });
    }
    onQuizDeleted?.();
    onBack?.();
  }, [
    draftStorageKey,
    lessonTitle,
    onBack,
    onQuizDeleted,
    courseId,
    lessonId,
    qc,
  ]);

  const handleDeleteQuiz = () => {
    if (!quizId || deleteQuizMutation.isPending) return;
    deleteQuizMutation.mutate(quizId, {
      onSuccess: () => {
        handleResetAfterDelete();
      },
    });
  };

  const handleDetachAssignment = () => {
    if (!assignment || deleteAssignmentMutation.isPending) return;
    deleteAssignmentMutation.mutate(assignment.id, {
      onSuccess: () => {
        setShowDetachConfirm(false);
        setAssignmentVersionId(null);
        if (courseId && lessonId) {
          handleResetAfterDelete();
        }
      },
    });
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

  const persistBrowserDraft = useCallback(
    (onSaved?: (newQuiz: NonNullable<typeof quiz.data>) => void) => {
      if (quizId || create.isPending) return;

      const title = quizTitle.trim() || lessonTitle?.trim();
      if (!title) return;

      const questions = draftQuestions.map((question) =>
        question.id === editingQuestionId
          ? {
              ...question,
              questionType,
              prompt,
              points,
              explanation,
              options,
            }
          : question,
      );
      setDraftQuestions(questions);
      setCreateSaveStatus("saving");

      create.mutate(
        {
          title,
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          questions: questions.map((question, position) =>
            toCreateQuizQuestionRequest(question, position),
          ),
        },
        {
          onSuccess: (next) => {
            setCreateSaveStatus("saved");
            setDetailsSaveStatus("saved");
            try {
              window.localStorage.removeItem(draftStorageKey);
            } catch {
              // Nothing to clear when browser storage is unavailable.
            }
            setDraftQuestions([]);
            lastLoadedQuizIdRef.current = next.id;
            setQuizId(next.id);
            lastSavedDetailsRef.current = {
              title,
              description: description.trim(),
              instructions: instructions.trim(),
            };
            setTimeout(() => {
              setCreateSaveStatus((curr) => (curr === "saved" ? null : curr));
              setDetailsSaveStatus((curr) => (curr === "saved" ? null : curr));
            }, 2000);
            onSaved?.(next);
          },
          onError: () => {
            setCreateSaveStatus("failed");
          },
        },
      );
    },
    [
      create,
      description,
      draftQuestions,
      draftStorageKey,
      editingQuestionId,
      explanation,
      instructions,
      lessonTitle,
      options,
      points,
      prompt,
      questionType,
      quizId,
      quizTitle,
      quiz,
    ],
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

  const flushQuestionSave = useCallback(
    (
      overrideType?: QuizQuestionType,
      overrideOptions?: OptionDraft[],
      overridePrompt?: string,
      overridePoints?: number,
      overrideExpl?: string,
      overrideQuestionId?: string,
    ) => {
      if (questionDebounceRef.current !== null) {
        window.clearTimeout(questionDebounceRef.current);
        questionDebounceRef.current = null;
      }
      const targetQuestionId = overrideQuestionId ?? editingQuestionId;
      if (!targetQuestionId) return;
      const qType = overrideType ?? questionType;
      const qOptions = overrideOptions ?? options;
      const qPromptValue =
        overridePrompt !== undefined ? overridePrompt : prompt;
      const qPrompt = qPromptValue.trim();
      const rawPoints = overridePoints !== undefined ? overridePoints : points;
      const qPoints =
        Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : 1;
      const qExplValue =
        overrideExpl !== undefined ? overrideExpl : explanation;
      const qExpl = qExplValue.trim();

      if (targetQuestionId.startsWith("temp-q-")) {
        if (!quizId) {
          setDraftQuestions((current) =>
            current.map((question) =>
              question.id === targetQuestionId
                ? {
                    ...question,
                    questionType: qType,
                    prompt: qPromptValue,
                    points: qPoints,
                    explanation: qExplValue,
                    options: qOptions,
                  }
                : question,
            ),
          );
          setQuestionSaveStatus("saved");
        } else {
          pendingSaveAfterCreateRef.current = true;
        }
        return;
      }

      if (
        !quizId ||
        !qPrompt ||
        qOptions.length === 0 ||
        qOptions.some((option) => !option.text.trim()) ||
        !qOptions.some((option) => option.isCorrect) ||
        updateQuestion.isPending
      )
        return;
      const payload = {
        questionType: qType,
        prompt: qPrompt,
        points: qPoints,
        explanation: qExpl || null,
        options: qOptions.map(({ id, text, isCorrect }, position) => ({
          ...(id && !id.startsWith("temp-opt-") ? { id } : {}),
          text: text.trim(),
          isCorrect,
          position,
        })),
      } as const;
      if (updateQuestion.error) {
        updateQuestion.reset();
      }
      setQuestionSaveStatus("saving");
      updateQuestion.mutate(
        { quizId, questionId: targetQuestionId, payload },
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
    },
    [
      quizId,
      editingQuestionId,
      prompt,
      options,
      questionType,
      points,
      explanation,
      updateQuestion,
    ],
  );

  const scheduleAutoSaveQuestion = useCallback(
    (
      overrideType?: QuizQuestionType,
      overrideOptions?: OptionDraft[],
      overridePrompt?: string,
      overridePoints?: number,
      overrideExpl?: string,
    ) => {
      if (!editingQuestionId) return;
      if (!quizId && editingQuestionId.startsWith("temp-q-")) {
        flushQuestionSave(
          overrideType,
          overrideOptions,
          overridePrompt,
          overridePoints,
          overrideExpl,
        );
        return;
      }
      if (questionDebounceRef.current) {
        window.clearTimeout(questionDebounceRef.current);
      }
      questionDebounceRef.current = window.setTimeout(() => {
        flushQuestionSave(
          overrideType,
          overrideOptions,
          overridePrompt,
          overridePoints,
          overrideExpl,
        );
      }, 700);
    },
    [editingQuestionId, flushQuestionSave, quizId],
  );

  const selectType = (nextType: QuizQuestionType) => {
    setQuestionType(nextType);
    let nextOptions = options;
    if (nextType === "true_false") {
      nextOptions = [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ];
      setOptions(nextOptions);
    } else if (nextType === "short_answer") {
      const existingText = options[0]?.text?.trim() || "";
      const isPlaceholder =
        /^Option\s*\d+$/i.test(existingText) ||
        existingText.toLowerCase() === "true" ||
        existingText.toLowerCase() === "false";
      nextOptions = [
        { text: isPlaceholder ? "" : existingText, isCorrect: true },
      ];
      setOptions(nextOptions);
    } else if (
      options.length < 2 ||
      questionType === "short_answer" ||
      questionType === "true_false"
    ) {
      nextOptions = initialOptions();
      setOptions(nextOptions);
    }
    scheduleAutoSaveQuestion(nextType, nextOptions);
  };

  const setCorrect = (index: number, checked: boolean) => {
    if (questionType === "short_answer") return;
    const nextOptions = options.map((option, optionIndex) => ({
      ...option,
      isCorrect:
        questionType === "multiple_choice"
          ? optionIndex === index
            ? checked
            : option.isCorrect
          : optionIndex === index
            ? checked
            : false,
    }));
    setOptions(nextOptions);
    scheduleAutoSaveQuestion(undefined, nextOptions);
  };

  const editQuestion = useCallback(
    (question: EditableQuestion) => {
      if (updateQuestion.error) {
        updateQuestion.reset();
      }
      setEditingQuestionId(question.id);
      setPrompt(question.prompt);
      setQuestionType(question.questionType);
      setPoints(question.points);
      setPointsInput(String(question.points));
      setExplanation(question.explanation ?? "");
      setOptions(
        question.options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      );
    },
    [updateQuestion],
  );

  const handleToggleExpandQuestion = (question: EditableQuestion) => {
    if (editingQuestionId === question.id) {
      flushQuestionSave();
      setEditingQuestionId(null);
    } else {
      if (editingQuestionId) {
        flushQuestionSave();
      }
      editQuestion(question);
    }
  };

  const handleAddNewQuestion = () => {
    if (!quizId) {
      const nextIdx = draftQuestions.length + 1;
      const newQuestion: QuizBuilderQuestionDraft = {
        id: `temp-q-${Date.now()}`,
        questionType: "single_choice",
        prompt: `Question ${nextIdx}`,
        points: 1,
        position: draftQuestions.length,
        explanation: "",
        options: initialOptions(),
      };
      setDraftQuestions((current) => [...current, newQuestion]);
      editQuestion(newQuestion);
      return;
    }

    if (editingQuestionId) {
      flushQuestionSave();
    }
    const nextIdx = (version?.questions.length ?? 0) + 1;
    const tempQuestionId = `temp-q-${Date.now()}`;
    const initialOpts = initialOptions().map((opt, position) => ({
      id: `temp-opt-${position}-${Date.now()}`,
      text: opt.text,
      isCorrect: opt.isCorrect,
      weight: 1,
      position,
    }));
    const newPosition = version?.questions.length ?? 0;
    const optimisticQuestion = {
      id: tempQuestionId,
      questionType: "single_choice" as const,
      prompt: `Question ${nextIdx}`,
      points: 1,
      position: newPosition,
      explanation: null,
      options: initialOpts,
    };

    // Optimistically update query cache immediately (0ms latency, zero fluctuation)
    qc.setQueryData(quizKeys.detail(quizId), (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        versions: prev.versions.map((v: any) => {
          if (v.id !== version?.id) return v;
          return {
            ...v,
            questions: [...(v.questions ?? []), optimisticQuestion],
          };
        }),
      };
    });

    // Immediately expand and enter edit mode for the optimistic question
    editQuestion(optimisticQuestion as any);

    addQuestion.mutate(
      {
        id: quizId,
        payload: {
          questionType: "single_choice",
          prompt: `Question ${nextIdx}`,
          points: 1,
          explanation: null,
          options: initialOpts.map((opt, position) => ({
            text: opt.text,
            isCorrect: opt.isCorrect,
            position,
          })),
        },
      },
      {
        onSuccess: (updatedQuiz) => {
          qc.setQueryData(quizKeys.detail(quizId), updatedQuiz);
          const latestVersion =
            updatedQuiz.versions.find((item) => !item.publishedAt) ??
            updatedQuiz.versions.at(-1);
          const realQ = latestVersion?.questions.at(-1);
          if (realQ) {
            setEditingQuestionId((currentId) =>
              currentId === tempQuestionId ? realQ.id : currentId,
            );
            if (pendingSaveAfterCreateRef.current) {
              pendingSaveAfterCreateRef.current = false;
              flushQuestionSave(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                realQ.id,
              );
            }
          }
        },
        onError: () => {
          qc.setQueryData(quizKeys.detail(quizId), (prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              versions: prev.versions.map((v: any) => {
                if (v.id !== version?.id) return v;
                return {
                  ...v,
                  questions: v.questions.filter(
                    (q: any) => q.id !== tempQuestionId,
                  ),
                };
              }),
            };
          });
          setEditingQuestionId((currentId) =>
            currentId === tempQuestionId ? null : currentId,
          );
        },
      },
    );
  };

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
    if (!quizId) {
      if (create.isPending || !draftQuestions.length) return;
      persistBrowserDraft((createdQuiz) => {
        publish.mutate(
          createdQuiz.id,
          effectiveCourseId && effectiveLessonId
            ? { onSuccess: assignPublishedVersion }
            : undefined,
        );
      });
      return;
    }
    if (!version) return;
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
    const courses = myCourses.data?.courses ?? [];
    const sorted = [...courses].sort((a, b) => {
      const dateA = a.updatedAt
        ? Date.parse(a.updatedAt)
        : a.createdAt
          ? Date.parse(a.createdAt)
          : 0;
      const dateB = b.updatedAt
        ? Date.parse(b.updatedAt)
        : b.createdAt
          ? Date.parse(b.createdAt)
          : 0;
      return dateB - dateA;
    });
    const titleCounts = new Map<string, number>();
    sorted.forEach((course) => {
      titleCounts.set(course.title, (titleCounts.get(course.title) ?? 0) + 1);
    });
    const list = sorted.map(
      (course) =>
        [
          course.id,
          titleCounts.get(course.title)! > 1
            ? `${course.title} · ${course.slug}`
            : course.title,
        ] as const,
    );
    return [["", "Select a course..."] as const, ...list];
  }, [myCourses.data?.courses]);

  const courseSections =
    courseEditor.data?.sections ?? courseOverview.data?.sections;
  const isLessonsLoading = Boolean(
    effectiveCourseId &&
    !courseSections &&
    (courseEditor.isLoading ||
      (courseOverview.isLoading && !courseEditor.isError)),
  );
  const isLessonsError = Boolean(
    effectiveCourseId &&
    !courseSections &&
    courseEditor.isError &&
    (courseOverview.isError || !courseOverview.data),
  );

  const lessonOptions: readonly ThemedSelectOption<string>[] = useMemo(() => {
    if (!effectiveCourseId) {
      return [["", "Select a course first"] as const];
    }
    if (isLessonsLoading) {
      if (selectedLessonId) {
        return [
          [selectedLessonId, "Attached lesson..."] as const,
          ["", "Loading lessons..."] as const,
        ];
      }
      return [["", "Loading lessons..."] as const];
    }
    if (isLessonsError) {
      return [["", "Failed to load lessons (click to retry)"] as const];
    }
    if (!courseSections || courseSections.length === 0) {
      return [["", "No sections in this course"] as const];
    }
    const options: ThemedSelectOption<string>[] = [
      ["", "Select a lesson..."] as const,
    ];
    let totalLessons = 0;
    courseSections.forEach((sec, secIdx) => {
      (sec.lessons ?? []).forEach((les, lesIdx) => {
        totalLessons++;
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
    if (totalLessons === 0) {
      return [["", "No lessons in this course"] as const];
    }
    return options;
  }, [
    courseSections,
    effectiveCourseId,
    isLessonsError,
    isLessonsLoading,
    selectedLessonId,
  ]);

  const quizOptions: readonly ThemedSelectOption[] = useMemo(() => {
    const list: ThemedSelectOption[] = [];
    if (!quizId) {
      list.push(["", "-- Select active quiz --"]);
    }
    for (const item of quizzes.data ?? []) {
      list.push([item.id, item.title]);
    }
    return list;
  }, [quizzes.data, quizId]);

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
    deleteQuizMutation.error ||
    deleteAssignmentMutation.error ||
    publish.error ||
    assign.error ||
    updateAssignment.error ||
    updateQuiz.error ||
    quiz.error;
  const errorMessage = quizErrorMessage(anyError);
  const editableQuestions: readonly EditableQuestion[] = quizId
    ? (version?.questions ?? [])
    : draftQuestions;
  const canPersistBrowserDraft = Boolean(
    quizTitle.trim() || lessonTitle?.trim(),
  );

  // Render: Unified Quiz Authoring Panel
  return (
    <div data-quiz-surface="" className="space-y-3 sm:space-y-5 text-(--text)">
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

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            {quizzes.isLoading ? (
              <span className="text-xs text-(--muted)">Loading quizzes...</span>
            ) : quizOptions.length > 0 ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs font-semibold text-(--muted) hidden md:inline">
                  Active quiz:
                </span>
                <div className="w-36 sm:w-52">
                  <ThemedSelect
                    value={quizId ?? ""}
                    onValueChange={(val) => {
                      hasExplicitlyDeletedOrDetachedRef.current = false;
                      resetEditor();
                      setQuizId(val || null);
                      if (!val) {
                        lastLoadedQuizIdRef.current = null;
                        setQuizTitle(lessonTitle ?? "");
                        setDescription("");
                        setInstructions("");
                      }
                    }}
                    options={quizOptions}
                    searchable
                    searchPlaceholder="Search quizzes..."
                    defaultLimit={5}
                    ariaLabel="Select active quiz"
                    triggerClassName="!h-8.5 sm:!h-9 !rounded-[8px] sm:!rounded-[9px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] !px-2.5 sm:!px-3 !text-xs sm:!text-sm !font-semibold !text-(--text) shadow-[var(--card-compact-shadow)] hover:!border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                  />
                </div>
              </div>
            ) : null}

            {assignment && Boolean(courseId && lessonId) && (
              <button
                type="button"
                onClick={() => setShowDetachConfirm(true)}
                disabled={
                  deleteAssignmentMutation.isPending ||
                  deleteQuizMutation.isPending
                }
                className="h-8.5 sm:h-9 px-3 sm:px-3.5 inline-flex items-center justify-center gap-1.5 rounded-[8px] sm:rounded-[9px] border border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_85%,var(--canvas))] text-xs sm:text-sm font-semibold text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)_100%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] shadow-[var(--card-compact-shadow)] transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-40"
                title="Detach quiz from this lesson"
              >
                <X
                  size={14}
                  weight="bold"
                  className="shrink-0 text-(--muted)"
                />
                <span>Detach</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={
                !quizId ||
                deleteQuizMutation.isPending ||
                deleteAssignmentMutation.isPending
              }
              className="h-8.5 sm:h-9 px-3 sm:px-3.5 inline-flex items-center justify-center gap-1.5 rounded-[8px] sm:rounded-[9px] border border-red-500/60 bg-red-600/20 text-xs sm:text-sm font-semibold text-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-[var(--card-compact-shadow)] transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-40"
              title={
                quizId
                  ? "Permanently delete this quiz"
                  : "No quiz loaded to delete"
              }
            >
              <Trash
                size={14}
                weight="bold"
                className="shrink-0 text-red-400 group-hover:text-white"
              />
              <span>Delete quiz</span>
            </button>
          </div>
        </div>
      </div>

      {quiz.isLoading && !quiz.data && !lastLoadedQuizIdRef.current ? (
        <div className="my-8 flex items-center justify-center gap-2 text-sm text-(--muted)">
          <CircleNotch size={18} className="animate-spin text-(--accent)" />
          <span>Loading quiz details...</span>
        </div>
      ) : null}

      {!quizId || quiz.data || lastLoadedQuizIdRef.current ? (
        <div className="space-y-3 sm:space-y-5">
          {/* Card 1: Quiz Details */}
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
                  {quizId
                    ? "Title, description, and student instructions auto-save as you type."
                    : "Your draft stays in this browser until you save or publish the quiz."}
                </p>
              </div>
              {quizId ? (
                <AutoSaveIndicator status={detailsSaveStatus} />
              ) : createSaveStatus ? (
                <AutoSaveIndicator status={createSaveStatus} />
              ) : (
                <span role="status" className="text-xs text-(--muted)">
                  Saved in this browser
                </span>
              )}
            </div>

            <div className="space-y-3 sm:space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                  Quiz title <span className="text-(--accent)">*</span>
                </span>
                <input
                  value={quizTitle}
                  onChange={(event) => {
                    setQuizTitle(event.target.value);
                    if (quizId) {
                      scheduleAutoSaveDetails(event.target.value);
                    }
                  }}
                  onBlur={() => {
                    if (quizId) {
                      flushDetailsPersistence();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !quizId) {
                      event.preventDefault();
                    }
                  }}
                  className={`${inputClass} w-full`}
                  placeholder="Quiz title"
                  autoFocus={!quizId && (!courseId || !lessonId)}
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
                    if (quizId) {
                      scheduleAutoSaveDetails(undefined, event.target.value);
                    }
                  }}
                  onBlur={() => {
                    if (quizId) {
                      flushDetailsPersistence();
                    }
                  }}
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
                    if (quizId) {
                      scheduleAutoSaveDetails(undefined, undefined, val);
                    }
                  }}
                  documentId={`quiz-${quizId ?? "draft"}-instructions`}
                  placeholder="Tell learners how to complete this quiz"
                  minHeight="min-h-20"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Questions with In-Place Curriculum-Style Accordion Authoring */}
          <div
            className="rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-2.5 sm:p-6"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-(--text) tracking-tight">
                  Questions ({editableQuestions.length})
                </h3>
                <p className="mt-0.5 text-xs text-(--muted)">
                  Each question can be edited in place. Click any question to
                  expand or collapse.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-2.5 py-0.5 sm:py-1 text-[0.7rem] sm:text-[0.72rem] font-semibold text-(--text-secondary)">
                  {editableQuestions.reduce((sum, q) => sum + q.points, 0)}{" "}
                  total points
                </span>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-2.5 py-0.5 sm:py-1 text-[0.7rem] sm:text-[0.72rem] font-semibold text-(--text-secondary)">
                  {version?.publishedAt ? "Published version" : "Draft version"}
                </span>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-2.5">
              {editableQuestions.map((question, index) => {
                const isCurrentlyEditing = editingQuestionId === question.id;
                const typeMeta = getQuestionTypeMeta(question.questionType);
                const correctCount = question.options.filter(
                  (option) => option.isCorrect,
                ).length;
                const promptSummary = stripHtml(question.prompt);

                return (
                  <div
                    key={question.id}
                    className={`rounded-[10px] sm:rounded-[12px] border transition-all overflow-hidden shadow-[var(--card-compact-shadow)] ${
                      isCurrentlyEditing
                        ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                    }`}
                  >
                    {/* Collapsed Header: Click to expand / collapse */}
                    <div
                      className="flex items-center justify-between gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer select-none"
                      onClick={() => handleToggleExpandQuestion(question)}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        <span className="flex size-5.5 sm:size-6 shrink-0 items-center justify-center rounded-md text-(--muted) opacity-60">
                          <DotsSixVertical size={16} />
                        </span>
                        <span className="flex size-5.5 sm:size-6 shrink-0 items-center justify-center rounded-full bg-(--accent)/15 text-[0.7rem] sm:text-xs font-bold text-(--accent)">
                          {index + 1}
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-(--text) truncate">
                          {promptSummary || "Untitled question"}
                        </p>
                        {isCurrentlyEditing && (
                          <span className="rounded-full bg-(--accent)/15 px-2 py-0.5 text-[0.65rem] sm:text-[0.68rem] font-bold text-(--accent) shrink-0">
                            Editing
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="rounded-md bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-1.5 sm:px-2 py-0.5 text-[0.7rem] font-medium text-(--text-secondary) capitalize">
                          {typeMeta.label}
                        </span>
                        <span className="rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-1.5 sm:px-2 py-0.5 text-[0.7rem] font-semibold text-(--accent)">
                          {question.points}{" "}
                          {question.points === 1 ? "pt" : "pts"}
                        </span>
                        <span className="hidden md:inline-block text-[0.72rem] text-(--muted)">
                          {question.questionType === "short_answer"
                            ? "Text input answer"
                            : `${correctCount} correct choice${correctCount === 1 ? "" : "s"}`}
                        </span>
                        <button
                          type="button"
                          disabled={deleteQuestion.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (editingQuestionId === question.id) {
                              setEditingQuestionId(null);
                            }
                            if (question.id.startsWith("temp-q-")) {
                              if (!quizId) {
                                setDraftQuestions((current) =>
                                  current.filter((q) => q.id !== question.id),
                                );
                              } else {
                                qc.setQueryData(
                                  quizKeys.detail(quizId),
                                  (prev: any) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      versions: prev.versions.map((v: any) => ({
                                        ...v,
                                        questions: v.questions.filter(
                                          (q: any) => q.id !== question.id,
                                        ),
                                      })),
                                    };
                                  },
                                );
                              }
                              return;
                            }
                            if (quizId) {
                              deleteQuestion.mutate({
                                quizId,
                                questionId: question.id,
                              });
                            }
                          }}
                          aria-label={`Delete question ${index + 1}`}
                          className="flex size-7 items-center justify-center rounded-lg text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-40"
                          title="Delete question"
                        >
                          <Trash size={14} />
                        </button>
                        <button
                          type="button"
                          className={`flex size-7 items-center justify-center rounded-lg text-(--muted) hover:text-(--text) transition-transform duration-200 cursor-pointer ${
                            isCurrentlyEditing ? "rotate-180 text-(--text)" : ""
                          }`}
                          aria-label={
                            isCurrentlyEditing
                              ? "Collapse question"
                              : "Expand question"
                          }
                        >
                          <CaretDown size={15} weight="bold" />
                        </button>
                      </div>
                    </div>

                    {/* In-Place Expanded Editor for this question */}
                    {isCurrentlyEditing && (
                      <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-3 sm:p-5 space-y-3.5 sm:space-y-4">
                        {/* Question prompt */}
                        <div>
                          <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                            Question prompt{" "}
                            <span className="text-(--accent)">*</span>
                          </span>
                          <QuizRichTextField
                            label="Question prompt"
                            value={prompt}
                            onChange={(val) => {
                              setPrompt(val);
                              scheduleAutoSaveQuestion(
                                undefined,
                                undefined,
                                val,
                              );
                            }}
                            documentId={`quiz-${quizId}-question-${question.id}`}
                            placeholder="Write a clear, unambiguous question..."
                          />
                        </div>

                        {/* Question Type Visual Cards (Course Curriculum Style) */}
                        <div>
                          <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                            Question type
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            {QUESTION_TYPES.map((qt) => {
                              const isSelected = questionType === qt.type;
                              const IconComp = qt.icon;
                              return (
                                <div
                                  key={qt.type}
                                  className={`relative flex items-center gap-2.5 border rounded-[10px] px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ease-out cursor-pointer ${
                                    isSelected
                                      ? "is-selected border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                                  }`}
                                  onClick={() => selectType(qt.type)}
                                >
                                  <div
                                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                      isSelected
                                        ? "border-(--accent)"
                                        : "border-(--muted)"
                                    }`}
                                  >
                                    {isSelected && (
                                      <div className="size-1.5 rounded-full bg-(--accent)" />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-center text-(--accent) shrink-0">
                                    <IconComp
                                      size={16}
                                      weight={isSelected ? "fill" : "regular"}
                                    />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-(--text) text-[0.82rem] font-bold leading-tight truncate">
                                      {qt.label}
                                    </span>
                                    <span className="text-(--muted) text-[0.70rem] truncate">
                                      {qt.description}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Points */}
                        <div className="w-full sm:w-44">
                          <label className="block">
                            <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                              Points <span className="text-(--accent)">*</span>
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={pointsInput}
                              onChange={(event) => {
                                let raw = event.target.value;
                                if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) {
                                  return;
                                }
                                if (
                                  raw.length > 1 &&
                                  raw.startsWith("0") &&
                                  !raw.startsWith("0.")
                                ) {
                                  raw = raw.replace(/^0+/, "") || "0";
                                }
                                setPointsInput(raw);
                                const parsed = parseFloat(raw);
                                if (!Number.isNaN(parsed) && parsed > 0) {
                                  setPoints(parsed);
                                  scheduleAutoSaveQuestion(
                                    undefined,
                                    undefined,
                                    undefined,
                                    parsed,
                                  );
                                }
                              }}
                              onBlur={() => {
                                const parsed = parseFloat(pointsInput);
                                if (Number.isNaN(parsed) || parsed <= 0) {
                                  const fallback = points > 0 ? points : 1;
                                  setPoints(fallback);
                                  setPointsInput(String(fallback));
                                  flushQuestionSave(
                                    undefined,
                                    undefined,
                                    undefined,
                                    fallback,
                                  );
                                } else {
                                  setPoints(parsed);
                                  setPointsInput(String(parsed));
                                  flushQuestionSave(
                                    undefined,
                                    undefined,
                                    undefined,
                                    parsed,
                                  );
                                }
                              }}
                              placeholder="1"
                              className={`${inputClass} w-full !h-9.5 sm:!h-10`}
                            />
                          </label>
                        </div>

                        {/* Explanation */}
                        <div>
                          <span className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                            Explanation shown in feedback{" "}
                            <span className="text-(--muted) font-normal">
                              (optional)
                            </span>
                          </span>
                          <QuizRichTextField
                            label="Answer explanation"
                            value={explanation}
                            onChange={(val) => {
                              setExplanation(val);
                              scheduleAutoSaveQuestion(
                                undefined,
                                undefined,
                                undefined,
                                undefined,
                                val,
                              );
                            }}
                            documentId={`quiz-${quizId}-explanation-${question.id}`}
                            placeholder="Explain why the correct answer is right..."
                            minHeight="min-h-20"
                          />
                        </div>

                        {/* Short Answer (Input Box Question) vs Multiple Choice Options */}
                        {questionType === "short_answer" ? (
                          <div className="rounded-[10px] sm:rounded-[12px] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] p-3 sm:p-4 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-[inset_0_1px_3px_color-mix(in_srgb,black_10%,transparent)] space-y-3">
                            <div>
                              <span className="text-xs font-bold text-(--text) tracking-tight">
                                Correct Answer (Learner Input Box)
                              </span>
                              <p className="mt-0.5 text-[0.72rem] text-(--muted)">
                                Learners will see a text input box to type their
                                response. Enter the correct answer below (graded
                                case-insensitively).
                              </p>
                            </div>

                            {/* Primary Answer Box */}
                            <div className="space-y-2.5">
                              <div>
                                <input
                                  value={options[0]?.text ?? ""}
                                  onChange={(event) => {
                                    const val = event.target.value;
                                    const nextOpts = [
                                      {
                                        ...(options[0] ?? {}),
                                        text: val,
                                        isCorrect: true,
                                      },
                                      ...options.slice(1).map((o) => ({
                                        ...o,
                                        isCorrect: true,
                                      })),
                                    ];
                                    setOptions(nextOpts);
                                    scheduleAutoSaveQuestion(
                                      undefined,
                                      nextOpts,
                                    );
                                  }}
                                  onBlur={() => flushQuestionSave()}
                                  className={`${inputClass} w-full !h-9.5 sm:!h-10 text-sm`}
                                  aria-label="Expected correct answer"
                                  placeholder="Type the expected answer (e.g. Photosynthesis)..."
                                />
                              </div>

                              {/* Alternative accepted answers (if any) */}
                              {options.length > 1 && (
                                <div className="pt-1.5 space-y-2">
                                  <span className="block text-[0.72rem] font-semibold text-(--text-secondary)">
                                    Alternative accepted answers (optional
                                    variations):
                                  </span>
                                  {options.slice(1).map((option, altIndex) => {
                                    const realIndex = altIndex + 1;
                                    return (
                                      <div
                                        key={option.id ?? realIndex}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          value={option.text}
                                          onChange={(event) => {
                                            const nextOpts = options.map(
                                              (item, idx) =>
                                                idx === realIndex
                                                  ? {
                                                      ...item,
                                                      text: event.target.value,
                                                      isCorrect: true,
                                                    }
                                                  : item,
                                            );
                                            setOptions(nextOpts);
                                            scheduleAutoSaveQuestion(
                                              undefined,
                                              nextOpts,
                                            );
                                          }}
                                          onBlur={() => flushQuestionSave()}
                                          className={`${inputClass} flex-1 min-w-0 !h-9 text-xs sm:text-sm`}
                                          aria-label={`Alternative accepted answer ${realIndex}`}
                                          placeholder={`Alternative answer variation ${realIndex} (e.g. abbreviation)...`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextOpts = options.filter(
                                              (_, idx) => idx !== realIndex,
                                            );
                                            setOptions(nextOpts);
                                            scheduleAutoSaveQuestion(
                                              undefined,
                                              nextOpts,
                                            );
                                          }}
                                          title={`Remove alternative answer ${realIndex}`}
                                          aria-label={`Remove alternative answer ${realIndex}`}
                                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                                        >
                                          <Trash size={14} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOptions = [
                                      ...options,
                                      { text: "", isCorrect: true },
                                    ];
                                    setOptions(nextOptions);
                                    scheduleAutoSaveQuestion(
                                      undefined,
                                      nextOptions,
                                    );
                                  }}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--accent) hover:underline cursor-pointer"
                                >
                                  <Plus size={13} weight="bold" />
                                  <span>
                                    + Add another acceptable variation
                                    (optional)
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Options & Answer Key Inset Container for Choice Questions */
                          <div className="rounded-[10px] sm:rounded-[12px] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] p-2.5 sm:p-4 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-[inset_0_1px_3px_color-mix(in_srgb,black_10%,transparent)]">
                            <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
                              <div>
                                <span className="text-xs font-bold text-(--text) tracking-tight">
                                  Options & Answer Key
                                </span>
                              </div>
                              {questionType !== "true_false" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOptions = [
                                      ...options,
                                      {
                                        text: `Option ${options.length + 1}`,
                                        isCorrect: false,
                                      },
                                    ];
                                    setOptions(nextOptions);
                                    scheduleAutoSaveQuestion(
                                      undefined,
                                      nextOptions,
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-(--accent) hover:underline cursor-pointer"
                                >
                                  <Plus size={13} weight="bold" />
                                  <span>Add option</span>
                                </button>
                              )}
                            </div>

                            <div className="space-y-2 sm:space-y-2.5">
                              {options.map((option, optIndex) => (
                                <div
                                  key={option.id ?? optIndex}
                                  className="flex items-center gap-1.5 sm:gap-2.5 min-w-0"
                                >
                                  <label className="flex items-center cursor-pointer p-0.5 sm:p-1">
                                    <input
                                      type={
                                        questionType === "multiple_choice"
                                          ? "checkbox"
                                          : "radio"
                                      }
                                      name={`correct-${quizId}-${question.id}`}
                                      checked={option.isCorrect}
                                      onChange={(event) =>
                                        setCorrect(
                                          optIndex,
                                          event.target.checked,
                                        )
                                      }
                                      aria-label={`Mark option ${optIndex + 1} as correct`}
                                      className="size-4 sm:size-4.5 accent-(--accent) cursor-pointer"
                                    />
                                  </label>
                                  <input
                                    value={option.text}
                                    onChange={(event) => {
                                      const nextOpts = options.map(
                                        (item, itemIndex) =>
                                          itemIndex === optIndex
                                            ? {
                                                ...item,
                                                text: event.target.value,
                                              }
                                            : item,
                                      );
                                      setOptions(nextOpts);
                                      scheduleAutoSaveQuestion(
                                        undefined,
                                        nextOpts,
                                      );
                                    }}
                                    onBlur={() => flushQuestionSave()}
                                    className={`${inputClass} flex-1 min-w-0 !h-9 sm:!h-10`}
                                    aria-label={`Option ${optIndex + 1}`}
                                    placeholder={`Option ${optIndex + 1}`}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      options.length <= 2 ||
                                      questionType === "true_false"
                                    }
                                    onClick={() => {
                                      const nextOpts = options.filter(
                                        (_, itemIndex) =>
                                          itemIndex !== optIndex,
                                      );
                                      setOptions(nextOpts);
                                      scheduleAutoSaveQuestion(
                                        undefined,
                                        nextOpts,
                                      );
                                    }}
                                    title={`Remove option ${optIndex + 1}`}
                                    aria-label={`Remove option ${optIndex + 1}`}
                                    className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                  >
                                    <Trash size={15} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer / Done editing / Auto-save indicator */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                flushQuestionSave();
                                setEditingQuestionId(null);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 sm:h-8.5 px-3 sm:px-3.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] text-xs font-semibold text-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] hover:border-(--accent) transition-all duration-150 cursor-pointer"
                              title="Finish editing and collapse this question"
                              aria-label="Done editing question"
                            >
                              <Check size={14} weight="bold" />
                              <span>Done Editing</span>
                            </button>
                          </div>
                          <AutoSaveIndicator status={questionSaveStatus} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!editableQuestions.length && (
                <div className="py-7 sm:py-9 text-center text-xs sm:text-sm text-(--muted) border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                  <p className="font-semibold text-(--text-secondary)">
                    No questions added yet.
                  </p>
                  <p className="mt-1 text-xs text-(--muted)">
                    Click &quot;Add question&quot; below to add your first
                    assessment question.
                  </p>
                </div>
              )}
            </div>

            {/* Add Question Button (Course Curriculum Style) */}
            <div className="mt-3 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <button
                type="button"
                onClick={handleAddNewQuestion}
                disabled={create.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-1.5 text-xs font-semibold text-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] hover:border-(--accent) transition-all cursor-pointer disabled:opacity-50"
              >
                <Plus size={13} weight="bold" />
                <span>Add question</span>
              </button>
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
                  delivery rules.{" "}
                  {quizId
                    ? "Changes auto-save as you type."
                    : "Changes are kept in this browser until you save the quiz."}
                </p>
              </div>
              {quizId ? (
                <AutoSaveIndicator status={assignmentSaveStatus} />
              ) : (
                <span role="status" className="text-xs text-(--muted)">
                  Saved in this browser
                </span>
              )}
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
                      searchable
                      searchPlaceholder="Search courses..."
                      defaultLimit={5}
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
                        if (isLessonsError) {
                          courseEditor.refetch();
                          courseOverview.refetch();
                          return;
                        }
                        setSelectedLessonId(val);
                      }}
                      options={lessonOptions}
                      searchable
                      searchPlaceholder="Search lessons..."
                      defaultLimit={10}
                      disabled={
                        !effectiveCourseId ||
                        isLessonsLoading ||
                        (!isLessonsError &&
                          Boolean(courseSections) &&
                          courseSections!.every(
                            (s) => (s.lessons ?? []).length === 0,
                          ))
                      }
                      ariaLabel="Target lesson"
                      triggerClassName="!h-9.5 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-3 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
                    />
                    {isLessonsError ? (
                      <button
                        type="button"
                        onClick={() => {
                          courseEditor.refetch();
                          courseOverview.refetch();
                        }}
                        className="mt-1.5 text-xs font-medium text-amber-500 hover:text-amber-400 hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        Failed to load lessons. Click to retry.
                      </button>
                    ) : null}
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
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-500">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle
                          size={15}
                          weight="bold"
                          className="shrink-0"
                        />
                        <span className="truncate">
                          This quiz is currently assigned to this lesson.
                          Delivery rules are active and auto-saving.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDetachConfirm(true)}
                        disabled={deleteAssignmentMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors shrink-0"
                        title="Detach quiz from this lesson"
                      >
                        <Trash size={12} weight="bold" />
                        <span>Detach</span>
                      </button>
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

                {/* Free Preview Toggle & Standalone Pricing Note */}
                <div className="rounded-[10px] sm:rounded-[12px] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] p-3 sm:p-4 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] space-y-3">
                  <div>
                    <span className="block text-xs font-bold text-(--text) tracking-tight mb-1">
                      Free Preview & Access
                    </span>
                    <p className="text-[0.7rem] sm:text-xs text-(--muted) m-0">
                      Configure whether prospective learners can preview and take this quiz before purchasing.
                    </p>
                  </div>

                  <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[8px] px-3 py-2 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                    <div className="pr-3">
                      <strong className="block mb-0.5 text-(--text) text-[0.88rem] font-[650]">
                        Free Preview
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.78rem]">
                        Allow prospective students to view and attempt this quiz before enrolling or purchasing.
                      </p>
                    </div>
                    <SettingsToggle
                      checked={Boolean(currentLesson?.isPreview)}
                      onChange={(checked) => {
                        if (effectiveCourseId && effectiveLessonId) {
                          updateLessonMutation.mutate({
                            courseId: effectiveCourseId,
                            lessonId: effectiveLessonId,
                            payload: { isPreview: checked },
                          });
                        }
                      }}
                      label="Toggle Free Preview"
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-[8px] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-2.5 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-xs text-(--text-secondary)">
                    <Info size={16} weight="bold" className="text-(--accent) shrink-0" />
                    <span>
                      Standalone pricing for this quiz is configured in the course <strong>Pricing</strong> tab.
                    </span>
                  </div>
                </div>

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
                  {!quizId ? (
                    <Button
                      onClick={() => persistBrowserDraft()}
                      disabled={!canPersistBrowserDraft || create.isPending}
                      motion="static"
                      className="h-9.5 sm:h-10 border border-(--accent)/35 bg-(--accent)/10 px-4 sm:px-5 text-xs sm:text-sm text-(--accent) shadow-none hover:bg-(--accent)/20"
                    >
                      {create.isPending ? "Saving quiz..." : "Save draft"}
                    </Button>
                  ) : null}
                  {assignment && assignment.quizId === quizId ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-500">
                      <CheckCircle size={16} weight="bold" />
                      <span>Assigned to lesson</span>
                    </span>
                  ) : (
                    <Button
                      onClick={publishAndAssign}
                      disabled={
                        !editableQuestions.length ||
                        create.isPending ||
                        publish.isPending ||
                        assign.isPending
                      }
                      className="h-9.5 sm:h-10 px-4 sm:px-5 font-semibold text-xs sm:text-sm"
                    >
                      {create.isPending ||
                      publish.isPending ||
                      assign.isPending ? (
                        <>
                          <CircleNotch
                            size={15}
                            className="animate-spin mr-2"
                          />
                          {create.isPending ? "Saving quiz..." : "Assigning..."}
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
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {!quizId ? (
                      <Button
                        onClick={() => persistBrowserDraft()}
                        disabled={!canPersistBrowserDraft || create.isPending}
                        motion="static"
                        className="h-9 border border-(--accent)/35 bg-(--accent)/10 px-4 text-xs text-(--accent) shadow-none hover:bg-(--accent)/20"
                      >
                        {create.isPending ? "Saving quiz..." : "Save draft"}
                      </Button>
                    ) : null}
                    <Button
                      onClick={publishAndAssign}
                      disabled={
                        !editableQuestions.length ||
                        create.isPending ||
                        publish.isPending
                      }
                      className="h-9 px-4 text-xs font-semibold"
                    >
                      {create.isPending || publish.isPending ? (
                        <>
                          <CircleNotch
                            size={14}
                            className="animate-spin mr-1.5"
                          />
                          {create.isPending
                            ? "Saving quiz..."
                            : "Publishing..."}
                        </>
                      ) : quizId ? (
                        "Publish version without attaching"
                      ) : (
                        "Save & publish version"
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
        <div
          role="alert"
          className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs sm:text-sm text-rose-500 font-medium"
        >
          <div className="flex items-center gap-2">
            <WarningCircle size={16} className="shrink-0" />
            <span>Unable to save quiz changes: {errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              create.reset();
              addQuestion.reset();
              updateQuestion.reset();
              deleteQuestion.reset();
              deleteQuizMutation.reset();
              deleteAssignmentMutation.reset();
              publish.reset();
              assign.reset();
              updateAssignment.reset();
              updateQuiz.reset();
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-lg hover:bg-rose-500/20 text-rose-500 transition-colors cursor-pointer"
            aria-label="Dismiss error"
            title="Dismiss error"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ) : null}

      <ConfirmActionModal
        id="delete-quiz-confirm-modal"
        isOpen={showDeleteConfirm}
        isPending={deleteQuizMutation.isPending}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteQuiz}
        icon={Trash}
        title="Delete this Quiz?"
        description={
          <div className="space-y-2 text-xs sm:text-sm text-(--muted)">
            <p>
              Are you sure you want to permanently delete{" "}
              <strong className="font-semibold text-(--text)">
                &quot;{quizTitle || "Untitled Quiz"}&quot;
              </strong>
              ?
            </p>
            <p className="text-rose-500 font-medium">
              This will remove all questions and unassign this quiz from any
              attached lessons. This action cannot be undone.
            </p>
            {deleteQuizMutation.isError && (
              <p className="text-red-400 font-medium pt-1">
                Failed to delete:{" "}
                {deleteQuizMutation.error?.message || "Something went wrong."}
              </p>
            )}
          </div>
        }
        cancelLabel="Cancel"
        confirmLabel="Yes, Delete Quiz"
        pendingLabel="Deleting quiz..."
        tone="danger"
      />

      <ConfirmActionModal
        id="detach-quiz-assignment-modal"
        isOpen={showDetachConfirm}
        isPending={deleteAssignmentMutation.isPending}
        onClose={() => setShowDetachConfirm(false)}
        onConfirm={handleDetachAssignment}
        icon={Trash}
        title="Detach Quiz from this Lesson?"
        description={
          <div className="space-y-2 text-xs sm:text-sm text-(--muted)">
            <p>
              Are you sure you want to detach{" "}
              <strong className="font-semibold text-(--text)">
                &quot;{quizTitle || "Untitled Quiz"}&quot;
              </strong>{" "}
              from this lesson?
            </p>
            <p>
              The quiz will remain safely in your quiz library and can be
              re-assigned to any lesson later.
            </p>
            {deleteAssignmentMutation.isError && (
              <p className="text-red-400 font-medium pt-1">
                Failed to detach:{" "}
                {deleteAssignmentMutation.error?.message ||
                  "Something went wrong."}
              </p>
            )}
          </div>
        }
        cancelLabel="Cancel"
        confirmLabel="Detach from Lesson"
        pendingLabel="Detaching..."
        tone="danger"
      />
    </div>
  );
}
