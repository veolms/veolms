import { api } from "../../lib/api-client";
import type {
  AvatarUploadContentType,
  AvatarUploadPresignRequest,
  AvatarUploadPresignResponse,
  AuthMessageResponse,
  CurrentUserResponse,
  EmailVerificationSendRequest,
  EmailVerificationVerifyRequest,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  PhoneVerificationSendRequest,
  PhoneVerificationVerifyRequest,
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegistrationOptionsResponse,
  ProfileUpdateRequest,
  RegisterRequest,
  SessionResponse,
  TotpEnableRequest,
  TotpVerifyRequest,
  UserProfileResponse,
} from "@veolms/contracts";
import {
  avatarUploadContentTypeSchema,
  passkeyAuthenticationOptionsResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
  sessionResponseSchema,
} from "@veolms/contracts";

export interface TotpSetupResponse {
  secret: string;
  uri: string;
}

const AVATAR_CONTENT_TYPE_BY_EXTENSION: Record<
  string,
  AvatarUploadContentType
> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Handles browsers (especially mobile browsers) that leave File.type empty. */
export function resolveAvatarUploadContentType(
  file: Pick<File, "name" | "type">,
): AvatarUploadContentType | null {
  const parsedType = avatarUploadContentTypeSchema.safeParse(
    file.type.trim().toLowerCase(),
  );
  if (parsedType.success) return parsedType.data;

  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return AVATAR_CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}

async function uploadToPresignedAvatarUrl(
  uploadUrl: string,
  file: File,
  contentType: AvatarUploadContentType,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
    credentials: "omit",
  });

  if (!response.ok) {
    throw new Error(
      `Storage upload failed with status ${response.status || "unknown"}.`,
    );
  }
}

export const authService = {
  sendOtp: (payload: OtpSendRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/otp/send", payload);
  },

  sendPhoneVerificationOtp: (
    payload: PhoneVerificationSendRequest,
  ): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/me/phone/otp/send", payload);
  },

  sendEmailVerificationOtp: (
    payload: EmailVerificationSendRequest,
  ): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/me/email/otp/send", payload);
  },

  verifyPhoneNumber: (
    payload: PhoneVerificationVerifyRequest,
  ): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/me/phone/otp/verify", payload);
  },

  verifyEmail: (
    payload: EmailVerificationVerifyRequest,
  ): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/me/email/otp/verify", payload);
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

  disableTotp: (): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>("/auth/totp");
  },

  deletePasskeys: (): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>("/auth/passkey");
  },

  verifyMfaTotp: (payload: TotpVerifyRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/totp/verify", payload);
  },

  getPasskeyRegisterOptions:
    async (): Promise<PasskeyRegistrationOptionsResponse> => {
      const response = await api.post<unknown>(
        "/auth/passkey/register/options",
      );
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
      const response = await api.post<unknown>("/auth/passkey/login/options");
      return passkeyAuthenticationOptionsResponseSchema.parse(response);
    },

  verifyPasskeyLogin: (payload: {
    response: unknown;
  }): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/passkey/login/verify", payload);
  },

  getSessions: async (): Promise<SessionResponse[]> => {
    const response = await api.get<unknown>("/auth/sessions");
    return sessionResponseSchema.array().parse(response);
  },

  revokeSession: (id: string): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>(`/auth/sessions/${id}`);
  },

  revokeAllOtherSessions: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/sessions/revoke-all");
  },

  getMe: async (): Promise<CurrentUserResponse> => {
    const response = await api.get<CurrentUserResponse>("/auth/me");
    return response;
  },

  updateProfile: (
    payload: ProfileUpdateRequest,
  ): Promise<UserProfileResponse> => {
    return api.patch<UserProfileResponse>("/auth/me", payload);
  },

  uploadAvatarPhoto: (file: File): Promise<UserProfileResponse> => {
    const contentType = resolveAvatarUploadContentType(file);
    if (!contentType) {
      return Promise.reject(
        new Error("Choose a JPEG, PNG, WebP, or GIF image."),
      );
    }

    const payload: AvatarUploadPresignRequest = {
      contentType,
      fileSize: file.size,
    };

    return api
      .post<AvatarUploadPresignResponse>("/auth/me/avatar/presign", payload)
      .then(({ uploadUrl }) =>
        uploadToPresignedAvatarUrl(uploadUrl, file, contentType),
      )
      .then(() =>
        api.post<UserProfileResponse>("/auth/me/avatar/complete", payload),
      );
  },

  logout: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/logout");
  },

  deactivateAccount: (): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>("/auth/me");
  },
};
