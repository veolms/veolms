import { OAuth2Client } from "google-auth-library";
import { z } from "zod";

import { AppError } from "../../../lib/errors.ts";

export type OauthProviderName = "google" | "github";

export interface OauthProfile {
  email: string;
  name: string;
  username: string;
  providerUserId: string;
  /** The provider's profile photo URL, when it exposes one. */
  pictureUrl?: string | undefined;
}

export interface OauthProviderCredentials {
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  githubClientId?: string | undefined;
  githubClientSecret?: string | undefined;
}

export interface FetchOauthProfileInput {
  provider: OauthProviderName;
  code: string;
  redirectUri?: string | undefined;
  codeVerifier?: string | undefined;
  credentials: OauthProviderCredentials;
  /** Enables the `mock_` short-circuit used by local development. */
  allowMockCodes: boolean;
}

function oauthFailure(message: string): AppError {
  return new AppError(
    400,
    "OAUTH_VERIFICATION_FAILED",
    `OAuth provider verification failed: ${message}`,
  );
}

const googleTokenSchema = z.object({ access_token: z.string().min(1) });

const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.url().optional(),
});

const githubTokenSchema = z.object({
  access_token: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const githubUserSchema = z.object({
  id: z.union([z.number(), z.string()]),
  login: z.string().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
});

const githubEmailsSchema = z.array(
  z.object({
    email: z.email(),
    primary: z.boolean().optional(),
    verified: z.boolean().optional(),
  }),
);

async function parseJson<T extends z.ZodType>(
  response: Response,
  schema: T,
  context: string,
): Promise<z.output<T>> {
  const body: unknown = await response.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw oauthFailure(`${context} returned an unexpected payload`);
  }

  return parsed.data;
}

function mockProfile(provider: OauthProviderName, code: string): OauthProfile {
  const parts = code.split("_");
  const email = parts[parts.length - 1] || "user@mock.academy.com";
  const username = email.split("@")[0] || "mockuser";

  return {
    email,
    username,
    name: `${provider === "google" ? "Google" : "GitHub"} Mock User`,
    providerUserId: `mock_${provider}_${username}`,
    pictureUrl: undefined,
  };
}

async function fetchGoogleProfile(
  input: FetchOauthProfileInput,
): Promise<OauthProfile> {
  const { credentials, code, codeVerifier, redirectUri } = input;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.googleClientId || "",
      client_secret: credentials.googleClientSecret || "",
      code,
      code_verifier: codeVerifier || "",
      grant_type: "authorization_code",
      redirect_uri: redirectUri || "",
    }),
  });

  if (!tokenResponse.ok) {
    throw oauthFailure("Google token exchange failed");
  }

  const { access_token: accessToken } = await parseJson(
    tokenResponse,
    googleTokenSchema,
    "Google token endpoint",
  );

  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!userInfoResponse.ok) {
    throw oauthFailure("Google userinfo fetch failed");
  }

  const profile = await parseJson(
    userInfoResponse,
    googleUserInfoSchema,
    "Google userinfo endpoint",
  );

  if (!profile.email_verified) {
    throw oauthFailure("Google email address is not verified");
  }

  const localPart = profile.email.split("@")[0] || "";

  return {
    email: profile.email,
    name: profile.name || localPart || "Google User",
    username: localPart,
    providerUserId: profile.sub,
    pictureUrl: profile.picture,
  };
}

