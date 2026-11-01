import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";
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
  OtpSendResponse,
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
import { writeSessionPresence } from "../../store/sessionPresence";
import {
  endPendingMfaLogin,
  notePendingMfaLogin,
} from "../../store/pendingMfaLogin";
import { clearCoursePlayerSessions } from "../../learning/coursePlayerNavigation";
import { forgetAccountBrowserState } from "../../store/accountBrowserState";
import { authKeys } from "./auth.keys";
import { updatePublicProfileCacheFromUser } from "./auth.queries";
import { authService, type TotpSetupResponse } from "./auth.service";
// Deliberately not the learning-interactions barrel: these two modules are
// dependency-light, while the barrel drags the optimistic cache coordinators
// into the startup bundle of every page.
import { courseKeys } from "../courses/courses.keys";
import { learningInteractionKeys } from "../learning-interactions/learning-interactions.keys";
import { resetRegisteredInteractionState } from "../learning-interactions/interaction-reset-registry";
import { trackAnalyticsEvent } from "../../lib/analytics-track";

function persistAuthenticatedSession(
  queryClient: QueryClient,
  data: LoginResponse,
  method: "otp" | "google" | "oauth",
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
    isTestAccount: data.user.isTestAccount,
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
  signedOutHere = false;
  notePendingMfaLogin(data.mfaRequired);
  authStore.setUser(data.user);
  resetRegisteredInteractionState();
  queryClient.removeQueries({ queryKey: learningInteractionKeys.all });
  queryClient.removeQueries({ queryKey: authKeys.avatars() });
  // A course overview says more to a learner who has the course than to a
  // visitor (the names of its lesson files). One fetched before signing in
  // is the visitor's.
  void queryClient.invalidateQueries({ queryKey: courseKeys.overviews() });
  queryClient.setQueryData(authKeys.me(), currentUser);
  // A sign-in still owing its second step is not complete yet.
  if (!data.mfaRequired) {
    trackAnalyticsEvent("login_completed", { props: { method } });
  }
}

/**
 * What the tab forgets when its session ends.
 *
 * `sessionEnded` says whether the server confirmed it: the sign-out request
 * itself succeeded. Then "nobody is signed in" is a fact and is kept as the
 * answer; dropping it had every mounted reader ask `/auth/me` once more,
 * only to be told the same. When the request failed the session may still
 * be alive, so the answer is dropped and asked for again: that is how the
 * tab notices a session the sign-out did not end.
 */
function clearSignedOutState(queryClient: QueryClient, sessionEnded: boolean) {
  authStore.clearAuth();
  resetRegisteredInteractionState();
  clearCoursePlayerSessions();
  // `clearAuth` above already does this for a tab it knew was signed in.
  // Signing out says so outright, so it does not depend on that.
  forgetAccountBrowserState();
  queryClient.setQueryData(authKeys.me(), null);
  if (!sessionEnded) queryClient.removeQueries({ queryKey: authKeys.me() });
  queryClient.removeQueries({ queryKey: authKeys.avatars() });
  queryClient.removeQueries({ queryKey: learningInteractionKeys.all });
  if (!sessionEnded) {
    queryClient.invalidateQueries({ queryKey: authKeys.me() });
  }
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
    let sessionEnded = false;
    try {
      await authService.logout();
      sessionEnded = true;
    } catch {
      // Unreachable or already ended. The tab stays signed out either way;
      // a session that did survive is met, and ended, on the next visit.
    } finally {
      // Only now is the sign-in forgotten as one that was walked away from.
      // Forgotten sooner, a guard that looks again before it has heard that
      // the session is gone would take this for a session it has to send to
      // the step.
      endPendingMfaLogin();
      clearSignedOutState(queryClient, sessionEnded);
      pendingLoginCancellation = null;
    }
  })();
  return pendingLoginCancellation;
}

export function useSendOtp() {
  return useMutation<OtpSendResponse, ApiError, OtpSendRequest>({
    mutationFn: (payload) => authService.sendOtp(payload),
  });
}

