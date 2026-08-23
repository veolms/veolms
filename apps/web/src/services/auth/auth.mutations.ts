import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AuthMessageResponse,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  RegisterRequest,
  TotpEnableRequest,
  TotpVerifyRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authStore } from "../../store/auth.store";
import { clearStoredProfilePreferences } from "../../settings/profilePreferences";
import { authKeys } from "./auth.keys";
import { authService, type TotpSetupResponse } from "./auth.service";

export function useSendOtp() {
  return useMutation<AuthMessageResponse, ApiError, OtpSendRequest>({
    mutationFn: (payload) => authService.sendOtp(payload),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (payload) => authService.login(payload),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, RegisterRequest>({
    mutationFn: (payload) => authService.register(payload),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
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
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
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
  return useMutation<unknown, ApiError, void>({
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
  return useMutation<unknown, ApiError, void>({
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
      clearStoredProfilePreferences();
      queryClient.setQueryData(authKeys.me(), null);
      queryClient.removeQueries({ queryKey: authKeys.me() });
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
