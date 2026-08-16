import type { FastifyReply, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { hashToken } from "../modules/auth/auth.utils.ts";
import { httpError } from "../lib/errors.ts";

export interface AuthMiddleware {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAuthenticated: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requirePermission: (
    permission: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createAuthMiddleware(
  database: Kysely<Database>,
): AuthMiddleware {
  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.user = null;
    request.session = null;

    const sessionCookie =
      request.cookies["veolms-session"] ||
      request.cookies["__Host-veolms-session"];
    if (!sessionCookie) {
      return;
    }

    const tokenHash = hashToken(sessionCookie);

    // Look up active session
    const session = await database
      .selectFrom("sessions")
      .select([
        "id",
        "user_id",
        "token_hash",
        "mfa_verified",
        "revoked_at",
        "expires_at",
        "last_used_at",
      ])
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", new Date())
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!session) {
      return;
    }

    // Look up user
    const user = await database
      .selectFrom("users")
      .select(["id", "username", "display_name", "email", "phone_no", "mfa_mandatory"])
      .where("id", "=", session.user_id)
      .executeTakeFirst();

    if (!user) {
      return;
    }

    // Query TOTP credentials enabled status
    const totpCred = await database
      .selectFrom("user_totp_credentials")
      .select("enabled")
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    const totpEnabled = !!totpCred?.enabled;

    // Resolve roles
    const userRoles = await database
      .selectFrom("user_roles")
      .innerJoin("roles", "roles.id", "user_roles.role_id")
      .select("roles.name")
      .where("user_roles.user_id", "=", user.id)
      .execute();

    const roles = userRoles.map((r) => r.name);

    // Resolve permissions from the new RBAC schema (menus + boolean flags)
    const permissionsRows = await database
      .selectFrom("user_roles")
      .innerJoin(
        "permissions",
        "permissions.role_id",
        "user_roles.role_id",
      )
      .innerJoin(
        "menus",
        "menus.id",
        "permissions.menu_id",
      )
      .select([
        "menus.route_link",
        "permissions.can_create",
        "permissions.can_read",
        "permissions.can_update",
        "permissions.can_delete"
      ])
      .where("user_roles.user_id", "=", user.id)
      .execute();

    const permsSet = new Set<string>();
    for (const row of permissionsRows) {
      const baseRoute = row.route_link.replace(/^\//, '') || "home";
      if (row.can_create) permsSet.add(`${baseRoute}:create`);
      if (row.can_read) permsSet.add(`${baseRoute}:read`);
      if (row.can_update) permsSet.add(`${baseRoute}:update`);
      if (row.can_delete) permsSet.add(`${baseRoute}:delete`);
    }
    const permissions = Array.from(permsSet);

    // Query passkeys count
    const passkeyCount = await database
      .selectFrom("passkeys")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    const passkeyEnabled = Number(passkeyCount?.count || 0) > 0;

    // Attach to request
    request.user = {
      id: user.id,
      username: user.username,
      name: user.display_name,
      displayName: user.display_name,
      email: user.email,
      phoneNo: user.phone_no,
      roles,
      permissions,
      totpEnabled,
      passkeyEnabled,
      mfaMandatory: !!user.mfa_mandatory,
    };

    request.session = {
      id: session.id,
      user_id: session.user_id,
      token_hash: session.token_hash,
      mfa_verified: session.mfa_verified,
      revoked_at: session.revoked_at,
      expires_at: session.expires_at,
    };

    // Update last_used_at if it was more than 15 minutes ago
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.last_used_at < fifteenMinutesAgo) {
      await database
        .updateTable("sessions")
        .set({ last_used_at: new Date() })
        .where("id", "=", session.id)
        .execute();
    }
  }

  async function requireAuthenticated(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply
        .code(401)
        .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
    }
  }

  function requirePermission(permission: string) {
    return async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      // 1. Ensure authenticated
      if (!request.user || !request.session) {
        return reply
          .code(401)
          .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
      }

      // 2. Enforce MFA check for users who have MFA enabled or mandatory
      const mfaRequired = request.user.mfaMandatory || request.user.totpEnabled || request.user.passkeyEnabled;
      if (mfaRequired && !request.session.mfa_verified) {
        return reply
          .code(403)
          .send(
            httpError(
              403,
              "MFA_REQUIRED",
              "Multi-factor authentication code required to complete action",
            ),
          );
      }

      // 3. Verify user has capability permission
      if (!request.user.permissions.includes(permission)) {
        return reply.code(403).send(httpError(403, "FORBIDDEN", "Forbidden"));
      }
    };
  }

  return {
    authenticate,
    requireAuthenticated,
    requirePermission,
  };
}
