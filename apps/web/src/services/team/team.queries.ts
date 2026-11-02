import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type {
  InvitationPreview,
  TeamInvitationListResponse,
  TeamMemberListResponse,
  TeamRoleListResponse,
  TeamUserSearchResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { teamKeys } from "./team.keys";
import { teamService } from "./team.service";

const PAGE_SIZE = 50;

export function useTeamRoles(options?: { enabled?: boolean }) {
  return useQuery<TeamRoleListResponse, ApiError>({
    queryKey: teamKeys.roles(),
    queryFn: () => teamService.listRoles(),
    enabled: options?.enabled ?? true,
  });
}

export function useTeamMembers(
  search: string,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery<TeamMemberListResponse, ApiError>({
    enabled: options?.enabled ?? true,
    queryKey: teamKeys.memberList(search),
    queryFn: ({ pageParam }) =>
      teamService.listMembers({
        limit: PAGE_SIZE,
        search: search || undefined,
        cursor: (pageParam as string | undefined) ?? undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useTeamUserSearch(q: string) {
  const term = q.trim();
  return useQuery<TeamUserSearchResponse, ApiError>({
    queryKey: teamKeys.userSearch(term),
    queryFn: () => teamService.searchUsers(term),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useTeamInvitations(
  status: string,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery<TeamInvitationListResponse, ApiError>({
    enabled: options?.enabled ?? true,
    queryKey: teamKeys.invitationList(status),
    queryFn: ({ pageParam }) =>
      teamService.listInvitations({
        limit: PAGE_SIZE,
        status: status as "all",
        cursor: (pageParam as string | undefined) ?? undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useInvitationPreview(token: string) {
  return useQuery<InvitationPreview, ApiError>({
    queryKey: teamKeys.invitationPreview(token),
    queryFn: () => teamService.previewInvitation(token),
    retry: false,
  });
}
