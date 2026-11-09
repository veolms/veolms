import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  WorkshopAdmin,
  WorkshopAdminListResponse,
  WorkshopAdminTab,
  WorkshopPublishCheck,
  WorkshopPublic,
  WorkshopPublicListResponse,
  WorkshopViewer,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { workshopKeys, workshopPublicKeys } from "./workshops.keys";
import { workshopsPublicService, workshopsService } from "./workshops.service";

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

// --- Learners ---

export function useWorkshopsPublic(options?: { enabled?: boolean }) {
  return useQuery<WorkshopPublicListResponse, ApiError>({
    queryKey: workshopPublicKeys.list(),
    queryFn: () => workshopsPublicService.list(),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useWorkshopPublic(slug: string | null | undefined) {
  return useQuery<WorkshopPublic, ApiError>({
    queryKey: workshopPublicKeys.detail(slug ?? ""),
    queryFn: () => workshopsPublicService.get(slug!),
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
  });
}

/** The signed-in learner's standing; not asked while signed out. */
export function useWorkshopViewer(
  slug: string | null | undefined,
  options: { enabled: boolean },
) {
  return useQuery<WorkshopViewer, ApiError>({
    queryKey: workshopPublicKeys.viewer(slug ?? ""),
    queryFn: () => workshopsPublicService.viewer(slug!),
    enabled: Boolean(slug) && options.enabled,
    staleTime: 15 * 1000,
  });
}
