import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  StorageLearnerResponse,
  StorageRequestResponse,
  StorageSettings,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { storageKeys } from "./storage.keys";
import { storageService } from "./storage.service";

export function useRequestMoreStorage() {
  const queryClient = useQueryClient();
  return useMutation<StorageRequestResponse, ApiError, { note?: string }>({
    mutationFn: (body) => storageService.requestMore(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageKeys.mine() }),
  });
}

export function useCancelStorageRequest() {
  const queryClient = useQueryClient();
  return useMutation<StorageRequestResponse, ApiError, void>({
    mutationFn: () => storageService.cancelRequest(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageKeys.mine() }),
  });
}

/** What an admin can do to one learner's space. */
export type StorageAdminAction =
  | {
      kind: "set_limit";
      userId: string;
      limitBytes: number | null;
      note?: string;
    }
  | { kind: "block"; userId: string; reason?: string }
  | { kind: "unblock"; userId: string }
  | { kind: "recount"; userId: string }
  | {
      kind: "approve";
      userId: string;
      requestId: string;
      limitBytes: number;
      note?: string;
    }
  | { kind: "decline"; userId: string; requestId: string; note?: string };

function run(action: StorageAdminAction): Promise<StorageLearnerResponse> {
  switch (action.kind) {
    case "set_limit":
      return storageService.setLimit(action.userId, {
        limitBytes: action.limitBytes,
        ...(action.note ? { note: action.note } : {}),
      });
    case "block":
      return storageService.block(action.userId, {
        ...(action.reason ? { reason: action.reason } : {}),
      });
    case "unblock":
      return storageService.unblock(action.userId);
    case "recount":
      return storageService.recount(action.userId);
    case "approve":
      return storageService.approve(action.requestId, {
        limitBytes: action.limitBytes,
        ...(action.note ? { note: action.note } : {}),
      });
    case "decline":
      return storageService.decline(action.requestId, {
        ...(action.note ? { note: action.note } : {}),
      });
  }
}

/** One mutation for every admin action; the lists and the learner refresh. */
export function useStorageAdminAction() {
  const queryClient = useQueryClient();
  return useMutation<StorageLearnerResponse, ApiError, StorageAdminAction>({
    mutationFn: run,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageKeys.admin() }),
  });
}

export function useUpdateStorageSettings() {
  const queryClient = useQueryClient();
  return useMutation<StorageSettings, ApiError, number>({
    mutationFn: (defaultLimitBytes) =>
      storageService.updateSettings({ defaultLimitBytes }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: storageKeys.all }),
  });
}
