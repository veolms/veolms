import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../shared/auth.cookies.ts";
import {
  presentAvatar,
  presentLogin,
  presentUserProfile,
} from "../shared/auth.presenters.ts";
import type { SessionUser } from "../shared/auth.types.ts";
import {
  normalizePhoneIdentifier,
  resolveIdentifier,
  toUserProfileFields,
} from "../shared/auth.utils.ts";
import type {
  AvatarUploadCompleteRequest,
  AvatarUploadPresignRequest,
  LoginRequest,
  ProfileUpdateRequest,
  PublicProfileUsernameParams,
  RegisterRequest,
  SelectAvatarRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

export function createAuthController(context: AuthContext) {
  const { authService, oauthService, sessionService } = context;

  async function login(
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply,
  ) {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const existingSessionToken = request.cookies["veolms-session"] ?? null;
    const result = await authService.login({
      identifier,
      identifierType,
      code: request.body.code,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        existingSessionToken,
      },
    });

    setSessionCookie(reply, result.session.token);
    return presentLogin(result.user, result.session.mfa);
  }

  async function register(
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply,
  ) {
    const {
      email,
      phoneNo,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
    } = request.body;
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const existingSessionToken = request.cookies["veolms-session"] ?? null;
    const result = await authService.register({
      identifier,
      identifierType,
      email: email ? email.trim().toLowerCase() : undefined,
      phoneNo: phoneNo ? normalizePhoneIdentifier(phoneNo) : undefined,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        existingSessionToken,
      },
    });

    setSessionCookie(reply, result.session.token);
    reply.code(201);
    return presentLogin(result.user, result.session.mfa);
  }

  async function getConfig() {
    return oauthService.getPublicConfig();
  }

  async function publicProfile(
    request: FastifyRequest<{ Params: PublicProfileUsernameParams }>,
  ) {
    const user = await authService.getPublicProfile(request.params.username);

    return {
      username: user.username,
      displayName: user.display_name,
      ...presentAvatar(user.avatar_data_url),
      bio: user.bio,
      email:
        user.email_public && user.email && user.email_verified_at
          ? user.email
          : null,
      phoneNo:
        user.mobile_public && user.phone_no && user.phone_verified_at
          ? user.phone_no
          : null,
      linkedinUrl: user.linkedin_public ? user.linkedin_url : null,
      githubUrl: user.github_public ? user.github_url : null,
      websiteUrl: user.website_public ? user.website_url : null,
    };
  }

  async function logout(request: FastifyRequest, reply: FastifyReply) {
    if (request.session) {
      await sessionService.logout(request.session.id);
    }

    clearSessionCookie(reply);
    return { message: "Logged out successfully" };
  }

  async function me(request: FastifyRequest) {
    const user = request.user;
    const session = request.session;

    if (!user || !session) {
      return null;
    }

    return presentUserProfile(user, user.roles, {
      mfaVerified: session.mfa_verified,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
      mfaMandatory: user.mfaMandatory,
    });
  }

  /** The profile as saved, with the MFA state of the session that saved it. */
  function presentUpdatedProfile(
    request: FastifyRequest,
    updated: SessionUser & { roles: string[] },
  ) {
    const user = request.user!;

    return presentUserProfile(toUserProfileFields(updated), updated.roles, {
      mfaVerified: request.session?.mfa_verified ?? false,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
      mfaMandatory: user.mfaMandatory,
    });
  }

  async function updateProfile(
    request: FastifyRequest<{ Body: ProfileUpdateRequest }>,
  ) {
    const updated = await authService.updateProfile(
      request.user!.id,
      request.body,
    );
    return presentUpdatedProfile(request, updated);
  }

  async function presignAvatarUpload(
    request: FastifyRequest<{ Body: AvatarUploadPresignRequest }>,
  ) {
    const user = request.user!;
    return authService.presignAvatarUpload(user.id, request.body);
  }

  async function completeAvatarUpload(
    request: FastifyRequest<{ Body: AvatarUploadCompleteRequest }>,
  ) {
    const updated = await authService.completeAvatarUpload(
      request.user!.id,
      request.body,
    );
    return presentUpdatedProfile(request, updated);
  }

  async function listAvatars(request: FastifyRequest) {
    return authService.listAvatars(request.user!.id);
  }

  async function selectAvatar(
    request: FastifyRequest<{ Body: SelectAvatarRequest }>,
  ) {
    const updated = await authService.selectAvatar(
      request.user!.id,
      request.body.avatarId,
    );
    return presentUpdatedProfile(request, updated);
  }

  async function deleteUploadedAvatars(request: FastifyRequest) {
    const updated = await authService.deleteUploadedAvatars(request.user!.id);
    return presentUpdatedProfile(request, updated);
  }

  async function deactivateAccount(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    await authService.deactivateAccount(request.user!.id);
    clearSessionCookie(reply);
    return { message: "Account deactivated successfully" };
  }

  return {
    login,
    register,
    getConfig,
    publicProfile,
    logout,
    me,
    updateProfile,
    presignAvatarUpload,
    completeAvatarUpload,
    listAvatars,
    selectAvatar,
    deleteUploadedAvatars,
    deactivateAccount,
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
