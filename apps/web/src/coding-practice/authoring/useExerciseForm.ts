import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CodingExercise,
  UpdateCodingExerciseRequest,
} from "@veolms/contracts";
import { getApiError } from "../../lib/api-error";
import { useUpdateCodingExercise } from "../../services/coding-practice";

export type ExerciseForm = Required<
  Pick<
    UpdateCodingExerciseRequest,
    | "title"
    | "difficulty"
    | "estimatedMinutes"
    | "statement"
    | "starterFiles"
    | "solutionFiles"
    | "entry"
    | "tests"
    | "hints"
    | "settings"
  >
>;

const AUTOSAVE_DELAY_MS = 1_200;

export function formFrom(exercise: CodingExercise): ExerciseForm {
  const editable = exercise.editable;
  return {
    title: exercise.title,
    difficulty: exercise.difficulty,
    estimatedMinutes: exercise.estimatedMinutes,
    statement: editable.statement,
    starterFiles: editable.starterFiles,
    solutionFiles: editable.solutionFiles,
    entry: editable.entry,
    tests: editable.tests,
    hints: editable.hints,
    settings: editable.settings,
  };
}

export type SaveState = "saved" | "saving" | "unsaved" | "error";

/**
 * The exercise as its author edits it, saved a moment after each change
 * (as the course editor autosaves). `saveNow` waits for everything typed
 * so far to be on the server: validation and publishing check the saved
 * version's fingerprint.
 */
export function useExerciseForm(exercise: CodingExercise) {
  const update = useUpdateCodingExercise();
  const [form, setForm] = useState<ExerciseForm>(() => formFrom(exercise));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const dirty = useRef(false);
  const inFlight = useRef<Promise<CodingExercise | null> | null>(null);
  const latest = useRef<CodingExercise>(exercise);

  const send = useCallback(async (): Promise<CodingExercise | null> => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return latest.current;
    dirty.current = false;
    setSaveState("saving");
    const payload = formRef.current;
    const request = update
      .mutateAsync({ exerciseId: exercise.id, payload })
      .then((saved) => {
        latest.current = saved;
        setSaveError(null);
        setSaveState(dirty.current ? "unsaved" : "saved");
        return saved;
      })
      .catch((error: unknown) => {
        dirty.current = true;
        setSaveError(getApiError(error).message);
        setSaveState("error");
        return null;
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return await request;
  }, [exercise.id, update]);

  const change = useCallback((patch: Partial<ExerciseForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    dirty.current = true;
    setSaveState("unsaved");
  }, []);

  useEffect(() => {
    if (saveState !== "unsaved") return undefined;
    const timer = window.setTimeout(() => void send(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [form, saveState, send]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !inFlight.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /** Saves what is typed and resolves with the saved exercise. */
  const saveNow = useCallback(async () => {
    const saved = await send();
    return saved ?? (dirty.current ? null : latest.current);
  }, [send]);

  return { form, change, saveState, saveError, saveNow };
}
