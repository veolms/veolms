import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type {
  AuthMessageResponse,
  BackupCodesResponse,
  CurrentUserResponse,
  EmailVerificationSendRequest,
  EmailVerificationVerifyRequest,
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegisterVerifyResponse,
  PasskeyRegistrationOptionsResponse,
  GoogleOneTapLoginRequest,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  PhoneVerificationSendRequest,
  PhoneVerificationVerifyRequest,
  RegisterRequest,
  ProfileUpdateRequest,
  TotpEnableRequest,
  TotpVerifyRequest,
  UserProfileResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { autosyncManager } from "../../lib/autosync/manager";
import { authStore } from "../../store/auth.store";
import {
  endPendingMfaLogin,
  notePendingMfaLogin,
} from "../../store/pendingMfaLogin";
import { clearCoursePlayerSessions } from "../../learning/coursePlayerNavigation";
import { authKeys } from "./auth.keys";
import { updatePublicProfileCacheFromUser } from "./auth.queries";
import { authService, type TotpSetupResponse } from "./auth.service";
// Deliberately not the learning-interactions barrel: these two modules are
// dependency-light, while the barrel drags the optimistic cache coordinators
// into the startup bundle of every page.
import { learningInteractionKeys } from "../learning-interactions/learning-interactions.keys";
import { resetRegisteredInteractionState } from "../learning-interactions/interaction-reset-registry";

function persistAuthenticatedSession(
  queryClient: QueryClient,
  data: LoginResponse,
) {
  const currentUser: NonNullable<CurrentUserResponse> = {
    id: data.user.id,
    username: data.user.username,
    displayName: data.user.displayName,
    avatarDataUrl: data.user.avatarDataUrl,
    avatarSrcSet: data.user.avatarSrcSet,
    bio: data.user.bio,
    emailPublic: data.user.emailPublic,
    mobilePublic: data.user.mobilePublic,
    linkedinUrl: data.user.linkedinUrl,
    linkedinPublic: data.user.linkedinPublic,
    githubUrl: data.user.githubUrl,
    githubPublic: data.user.githubPublic,
    websiteUrl: data.user.websiteUrl,
    websitePublic: data.user.websitePublic,
    email: data.user.email,
    emailVerified: data.user.emailVerified,
    phoneNo: data.user.phoneNo,
    mobileVerified: data.user.mobileVerified,
    roles: data.user.roles,
    mfaVerified: !data.mfaRequired,
    totpEnabled: data.totpEnabled,
    passkeyEnabled: data.passkeyEnabled,
    mfaMandatory: data.mfaMandatory,
  };

  // The legacy browser collection is not account-scoped. Clear it at the
  // account boundary so a prior account's fallback sessions cannot be
  // associated with the newly authenticated account.
  clearCoursePlayerSessions();
  // A different account than the one last signed in on this page — after
  // a sign-out, or after its session simply expired. Whatever was cached
  // for the previous account (enrolments, orders, notifications) must not
  // be shown to this one while it is still considered fresh.
  const previousUserId = authStore.getLastSignedInUserId();
  if (previousUserId && previousUserId !== data.user.id) {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== authKeys.all[0],
    });
  }
  notePendingMfaLogin(data.mfaRequired);
  authStore.setUser(data.user);
  resetRegisteredInteractionState();
  queryClient.removeQueries({ queryKey: learningInteractionKeys.all });
  queryClient.removeQueries({ queryKey: authKeys.avatars() });
  queryClient.setQueryData(authKeys.me(), currentUser);
}

/** What the tab forgets when its session ends. */
function clearSignedOutState(queryClient: QueryClient) {
  authStore.clearAuth();
  resetRegisteredInteractionState();
  clearCoursePlayerSessions();
  queryClient.setQueryData(authKeys.me(), null);
  queryClient.removeQueries({ queryKey: authKeys.me() });
  queryClient.removeQueries({ queryKey: authKeys.avatars() });
  queryClient.removeQueries({ queryKey: learningInteractionKeys.all });
  queryClient.invalidateQueries({ queryKey: authKeys.me() });
}

