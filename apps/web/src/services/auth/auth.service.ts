import { api } from "../../lib/api-client";
import type {
  AuthMessageResponse,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegistrationOptionsResponse,
  RegisterRequest,
  SessionResponse,
  TotpEnableRequest,
  TotpVerifyRequest,
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

  getPasskeyRegisterOptions:
    async (): Promise<PasskeyRegistrationOptionsResponse> => {
      const [{ passkeyRegistrationOptionsResponseSchema }, response] =
        await Promise.all([
          import("@veolms/contracts"),
          api.post<unknown>("/auth/passkey/register/options"),
        ]);
      return passkeyRegistrationOptionsResponseSchema.parse(response);
    },

  verifyPasskeyRegister: (payload: {
    response: unknown;
  }): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>(
      "/auth/passkey/register/verify",
      payload,
    );
  },

  getPasskeyLoginOptions:
    async (): Promise<PasskeyAuthenticationOptionsResponse> => {
      const [{ passkeyAuthenticationOptionsResponseSchema }, response] =
        await Promise.all([
          import("@veolms/contracts"),
          api.post<unknown>("/auth/passkey/login/options"),
        ]);
      return passkeyAuthenticationOptionsResponseSchema.parse(response);
    },

  verifyPasskeyLogin: (payload: {
    response: unknown;
  }): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/passkey/login/verify", payload);
  },

  getSessions: async (): Promise<SessionResponse[]> => {
    const [{ sessionResponseSchema }, response] = await Promise.all([
      import("@veolms/contracts"),
      api.get<unknown>("/auth/sessions"),
    ]);
    return sessionResponseSchema.array().parse(response);
  },

  revokeSession: (id: string): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>(`/auth/sessions/${id}`);
  },

  revokeAllOtherSessions: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/sessions/revoke-all");
  },

  getMe: (): Promise<CurrentUserResponse> => {
    return api.get<CurrentUserResponse>("/auth/me");
  },

  logout: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/logout");
  },
};
