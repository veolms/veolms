import {
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseIncludeItem,
  UpdateCourseSettingsRequest,
  CreateCourseIncludeRequest,
  UpdateCourseIncludeRequest,
  ReorderCourseIncludesRequest,
} from "@veolms/contracts";
import { type ExtrasFormState, normalizeExtrasState } from "../extrasState";
import { setCustomDragImage, inclusionGhostHtml } from "../dragGhosts";
import type { ExtrasState } from "../editorLocalTypes";
import type { ApiError } from "../../../lib/api-error";

export interface UseExtrasHandlersArgs {
  currentCourseId: string | null;
  isReorderingIncludes: boolean;
  setIsReorderingIncludes: Dispatch<SetStateAction<boolean>>;
  upsertSettingsMutation: UseMutationResult<
    {
      id: string;
      allowQa: boolean;
      allowComments: boolean;
      allowDownloads: boolean;
      allowNotes: boolean;
      certificateEnabled: boolean;
      showInstructorName: boolean;
      language: string;
      estimatedDuration?: number | null | undefined;
    },
    ApiError,
    { courseId: string; payload: UpdateCourseSettingsRequest },
    unknown
  >;
  createIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    { courseId: string; payload: CreateCourseIncludeRequest },
    unknown
  >;
  updateIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    {
      courseId: string;
      includeId: string;
      payload: UpdateCourseIncludeRequest;
    },
    unknown
  >;
  deleteIncludeMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; includeId: string },
    unknown
  >;
  reorderIncludesMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderCourseIncludesRequest },
    unknown
  >;
  isExtrasSaving: boolean;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setServerExtras: Dispatch<SetStateAction<ExtrasFormState>>;
  serverIncludes: { id: string; text: string; position: number }[];
  setServerIncludes: Dispatch<
    SetStateAction<{ id: string; text: string; position: number }[]>
  >;
  setManualIncludesDraft: Dispatch<
    SetStateAction<{ id: string; text: string; isPendingCreation?: boolean }[]>
  >;
  manualIncludesDraftRef: RefObject<
    { id: string; text: string; isPendingCreation?: boolean }[]
  >;
  dragInitialIncludesStateRef: RefObject<{
    includeIds: string[];
    previousIncludes: Array<{
      id: string;
      text: string;
      isPendingCreation?: boolean;
    }>;
  } | null>;
  deletingIncludeIdsRef: RefObject<Set<string>>;
  setDeletingIncludeIds: Dispatch<SetStateAction<Set<string>>>;
  savingIncludeIdsRef: RefObject<Set<string>>;
  setSavingIncludeIds: Dispatch<SetStateAction<Set<string>>>;
  setIsSavingCertificate: Dispatch<SetStateAction<boolean>>;
  isSavingCertificateRef: RefObject<boolean>;
  clearExtrasControlStatus: (controlKey: string) => void;
  markExtrasControlSaved: (controlKey: string) => void;
  markExtrasControlFailed: (controlKey: string) => void;
  extras: ExtrasState;
  setExtras: Dispatch<SetStateAction<ExtrasState>>;
}

export interface UseExtrasHandlersResult {
  dragEnabledInclusionId: string | null;
  setDragEnabledInclusionId: Dispatch<SetStateAction<string | null>>;
  focusedInclusionId: string | null;
  setFocusedInclusionId: Dispatch<SetStateAction<string | null>>;
  handleAddManualInclusion: (customText?: string) => Promise<void>;
  handleUpdateManualInclusionText: (id: string, text: string) => void;
  handleManualInclusionBlur: (id: string) => Promise<void>;
  handleDeleteManualInclusion: (id: string) => Promise<void>;
  handleInclusionDragStart: (
    e: React.DragEvent,
    index: number,
    text: string,
  ) => void;
  handleInclusionDragOver: (e: React.DragEvent, index: number) => void;
  handleInclusionDragEnd: () => Promise<void>;
  handleToggleCertificate: () => Promise<void>;
  handleCertificateTemplateChange: (template: string) => void;
  handleToggleAutoEmailCertificate: () => void;
}