let pendingLoginCancellation: Promise<void> | null = null;

/**
 * Calls off a sign-in that stopped at its second step: the session it
 * created is ended on the server and forgotten here, as if the sign-in had
 * never been started.
 *
 * The tab forgets the session at once, so whatever is on screen is a
 * signed-out page from this moment and no guard sends it back to the step.
 * The current user is set to "nobody" rather than dropped until the server
 * has answered: dropped, it would be asked for again, and the session is
 * still there to be found until the sign-out lands.
 *
 * Safe to call again while it is running: every caller gets the same run.
 */
export function cancelPendingLogin(queryClient: QueryClient): Promise<void> {
  pendingLoginCancellation ??= (async () => {
    authStore.clearAuth();
    queryClient.setQueryData(authKeys.me(), null);
    try {
      await authService.logout();
    } catch {
      // Unreachable or already ended. The tab stays signed out either way;
      // a session that did survive is met, and ended, on the next visit.
    } finally {
      // Only now is the sign-in forgotten as one that was walked away from.
      // Forgotten sooner, a guard that looks again before it has heard that
      // the session is gone would take this for a session it has to send to
      // the step.
      endPendingMfaLogin();
      clearSignedOutState(queryClient);
      pendingLoginCancellation = null;
    }
  })();
  return pendingLoginCancellation;
}

export function useSendOtp() {
  return useMutation<AuthMessageResponse, ApiError, OtpSendRequest>({
    mutationFn: (payload) => authService.sendOtp(payload),
  });
}

export function useSendPhoneVerificationOtp() {
  return useMutation<
    AuthMessageResponse,
    ApiError,
    PhoneVerificationSendRequest
  >({
    mutationFn: (payload) => authService.sendPhoneVerificationOtp(payload),
  });
}

export function useSendEmailVerificationOtp() {
  return useMutation<
    AuthMessageResponse,
    ApiError,
    EmailVerificationSendRequest
  >({
    mutationFn: (payload) => authService.sendEmailVerificationOtp(payload),
  });
}

