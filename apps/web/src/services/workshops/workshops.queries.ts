import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  WorkshopStandingsResponse,
  WorkshopCourseSectionsResponse,
  WorkshopRegistrantsResponse,
  WorkshopHomeCard,
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

/**
 * How often the page should refresh so the Join button appears on time:
 * every 30 s from an hour before a session until it ends, otherwise never.
 */
export function workshopRefetchInterval(
  sessions: { startsAt: string; endsAt: string }[],
  now = Date.now(),
): number | false {
  const HOUR = 60 * 60_000;
  const near = sessions.some((session) => {
    const starts = new Date(session.startsAt).getTime();
    const ends = new Date(session.endsAt).getTime();
    return now >= starts - HOUR && now <= ends;
  });
  return near ? 30_000 : false;
}

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
    refetchInterval: (query) =>
      workshopRefetchInterval(query.state.data?.sessions ?? []),
  });
}

/** The signed-in learner's standing; not asked while signed out. */
export function useWorkshopViewer(
  slug: string | null | undefined,
  options: { enabled: boolean; refetchInterval?: number | false },
) {
  return useQuery<WorkshopViewer, ApiError>({
    queryKey: workshopPublicKeys.viewer(slug ?? ""),
    queryFn: () => workshopsPublicService.viewer(slug!),
    enabled: Boolean(slug) && options.enabled,
    staleTime: 15 * 1000,
    refetchInterval: options.refetchInterval ?? false,
  });
}

export function useWorkshopRegistrants(
  workshopId: string | null | undefined,
  options: { page?: number; search?: string } = {},
) {
  const page = options.page ?? 1;
  const search = options.search?.trim() || undefined;
  return useQuery<WorkshopRegistrantsResponse, ApiError>({
    queryKey: [
      ...workshopKeys.registrants(workshopId ?? ""),
      { page, search: search ?? "" },
    ],
    queryFn: () =>
      workshopsService.listRegistrants(workshopId!, { page, search }),
    enabled: Boolean(workshopId),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}

/** The workshop the learner's home points at; null when nothing is upcoming. */
export function useWorkshopHomeCard(options: { enabled: boolean }) {
  return useQuery<WorkshopHomeCard | null, ApiError>({
    queryKey: workshopPublicKeys.home(),
    queryFn: () => workshopsPublicService.homeCard(),
    enabled: options.enabled,
    staleTime: 60 * 1000,
  });
}

/** A course workshop's course sections, for the recording lesson's picker. */
export function useWorkshopCourseSections(
  workshopId: string,
  options: { enabled: boolean },
) {
  return useQuery<WorkshopCourseSectionsResponse, ApiError>({
    queryKey: [...workshopKeys.all, "admin", "course-sections", workshopId],
    queryFn: () => workshopsService.courseSections(workshopId),
    enabled: options.enabled,
    staleTime: 60 * 1000,
  });
}

/** Whether the signed-in learner is in each listed workshop. */
export function useWorkshopStandings(options: { enabled: boolean }) {
  return useQuery<WorkshopStandingsResponse, ApiError>({
    queryKey: workshopPublicKeys.standings(),
    queryFn: () => workshopsPublicService.standings(),
    enabled: options.enabled,
    staleTime: 30 * 1000,
  });
}
