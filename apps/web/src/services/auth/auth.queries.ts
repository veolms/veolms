import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AuthUser,
  AuthConfigResponse,
  CurrentUserResponse,
  PublicProfileResponse,
  SessionResponse,
  UserAvatarListResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { withOfflineFallback } from "../../lib/offline-data";
import { readSessionCache, writeSessionCache } from "../../lib/session-cache";
import { authStore } from "../../store/auth.store";
import { authKeys } from "./auth.keys";
import { authService } from "./auth.service";
import { resetRegisteredInteractionState } from "../learning-interactions/interaction-reset-registry";

export function currentUserQueryOptions(queryClient: QueryClient) {
  return {
    queryKey: authKeys.me(),
    queryFn: async (): Promise<CurrentUserResponse> => {
      const generation = authStore.getWriteGeneration();
      // Offline, a plugin that keeps downloads may know who was signed in.
      const profile = await withOfflineFallback(
        () => authService.getMe(),
        (offline) => offline.currentUser(),
      );

      if (generation !== authStore.getWriteGeneration()) {
        // A logout/login write happened while this request was in flight.
        // Never let the old response restore a signed-out (or previous)
        // account. The mutation that changed auth state owns the cache now.
        return (
          queryClient.getQueryData<CurrentUserResponse>(authKeys.me()) ?? null
        );
      }

      if (profile) {
        authStore.setUser(profile, { refresh: true });
      } else {
        authStore.clearAuth();
        queryClient.removeQueries({ queryKey: authKeys.avatars() });
        resetRegisteredInteractionState();
      }

      return profile;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    // Run once even when the browser reports no network, so the offline
    // fallback above can answer instead of the query waiting forever.
    networkMode: "offlineFirst" as const,
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

// The sign-in settings are the deployment's own (today, which Google client
// to use) and the same for every visitor, so a tab asks for them once.
const AUTH_CONFIG_SESSION_KEY = "veolms-auth-config:v1";
const AUTH_CONFIG_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function isAuthConfig(value: unknown): value is AuthConfigResponse {
  if (!value || typeof value !== "object") return false;
  const { googleClientId } = value as Record<string, unknown>;
  return googleClientId === undefined || typeof googleClientId === "string";
}

async function loadAuthConfig(): Promise<AuthConfigResponse> {
  const saved = readSessionCache(
    AUTH_CONFIG_SESSION_KEY,
    AUTH_CONFIG_SESSION_MAX_AGE_MS,
    isAuthConfig,
  );
  if (saved) return saved.value;
  const config = await authService.getAuthConfig();
  writeSessionCache(AUTH_CONFIG_SESSION_KEY, config);
  return config;
}

export function useAuthConfig() {
  return useQuery<AuthConfigResponse, ApiError>({
    queryKey: authKeys.config(),
    queryFn: loadAuthConfig,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
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
