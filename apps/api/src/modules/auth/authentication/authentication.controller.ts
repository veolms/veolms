import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";
import { resolveIdentifier } from "../shared/auth.utils.ts";
import type {
  LoginRequest,
  ProfileUpdateRequest,
  RegisterRequest,
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
      email,
      phoneNo,
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

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarDataUrl: user.avatarDataUrl,
      bio: user.bio,
      emailPublic: Boolean(
        user.emailPublic && user.email && user.emailVerified,
      ),
      mobilePublic: Boolean(
        user.mobilePublic && user.phoneNo && user.mobileVerified,
      ),
      linkedinUrl: user.linkedinUrl,
      linkedinPublic: Boolean(user.linkedinPublic && user.linkedinUrl),
      githubUrl: user.githubUrl,
      githubPublic: Boolean(user.githubPublic && user.githubUrl),
      websiteUrl: user.websiteUrl,
      websitePublic: Boolean(user.websitePublic && user.websiteUrl),
      email: user.email,
      emailVerified: user.emailVerified,
      phoneNo: user.phoneNo,
      mobileVerified: user.mobileVerified,
      roles: user.roles,
      permissions: user.permissions,
      menus: user.menus,
      mfaVerified: session.mfa_verified,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
      mfaMandatory: user.mfaMandatory,
    };
  }

  async function updateProfile(
    request: FastifyRequest<{ Body: ProfileUpdateRequest }>,
  ) {
    const user = request.user!;

    const updated = await authService.updateProfile(user.id, request.body);
    return {
      id: updated.id,
      username: updated.username,
      displayName: updated.display_name,
      avatarDataUrl: updated.avatar_data_url,
      bio: updated.bio,
      emailPublic: Boolean(
        updated.email_public && updated.email && updated.email_verified_at,
      ),
      mobilePublic: Boolean(
        updated.mobile_public && updated.phone_no && updated.phone_verified_at,
      ),
      linkedinUrl: updated.linkedin_url,
      linkedinPublic: Boolean(updated.linkedin_public && updated.linkedin_url),
      githubUrl: updated.github_url,
      githubPublic: Boolean(updated.github_public && updated.github_url),
      websiteUrl: updated.website_url,
      websitePublic: Boolean(updated.website_public && updated.website_url),
      email: updated.email,
      emailVerified: Boolean(updated.email_verified_at),
      phoneNo: updated.phone_no,
      mobileVerified: Boolean(updated.phone_verified_at),
      roles: updated.roles,
      permissions: updated.permissions,
      menus: updated.menus,
      mfaVerified: request.session?.mfa_verified ?? false,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
      mfaMandatory: user.mfaMandatory,
    };
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
    logout,
    me,
    updateProfile,
    deactivateAccount,
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
