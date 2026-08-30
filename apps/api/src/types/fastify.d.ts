import type { AuthMenuNode } from "@veolms/contracts";
import "fastify";

interface AuthenticatedUser {
  id: string;
  username: string;
  name: string; // display name
  displayName: string;
  email: string | null;
  phoneNo: string | null;
  roles: string[];
  permissions: string[];
  menus: AuthMenuNode[];
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaMandatory: boolean;
}

interface ActiveSession {
  id: string;
  user_id: string;
  token_hash: string;
  mfa_verified: boolean;
  revoked_at: Date | null;
  expires_at: Date;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
    session: ActiveSession | null;
  }
}
