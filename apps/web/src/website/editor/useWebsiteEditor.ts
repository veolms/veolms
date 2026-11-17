import type { SitePageResponse } from "@veolms/contracts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getApiError } from "../../lib/api-error";
import {
  usePublishWebsitePage,
  useSaveWebsiteDraft,
} from "../../services/website";
import {
  checkPage,
  historyReducer,
  type EditablePage,
  type PageEdit,
} from "./pageDocument";

const AUTOSAVE_DELAY_MS = 1200;

export type SaveState =
  | { kind: "saved" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "invalid"; problems: string[]; sectionIds: string[] }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export function saveStateLabel(state: SaveState): string {
  switch (state.kind) {
    case "saved":
      return "All changes saved";
    case "pending":
    case "saving":
      return "Saving…";
    case "invalid":
      return "Not saved: fix the marked section";
    case "conflict":
      return "Changed in another tab";
    case "error":
      return "Not saved";
  }
}

/**
 * The page being edited: its document with undo and redo, saved as a
 * draft a moment after each change (refused, not overwritten, when another
 * tab saved first), and published on request.
 */
export function useWebsiteEditor(initial: SitePageResponse) {
  const pageId = initial.page.id;
  const saveDraft = useSaveWebsiteDraft();
  const publishMutation = usePublishWebsitePage();

  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial.document,
    future: [],
    coalesce: null,
  });
  const [current, setCurrent] = useState<SitePageResponse>(initial);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved" });

  const latest = useRef<EditablePage>(initial.document);
  const baseUpdatedAt = useRef<string>(initial.draftUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  // The document last seen by the save effect: an effect that runs again
  // with the same document (React does that in development) saves nothing.
  const seen = useRef<EditablePage>(initial.document);

  /** Saves what is on screen now. True when the server has it. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) await inFlight.current;
    const checked = checkPage(latest.current);
    if (!checked.ok) {
      setSaveState({
        kind: "invalid",
        problems: checked.problems,
        sectionIds: checked.sectionIds,
      });
      return false;
    }
    setSaveState({ kind: "saving" });
    const run = (async () => {
      try {
        const saved = await saveDraft.mutateAsync({
          id: pageId,
          body: {
            document: checked.document,
            baseUpdatedAt: baseUpdatedAt.current,
          },
        });
        baseUpdatedAt.current = saved.draftUpdatedAt;
        setCurrent(saved);
        setSaveState(timer.current ? { kind: "pending" } : { kind: "saved" });
        return true;
      } catch (failure) {
        const error = getApiError(failure);
        setSaveState(
          error.status === 409
            ? { kind: "conflict" }
            : { kind: "error", message: error.message },
        );
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return await run;
  }, [pageId, saveDraft]);

  // Every change (an edit, an undo, a redo) is saved shortly after.
  useEffect(() => {
    latest.current = history.present;
    if (seen.current === history.present) return;
    seen.current = history.present;
    if (timer.current) clearTimeout(timer.current);
    setSaveState((state) =>
      state.kind === "conflict" ? state : { kind: "pending" },
    );
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveNow();
    }, AUTOSAVE_DELAY_MS);
  }, [history.present, saveNow]);

  // Save what's left when leaving the editor.
  useEffect(
    () => () => {
      if (timer.current) void saveNow();
    },
    [saveNow],
  );

  const edit = useCallback(
    (change: PageEdit) =>
      dispatch({ type: "edit", edit: change, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  const publish = useCallback(async (): Promise<string | null> => {
    if (saveState.kind !== "saved" && !(await saveNow())) {
      return "Fix what isn’t saved, then publish.";
    }
    try {
      const published = await publishMutation.mutateAsync(pageId);
      setCurrent(published);
      baseUpdatedAt.current = published.draftUpdatedAt;
      return null;
    } catch (failure) {
      return getApiError(failure).message;
    }
  }, [pageId, publishMutation, saveNow, saveState.kind]);

  return {
    page: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    edit,
    undo,
    redo,
    current,
    setCurrent,
    saveState,
    publish,
    publishing: publishMutation.isPending,
  };
}
