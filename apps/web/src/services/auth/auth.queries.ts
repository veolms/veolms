import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AuthUser,
  CurrentUserResponse,
  PublicProfileResponse,
  SessionResponse,
  UserAvatarListResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authStore } from "../../store/auth.store";
import { authKeys } from "./auth.keys";
import { authService } from "./auth.service";
import { interactionCreationCoordinator } from "../learning-interactions/interaction-creation-coordinator";
import { desiredStateCoordinator } from "../learning-interactions/desired-state-coordinator";
import { optimisticDeletionCoordinator } from "../learning-interactions/optimistic-deletion-coordinator";

export function currentUserQueryOptions(queryClient: QueryClient) {
  return {
    queryKey: authKeys.me(),
    queryFn: async (): Promise<CurrentUserResponse> => {
      const generation = authStore.getWriteGeneration();
      const profile = await authService.getMe();

      if (generation !== authStore.getWriteGeneration()) {
        // A logout/login write happened while this request was in flight.
        // Never let the old response restore a signed-out (or previous)
        // account. The mutation that changed auth state owns the cache now.
        return (
          queryClient.getQueryData<CurrentUserResponse>(authKeys.me()) ?? null
        );
      }

      if (profile) {
        authStore.setUser(profile);
      } else {
        authStore.clearAuth();
        queryClient.removeQueries({ queryKey: authKeys.avatars() });
        desiredStateCoordinator.reset();
        interactionCreationCoordinator.reset();
        optimisticDeletionCoordinator.reset();
      }

      return profile;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  };
}

/** Keep cached public profile views in sync with the current user's saved profile. */
export function updatePublicProfileCacheFromUser(
  queryClient: QueryClient,
  user: AuthUser,
  previousUsername?: string | null,
) {
  const username = user.username.toLowerCase();
  const publicProfile: PublicProfileResponse = {
    username,
    displayName: user.displayName,
    avatarDataUrl: user.avatarDataUrl ?? null,
    avatarSrcSet: user.avatarSrcSet ?? [],
    bio: user.bio ?? null,
    email: user.emailPublic && user.emailVerified ? user.email : null,
    phoneNo: user.mobilePublic && user.mobileVerified ? user.phoneNo : null,
    linkedinUrl: user.linkedinPublic ? (user.linkedinUrl ?? null) : null,
    githubUrl: user.githubPublic ? (user.githubUrl ?? null) : null,
    websiteUrl: user.websitePublic ? (user.websiteUrl ?? null) : null,
  };

  const previous = previousUsername?.toLowerCase();
  if (previous && previous !== username) {
    queryClient.removeQueries({
      queryKey: authKeys.publicProfile(previous),
      exact: true,
    });
  }

  queryClient.setQueryData(authKeys.publicProfile(username), publicProfile);
  for (const [queryKey] of queryClient.getQueriesData({
    queryKey: authKeys.publicProfiles(),
  })) {
    const cachedUsername = queryKey[2];
    if (
      typeof cachedUsername === "string" &&
      cachedUsername.toLowerCase() === username
    ) {
      queryClient.setQueryData(queryKey, publicProfile);
    }
  }
}

export function useCurrentUser() {
  const queryClient = useQueryClient();

  return useQuery<CurrentUserResponse, ApiError>(
    currentUserQueryOptions(queryClient),
  );
}

export function usePublicProfile(username?: string) {
  return useQuery<PublicProfileResponse, ApiError>({
    queryKey: authKeys.publicProfile(username ?? ""),
    queryFn: () => authService.getPublicProfile(username!),
    enabled: Boolean(username),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSessions(options?: { enabled?: boolean }) {
  return useQuery<SessionResponse[], ApiError>({
    queryKey: authKeys.sessions(),
    queryFn: () => authService.getSessions(),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useUserAvatars(options?: { enabled?: boolean }) {
  return useQuery<UserAvatarListResponse, ApiError>({
    queryKey: authKeys.avatars(),
    queryFn: () => authService.getAvatars(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
