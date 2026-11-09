import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CancelWorkshopRequest,
  CreateWorkshopRequest,
  UpdateWorkshopRequest,
  WorkshopAdmin,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { workshopKeys } from "./workshops.keys";
import { workshopsService } from "./workshops.service";

function useRefreshWorkshops() {
  const queryClient = useQueryClient();
  return (workshop?: WorkshopAdmin) => {
    void queryClient.invalidateQueries({ queryKey: workshopKeys.adminLists() });
    if (workshop) {
      queryClient.setQueryData(workshopKeys.adminDetail(workshop.id), workshop);
      void queryClient.invalidateQueries({
        queryKey: workshopKeys.publishCheck(workshop.id),
      });
    }
  };
}

export function useCreateWorkshop() {
  const refresh = useRefreshWorkshops();
  return useMutation<WorkshopAdmin, ApiError, CreateWorkshopRequest>({
    mutationFn: (payload) => workshopsService.create(payload),
    onSuccess: (workshop) => refresh(workshop),
  });
}

export function useUpdateWorkshop() {
  const refresh = useRefreshWorkshops();
  return useMutation<
    WorkshopAdmin,
    ApiError,
    { workshopId: string; payload: UpdateWorkshopRequest }
  >({
    mutationFn: ({ workshopId, payload }) =>
      workshopsService.update(workshopId, payload),
    onSuccess: (workshop) => refresh(workshop),
  });
}

export function usePublishWorkshop() {
  const refresh = useRefreshWorkshops();
  return useMutation<WorkshopAdmin, ApiError, string>({
    mutationFn: (workshopId) => workshopsService.publish(workshopId),
    onSuccess: (workshop) => refresh(workshop),
  });
}

export function useUnpublishWorkshop() {
  const refresh = useRefreshWorkshops();
  return useMutation<WorkshopAdmin, ApiError, string>({
    mutationFn: (workshopId) => workshopsService.unpublish(workshopId),
    onSuccess: (workshop) => refresh(workshop),
  });
}

export function useCancelWorkshop() {
  const refresh = useRefreshWorkshops();
  return useMutation<
    WorkshopAdmin,
    ApiError,
    { workshopId: string; payload: CancelWorkshopRequest }
  >({
    mutationFn: ({ workshopId, payload }) =>
      workshopsService.cancel(workshopId, payload),
    onSuccess: (workshop) => refresh(workshop),
  });
}

export function useDeleteWorkshop() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: true }, ApiError, string>({
    mutationFn: (workshopId) => workshopsService.remove(workshopId),
    onSuccess: (_result, workshopId) => {
      void queryClient.invalidateQueries({
        queryKey: workshopKeys.adminLists(),
      });
      queryClient.removeQueries({
        queryKey: workshopKeys.adminDetail(workshopId),
      });
    },
  });
}
