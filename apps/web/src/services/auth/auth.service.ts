import { api } from "../../lib/api-client";
import type {
  AuthMessageResponse,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  RegisterRequest,
  SessionResponse,
  TotpEnableRequest,
  TotpVerifyRequest,
  UserProfileResponse,
} from "@veolms/contracts";

export interface TotpSetupResponse {
  secret: string;
  uri: string;
}

export const authService = {
  sendOtp: (payload: OtpSendRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/otp/send", payload);
  },

  login: (payload: LoginRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/login", payload);
  },

  register: (payload: RegisterRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/register", payload);
  },

  getOauthUrl: (payload: OauthUrlRequest): Promise<OauthUrlResponse> => {
    return api.post<OauthUrlResponse>("/auth/oauth/url", payload);
  },

  oauthLogin: (payload: OauthLoginRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/oauth/login", payload);
  },

  setupTotp: (): Promise<TotpSetupResponse> => {
    return api.post<TotpSetupResponse>("/auth/totp/setup");
  },

  enableTotp: (
    payload: TotpEnableRequest,
  ): Promise<{ backupCodes: string[] }> => {
    return api.post<{ backupCodes: string[] }>("/auth/totp/enable", payload);
  },

  verifyMfaTotp: (payload: TotpVerifyRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/totp/verify", payload);
  },

  getPasskeyRegisterOptions: (): Promise<unknown> => {
    return api.post<unknown>("/auth/passkey/register/options");
  },

  verifyPasskeyRegister: (payload: {
    response: unknown;
  }): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>(
      "/auth/passkey/register/verify",
      payload,
    );
  },

  getPasskeyLoginOptions: (): Promise<unknown> => {
    return api.post<unknown>("/auth/passkey/login/options");
  },

  verifyPasskeyLogin: (payload: {
    response: unknown;
  }): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>(
      "/auth/passkey/login/verify",
      payload,
    );
  },

  getSessions: (): Promise<SessionResponse[]> => {
    return api.get<SessionResponse[]>("/auth/sessions");
  },

  revokeSession: (id: string): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>(`/auth/sessions/${id}`);
  },

  revokeAllOtherSessions: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/sessions/revoke-all");
  },

  getMe: (): Promise<UserProfileResponse> => {
    return api.get<UserProfileResponse>("/auth/me");
  },

  logout: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/logout");
  },
};
