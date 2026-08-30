import { APP_HOME_PATH, MFA_CHALLENGE_PATH } from "../routing/routeAccess";

export const POST_AUTH_HOME_PATH = APP_HOME_PATH;
export { MFA_CHALLENGE_PATH };

export function resolvePostAuthPath(response: {
  mfaRequired: boolean;
}): string {
  return response.mfaRequired ? MFA_CHALLENGE_PATH : POST_AUTH_HOME_PATH;
}
