import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodingFile, CodingLesson } from "@veolms/contracts";
import { codingPracticeService } from "../../services/coding-practice";
import { readDeviceDraft, writeDeviceDraft } from "./deviceStore";
import type { ActiveTime } from "./useActiveTime";
import type { SaveStatus } from "./WorkspaceHeaderParts";

const DEVICE_SAVE_DELAY_MS = 400;
/** The server gets the code this long after typing stops. */
const SERVER_SAVE_DELAY_MS = 4_000;

/** Saved content laid over the starter: read-only files always the starter's. */
export function overlayFiles(
  starter: CodingFile[],
  saved: { path: string; content: string }[] | undefined,
): CodingFile[] {
  return starter.map((file) => {
    if (file.readOnly) return file;
    const match = saved?.find((item) => item.path === file.path);
    return match ? { ...file, content: match.content } : file;
  });
}

export function editableOnly(files: CodingFile[]) {
  return files
    .filter((file) => !file.readOnly)
    .map((file) => ({ path: file.path, content: file.content }));
}

/**
 * The learner's code for a lesson. Starts from the newest of: the code on
 * this device, the server's copy (another device, the last submit), the
 * starter. Every change is kept on the device at once, and on the server a
 * few seconds after typing stops and when the learner leaves the lesson or
 * the page goes to the background.
 *
 * Which copy is newer is judged on the server's clock: the device copy
 * wins unless the server's changed after this device last had it (another
 * device, a submit). Comparing the device's own clock with the server's
 * could hand back older code on a device whose clock runs behind.
 */
export function useCodingDraft(lesson: CodingLesson, activeTime?: ActiveTime) {
  const assignmentId = lesson.assignment.id;
  const versionId = lesson.exercise.versionId;
  const starter = lesson.exercise.starterFiles;

  const initial = useMemo(() => {
    const device = readDeviceDraft(assignmentId);
    const server = lesson.draft;
    const serverAt = server ? Date.parse(server.updatedAt) || 0 : 0;
    const deviceWins =
      device !== null &&
      (!server ||
        (device.serverAt !== undefined
          ? serverAt <= device.serverAt
          : device.savedAt >= serverAt));
    const chosen = deviceWins
      ? { versionId: device.versionId, files: device.files }
      : server
        ? { versionId: server.versionId, files: server.files }
        : null;
    return {
      serverAt: Math.max(serverAt, deviceWins ? (device.serverAt ?? 0) : 0),
      files: overlayFiles(starter, chosen?.files),
      fromOlderVersion: Boolean(chosen && chosen.versionId !== versionId),
      serverSnapshot: server
        ? JSON.stringify(editableOnly(overlayFiles(starter, server.files)))
        : JSON.stringify(editableOnly(starter)),
    };
    // Read once when the lesson's exercise is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, versionId]);

  const [files, setFiles] = useState<CodingFile[]>(initial.files);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const activeRef = useRef(activeTime);
  activeRef.current = activeTime;
  const [fromOlderVersion, setFromOlderVersion] = useState(
    initial.fromOlderVersion,
  );
  const filesRef = useRef(files);
  filesRef.current = files;
  const serverSnapshot = useRef(initial.serverSnapshot);
  /** The server's copy as this device last had it (server clock). */
  const serverAt = useRef(initial.serverAt);

  const keepOnDevice = useCallback(
    (current: CodingFile[]) =>
      writeDeviceDraft(assignmentId, {
        versionId,
        files: editableOnly(current),
        savedAt: Date.now(),
        serverAt: serverAt.current || undefined,
      }),
    [assignmentId, versionId],
  );

  // Kept on the device a moment after every change.
  useEffect(() => {
    const timer = window.setTimeout(
      () => keepOnDevice(files),
      DEVICE_SAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [keepOnDevice, files]);

  // And on the server a few seconds after typing stops, so another device,
  // or this one after its storage was cleared, finds it too.
  const saving = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = editableOnly(filesRef.current);
      const text = JSON.stringify(current);
      if (saving.current) return;
      if (text === serverSnapshot.current) {
        setSaveStatus((status) => (status === "unsaved" ? "saved" : status));
        return;
      }
      saving.current = true;
      setSaveStatus("saving");
      const activeSeconds = activeRef.current?.take() ?? 0;
      codingPracticeService
        .saveDraft(assignmentId, {
          versionId,
          files: current,
          ...(activeSeconds ? { activeSeconds } : {}),
        })
        .then(({ savedAt }) => {
          serverSnapshot.current = text;
          serverAt.current = Date.parse(savedAt) || serverAt.current;
          keepOnDevice(filesRef.current);
          setSaveStatus(
            JSON.stringify(editableOnly(filesRef.current)) === text
              ? "saved"
              : "unsaved",
          );
        })
        .catch(() => {
          // Offline or refused: the device keeps it; the next pause or
          // leaving the lesson tries again.
          activeRef.current?.giveBack(activeSeconds);
          setSaveStatus("offline");
        })
        .finally(() => {
          saving.current = false;
        });
    }, SERVER_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [assignmentId, versionId, files, keepOnDevice]);

  const flushToServer = useCallback(() => {
    const current = JSON.stringify(editableOnly(filesRef.current));
    if (current === serverSnapshot.current) return;
    serverSnapshot.current = current;
    codingPracticeService.saveDraftOnLeave(assignmentId, {
      versionId,
      files: editableOnly(filesRef.current),
    });
  }, [assignmentId, versionId]);

  // Leaving the lesson, closing the tab, or switching apps on a phone.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushToServer();
    };
    window.addEventListener("pagehide", flushToServer);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushToServer);
      document.removeEventListener("visibilitychange", onHidden);
      flushToServer();
    };
  }, [flushToServer]);

  // The ref moves with every keystroke, before React re-renders: Run or
  // Submit pressed in the same moment as an edit (Ctrl+Enter right after a
  // paste) must still see that edit.
  const updateFile = useCallback((path: string, content: string) => {
    const next = filesRef.current.map((file) =>
      file.path === path && !file.readOnly ? { ...file, content } : file,
    );
    filesRef.current = next;
    setFiles(next);
    setSaveStatus((status) => (status === "offline" ? status : "unsaved"));
  }, []);

  /** The files as they are now, edits not yet rendered included. */
  const latestFiles = useCallback(() => filesRef.current, []);

  const replaceFiles = useCallback(
    (saved: { path: string; content: string }[]) => {
      setFiles(overlayFiles(starter, saved));
      setFromOlderVersion(false);
    },
    [starter],
  );

  const resetToStarter = useCallback(() => {
    setFiles(starter);
    setFromOlderVersion(false);
  }, [starter]);

  /** The server has this code now (it was just submitted). */
  const markSaved = useCallback(
    (saved: { path: string; content: string }[]) => {
      serverSnapshot.current = JSON.stringify(saved);
      setSaveStatus("saved");
    },
    [],
  );

  return {
    files,
    latestFiles,
    updateFile,
    replaceFiles,
    resetToStarter,
    markSaved,
    saveStatus,
    fromOlderVersion,
    dismissOlderVersion: () => setFromOlderVersion(false),
  };
}
