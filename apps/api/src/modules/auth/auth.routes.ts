import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { z } from "zod";

function getWorkspaceRoot(): string {
  let currentDir = process.cwd();
  while (currentDir) {
    if (fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return process.cwd();
}

function logTestCredentials(message: string) {
  if (config.NODE_ENV === "production") return; // hard stop, no env flag can override this
  try {
    const filePath = path.join(getWorkspaceRoot(), "otp.txt");
    const logLine = `[${new Date().toLocaleTimeString()}] ${message}\n`;
    fs.appendFileSync(filePath, logLine);
    console.log(`\n\x1b[32m==================================================`);
    console.log(`[TESTING LOG] ${message}`);
    console.log(`==================================================\x1b[0m\n`);
  } catch (err) {
    // Ignore log writing errors
  }
}

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  otpSendRequestSchema,
  otpVerifyRequestSchema,
  registerRequestSchema,
  loginRequestSchema,
  oauthLoginRequestSchema,
  oauthRegisterRequestSchema,
  passkeyRegisterVerifyRequestSchema,
  passkeyLoginVerifyRequestSchema,
  totpVerifyRequestSchema,
  totpEnableRequestSchema,
  authMessageResponseSchema,
  loginResponseSchema,
  userProfileResponseSchema,
  sessionResponseSchema,
  totpSetupResponseSchema,
  totpEnableResponseSchema,
  passkeyOptionsResponseSchema,
} from "@veolms/contracts";

import {
  generateRandomToken,
  hashToken,
  generateTotpSecret,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generatePkce,
} from "./auth.utils.ts";
import { sendEmail } from "../../lib/email.ts";
import { sendSMS } from "../../lib/sms.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { errorResponse, httpError } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import { config } from "../../config.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";

const sessionParamsSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe("The UUID of the session to revoke."),
});

interface OauthProfile {
  email: string;
  name: string;
  username: string;
  providerUserId: string;
}