export function useExtrasHandlers({
  currentCourseId,
  isReorderingIncludes,
  setIsReorderingIncludes,
  upsertSettingsMutation,
  createIncludeMutation,
  updateIncludeMutation,
  deleteIncludeMutation,
  reorderIncludesMutation,
  isExtrasSaving,
  setToastMessage,
  setServerExtras,
  serverIncludes,
  setServerIncludes,
  setManualIncludesDraft,
  manualIncludesDraftRef,
  dragInitialIncludesStateRef,
  deletingIncludeIdsRef,
  setDeletingIncludeIds,
  savingIncludeIdsRef,
  setSavingIncludeIds,
  setIsSavingCertificate,
  isSavingCertificateRef,
  clearExtrasControlStatus,
  markExtrasControlSaved,
  markExtrasControlFailed,
  extras,
  setExtras,
}: UseExtrasHandlersArgs): UseExtrasHandlersResult {
  // Extras Inclusions Handlers
  const [draggedInclusionIndex, setDraggedInclusionIndex] = useState<
    number | null
  >(null);
  const [dragEnabledInclusionId, setDragEnabledInclusionId] = useState<
    string | null
  >(null);
  const [focusedInclusionId, setFocusedInclusionId] = useState<string | null>(
    null,
  );

  const handleAddManualInclusion = async (customText?: string) => {
    if (manualIncludesDraftRef.current.length >= 6) return;
    const defaultText =
      customText?.trim().slice(0, 25) ||
      `Benefit ${manualIncludesDraftRef.current.length + 1}`.slice(0, 25);
    const tempId = `temp-inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Immediately append temporary pending inclusion
    setManualIncludesDraft((prev) => {
      if (prev.length >= 6) return prev;
      return [
        ...prev,
        {
          id: tempId,
          text: defaultText,
          isPendingCreation: true,
        },
      ];
    });
    setFocusedInclusionId(tempId);

    // 2. Ensure course ID exists
    let targetCourseId = currentCourseId;
    if (!targetCourseId) {
      setManualIncludesDraft((prev) =>
        prev.filter((item) => item.id !== tempId),
      );
      setToastMessage("Please enter a course title on the Basics tab first.");
      return;
    }

    // 3. Immediately trigger create mutation
    try {
      const created = await createIncludeMutation.mutateAsync({
        courseId: targetCourseId,
        payload: { text: defaultText },
      });

      // 4. On success: replace tempId with real server UUID and clear isPendingCreation
      setManualIncludesDraft((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                text: item.text,
                isPendingCreation: false,
              }
            : item,
        ),
      );

      // Keep serverIncludes baseline in sync so existing saveExtrasStep does not duplicate it
      setServerIncludes((prev) => {
        if (prev.some((s) => s.id === created.id)) return prev;
        return [...prev, created];
      });
      markExtrasControlSaved(created.id);
      markExtrasControlSaved("inclusions");
    } catch (err: unknown) {
      // 5. On failure: remove ONLY this failed temporary inclusion
      setManualIncludesDraft((prev) =>
        prev.filter((item) => item.id !== tempId),
      );
      markExtrasControlFailed("inclusions");
      const errorMsg =
        (err as { message?: string })?.message || "Failed to add inclusion.";
      setToastMessage(errorMsg);
    }
  };

  const handleUpdateManualInclusionText = (id: string, text: string) => {
    clearExtrasControlStatus(id);
    clearExtrasControlStatus("inclusions");
    const truncated = text.slice(0, 25);
    setManualIncludesDraft((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, text: truncated } : item,
      ),
    );
  };

  const handleManualInclusionBlur = async (id: string) => {
    setFocusedInclusionId(null);

    if (
      savingIncludeIdsRef.current.has(id) ||
      deletingIncludeIdsRef.current.has(id)
    ) {
      return;
    }

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!currentCourseId || !UUID_REGEX.test(id)) {
      return;
    }

    const currentItem = manualIncludesDraftRef.current.find((i) => i.id === id);
    if (!currentItem || currentItem.isPendingCreation) {
      return;
    }

    const serverItem = serverIncludes.find((s) => s.id === id);
    if (!serverItem) {
      return;
    }

    const trimmed = currentItem.text.trim();

    // Empty text handling: revert to server-confirmed value because backend schema requires min(1)
    if (!trimmed) {
      setManualIncludesDraft((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        ),
      );
      return;
    }

    // Clean blur: if trimmed matches server baseline, nothing to persist
    if (trimmed === serverItem.text.trim()) {
      if (trimmed !== currentItem.text) {
        setManualIncludesDraft((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, text: trimmed } : item,
          ),
        );
      }
      return;
    }

    // Normalize draft to trimmed before persisting
    setManualIncludesDraft((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
    );

    savingIncludeIdsRef.current.add(id);
    setSavingIncludeIds(new Set(savingIncludeIdsRef.current));

    try {
      const updated = await updateIncludeMutation.mutateAsync({
        courseId: currentCourseId,
        includeId: id,
        payload: { text: trimmed },
      });

      // Update serverIncludes baseline so saveExtrasStep does not duplicate it
      setServerIncludes((prev) => prev.map((s) => (s.id === id ? updated : s)));
      markExtrasControlSaved(id);
      markExtrasControlSaved("inclusions");
    } catch (err: unknown) {
      markExtrasControlFailed(id);
      markExtrasControlFailed("inclusions");
      // Revert on failure to the last confirmed server value
      setManualIncludesDraft((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        ),
      );
      const errorMsg =
        (err as { message?: string })?.message || "Failed to update inclusion.";
      setToastMessage(errorMsg);
    } finally {
      savingIncludeIdsRef.current.delete(id);
      setSavingIncludeIds(new Set(savingIncludeIdsRef.current));
    }
  };

  const handleDeleteManualInclusion = async (id: string) => {
    if (deletingIncludeIdsRef.current.has(id)) return;

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // If it is not a real server UUID (e.g. client-only temp item) or no course ID, remove locally
    if (!currentCourseId || !UUID_REGEX.test(id)) {
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== id));
      clearExtrasControlStatus(id);
      if (focusedInclusionId === id) {
        setFocusedInclusionId(null);
      }
      if (dragEnabledInclusionId === id) {
        setDragEnabledInclusionId(null);
      }
      return;
    }

    deletingIncludeIdsRef.current.add(id);
    setDeletingIncludeIds(new Set(deletingIncludeIdsRef.current));

    try {
      await deleteIncludeMutation.mutateAsync({
        courseId: currentCourseId,
        includeId: id,
      });

      // On success: remove only this inclusion from draft and server baseline
      setManualIncludesDraft((prev) => prev.filter((item) => item.id !== id));
      setServerIncludes((prev) => prev.filter((s) => s.id !== id));
      clearExtrasControlStatus(id);
      markExtrasControlSaved("inclusions");
      if (focusedInclusionId === id) {
        setFocusedInclusionId(null);
      }
      if (dragEnabledInclusionId === id) {
        setDragEnabledInclusionId(null);
      }
    } catch (err: unknown) {
      markExtrasControlFailed(id);
      markExtrasControlFailed("inclusions");
      // On failure: keep inclusion visible and show error toast
      const errorMsg =
        (err as { message?: string })?.message || "Failed to delete inclusion.";
      setToastMessage(errorMsg);
    } finally {
      deletingIncludeIdsRef.current.delete(id);
      setDeletingIncludeIds(new Set(deletingIncludeIdsRef.current));
    }
  };

  const handleInclusionDragStart = (
    e: React.DragEvent,
    index: number,
    text: string,
  ) => {
    if (
      isReorderingIncludes ||
      reorderIncludesMutation.isPending ||
      isExtrasSaving
    ) {
      e.preventDefault();
      return;
    }
    dragInitialIncludesStateRef.current = {
      includeIds: manualIncludesDraftRef.current.map((i) => i.id),
      previousIncludes: structuredClone(manualIncludesDraftRef.current),
    };
    setDraggedInclusionIndex(index);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      inclusionGhostHtml(text),
    );
  };

  const handleInclusionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInclusionIndex === null || draggedInclusionIndex === index)
      return;
    setManualIncludesDraft((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedInclusionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return copy;
    });
    setDraggedInclusionIndex(index);
  };

  const handleInclusionDragEnd = async () => {
    const initial = dragInitialIncludesStateRef.current;
    setDraggedInclusionIndex(null);
    setDragEnabledInclusionId(null);
    dragInitialIncludesStateRef.current = null;

    if (!initial) return;

    const initialIds = initial.includeIds;
    const currentIncludes = manualIncludesDraftRef.current;
    const currentIds = currentIncludes.map((i) => i.id);

    // Check if order actually changed
    const orderChanged =
      initialIds.length === currentIds.length &&
      initialIds.some((id, idx) => id !== currentIds[idx]);

    if (!orderChanged) return;

    if (currentCourseId) {
      // Validate if all IDs are valid persisted UUIDs
      const allValidUuids = currentIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
      );

      if (allValidUuids && serverIncludes.length === currentIds.length) {
        setIsReorderingIncludes(true);
        try {
          await reorderIncludesMutation.mutateAsync({
            courseId: currentCourseId,
            payload: {
              orderedIds: currentIds,
            },
          });
          const reorderedServer = currentIds
            .map((id) => serverIncludes.find((s) => s.id === id))
            .filter(Boolean) as CourseIncludeItem[];
          setServerIncludes(reorderedServer);
          markExtrasControlSaved("inclusions");
        } catch (err: unknown) {
          markExtrasControlFailed("inclusions");
          // Rollback to previous order on failure
          setManualIncludesDraft(initial.previousIncludes);
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save inclusion order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setIsReorderingIncludes(false);
        }
      }
    }
  };

  // Certificate Handlers
  const handleToggleCertificate = async () => {
    if (isSavingCertificateRef.current) return;

    clearExtrasControlStatus("enableCertificate");
    const previousValue = extras.enableCertificate;
    const nextValue = !previousValue;

    // 1. Optimistic update
    setExtras((prev) => ({
      ...prev,
      enableCertificate: nextValue,
    }));

    isSavingCertificateRef.current = true;
    setIsSavingCertificate(true);

    try {
      // 2. Ensure course ID exists
      let targetCourseId = currentCourseId;
      if (!targetCourseId) {
        throw new Error(
          "Course draft must be created before enabling certificates. Please enter a course title first.",
        );
      }

      // 3. Directly call existing settings mutation
      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          certificateEnabled: nextValue,
        },
      });

      // 4. Update serverExtras baseline
      const confirmedCertificate = res.certificateEnabled ?? nextValue;
      const newBaseline = normalizeExtrasState({
        enableCertificate: confirmedCertificate,
      });
      setServerExtras(newBaseline);
      setExtras((prev) => ({
        ...prev,
        enableCertificate: newBaseline.enableCertificate,
      }));
      markExtrasControlSaved("enableCertificate");
    } catch (err: unknown) {
      markExtrasControlFailed("enableCertificate");
      // 5. Rollback on failure
      setExtras((prev) => ({
        ...prev,
        enableCertificate: previousValue,
      }));
      const errorMsg =
        (err as { message?: string })?.message ||
        "Failed to update certificate setting.";
      setToastMessage(errorMsg);
    } finally {
      isSavingCertificateRef.current = false;
      setIsSavingCertificate(false);
    }
  };

  const handleCertificateTemplateChange = (template: string) => {
    setExtras((prev) => ({ ...prev, certificateTemplate: template }));
  };

  const handleToggleAutoEmailCertificate = () => {
    setExtras((prev) => ({
      ...prev,
      autoEmailCertificate: !prev.autoEmailCertificate,
    }));
  };
  return {
    dragEnabledInclusionId,
    setDragEnabledInclusionId,
    focusedInclusionId,
    setFocusedInclusionId,
    handleAddManualInclusion,
    handleUpdateManualInclusionText,
    handleManualInclusionBlur,
    handleDeleteManualInclusion,
    handleInclusionDragStart,
    handleInclusionDragOver,
    handleInclusionDragEnd,
    handleToggleCertificate,
    handleCertificateTemplateChange,
    handleToggleAutoEmailCertificate,
  };
}
