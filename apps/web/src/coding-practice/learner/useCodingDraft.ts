import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodingFile, CodingLesson } from "@veolms/contracts";
import { codingPracticeService } from "../../services/coding-practice";
import { readDeviceDraft, writeDeviceDraft } from "./deviceStore";

const DEVICE_SAVE_DELAY_MS = 400;

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
 * starter. Every change is kept on the device; the server gets it when the
 * learner leaves the lesson or the page goes to the background (one save
 * per visit, not per keystroke).
 */
export function useCodingDraft(lesson: CodingLesson) {
  const assignmentId = lesson.assignment.id;
  const versionId = lesson.exercise.versionId;
  const starter = lesson.exercise.starterFiles;

  const initial = useMemo(() => {
    const device = readDeviceDraft(assignmentId);
    const server = lesson.draft;
    const deviceAt = device?.savedAt ?? 0;
    const serverAt = server ? Date.parse(server.updatedAt) : 0;
    const chosen =
      device && deviceAt >= serverAt
        ? { versionId: device.versionId, files: device.files }
        : server
          ? { versionId: server.versionId, files: server.files }
          : null;
    return {
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
  const [fromOlderVersion, setFromOlderVersion] = useState(
    initial.fromOlderVersion,
  );
  const filesRef = useRef(files);
  filesRef.current = files;
  const serverSnapshot = useRef(initial.serverSnapshot);

  // Kept on the device a moment after every change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeDeviceDraft(assignmentId, {
        versionId,
        files: editableOnly(files),
        savedAt: Date.now(),
      });
    }, DEVICE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [assignmentId, versionId, files]);

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

  const updateFile = useCallback((path: string, content: string) => {
    setFiles((current) =>
      current.map((file) =>
        file.path === path && !file.readOnly ? { ...file, content } : file,
      ),
    );
  }, []);

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
    },
    [],
  );

  return {
    files,
    updateFile,
    replaceFiles,
    resetToStarter,
    markSaved,
    fromOlderVersion,
    dismissOlderVersion: () => setFromOlderVersion(false),
  };
}
