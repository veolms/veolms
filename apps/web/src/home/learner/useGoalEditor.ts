import { useQueryClient } from "@tanstack/react-query";
import type { LearningSummaryResponse } from "@veolms/contracts";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  learningGoalKeys,
  useLearningGoalSettings,
  useUpdateLearningGoalSettings,
} from "../../services/learning-goals";
import { checkGoalInput, goalTextFromMinutes } from "./goalInput";

/**
 * The daily goal edited where it is shown (the laptop's screen, the phone's
 * card): one line of text ("45 min", "1.5 hr", "1h 30m", see `goalInput`),
 * saved with the tick that stands where the edit button was, or Enter. What
 * is wrong with the text is said once a save is tried, and from then on as
 * it is typed. Esc, or a press outside the field and the tick, leaves the
 * goal as it was. The goal is the same one Settings → Learning sets, so a save here is
 * what that page shows, and the other way round.
 *
 * A save sends the learner's whole goal settings (reminders included), so
 * they are read when the editor opens and the save waits for them.
 */
export function useGoalEditor(goalMinutes: number) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const formId = useId();
  const editorRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useLearningGoalSettings({ enabled: editing });
  const update = useUpdateLearningGoalSettings();
  const queryClient = useQueryClient();

  const check = checkGoalInput(value);
  const ready = Boolean(settings.data) && !update.isPending;

  const open = useCallback(() => {
    setValue(goalTextFromMinutes(goalMinutes));
    setTried(false);
    setSaveFailed(false);
    setEditing(true);
  }, [goalMinutes]);

  const close = useCallback(() => {
    setEditing(false);
    setSaveFailed(false);
  }, []);

  const save = () => {
    if (!check.ok) {
      setTried(true);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!settings.data || update.isPending) return;
    if (check.minutes === goalMinutes) {
      close();
      return;
    }
    setSaveFailed(false);
    update.mutate(
      { ...settings.data.settings, dailyGoalMinutes: check.minutes },
      {
        onSuccess: () => {
          // Shown at once; the summary the save refreshes agrees with it.
          queryClient.setQueryData<LearningSummaryResponse>(
            learningGoalKeys.summary(),
            (summary) =>
              summary
                ? { ...summary, dailyGoalMinutes: check.minutes }
                : summary,
          );
          close();
        },
        onError: () => setSaveFailed(true),
      },
    );
  };

  // A press anywhere outside the field and its tick leaves the goal as it
  // was.
  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (editorRef.current?.contains(target) ||
          saveRef.current?.contains(target))
      ) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, editing]);

  const problem = tried && !check.ok ? check.message : null;
  const message = problem
    ? problem
    : saveFailed
      ? "Couldn't save your goal. Try again."
      : settings.isError
        ? "Couldn't load your goal settings. Try again later."
        : null;

  return {
    editing,
    open,
    close,
    save,
    value,
    setValue,
    /** The tick waits for the settings a save sends, and for a save. */
    canSave: ready,
    saving: update.isPending,
    /** The text cannot be saved as it is: the field is ringed in red. */
    invalid: problem !== null,
    message,
    formId,
    editorRef,
    saveRef,
    inputRef,
  };
}

export type GoalEditor = ReturnType<typeof useGoalEditor>;