export function useVerifyPhoneNumber() {
  const queryClient = useQueryClient();

  return useMutation<
    AuthMessageResponse,
    ApiError,
    PhoneVerificationVerifyRequest
  >({
    mutationFn: (payload) => authService.verifyPhoneNumber(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation<
    AuthMessageResponse,
    ApiError,
    EmailVerificationVerifyRequest
  >({
    mutationFn: (payload) => authService.verifyEmail(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (payload) => authService.login(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, RegisterRequest>({
    mutationFn: (payload) => authService.register(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UserProfileResponse, ApiError, ProfileUpdateRequest>({
    mutationFn: (payload) => authService.updateProfile(payload),
    onSuccess: async (profile) => {
      const previousUsername = queryClient.getQueryData<CurrentUserResponse>(
        authKeys.me(),
      )?.username;
      authStore.setUser(profile);
      queryClient.setQueryData(authKeys.me(), profile);
      updatePublicProfileCacheFromUser(queryClient, profile, previousUsername);
      queryClient.invalidateQueries({ queryKey: authKeys.avatars() });
      // The PATCH response updates the UI immediately, but `/auth/me` remains
      // the canonical source after a reload. Re-fetch it here so visibility
      // flags and any server-side guards are reflected before the save settles.
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useSelectAvatar() {
  const queryClient = useQueryClient();

  return useMutation<UserProfileResponse, ApiError, string>({
    mutationFn: (avatarId) => authService.selectAvatar(avatarId),
    onSuccess: (profile) => {
      const previousUsername = queryClient.getQueryData<CurrentUserResponse>(
        authKeys.me(),
      )?.username;
      authStore.setUser(profile);
      queryClient.setQueryData(authKeys.me(), profile);
      updatePublicProfileCacheFromUser(queryClient, profile, previousUsername);
      queryClient.invalidateQueries({ queryKey: authKeys.avatars() });
    },
  });
}

export function useOauthUrl() {
  return useMutation<OauthUrlResponse, ApiError, OauthUrlRequest>({
    mutationFn: (payload) => authService.getOauthUrl(payload),
  });
}

export function useOauthLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, OauthLoginRequest>({
    mutationFn: (payload) => authService.oauthLogin(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data);
    },
  });
}

export function useGoogleOneTapLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, GoogleOneTapLoginRequest>({
    mutationFn: (payload) => authService.googleOneTapLogin(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data);
    },
  });
}

export function useSetupTotp() {
  return useMutation<TotpSetupResponse, ApiError, void>({
    mutationFn: () => authService.setupTotp(),
  });
}

export function useEnableTotp() {
  return useMutation<{ backupCodes: string[] }, ApiError, TotpEnableRequest>({
    mutationFn: (payload) => authService.enableTotp(payload),
  });
}

export function useDisableTotp() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.disableTotp(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useDeletePasskeys() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.deletePasskeys(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useVerifyMfaTotp() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, TotpVerifyRequest>({
    mutationFn: (payload) => authService.verifyMfaTotp(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function usePasskeyRegisterOptions() {
  return useMutation<PasskeyRegistrationOptionsResponse, ApiError, void>({
    mutationFn: () => authService.getPasskeyRegisterOptions(),
  });
}

/**
 * `refreshSession: false` leaves the current user as it was. The sign-in
 * enrolment step needs that: the moment the account is seen to have its
 * factor, the route guard moves on from the step, and the backup codes this
 * call returned would never be shown. That caller refreshes once the codes
 * have been saved.
 */
export function usePasskeyRegisterVerify({
  refreshSession = true,
}: { refreshSession?: boolean } = {}) {
  const queryClient = useQueryClient();

  return useMutation<
    PasskeyRegisterVerifyResponse,
    ApiError,
    { response: unknown }
  >({
    mutationFn: (payload) => authService.verifyPasskeyRegister(payload),
    onSuccess: () => {
      if (!refreshSession) return;
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useRegenerateBackupCodes() {
  return useMutation<BackupCodesResponse, ApiError, void>({
    mutationFn: () => authService.regenerateBackupCodes(),
  });
}

export function usePasskeyLoginOptions() {
  return useMutation<PasskeyAuthenticationOptionsResponse, ApiError, void>({
    mutationFn: () => authService.getPasskeyLoginOptions(),
  });
}

export function usePasskeyLoginVerify() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, { response: unknown }>({
    mutationFn: (payload) => authService.verifyPasskeyLogin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, string>({
    mutationFn: (id) => authService.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useRevokeAllOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.revokeAllOtherSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.logout(),
    onSettled: () => clearSignedOutState(queryClient),
  });
}

export function useDeactivateAccount() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.deactivateAccount(),
    onSettled: () => {
      authStore.clearAuth();
      resetRegisteredInteractionState();
      clearCoursePlayerSessions();

      // A deactivated account must not leave protected data in the client
      // cache, especially if another account signs in in the same tab.
      queryClient.clear();
    },
  });
}

export function useSignOut() {
  const logoutMutation = useLogout();
  const logoutMutationRef = useRef(logoutMutation);
  logoutMutationRef.current = logoutMutation;

  const signOut = useCallback(async () => {
    try {
      await autosyncManager.requireSynced();
    } catch {
      // Autosync failed or timed out, proceed with logout so user is never trapped
    }
    await logoutMutationRef.current.mutateAsync().catch(() => undefined);
    authStore.clearAuth();
    clearCoursePlayerSessions();
    // Redirect even when the API request cannot complete. This prevents a
    // stale authenticated shell from trapping the user in the workspace.
    if (typeof window !== "undefined") window.location.href = "/";
  }, []);

  return { isPending: logoutMutation.isPending, signOut };
}
