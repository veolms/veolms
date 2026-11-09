import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  WorkshopAdmin,
  WorkshopAdminListResponse,
  WorkshopAdminTab,
  WorkshopPublishCheck,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { workshopKeys } from "./workshops.keys";
import { workshopsService } from "./workshops.service";

export function useWorkshopsAdminList(options: {
  tab: WorkshopAdminTab;
  search?: string;
  enabled?: boolean;
}) {
  const search = options.search?.trim() || undefined;
  return useQuery<WorkshopAdminListResponse, ApiError>({
    queryKey: workshopKeys.adminList({
      tab: options.tab,
      ...(search ? { search } : {}),
    }),
    queryFn: () =>
      workshopsService.listAdmin({
        tab: options.tab,
        ...(search ? { search } : {}),
      }),
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
    // Switching tabs keeps the old rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

export function useWorkshopAdmin(workshopId: string | null | undefined) {
  return useQuery<WorkshopAdmin, ApiError>({
    queryKey: workshopKeys.adminDetail(workshopId ?? ""),
    queryFn: () => workshopsService.getAdmin(workshopId!),
    enabled: Boolean(workshopId),
  });
}

export function useWorkshopPublishCheck(
  workshopId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<WorkshopPublishCheck, ApiError>({
    queryKey: workshopKeys.publishCheck(workshopId ?? ""),
    queryFn: () => workshopsService.publishCheck(workshopId!),
    enabled: Boolean(workshopId) && (options?.enabled ?? true),
  });
}
