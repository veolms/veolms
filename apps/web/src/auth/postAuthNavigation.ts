import {
  APP_HOME_PATH,
  MFA_CHALLENGE_PATH,
  resolveAuthenticatedDestination,
} from "../routing/routeAccess";

export const POST_AUTH_HOME_PATH = APP_HOME_PATH;
export { MFA_CHALLENGE_PATH };

export function resolvePostAuthPath(
  response: {
    mfaRequired: boolean;
  },
  returnTo?: string | null,
): string {
  return response.mfaRequired
    ? MFA_CHALLENGE_PATH
    : resolveAuthenticatedDestination(returnTo);
}
