import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type {
  AuthMessageResponse,
  CurrentUserResponse,
  EmailVerificationSendRequest,
  EmailVerificationVerifyRequest,
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegistrationOptionsResponse,
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
import { authStore } from "../../store/auth.store";
import { clearStoredProfilePreferences } from "../../settings/profilePreferences";
import { clearCoursePlayerSessions } from "../../learning/coursePlayerNavigation";
import { authKeys } from "./auth.keys";
import { authService, type TotpSetupResponse } from "./auth.service";
import { learningSpaceKeys } from "../learning-space";

function persistAuthenticatedSession(
  queryClient: QueryClient,
  data: LoginResponse,
) {
  const currentUser: NonNullable<CurrentUserResponse> = {
    id: data.user.id,
    username: data.user.username,
    displayName: data.user.displayName,
    avatarDataUrl: data.user.avatarDataUrl,
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
    permissions: data.user.permissions,
    menus: data.user.menus,
    mfaVerified: !data.mfaRequired,
    totpEnabled: data.totpEnabled,
    passkeyEnabled: data.passkeyEnabled,
    mfaMandatory: data.mfaMandatory,
  };

  // The legacy browser collection is not account-scoped. Clear it at the
  // account boundary so a prior account's fallback sessions cannot be
  // associated with the newly authenticated account.
  clearCoursePlayerSessions();
  authStore.setUser(data.user);
  queryClient.removeQueries({ queryKey: learningSpaceKeys.all });
  queryClient.setQueryData(authKeys.me(), currentUser);
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
      authStore.setUser(profile);
      queryClient.setQueryData(authKeys.me(), profile);
      // The PATCH response updates the UI immediately, but `/auth/me` remains
      // the canonical source after a reload. Re-fetch it here so visibility
      // flags and any server-side guards are reflected before the save settles.
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
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

export function useSetupTotp() {
  return useMutation<TotpSetupResponse, ApiError, void>({
    mutationFn: () => authService.setupTotp(),
  });
}

export function useEnableTotp() {
  const queryClient = useQueryClient();

  return useMutation<{ backupCodes: string[] }, ApiError, TotpEnableRequest>({
    mutationFn: (payload) => authService.enableTotp(payload),
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

export function usePasskeyRegisterVerify() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, { response: unknown }>({
    mutationFn: (payload) => authService.verifyPasskeyRegister(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
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
    onSuccess: () => {
      authStore.clearAuth();
      clearCoursePlayerSessions();
      clearStoredProfilePreferences();
      queryClient.setQueryData(authKeys.me(), null);
      queryClient.removeQueries({ queryKey: authKeys.me() });
      queryClient.removeQueries({ queryKey: learningSpaceKeys.all });
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useDeactivateAccount() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.deactivateAccount(),
    onSuccess: () => {
      authStore.clearAuth();
      clearCoursePlayerSessions();
      clearStoredProfilePreferences();

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

  const signOut = useCallback(() => {
    void logoutMutationRef.current
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => {
        // Redirect even when the API request cannot complete. This prevents a
        // stale authenticated shell from trapping the user in the workspace.
        clearStoredProfilePreferences();
        if (typeof window !== "undefined") window.location.href = "/";
      });
  }, []);

  return { isPending: logoutMutation.isPending, signOut };
}
