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
  UserAvatarListResponse,
  TotpEnableRequest,
  TotpVerifyRequest,
  UserProfileResponse,
} from "@veolms/contracts";
import {
  avatarUploadContentTypeSchema,
  DICEBEAR_BASE_URL,
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
  const declaredType = file.type.trim().toLowerCase();
  if (declaredType) {
    const parsedType = avatarUploadContentTypeSchema.safeParse(declaredType);
    return parsedType.success ? parsedType.data : null;
  }

  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return AVATAR_CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}

async function uploadToPresignedAvatarUrl(
  uploadUrl: string,
  file: File,
  contentType: AvatarUploadContentType,
): Promise<void> {
  if (typeof XMLHttpRequest === "undefined") {
    throw new Error("Avatar uploads are only available in a browser.");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.withCredentials = false;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Storage upload failed with status ${xhr.status || "unknown"}.`,
          ),
        );
      }
    });
    xhr.addEventListener("error", () =>
      reject(
        new Error("Storage upload failed before a response was received."),
      ),
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("Storage upload was cancelled.")),
    );
    xhr.send(file);
  });
}

async function generatedAvatarFile(previewUrl: string): Promise<File> {
  const url = new URL(previewUrl);
  const baseUrl = new URL(DICEBEAR_BASE_URL);
  if (
    url.origin !== baseUrl.origin ||
    !url.pathname.startsWith(`${baseUrl.pathname}/`) ||
    !url.pathname.endsWith("/svg") ||
    !url.searchParams.has("seed")
  ) {
    throw new Error("Generated avatar URL is invalid.");
  }

  url.pathname = `${url.pathname.slice(0, -4)}/png`;
  const response = await fetch(url.href, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("Generated avatar could not be downloaded.");
  }

  const blob = await response.blob();
  return new File([blob], "generated-avatar.png", { type: "image/png" });
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
      .then(({ uploadId, uploadUrl }) =>
        uploadToPresignedAvatarUrl(uploadUrl, file, contentType).then(
          () => uploadId,
        ),
      )
      .then((uploadId) =>
        api.post<UserProfileResponse>("/auth/me/avatar/complete", {
          ...payload,
          uploadId,
        }),
      );
  },

  /** Uses the same presigned browser-to-R2 flow as course media uploads. */
  uploadGeneratedAvatar: async (
    previewUrl: string,
  ): Promise<UserProfileResponse> => {
    const file = await generatedAvatarFile(previewUrl);
    return authService.uploadAvatarPhoto(file);
  },

  getAvatars: (): Promise<UserAvatarListResponse> => {
    return api.get<UserAvatarListResponse>("/auth/me/avatars");
  },

  selectAvatar: (avatarId: string): Promise<UserProfileResponse> => {
    return api.post<UserProfileResponse>("/auth/me/avatar/select", {
      avatarId,
    });
  },

  deleteUploadedAvatars: (): Promise<UserProfileResponse> => {
    return api.delete<UserProfileResponse>("/auth/me/avatars");
  },

  logout: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/logout");
  },

  deactivateAccount: (): Promise<AuthMessageResponse> => {
    return api.delete<AuthMessageResponse>("/auth/me");
  },
};