export function useSendPhoneVerificationOtp() {
  return useMutation<OtpSendResponse, ApiError, PhoneVerificationSendRequest>({
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
      persistAuthenticatedSession(queryClient, data, "otp");
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, RegisterRequest>({
    mutationFn: (payload) => authService.register(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data, "otp");
      trackAnalyticsEvent("signup_completed");
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
      persistAuthenticatedSession(queryClient, data, "oauth");
    },
  });
}

export function useGoogleOneTapLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, GoogleOneTapLoginRequest>({
    mutationFn: (payload) => authService.googleOneTapLogin(payload),
    onSuccess: (data) => {
      persistAuthenticatedSession(queryClient, data, "google");
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
    // Waits for the refreshed user: until it arrives the cached one still
    // owes the second step, and a route guard meeting it after the step has
    // closed takes the sign-in for one walked away from and ends it.
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
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
    // Waits for the refreshed user: until it arrives the cached one still
    // owes the second step, and a route guard meeting it after the step has
    // closed takes the sign-in for one walked away from and ends it.
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
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
    onSettled: (_data, error) => clearSignedOutState(queryClient, !error),
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

let signedOutHere = false;

/**
 * Whether the visitor signed out in this tab themselves, rather than their
 * session running out. A page that needs a session then sends them to the
 * home page instead of asking them to sign in again.
 */
export function wasSignedOutHere(): boolean {
  return signedOutHere;
}

/**
 * Cached answers that are the same for a visitor: kept on screen through a
 * sign-out and asked for again as one. Everything else in the cache was the
 * account's and is dropped.
 */
function isVisitorQuery(queryKey: readonly unknown[]): boolean {
  const [root, part] = queryKey;
  // "me" holds the answer "nobody", set as the page signed out.
  if (root === authKeys.all[0])
    return part === "me" || part === "config" || part === "public-profile";
  if (root === courseKeys.all[0]) return part !== "mine";
  if (root === "home") return part === "guest-page" || part === "discovery";
  return root === "quotes";
}

export type SignOutResult = "signed-out" | "still-signed-in";

const signedOutListeners = new Set<() => void>();

/**
 * Calls `listener` each time a sign-out in this tab is confirmed, whichever
 * screen started it (the shell's question, Settings or `/logout`), so the
 * shell can tell the visitor. Returns the unsubscribe function.
 */
export function onSignedOutHere(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => {
    signedOutListeners.delete(listener);
  };
}

/**
 * Signs out on screen at once and tells the server after: the page becomes
 * its signed-out version the moment the visitor confirms (a page that needs
 * a session goes to the home page, see wasSignedOutHere), with no reload.
 * Unsaved editor work is sent first, while the session still holds; usually
 * there is none and nothing waits.
 *
 * Should the server not end the session (the request fails and `/auth/me`
 * still finds it), the account is put back on screen and the result says
 * so, for the caller to tell the visitor. A session the request did end
 * anyway, or that is gone, stays signed out.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    if (autosyncManager.hasUnsavedWork()) {
      setIsPending(true);
      try {
        await autosyncManager.requireSynced();
      } catch {
        // Autosync failed or timed out; sign out anyway so the visitor is
        // never trapped (the draft stays in this browser).
      }
      setIsPending(false);
    }

    const previousUser =
      queryClient.getQueryData<CurrentUserResponse>(authKeys.me()) ?? null;
    signedOutHere = true;
    clearSignedOutState(queryClient, true);

    try {
      await authService.logout();
    } catch {
      let user: CurrentUserResponse | null = previousUser;
      try {
        user = await authService.getMe();
      } catch (error) {
        // Signed out after all; otherwise (the API not answering) the
        // session is most likely still there, as it was before.
        if ((error as Partial<ApiError>)?.status === 401) user = null;
      }
      if (user) {
        signedOutHere = false;
        writeSessionPresence(true);
        authStore.setUser(user);
        queryClient.setQueryData(authKeys.me(), user);
        return "still-signed-in";
      }
    }

    queryClient.removeQueries({
      predicate: (query) => !isVisitorQuery(query.queryKey),
    });
    void queryClient.invalidateQueries({
      predicate: (query) => isVisitorQuery(query.queryKey),
    });
    for (const listener of signedOutListeners) listener();
    return "signed-out";
  }, [queryClient]);

  return { isPending, signOut };
}