const authRoutes: RoutePlugin = async (app, { database }) => {
  const authMiddleware = createAuthMiddleware(database);

  // Helper to fetch Google / GitHub profile details
  async function fetchOauthProfile(
    provider: string,
    code: string,
    redirectUri: string | undefined,
    codeVerifier: string | undefined,
    reply: any,
  ): Promise<OauthProfile> {
    let email = "";
    let name = "";
    let username = "";
    let providerUserId = "";

    try {
      if (config.NODE_ENV === "development" && code.startsWith("mock_")) {
        const parts = code.split("_");
        email = (parts[parts.length - 1] as string) || "user@mock.academy.com";
        name = `${provider === "google" ? "Google" : "GitHub"} Mock User`;
        username = email.split("@")[0] || "mockuser";
        providerUserId = `mock_${provider}_${username}`;
      } else if (provider === "google") {
        // Exchange Google auth code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: config.GOOGLE_CLIENT_ID || "",
            client_secret: config.GOOGLE_CLIENT_SECRET || "",
            code,
            code_verifier: codeVerifier || "",
            grant_type: "authorization_code",
            redirect_uri: redirectUri || "",
          }),
        });
        if (!tokenRes.ok) {
          const errBody = await tokenRes.text();
          throw new Error(`Google token exchange failed: ${errBody}`);
        }
        const tokenData = (await tokenRes.json()) as any;
        const accessToken = tokenData.access_token;

        // Fetch user info from Google userinfo endpoint using access token
        const userInfoRes = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (!userInfoRes.ok) throw new Error("Google userinfo fetch failed");
        const payload = (await userInfoRes.json()) as any;
        if (!payload.email_verified) {
          throw new Error("Google email address is not verified.");
        }
        email = payload.email;
        name = payload.name || email.split("@")[0] || "Google User";
        username = email.split("@")[0] || "";
        providerUserId = payload.sub;
      } else {
        const tokenRes = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: config.GITHUB_CLIENT_ID,
              client_secret: config.GITHUB_CLIENT_SECRET,
              code,
              redirect_uri: redirectUri,
            }),
          },
        );
        if (!tokenRes.ok) throw new Error("GitHub token exchange failed");
        const tokenData = (await tokenRes.json()) as any;
        if (tokenData.error) {
          throw new Error(
            `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
          );
        }
        const accessToken = tokenData.access_token;
        if (!accessToken)
          throw new Error("GitHub access token missing from response");

        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "VeoLMS-API",
          },
        });
        if (!res.ok) throw new Error("GitHub access token invalid");
        const payload = (await res.json()) as any;

        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "VeoLMS-API",
          },
        });
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as any[];
          const verifiedEmails = emails.filter((e) => e.verified);
          const selectedEmailObj = verifiedEmails.find((e) => e.primary) || verifiedEmails[0];
          email = selectedEmailObj?.email || "";
        } else {
          email = payload.email || "";
        }

        if (!email) {
          throw new Error("No verified email address found on GitHub profile.");
        }
        name = payload.name || payload.login || "GitHub User";
        username = payload.login || "";
        providerUserId = String(payload.id);
      }

      return { email, name, username, providerUserId };
    } catch (err: any) {
      reply
        .code(400)
        .send(
          httpError(
            400,
            "OAUTH_VERIFICATION_FAILED",
            `OAuth provider verification failed: ${err.message}`,
          ),
        );
      throw err;
    }
  }

  // Helper to establish session cookie and return user response
  async function establishSession(user: any, request: any, reply: any) {
    const userRoles = await database
      .selectFrom("user_roles")
      .innerJoin("roles", "roles.id", "user_roles.role_id")
      .select("roles.name")
      .where("user_roles.user_id", "=", user.id)
      .execute();

    const roles = userRoles.map((r) => r.name);

    const isCreator = roles.includes("creator");

    // Fetch TOTP and Passkey enabled status dynamically
    const totpCred = await database
      .selectFrom("user_totp_credentials")
      .select("enabled")
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    const totpEnabled = !!totpCred?.enabled;

    const passkeyCount = await database
      .selectFrom("passkeys")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    const passkeyEnabled = Number(passkeyCount?.count || 0) > 0;

    const mfaRequired = !!user.mfa_mandatory || totpEnabled || passkeyEnabled;

    const token = generateRandomToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const sessionId = crypto.randomUUID();

    await database
      .insertInto("sessions")
      .values({
        id: sessionId,
        user_id: user.id,
        token_hash: tokenHash,
        ip_address: request.ip,
        user_agent: request.headers["user-agent"] || null,
        mfa_verified: !mfaRequired,
        expires_at: expiresAt,
      })
      .execute();

    reply.setCookie("veolms-session", token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        phoneNo: user.phone_no,
      },
      mfaRequired,
    });
  }

  // Helper to find weather any active MFA factor is there 
  async function userHasAnyMfaFactor(userId: string): Promise<boolean> {
    const totpCred = await database
      .selectFrom("user_totp_credentials")
      .select("enabled")
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (totpCred?.enabled) return true;

    const passkeyCount = await database
      .selectFrom("passkeys")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return Number(passkeyCount?.count || 0) > 0;
  }

  // Helper to verify and consume OTP with rate limit / attempts checks
  async function verifyAndConsumeOtp(
    identifier: string,
    identifierType: "email" | "phone",
    purpose: string,
    code: string,
    reply: any,
  ): Promise<boolean> {
    const codeHash = hashToken(code);
    const now = new Date();

    // 1. Look up matching active OTP
    const activeOtp = await database
      .selectFrom("otp_codes")
      .selectAll()
      .where("identifier", "=", identifier)
      .where("identifier_type", "=", identifierType)
      .where("purpose", "=", purpose as any)
      .where("code_hash", "=", codeHash)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", now)
      .executeTakeFirst();

    if (!activeOtp) {
      // Increment attempts for any active unconsumed OTP for this identifier/purpose to prevent brute-force
      const unconsumedOtp = await database
        .selectFrom("otp_codes")
        .select(["id", "attempts"])
        .where("identifier", "=", identifier)
        .where("identifier_type", "=", identifierType)
        .where("purpose", "=", purpose as any)
        .where("consumed_at", "is", null)
        .where("expires_at", ">", now)
        .executeTakeFirst();

      if (unconsumedOtp) {
        const newAttempts = unconsumedOtp.attempts + 1;
        if (newAttempts >= 3) {
          await database
            .updateTable("otp_codes")
            .set({ attempts: newAttempts, consumed_at: now })
            .where("id", "=", unconsumedOtp.id)
            .execute();
        } else {
          await database
            .updateTable("otp_codes")
            .set({ attempts: newAttempts })
            .where("id", "=", unconsumedOtp.id)
            .execute();
        }
      }

      reply
        .code(401)
        .send(
          httpError(
            401,
            "INVALID_CODE",
            "Verification code is invalid, expired, or revoked due to excessive attempts.",
          ),
        );
      return false;
    }

    if (activeOtp.attempts >= 3) {
      reply
        .code(401)
        .send(
          httpError(
            401,
            "INVALID_CODE",
            "Verification code is invalid, expired, or revoked due to excessive attempts.",
          ),
        );
      return false;
    }

    // 2. Consume OTP atomically to prevent concurrent reuse
    const updateRes = await database
      .updateTable("otp_codes")
      .set({ consumed_at: now })
      .where("id", "=", activeOtp.id)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", now)
      .where("attempts", "<", 3)
      .executeTakeFirst();

    if (Number(updateRes.numUpdatedRows || 0) === 0) {
      reply
        .code(401)
        .send(
          httpError(
            401,
            "INVALID_CODE",
            "Verification code was already used or invalidated.",
          ),
        );
      return false;
    }

    return true;
  }

  // 1. Passwordless OTP Dispatch
  app.post(
    "/auth/otp/send",
    {
      schema: {
        operationId: "sendOtp",
        tags: ["Auth"],
        summary: "Send login/register OTP",
        description:
          "Dispatches a secure 6-digit verification code via email or SMS.",
        body: otpSendRequestSchema,
        response: {
          200: jsonResponse(
            "OTP dispatched successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Validation error or missing parameters."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNo } = request.body;
      const targetPhone = phoneNo;
      const identifier = email || targetPhone;
      const identifierType = email ? "email" : "phone";

      if (!identifier) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "INVALID_REQUEST",
              "Email or phone number is required",
            ),
          );
      }

      // Determine purpose based on user existence
      let purpose: "login" | "email_verification" | "phone_verification" =
        "login";
      const userExists = await database
        .selectFrom("users")
        .select("id")
        .where(email ? "email" : "phone_no", "=", identifier)
        .executeTakeFirst();

      if (!userExists) {
        purpose = email ? "email_verification" : "phone_verification";
      }

      // Rate limit check: 1 OTP per identifier/purpose in the last 60 seconds
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentOtp = await database
        .selectFrom("otp_codes")
        .select("id")
        .where("identifier", "=", identifier)
        .where("identifier_type", "=", identifierType)
        .where("purpose", "=", purpose)
        .where("created_at", ">", oneMinuteAgo)
        .executeTakeFirst();

      if (recentOtp) {
        return reply
          .code(429)
          .send(
            httpError(
              429,
              "RATE_LIMIT_EXCEEDED",
              "Please wait 60 seconds before requesting another code.",
            ),
          );
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      //just testing otp code
      logTestCredentials(`OTP CODE for ${identifier} (${purpose}): ${otp}`);
      const codeHash = hashToken(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

      // Delete active unconsumed OTPs for same identifier and purpose
      await database
        .deleteFrom("otp_codes")
        .where("identifier", "=", identifier)
        .where("identifier_type", "=", identifierType)
        .where("purpose", "=", purpose)
        .execute();

      await database
        .insertInto("otp_codes")
        .values({
          id: crypto.randomUUID(),
          identifier,
          identifier_type: identifierType,
          purpose,
          code_hash: codeHash,
          attempts: 0,
          expires_at: expiresAt,
          consumed_at: null,
        })
        .execute();

      if (email) {
        void sendEmail({
          to: email,
          subject: "VeoLMS Login Verification Code",
          text: `Your login code is: ${otp}. It is valid for 5 minutes.`,
          html: `<p>Your verification code is: <strong>${otp}</strong>.</p><p>It will expire in 5 minutes.</p>`,
        });
      } else if (targetPhone) {
        void sendSMS(
          targetPhone,
          `Your verification code is: ${otp}. Valid for 5 minutes.`,
        );
      }

      return { message: "Verification OTP sent successfully." };
    },
  );

  // 2. Custom Login Endpoint (verifies OTP and fails if user does not exist)
  app.post(
    "/auth/login",
    {
      schema: {
        operationId: "loginUser",
        tags: ["Auth"],
        summary: "Log in with OTP",
        description: "Checks 6-digit OTP and logs in if user exists.",
        body: loginRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse("No user exists or code invalid."),
          401: errorResponse("Verification failed."),
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNo, code } = request.body;
      const identifier = email || phoneNo;
      const identifierType = email ? "email" : "phone";

      if (!identifier) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "INVALID_REQUEST",
              "Email or phone number is required.",
            ),
          );
      }

      // Verify and consume OTP for purpose: 'login'
      const otpValid = await verifyAndConsumeOtp(
        identifier,
        identifierType,
        "login",
        code,
        reply,
      );
      if (!otpValid) return;

      let userQuery = database.selectFrom("users").selectAll();
      if (email) {
        userQuery = userQuery.where("email", "=", email);
      } else if (phoneNo) {
        userQuery = userQuery.where("phone_no", "=", phoneNo);
      }

      const user = await userQuery.executeTakeFirst();
      if (!user) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "REGISTRATION_REQUIRED",
              "Account does not exist. Please register first.",
            ),
          );
      }

      return establishSession(user, request, reply);
    },
  );

  // 3. Custom Register Endpoint (verifies OTP and registers user)
  app.post(
    "/auth/register",
    {
      schema: {
        operationId: "registerUser",
        tags: ["Auth"],
        summary: "Register a new user",
        description:
          "Registers a user and assigns role creator (if first user) or student.",
        body: registerRequestSchema,
        response: {
          201: jsonResponse("Registration successful.", loginResponseSchema),
          400: errorResponse(
            "Invalid code, username taken, or user already exists.",
          ),
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNo, code, username, displayName } = request.body;
      const identifier = email || phoneNo;
      const identifierType = email ? "email" : "phone";
      const purpose = email ? "email_verification" : "phone_verification";

      if (!identifier) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "INVALID_REQUEST",
              "Email or phone number is required.",
            ),
          );
      }

      // Verify and consume OTP
      const otpValid = await verifyAndConsumeOtp(
        identifier,
        identifierType,
        purpose,
        code,
        reply,
      );
      if (!otpValid) return;

      let existingQuery = database.selectFrom("users").select("id");
      if (email) {
        existingQuery = existingQuery.where("email", "=", email);
      } else if (phoneNo) {
        existingQuery = existingQuery.where("phone_no", "=", phoneNo);
      }
      const existingUser = await existingQuery.executeTakeFirst();
      if (existingUser) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "USER_EXISTS",
              "An account with this email or phone number already exists.",
            ),
          );
      }

      const existingUsername = await database
        .selectFrom("users")
        .select("id")
        .where("username", "=", username.toLowerCase())
        .executeTakeFirst();
      if (existingUsername) {
        return reply
          .code(400)
          .send(httpError(400, "USERNAME_TAKEN", "Username is already taken."));
      }

      const userCount = await database
        .selectFrom("users")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst();
      const count = Number(userCount?.count || 0);
      const isCreator = count === 0;

      const userId = crypto.randomUUID();

      await database.transaction().execute(async (trx) => {
        await trx
          .insertInto("users")
          .values({
            id: userId,
            email: email || null,
            phone_no: phoneNo || null,
            username: username.toLowerCase(),
            display_name: displayName,
            email_verified_at: email ? new Date() : null,
            mfa_mandatory: isCreator,
          })
          .execute();

        const roleName = isCreator ? "creator" : "student";
        const role = await trx
          .selectFrom("roles")
          .select("id")
          .where("name", "=", roleName)
          .executeTakeFirst();

        const roleId =
          role?.id ||
          (isCreator
            ? "11111111-1111-4000-a000-000000000001"
            : "22222222-2222-4000-a000-000000000002");

        await trx
          .insertInto("user_roles")
          .values({
            user_id: userId,
            role_id: roleId,
          })
          .execute();
      });

      const user = await database
        .selectFrom("users")
        .selectAll()
        .where("id", "=", userId)
        .executeTakeFirst();

      reply.code(201);
      return establishSession(user, request, reply);
    },
  );

  // Legacy OTP Verification & Account Signup route
  app.post(
    "/auth/otp/verify",
    {
      schema: {
        operationId: "verifyOtp",
        tags: ["Auth"],
        summary: "Verify OTP and Login",
        description:
          "Checks 6-digit OTP. Fails if user account does not exist.",
        body: otpVerifyRequestSchema,
        response: {
          200: jsonResponse("Verification successful.", loginResponseSchema),
          400: errorResponse("No user exists or code invalid."),
          401: errorResponse("Incorrect code or code expired."),
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNo, code } = request.body;
      const targetPhone = phoneNo;
      const identifier = email || targetPhone;
      const identifierType = email ? "email" : "phone";

      if (!identifier) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "INVALID_REQUEST",
              "Email or phone number is required.",
            ),
          );
      }

      // Verify and consume OTP for purpose: 'login'
      const otpValid = await verifyAndConsumeOtp(
        identifier,
        identifierType,
        "login",
        code,
        reply,
      );
      if (!otpValid) return;

      let userQuery = database.selectFrom("users").selectAll();
      if (email) {
        userQuery = userQuery.where("email", "=", email);
      } else if (targetPhone) {
        userQuery = userQuery.where("phone_no", "=", targetPhone);
      }

      const user = await userQuery.executeTakeFirst();
      if (!user) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "REGISTRATION_REQUIRED",
              "Please register the account first.",
            ),
          );
      }

      return establishSession(user, request, reply);
    },
  );

  // 3.5. Get OAuth Redirection URL
  app.post(
    "/auth/oauth/url",
    {
      schema: {
        operationId: "getOauthUrl",
        tags: ["Auth"],
        summary: "Get OAuth redirection URL",
        description:
          "Generates the OAuth redirection URL with state and optional PKCE verifier stored in a secure cookie.",
        body: z.object({
          provider: z.enum(["google", "github"]),
          redirectUri: z.string().url(),
        }),
        response: {
          200: jsonResponse(
            "URL generated successfully.",
            z.object({
              url: z.string(),
              state: z.string(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { provider, redirectUri } = request.body;
      const state = generateRandomToken();

      let oauthUrl = "";
      let codeVerifier: string | undefined = undefined;

      if (provider === "google") {
        const pkce = generatePkce();
        codeVerifier = pkce.verifier;
        oauthUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          new URLSearchParams({
            client_id: config.GOOGLE_CLIENT_ID || "",
            redirect_uri: redirectUri,
            state,
            response_type: "code",
            scope: "openid profile email",
            code_challenge: pkce.challenge,
            code_challenge_method: "S256",
          }).toString();
      } else {
        oauthUrl =
          `https://github.com/login/oauth/authorize?` +
          new URLSearchParams({
            client_id: config.GITHUB_CLIENT_ID || "",
            redirect_uri: redirectUri,
            state,
            scope: "user:email",
          }).toString();
      }

      // Store state and optional verifier in secure HttpOnly cookie
      reply.setCookie(
        "veolms-oauth-state",
        JSON.stringify({
          state,
          provider,
          code_verifier: codeVerifier,
        }),
        {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 10 * 60, // 10 minutes
        },
      );

      return { url: oauthUrl, state };
    },
  );

  // 4. OAuth Login
  app.post(
    "/auth/oauth/login",
    {
      schema: {
        operationId: "oauthLogin",
        tags: ["Auth"],
        summary: "OAuth Login",
        description:
          "Logs in a user with Google or GitHub OAuth. Fails if user not registered.",
        body: z.object({
          provider: z.enum(["google", "github"]),
          code: z.string().optional(),
          token: z.string().optional(),
          state: z.string().optional(),
          redirectUri: z.string().optional(),
        }),
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse(
            "Authentication failed or account does not exist.",
          ),
        },
      },
    },
    async (request, reply) => {
      const { provider, code, token, state, redirectUri } = request.body;
      const oauthCode = code || token;

      if (!oauthCode) {
        return reply
          .code(400)
          .send(
            httpError(400, "CODE_REQUIRED", "OAuth code or token is required."),
          );
      }

      let codeVerifier: string | undefined = undefined;
      const isMockOauthCode = config.NODE_ENV === "development" && oauthCode.startsWith("mock_");

      // CSRF and state verification (if state is provided or not a mock code)
      if (!isMockOauthCode) {
        const stateCookie = request.cookies["veolms-oauth-state"];
        if (!stateCookie) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISSING",
                "OAuth state cookie is missing. Please restart the flow.",
              ),
            );
        }

        let parsedState;
        try {
          parsedState = JSON.parse(stateCookie);
        } catch {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_INVALID",
                "OAuth state cookie is invalid.",
              ),
            );
        }

        if (parsedState.provider !== provider || parsedState.state !== state) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISMATCH",
                "OAuth state mismatch (possible CSRF attack).",
              ),
            );
        }

        codeVerifier = parsedState.code_verifier;
        // Clear state cookie
        reply.clearCookie("veolms-oauth-state", { path: "/" });
      }

      const oauthDetails = await fetchOauthProfile(
        provider,
        oauthCode,
        redirectUri,
        codeVerifier,
        reply,
      );
      if (reply.sent) return;

     let user = await database
        .selectFrom("users")
        .innerJoin("oauth_accounts", "oauth_accounts.user_id", "users.id")
        .selectAll("users")
        .where("oauth_accounts.provider", "=", provider)
        .where("oauth_accounts.provider_user_id", "=", oauthDetails.providerUserId)
        .executeTakeFirst();

      if (!user) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "REGISTRATION_REQUIRED",
              "Please register first using your Google or GitHub account.",
            ),
          );
      }

      return establishSession(user, request, reply);
    },
  );

  // 5. OAuth Register
  app.post(
    "/auth/oauth/register",
    {
      schema: {
        operationId: "oauthRegister",
        tags: ["Auth"],
        summary: "OAuth Register",
        description: "Registers a user with Google or GitHub OAuth.",
        body: z.object({
          provider: z.enum(["google", "github"]),
          code: z.string().optional(),
          token: z.string().optional(),
          state: z.string().optional(),
          redirectUri: z.string().optional(),
          username: z.string().optional(),
          displayName: z.string().optional(),
        }),
        response: {
          201: jsonResponse("Registration successful.", loginResponseSchema),
          400: errorResponse(
            "Authentication failed, username taken, or account exists.",
          ),
        },
      },
    },
    async (request, reply) => {
      const {
        provider,
        code,
        token,
        state,
        redirectUri,
        username: preferredUsername,
        displayName: preferredDisplayName,
      } = request.body;
      const oauthCode = code || token;

      if (!oauthCode) {
        return reply
          .code(400)
          .send(
            httpError(400, "CODE_REQUIRED", "OAuth code or token is required."),
          );
      }

      let codeVerifier: string | undefined = undefined;
      const isMockOauthCode = config.NODE_ENV === "development" && oauthCode.startsWith("mock_");
      // CSRF and state verification (if not mock)
      if (!isMockOauthCode) {
        const stateCookie = request.cookies["veolms-oauth-state"];
        if (!stateCookie) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISSING",
                "OAuth state cookie is missing. Please restart the flow.",
              ),
            );
        }

        let parsedState;
        try {
          parsedState = JSON.parse(stateCookie);
        } catch {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_INVALID",
                "OAuth state cookie is invalid.",
              ),
            );
        }

        if (parsedState.provider !== provider || parsedState.state !== state) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISMATCH",
                "OAuth state mismatch (possible CSRF attack).",
              ),
            );
        }

        codeVerifier = parsedState.code_verifier;
        // Clear state cookie
        reply.clearCookie("veolms-oauth-state", { path: "/" });
      }

      const oauthDetails = await fetchOauthProfile(
        provider,
        oauthCode,
        redirectUri,
        codeVerifier,
        reply,
      );
      if (reply.sent) return;

      let user = await database
        .selectFrom("users")
        .selectAll()
        .where("email", "=", oauthDetails.email)
        .executeTakeFirst();

      if (user) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "USER_EXISTS",
              "An account with this email already exists. Please log in instead.",
            ),
          );
      }

      const displayName =
        preferredDisplayName ||
        oauthDetails.name ||
        oauthDetails.email.split("@")[0] ||
        "OAuth User";
      const baseUsername = (
        preferredUsername ||
        oauthDetails.username ||
        oauthDetails.email.split("@")[0] ||
        "oauth_user"
      )
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");

      let uniqueUsername = baseUsername;
      let isTaken = true;
      let attempts = 0;
      while (isTaken && attempts < 10) {
        const existing = await database
          .selectFrom("users")
          .select("id")
          .where("username", "=", uniqueUsername)
          .executeTakeFirst();
        if (!existing) {
          isTaken = false;
        } else {
          uniqueUsername = `${baseUsername}_${crypto.randomInt(100, 999)}`;
          attempts++;
        }
      }

      const userCount = await database
        .selectFrom("users")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst();
      const count = Number(userCount?.count || 0);
      const isCreator = count === 0;

      const userId = crypto.randomUUID();

      await database.transaction().execute(async (trx) => {
        await trx
          .insertInto("users")
          .values({
            id: userId,
            email: oauthDetails.email,
            phone_no: null,
            username: uniqueUsername,
            display_name: displayName,
            email_verified_at: new Date(),
            mfa_mandatory: isCreator,
          })
          .execute();

        await trx
          .insertInto("oauth_accounts")
          .values({
            id: crypto.randomUUID(),
            user_id: userId,
            provider,
            provider_user_id: oauthDetails.providerUserId,
          })
          .execute();

        const roleName = isCreator ? "creator" : "student";
        const role = await trx
          .selectFrom("roles")
          .select("id")
          .where("name", "=", roleName)
          .executeTakeFirst();

        const roleId =
          role?.id ||
          (isCreator
            ? "11111111-1111-4000-a000-000000000001"
            : "22222222-2222-4000-a000-000000000002");

        await trx
          .insertInto("user_roles")
          .values({
            user_id: userId,
            role_id: roleId,
          })
          .execute();
      });

      const registeredUser = await database
        .selectFrom("users")
        .selectAll()
        .where("id", "=", userId)
        .executeTakeFirst();

      reply.code(201);
      return establishSession(registeredUser, request, reply);
    },
  );

  // Legacy OAuth verify endpoint (updated to act as login / fail if not registered)
  app.post(
    "/auth/oauth/verify",
    {
      schema: {
        operationId: "oauthVerify",
        tags: ["Auth"],
        summary: "OAuth Login",
        description: "Validates Google or GitHub tokens and logs in the user.",
        body: z.object({
          provider: z.enum(["google", "github"]),
          code: z.string().optional(),
          token: z.string().optional(),
          state: z.string().optional(),
          redirectUri: z.string().optional(),
        }),
        response: {
          200: jsonResponse("Authentication successful.", loginResponseSchema),
          400: errorResponse(
            "OAuth verification failed or user not registered.",
          ),
        },
      },
    },
    async (request, reply) => {
      const { provider, code, token, state, redirectUri } = request.body;
      const oauthCode = code || token;

      if (!oauthCode) {
        return reply
          .code(400)
          .send(
            httpError(400, "CODE_REQUIRED", "OAuth code or token is required."),
          );
      }

      let codeVerifier: string | undefined = undefined;
      const isMockOauthCode = config.NODE_ENV === "development" && oauthCode.startsWith("mock_");
      // CSRF and state verification (if not mock)
      if (!isMockOauthCode) {
        const stateCookie = request.cookies["veolms-oauth-state"];
        if (!stateCookie) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISSING",
                "OAuth state cookie is missing. Please restart the flow.",
              ),
            );
        }

        let parsedState;
        try {
          parsedState = JSON.parse(stateCookie);
        } catch {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_INVALID",
                "OAuth state cookie is invalid.",
              ),
            );
        }

        if (parsedState.provider !== provider || parsedState.state !== state) {
          return reply
            .code(400)
            .send(
              httpError(
                400,
                "OAUTH_STATE_MISMATCH",
                "OAuth state mismatch (possible CSRF attack).",
              ),
            );
        }

        codeVerifier = parsedState.code_verifier;
        // Clear state cookie
        reply.clearCookie("veolms-oauth-state", { path: "/" });
      }

      const oauthDetails = await fetchOauthProfile(
        provider,
        oauthCode,
        redirectUri,
        codeVerifier,
        reply,
      );
      if (reply.sent) return;

      const user = await database
        .selectFrom("users")
        .innerJoin("oauth_accounts", "oauth_accounts.user_id", "users.id")
        .selectAll("users")
        .where("oauth_accounts.provider", "=", provider)
        .where("oauth_accounts.provider_user_id", "=", oauthDetails.providerUserId)
        .executeTakeFirst();

      if (!user) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "REGISTRATION_REQUIRED",
              "Please register first using your Google or GitHub account.",
            ),
          );
      }

      return establishSession(user, request, reply);
    },
  );

  // Auth Config Check
  app.get(
    "/auth/config",
    {
      schema: {
        operationId: "getAuthConfig",
        tags: ["Auth"],
        summary: "Get public auth configs",
        description: "Returns public OAuth Client IDs.",
        response: {
          200: jsonResponse(
            "OAuth Client IDs context.",
            z.object({
              googleClientId: z.string().optional(),
              githubClientId: z.string().optional(),
            }),
          ),
        },
      },
    },
    async () => {
      return {
        googleClientId: config.GOOGLE_CLIENT_ID || "",
        githubClientId: config.GITHUB_CLIENT_ID || "",
      };
    },
  );

  // Specialized Creator Signup (kept for compatibility, registers Creator)
  app.post(
    "/auth/creator/register",
    {
      schema: {
        operationId: "registerCreator",
        tags: ["Auth"],
        summary: "Specialized Creator onboarding",
        description:
          "Registers the first user on the platform as Creator. Disallowed if accounts exist.",
        body: z.object({
          name: z.string().min(1, "Name is required").max(100),
          email: z.string().email("Invalid email address").toLowerCase(),
          phoneNo: z.string().min(8).nullable().optional(),
        }),
        response: {
          201: jsonResponse(
            "Creator initialized successfully.",
            loginResponseSchema,
          ),
          403: errorResponse("Creator already initialized."),
        },
      },
    },
    async (request, reply) => {
      if (await isSetupAlreadyCompleted(reply)) return;
      if (!requireValidSetupCookie(request, reply)) return;

      const { name, email, phoneNo } = request.body;
      const creatorId = crypto.randomUUID();

      try {
        await database.transaction().execute(async (trx) => {
          const userCount = await trx
            .selectFrom("users")
            .select((eb) => eb.fn.count("id").as("count"))
            .executeTakeFirst();

          const count = Number(userCount?.count || 0);
          if (count > 0) {
            const err = new Error("CREATOR_EXISTS");
            (err as any).statusCode = 403;
            throw err;
          }

          const baseUsername = (email.split("@")[0] || "creator")
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_");
          let username = baseUsername;
          let isTaken = true;
          let attempts = 0;
          while (isTaken && attempts < 10) {
            const existing = await trx
              .selectFrom("users")
              .select("id")
              .where("username", "=", username)
              .executeTakeFirst();
            if (!existing) {
              isTaken = false;
            } else {
              username = `${baseUsername}_${crypto.randomInt(100, 999)}`;
              attempts++;
            }
          }

          await trx
            .insertInto("users")
            .values({
              id: creatorId,
              email,
              phone_no: phoneNo || null,
              username,
              display_name: name,
              email_verified_at: new Date(),
              mfa_mandatory: true,
            })
            .execute();

          const creatorRole = await trx
            .selectFrom("roles")
            .select("id")
            .where("name", "=", "creator")
            .executeTakeFirst();

          const roleId =
            creatorRole?.id || "11111111-1111-4000-a000-000000000001";

          await trx
            .insertInto("user_roles")
            .values({
              user_id: creatorId,
              role_id: roleId,
            })
            .execute();
        });
      } catch (err: any) {
        if (err.message === "CREATOR_EXISTS") {
          return reply
            .code(403)
            .send(
              httpError(
                403,
                "CREATOR_EXISTS",
                "LMS platform has already been initialized. Creator account exists.",
              ),
            );
        }
        throw err;
      }

      const user = await database
        .selectFrom("users")
        .selectAll()
        .where("id", "=", creatorId)
        .executeTakeFirst();

      reply.code(201);
      return establishSession(user, request, reply);
    },
  );

  // Logout
  app.post(
    "/auth/logout",
    {
      schema: {
        operationId: "logout",
        tags: ["Auth"],
        summary: "Log out of session",
        description: "Invalidates the active session and clears cookies.",
        response: {
          200: jsonResponse("Logged out.", authMessageResponseSchema),
        },
      },
      preHandler: [authMiddleware.authenticate],
    },
    async (request, reply) => {
      if (request.session) {
        await database
          .deleteFrom("sessions")
          .where("id", "=", request.session.id)
          .execute();
      }

      reply.clearCookie("veolms-session", { path: "/" });
      return { message: "Logged out successfully" };
    },
  );

  // Me
  app.get(
    "/auth/me",
    {
      schema: {
        operationId: "getCurrentUserProfile",
        tags: ["Auth"],
        summary: "Get current user profile",
        description:
          "Inspects and returns the active authenticated user profile details.",
        response: {
          200: jsonResponse("User context.", userProfileResponseSchema),
          401: errorResponse("Session missing or invalid."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request) => {
      return {
        id: request.user!.id,
        username: request.user!.username,
        displayName: request.user!.displayName,
        email: request.user!.email,
        phoneNo: request.user!.phoneNo,
        roles: request.user!.roles,
        permissions: request.user!.permissions,
        mfaVerified: request.session!.mfa_verified,
        totpEnabled: request.user!.totpEnabled,
        passkeyEnabled: request.user!.passkeyEnabled,
      };
    },
  );

  // Get Sessions
  app.get(
    "/auth/sessions",
    {
      schema: {
        operationId: "getActiveSessions",
        tags: ["Auth"],
        summary: "List active sessions",
        description: "Returns metadata for all active user sessions.",
        response: {
          200: jsonResponse(
            "List of active sessions.",
            z.array(sessionResponseSchema),
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request) => {
      const userId = request.user!.id;
      const currentSessionId = request.session!.id;

      const sessions = await database
        .selectFrom("sessions")
        .select([
          "id",
          "ip_address",
          "user_agent",
          "created_at",
          "last_used_at",
        ])
        .where("user_id", "=", userId)
        .orderBy("last_used_at", "desc")
        .execute();

      return sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        isCurrent: s.id === currentSessionId,
        createdAt: s.created_at.toISOString(),
        lastUsedAt: s.last_used_at.toISOString(),
      }));
    },
  );

  // Revoke Specific Session
  app.delete(
    "/auth/sessions/:id",
    {
      schema: {
        operationId: "revokeSession",
        tags: ["Auth"],
        summary: "Revoke active session",
        description: "Invalidates a specific user session from the database.",
        params: sessionParamsSchema,
        response: {
          200: jsonResponse("Session revoked.", authMessageResponseSchema),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      await database
        .deleteFrom("sessions")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .execute();

      return reply.send({ message: "Session revoked" });
    },
  );

  // Revoke All Other Sessions
  app.post(
    "/auth/sessions/revoke-all",
    {
      schema: {
        operationId: "revokeAllOtherSessions",
        tags: ["Auth"],
        summary: "Revoke other active sessions",
        description:
          "Terminates all user sessions except the current active one.",
        response: {
          200: jsonResponse(
            "Other sessions successfully revoked.",
            authMessageResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request) => {
      const userId = request.user!.id;
      const currentSessionId = request.session!.id;

      await database
        .deleteFrom("sessions")
        .where("user_id", "=", userId)
        .where("id", "!=", currentSessionId)
        .execute();

      return { message: "All other sessions revoked" };
    },
  );

  // TOTP MFA Setup
  app.post(
    "/auth/totp/setup",
    {
      schema: {
        operationId: "setupTotp",
        tags: ["Auth"],
        summary: "Generate TOTP Secret",
        description:
          "Generates a dynamic base32 MFA secret and provisioning URL challenge.",
        response: {
          200: jsonResponse("MFA secret metadata.", totpSetupResponseSchema),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request) => {
      const userIdentifier =
        request.user!.email ||
        request.user!.username ||
        request.user!.phoneNo ||
        "user";
      const { secret, uri } = generateTotpSecret(
        userIdentifier,
        config.RP_NAME,
      );

      return { secret, uri };
    },
  );

  // TOTP MFA Enable
  app.post(
    "/auth/totp/enable",
    {
      schema: {
        operationId: "enableTotp",
        tags: ["Auth"],
        summary: "Activate TOTP Authenticator",
        description:
          "Validates verification code and registers authenticator. Outputs 10 backup recovery codes.",
        body: totpEnableRequestSchema,
        response: {
          200: jsonResponse(
            "TOTP enabled successfully. Recovery backup codes returned.",
            totpEnableResponseSchema,
          ),
          400: errorResponse("Verification failed."),
          401: errorResponse("Unauthorized."),
          403: errorResponse("Step-up MFA required to replace existing factor."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
      const { code, secret } = request.body;
      const hasAnyFactor = await userHasAnyMfaFactor(request.user!.id);

      if (hasAnyFactor && !request.session!.mfa_verified) {
        return reply.code(403).send(httpError(403, "MFA_STEP_UP_REQUIRED", "Verify an existing MFA factor before adding or replacing another."));
      }

      const totpResult = verifyTotp(secret, code, {
        backwardSteps: config.TOTP_BACKWARD_STEPS,
        forwardSteps: config.TOTP_FORWARD_STEPS,
      });
      if (!totpResult || !totpResult.verified) {
        return reply
          .code(400)
          .send(httpError(400, "INVALID_CODE", "Invalid verification code."));
      }
      const currentStep = Number(totpResult.step);

      const secretEncrypted = encryptSecret(secret, config.MFA_ENCRYPTION_KEY);

      const backupCodes: string[] = [];
      const backupCodesValues: {
        id: string;
        user_id: string;
        code_hash: string;
      }[] = [];

      for (let i = 0; i < 10; i++) {
        const codeValue = crypto.randomInt(10000000, 99999999).toString();
        backupCodes.push(codeValue);
        backupCodesValues.push({
          id: crypto.randomUUID(),
          user_id: request.user!.id,
          code_hash: hashToken(codeValue),
        });
      }

      await database.transaction().execute(async (trx) => {
        // Delete any existing TOTP credential for this user
        await trx
          .deleteFrom("user_totp_credentials")
          .where("user_id", "=", request.user!.id)
          .execute();

        await trx
          .insertInto("user_totp_credentials")
          .values({
            id: crypto.randomUUID(),
            user_id: request.user!.id,
            secret_encrypted: secretEncrypted,
            enabled: true,
            last_used_step: String(currentStep),
          })
          .execute();

        // Delete any existing backup codes for this user
        await trx
          .deleteFrom("mfa_backup_codes")
          .where("user_id", "=", request.user!.id)
          .execute();

        // Insert new backup codes
        if (backupCodesValues.length > 0) {
          await trx
            .insertInto("mfa_backup_codes")
            .values(backupCodesValues)
            .execute();
        }

        await trx
          .updateTable("sessions")
          .set({ mfa_verified: true })
          .where("id", "=", request.session!.id)
          .execute();
      });

      return { backupCodes };
    },
  );

  // TOTP MFA Verify
  app.post(
    "/auth/totp/verify",
    {
      schema: {
        operationId: "verifyTotpCode",
        tags: ["Auth"],
        summary: "Verify TOTP Authenticator Code",
        description:
          "Validates a 6-digit TOTP code or 8-digit backup code to complete step-up MFA login.",
        body: totpVerifyRequestSchema,
        response: {
          200: jsonResponse("MFA verified.", authMessageResponseSchema),
          400: errorResponse("TOTP is not enabled."),
          401: errorResponse("Incorrect code or unauthorized."),
          429: errorResponse("Too many failed attempts."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
      const { code } = request.body;
      const userId = request.user!.id;

        const totpCred = await database
          .selectFrom("user_totp_credentials")
          .select(["id", "secret_encrypted", "enabled", "last_used_step", "failed_attempts", "locked_until"])
          .where("user_id", "=", userId)
          .executeTakeFirst();

      if (!totpCred || !totpCred.enabled) {
        return reply.code(400).send(httpError(400, "MFA_NOT_ENABLED", "TOTP MFA is not enabled for this user."));
      }

      if (totpCred.locked_until && totpCred.locked_until > new Date()) {
        return reply
          .code(429)
          .send(httpError(429, "TOTP_LOCKED", "Too many failed attempts. Try again later."));
      }



      const plaintextSecret = decryptSecret(
        totpCred.secret_encrypted,
        config.MFA_ENCRYPTION_KEY,
      );
      const totpResult = verifyTotp(plaintextSecret, code, {
        backwardSteps: 1,
        forwardSteps: 0,
      });

      if (totpResult && totpResult.verified) {
        // Replay protection check
        if (
          totpCred.last_used_step &&
          totpResult.step <= BigInt(totpCred.last_used_step)
        ) {
          return reply
            .code(401)
            .send(
              httpError(
                401,
                "INVALID_CODE",
                "TOTP code has already been used.",
              ),
            );
        }

        // Atomically update last_used_step to prevent concurrent reuse
        const updateRes = await database
          .updateTable("user_totp_credentials")
          .set({
            last_used_step: String(totpResult.step),
            updated_at: new Date(),
          })
          .where("user_id", "=", userId)
          .where((eb) =>
            eb.or([
              eb("last_used_step", "is", null),
              eb("last_used_step", "<", String(totpResult.step)),
            ]),
          )
          .executeTakeFirst();

        if (Number(updateRes.numUpdatedRows || 0) === 0) {
          return reply
            .code(401)
            .send(
              httpError(
                401,
                "INVALID_CODE",
                "TOTP code has already been used.",
              ),
            );
        }

        await database
          .updateTable("sessions")
          .set({ mfa_verified: true })
          .where("id", "=", request.session!.id)
          .execute();

        return { message: "MFA verified successfully" };
      }

      // Check if it is a backup code
      const hashedCode = hashToken(code);
      const backupCode = await database
        .selectFrom("mfa_backup_codes")
        .select("id")
        .where("user_id", "=", userId)
        .where("code_hash", "=", hashedCode)
        .where("used_at", "is", null)
        .executeTakeFirst();

      if (backupCode) {
        // Atomically mark it as used
        const updateBackup = await database
          .updateTable("mfa_backup_codes")
          .set({ used_at: new Date() })
          .where("id", "=", backupCode.id)
          .where("used_at", "is", null)
          .executeTakeFirst();

        if (Number(updateBackup.numUpdatedRows || 0) > 0) {
          await database
            .updateTable("sessions")
            .set({ mfa_verified: true })
            .where("id", "=", request.session!.id)
            .execute();

          return { message: "MFA verified using backup code" };
        }
      }
      const newAttempts = totpCred.failed_attempts + 1;
      await database
        .updateTable("user_totp_credentials")
        .set({
          failed_attempts: newAttempts,
          locked_until: newAttempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null,
        })
        .where("id", "=", totpCred.id)
        .execute();

      return reply
        .code(401)
        .send(httpError(401, "INVALID_CODE", "Invalid verification code."));
    },
  );

  // Passkey WebAuthn Challenge Registration Options
  app.post(
    "/auth/passkey/register/options",
    {
      schema: {
        operationId: "getPasskeyRegisterOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Registration Options",
        description:
          "Creates options challenge payload to register a new WebAuthn credential.",
        response: {
          200: jsonResponse(
            "Passkey options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("Step-up MFA required to replace existing factor."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
    const userPasskeys = await database
      .selectFrom("passkeys")
      .select("credential_id")
      .where("user_id", "=", request.user!.id)
      .execute();

    const hasAnyFactor = await userHasAnyMfaFactor(request.user!.id);

    if (hasAnyFactor && !request.session!.mfa_verified) {
      return reply.code(403).send(httpError(403, "MFA_STEP_UP_REQUIRED", "Verify an existing MFA factor before adding another passkey."));
    }
      const userIdentifier =
        request.user!.email ||
        request.user!.username ||
        request.user!.phoneNo ||
        "user";
      const options = await generateRegistrationOptions({
        rpName: config.RP_NAME,
        rpID: config.RP_ID,
        userID: Uint8Array.from(Buffer.from(request.user!.id)),
        userName: userIdentifier,
        userDisplayName: request.user!.name,
        attestationType: "none",
        excludeCredentials: userPasskeys.map((p) => ({
          id: p.credential_id,
          type: "public-key",
        })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      });

      // Clear any old registration challenges for this user
      await database.transaction().execute(async (trx) => {
        await trx.deleteFrom("webauthn_challenges")
          .where("user_id", "=", request.user!.id)
          .where("type", "=", "registration")
          .execute();
          await trx
            .insertInto("webauthn_challenges")
            .values({
              id: crypto.randomUUID(),  
              user_id: request.user!.id,
              challenge: options.challenge,
              type: "registration",
              expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
              consumed_at: null,
            })
            .execute();
      })


      return options;
    },
  );

  // Passkey WebAuthn Registration Verification
  app.post(
    "/auth/passkey/register/verify",
    {
      schema: {
        operationId: "verifyPasskeyRegister",
        tags: ["Auth"],
        summary: "Verify Passkey Registration Response",
        description:
          "Verifies the browser WebAuthn response signature and saves credential to user keys.",
        body: passkeyRegisterVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey registered successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Verification challenge expired or validation failed.",
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
      const challengeRecord = await database
        .selectFrom("webauthn_challenges")
        .selectAll()
        .where("user_id", "=", request.user!.id)
        .where("type", "=", "registration")
        .where("expires_at", ">", new Date())
        .where("consumed_at", "is", null)
        .executeTakeFirst();

      if (!challengeRecord) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "CHALLENGE_MISSING",
              "Registration challenge missing, expired, or already used. Call register/options first.",
            ),
          );
      }

      // Atomically update consumed_at to prevent replay
      const updateRes = await database
        .updateTable("webauthn_challenges")
        .set({ consumed_at: new Date() })
        .where("id", "=", challengeRecord.id)
        .where("consumed_at", "is", null)
        .executeTakeFirst();

      if (Number(updateRes.numUpdatedRows || 0) === 0) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "VERIFICATION_FAILED",
              "Challenge has already been used.",
            ),
          );
      }

      const challenge = challengeRecord.challenge;

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: request.body.response,
          expectedChallenge: challenge,
          expectedOrigin: config.WEB_URL,
          expectedRPID: config.RP_ID,
          requireUserVerification: true,
        });
      } catch (err: any) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "REGISTRATION_VERIFICATION_FAILED",
              `WebAuthn verification failed: ${err.message}`,
            ),
          );
      }

      if (verification.verified && verification.registrationInfo) {
        const { credential } = verification.registrationInfo;
        const {
          id: credentialID,
          publicKey: credentialPublicKey,
          counter,
        } = credential;

        await database.transaction().execute(async (trx) => {
          await trx
            .insertInto("passkeys")
            .values({
              id: crypto.randomUUID(),
              user_id: request.user!.id,
              credential_id: credentialID,
              public_key: Buffer.from(credentialPublicKey).toString("base64"),
              counter: counter,
              transports: request.body.response.transports
                ? request.body.response.transports.join(",")
                : null,
            })
            .execute();

          await trx
            .updateTable("sessions")
            .set({ mfa_verified: true })
            .where("id", "=", request.session!.id)
            .execute();
        });

        return { message: "Passkey registered successfully." };
      }

      return reply
        .code(400)
        .send(
          httpError(400, "VERIFICATION_FAILED", "Passkey verification failed."),
        );
    },
  );

  // Passkey WebAuthn Challenge Authentication Options
  app.post(
    "/auth/passkey/login/options",
    {
      schema: {
        operationId: "getPasskeyLoginOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Login Options",
        description:
          "Creates options challenge payload to complete WebAuthn login assertion.",
        response: {
          200: jsonResponse(
            "Assertion options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request) => {
      const userPasskeys = await database
        .selectFrom("passkeys")
        .select(["credential_id", "transports"])
        .where("user_id", "=", request.user!.id)
        .execute();

      const options = await generateAuthenticationOptions({
        rpID: config.RP_ID,
        allowCredentials: userPasskeys.map((p) => ({
          id: p.credential_id,
          type: "public-key",
          transports: p.transports
            ? (p.transports.split(",") as any)
            : undefined,
        })),
        userVerification: "required",
      });

      // Clear any old authentication challenges for this user
      await database
        .deleteFrom("webauthn_challenges")
        .where("user_id", "=", request.user!.id)
        .where("type", "=", "authentication")
        .execute();

      await database
        .insertInto("webauthn_challenges")
        .values({
          id: crypto.randomUUID(),
          user_id: request.user!.id,
          challenge: options.challenge,
          type: "authentication",
          expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
          consumed_at: null,
        })
        .execute();

      return options;
    },
  );

  // Passkey WebAuthn Authentication Verification
  app.post(
    "/auth/passkey/login/verify",
    {
      schema: {
        operationId: "verifyPasskeyLogin",
        tags: ["Auth"],
        summary: "Verify Passkey Login Response",
        description:
          "Verifies browser WebAuthn assertion signature, completing step-up MFA login.",
        body: passkeyLoginVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey verified successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Challenge expired or passkey credential missing.",
          ),
          401: errorResponse("Incorrect code or signature validation failed."),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireAuthenticated,
      ],
    },
    async (request, reply) => {
      const challengeRecord = await database
        .selectFrom("webauthn_challenges")
        .selectAll()
        .where("user_id", "=", request.user!.id)
        .where("type", "=", "authentication")
        .where("expires_at", ">", new Date())
        .where("consumed_at", "is", null)
        .executeTakeFirst();

      if (!challengeRecord) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "CHALLENGE_MISSING",
              "Authentication challenge missing, expired, or already used. Call login/options first.",
            ),
          );
      }

      // Atomically update consumed_at to prevent replay
      const updateRes = await database
        .updateTable("webauthn_challenges")
        .set({ consumed_at: new Date() })
        .where("id", "=", challengeRecord.id)
        .where("consumed_at", "is", null)
        .executeTakeFirst();

      if (Number(updateRes.numUpdatedRows || 0) === 0) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "VERIFICATION_FAILED",
              "Challenge has already been used.",
            ),
          );
      }

      const challenge = challengeRecord.challenge;
      const credentialID = request.body.response.id;

      const passkey = await database
        .selectFrom("passkeys")
        .selectAll()
        .where("user_id", "=", request.user!.id)
        .where("credential_id", "=", credentialID)
        .executeTakeFirst();

      if (!passkey) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "CREDENTIAL_NOT_FOUND",
              "Passkey credential matching this session is not registered.",
            ),
          );
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: request.body.response,
          expectedChallenge: challenge,
          expectedOrigin: config.WEB_URL,
          expectedRPID: config.RP_ID,
          credential: {
            id: passkey.credential_id,
            publicKey: Buffer.from(passkey.public_key, "base64"),
            counter: Number(passkey.counter),
          },
          requireUserVerification: true,
        });
      } catch (err: any) {
        return reply
          .code(401)
          .send(
            httpError(
              401,
              "ASSERTION_FAILED",
              `WebAuthn assertion failed: ${err.message}`,
            ),
          );
      }

      if (verification.verified && verification.authenticationInfo) {
        const { newCounter } = verification.authenticationInfo;

        await database.transaction().execute(async (trx) => {
          await trx
            .updateTable("passkeys")
            .set({ counter: newCounter })
            .where("id", "=", passkey.id)
            .execute();

          await trx
            .updateTable("sessions")
            .set({ mfa_verified: true })
            .where("id", "=", request.session!.id)
            .execute();
        });

        return { message: "MFA verified successfully." };
      }

      return reply
        .code(401)
        .send(
          httpError(
            401,
            "VERIFICATION_FAILED",
            "Assertion verification failed.",
          ),
        );
    },
  );

  // Helper to ensure setup is not finalized
  async function isSetupAlreadyCompleted(reply: any): Promise<boolean> {
    const academy = await database
      .selectFrom("academy")
      .selectAll()
      .executeTakeFirst();

    if (academy?.setup_completed) {
      reply
        .code(403)
        .send(httpError(403, "SETUP_ALREADY_COMPLETED", "The platform setup has already been finalized and locked."));
      return true;
    }
    return false;
  }

  // helper 
  const SETUP_COOKIE = "veolms-setup-token";

  function requireValidSetupCookie(request: any, reply: any): boolean {
    const cookieValue = request.cookies[SETUP_COOKIE];
    const expected = config.SETUP_TOKEN;

    if (
      !cookieValue ||
      cookieValue.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(expected))
    ) {
      reply
        .code(401)
        .send(httpError(401, "SETUP_TOKEN_REQUIRED", "A valid setup session is required for this action."));
      return false;
    }
    return true;
}
  // A. Verify Setup Token
  app.post(
    "/auth/verify-token",
    {
      schema: {
        operationId: "verifySetupToken",
        tags: ["Auth"],
        summary: "Verify setup token",
        description:
          "Checks if the provided token matches the installation setup token.",
        body: z.object({
          token: z.string(),
        }),
        response: {
          200: jsonResponse(
            "Token verified successfully.",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Invalid setup token."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request, reply) => {
      if (await isSetupAlreadyCompleted(reply)) return;
      const { token } = request.body;

      if (
        token.length !== config.SETUP_TOKEN.length ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.SETUP_TOKEN))
      ) {
        return reply.code(401).send(httpError(401, "INVALID_SETUP_TOKEN", "The setup token provided is incorrect."));
      }

      reply.setCookie(SETUP_COOKIE, token, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 60, // 30 minutes — long enough to finish onboarding
      });

      return { message: "Setup token verified successfully." };
    }
  );

  // B. Configure Academy Brand
  app.post(
    "/auth/academy",
    {
      schema: {
        operationId: "setupAcademy",
        tags: ["Auth"],
        summary: "Configure academy brand details",
        description:
          "Saves the academy brand configuration during platform setup.",
        body: z.object({
          name: z.string().min(1),
          logoUrl: z.string().url().nullable().optional(),
          customDomain: z.string().nullable().optional(),
        }),
        response: {
          200: jsonResponse(
            "Academy brand saved successfully.",
            z.object({
              id: z.string(),
              name: z.string(),
              logoUrl: z.string().nullable(),
              customDomain: z.string().nullable(),
              setupCompleted: z.boolean(),
            }),
          ),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request, reply) => {
      if (await isSetupAlreadyCompleted(reply)) return;
      if (!requireValidSetupCookie(request, reply)) return;
      const { name, logoUrl, customDomain } = request.body;
      const existing = await database
        .selectFrom("academy")
        .selectAll()
        .executeTakeFirst();

      const academyId = existing?.id || crypto.randomUUID();
      const updated = {
        id: academyId,
        name,
        logo_url: logoUrl || null,
        custom_domain: customDomain || null,
        updated_at: new Date(),
      };

      if (existing) {
        await database
          .updateTable("academy")
          .set(updated)
          .where("id", "=", existing.id)
          .execute();
      } else {
        await database
          .insertInto("academy")
          .values({
            ...updated,
            setup_completed: false,
          })
          .execute();
      }

      return {
        id: academyId,
        name,
        logoUrl: logoUrl || null,
        customDomain: customDomain || null,
        setupCompleted: false,
      };
    },
  );

  // C. Finalize Platform Setup
  app.post(
    "/auth/setup/finish",
    {
      schema: {
        operationId: "finalizeSetup",
        tags: ["Auth"],
        summary: "Finalize platform setup",
        description: "Locks the platform setup, completing installation.",
        response: {
          200: jsonResponse(
            "Setup finalized successfully.",
            z.object({ message: z.string() }),
          ),
          400: errorResponse("Academy configuration missing."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request, reply) => {
      if (await isSetupAlreadyCompleted(reply)) return;
      if (!requireValidSetupCookie(request, reply)) return;
      const existing = await database
        .selectFrom("academy")
        .selectAll()
        .executeTakeFirst();
      if (!existing) {
        return reply
          .code(400)
          .send(
            httpError(
              400,
              "ACADEMY_NOT_CONFIGURED",
              "Configure academy details first.",
            ),
          );
      }

      await database
        .updateTable("academy")
        .set({ setup_completed: true, updated_at: new Date() })
        .where("id", "=", existing.id)
        .execute();


      reply.clearCookie(SETUP_COOKIE, { path: "/" }); // burn it once setup is locked
      return { message: "Academy setup finalized successfully." };
    },
  );
};

export default authRoutes;