async function fetchGithubProfile(
  input: FetchOauthProfileInput,
): Promise<OauthProfile> {
  const { credentials, code, redirectUri } = input;

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: credentials.githubClientId,
        client_secret: credentials.githubClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    },
  );

  if (!tokenResponse.ok) {
    throw oauthFailure("GitHub token exchange failed");
  }

  const tokenData = await parseJson(
    tokenResponse,
    githubTokenSchema,
    "GitHub token endpoint",
  );

  if (tokenData.error) {
    throw oauthFailure(
      `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
    );
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw oauthFailure("GitHub access token missing from response");
  }

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "VeoLMS-API",
  };

  const userResponse = await fetch("https://api.github.com/user", {
    headers: authHeaders,
  });

  if (!userResponse.ok) {
    throw oauthFailure("GitHub access token invalid");
  }

  const user = await parseJson(
    userResponse,
    githubUserSchema,
    "GitHub user endpoint",
  );

  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers: authHeaders,
  });

  let email = "";
  if (emailsResponse.ok) {
    const emails = await parseJson(
      emailsResponse,
      githubEmailsSchema,
      "GitHub emails endpoint",
    );
    const verified = emails.filter((entry) => entry.verified);
    email =
      (verified.find((entry) => entry.primary) || verified[0])?.email || "";
  }

  if (!email) {
    throw oauthFailure("No verified email address found on GitHub profile");
  }

  return {
    email,
    name: user.name || user.login || "GitHub User",
    username: user.login || "",
    providerUserId: String(user.id),
    pictureUrl: user.avatar_url,
  };
}

const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

export interface GoogleIdTokenClaims {
  sub?: string | undefined;
  email?: string | undefined;
  email_verified?: boolean | undefined;
  name?: string | undefined;
  picture?: string | undefined;
  aud?: string | string[] | undefined;
  iss?: string | undefined;
}

function audienceMatches(
  audience: string | string[] | undefined,
  clientId: string,
): boolean {
  if (!clientId) return false;
  const values = Array.isArray(audience)
    ? audience
    : audience
      ? [audience]
      : [];
  return values.includes(clientId);
}

export function googleIdTokenToProfile(
  claims: GoogleIdTokenClaims,
  clientId: string,
): OauthProfile {
  if (!audienceMatches(claims.aud, clientId)) {
    throw oauthFailure("Google ID token audience is invalid");
  }

  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw oauthFailure("Google ID token issuer is invalid");
  }

  if (!claims.sub) {
    throw oauthFailure("Google ID token is missing a subject");
  }

  if (!claims.email) {
    throw oauthFailure("Google ID token is missing an email address");
  }

  if (claims.email_verified !== true) {
    throw oauthFailure("Google email address is not verified");
  }

  const localPart = claims.email.split("@")[0] || "";
  const pictureUrl =
    claims.picture && claims.picture.startsWith("https://")
      ? claims.picture
      : undefined;

  return {
    email: claims.email,
    name: claims.name || localPart || "Google User",
    username: localPart,
    providerUserId: claims.sub,
    pictureUrl,
  };
}

// Reused across requests so Google's signing certs stay cached in the client.
const googleClients = new Map<string, OAuth2Client>();

function getGoogleClient(clientId: string): OAuth2Client {
  let client = googleClients.get(clientId);
  if (!client) {
    client = new OAuth2Client(clientId);
    googleClients.set(clientId, client);
  }
  return client;
}

export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
): Promise<OauthProfile> {
  if (!credential || !clientId) {
    throw oauthFailure("Google ID token verification failed");
  }

  const client = getGoogleClient(clientId);
  let claims: GoogleIdTokenClaims | undefined;

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    claims = ticket.getPayload() ?? undefined;
  } catch {
    throw oauthFailure("Google ID token verification failed");
  }

  if (!claims) {
    throw oauthFailure("Google ID token is missing a payload");
  }

  return googleIdTokenToProfile(claims, clientId);
}

export async function fetchOauthProfile(
  input: FetchOauthProfileInput,
): Promise<OauthProfile> {
  if (input.allowMockCodes && input.code.startsWith("mock_")) {
    return mockProfile(input.provider, input.code);
  }

  return input.provider === "google"
    ? fetchGoogleProfile(input)
    : fetchGithubProfile(input);
}

const oauthStateCookieSchema = z.object({
  state: z.string().min(1),
  provider: z.enum(["google", "github"]),
  code_verifier: z.string().optional(),
});

export function verifyOauthState({
  cookieValue,
  provider,
  state,
}: {
  cookieValue: string | undefined;
  provider: OauthProviderName;
  state: string | undefined;
}): { codeVerifier: string | undefined } {
  if (!cookieValue) {
    throw new AppError(
      400,
      "OAUTH_STATE_MISSING",
      "OAuth state cookie is missing. Please restart the flow.",
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cookieValue);
  } catch {
    throw new AppError(
      400,
      "OAUTH_STATE_INVALID",
      "OAuth state cookie is invalid.",
    );
  }

  const parsed = oauthStateCookieSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(
      400,
      "OAUTH_STATE_INVALID",
      "OAuth state cookie is invalid.",
    );
  }

  if (parsed.data.provider !== provider || parsed.data.state !== state) {
    throw new AppError(
      400,
      "OAUTH_STATE_MISMATCH",
      "OAuth state mismatch (possible CSRF attack).",
    );
  }

  return { codeVerifier: parsed.data.code_verifier };
}
