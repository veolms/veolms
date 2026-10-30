import { z } from "zod";
import { emailInput } from "./email-input.ts";
import { authUserSchema } from "./user.ts";

export const loginRequestSchema = z
  .object({
    email: emailInput("Invalid email address")
      .meta({ example: "ada@example.com" })
      .optional(),
    phoneNo: z
      .string()
      .min(8, "Phone number is too short")
      .meta({ example: "+15551234567" })
      .optional(),
    code: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits")
      .meta({ example: "123456" }),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

export const oauthProviderSchema = z.enum(["google", "github"]);

export const oauthUrlRequestSchema = z.object({
  provider: oauthProviderSchema,
  redirectUri: z
    .url()
    .max(2048)
    .meta({ example: "https://app.example.com/oauth/callback" }),
});

export const oauthUrlResponseSchema = z.object({
  url: z.string().meta({
    description: "Provider consent screen the client should redirect to.",
  }),
});

export const oauthCallbackRequestSchema = z.object({
  provider: oauthProviderSchema,
  code: z.string().meta({ example: "4/0AY0e-g7..." }).optional(),
  token: z.string().meta({ example: "4/0AY0e-g7..." }).optional(),
  state: z.string().meta({ example: "8f14e45fceea167a" }).optional(),
  redirectUri: z
    .string()
    .max(2048)
    .meta({ example: "https://app.example.com/oauth/callback" })
    .optional(),
});

export const oauthLoginRequestSchema = oauthCallbackRequestSchema;

export const googleOneTapLoginRequestSchema = z.object({
  credential: z.string().min(1).meta({
    description: "Google Identity Services ID token from One Tap.",
  }),
});

export const oauthRegisterRequestSchema = oauthCallbackRequestSchema.extend({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username is too long")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username must contain only letters, numbers, and underscores",
    )
    .toLowerCase()
    .meta({ example: "ada_lovelace" })
    .optional(),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(100)
    .meta({ example: "Ada Lovelace" })
    .optional(),
});

export const authConfigResponseSchema = z.object({
  googleClientId: z.string().optional(),
  /**
   * A verified mobile number is needed before buying or enrolling: the
   * course page asks for it first (REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT).
   */
  requireVerifiedPhoneForEnrollment: z.boolean().optional(),
});

export const authMessageResponseSchema = z.object({
  message: z.string().max(255),
});

export const otpSendResponseSchema = authMessageResponseSchema.extend({
  codeExpiresInSeconds: z
    .number()
    .int()
    .positive()
    .meta({
      description:
        "How long the code just sent can be used, counted from this answer " +
        "(OTP_TTL_MINUTES on the server).",
    }),
});

export const loginResponseSchema = z.object({
  user: authUserSchema,
  mfaRequired: z.boolean(),
  mfaMandatory: z.boolean().meta({
    description:
      "True if the account is required to have MFA enrolled (e.g. administrator accounts). " +
      "When mfaRequired is true but neither totpEnabled nor passkeyEnabled is true, " +
      "the client must prompt for MFA enrollment rather than step-up verification.",
  }),
  totpEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
});

export const sessionResponseSchema = z.object({
  id: z.uuid(),
  ipAddress: z.string().max(45).nullable(),
  userAgent: z.string().max(255).nullable(),
  location: z.string().max(255).nullable().meta({
    description: "Roughly where the device signed in from, e.g. a city.",
  }),
  isCurrent: z.boolean(),
  lastUsedAt: z.string().max(40),
});

/**
 * A student at the academy's device limit, signing in on one more: the
 * devices they are signed in on, one of which they sign out to continue.
 */
export const deviceLimitResponseSchema = z.object({
  limit: z.number().int().positive().nullable(),
  sessions: sessionResponseSchema.array(),
});

export const resolveDeviceLimitRequestSchema = z.object({
  sessionId: z.uuid().describe("The session to sign out to make room."),
});

export const sessionParamsSchema = z.object({
  id: z.uuid().describe("The UUID of the session to revoke."),
});

// Passkeys & MFA

/**
 * The least a WebAuthn credential must carry for the server to look it up:
 * a credential id and the authenticator's response object. Everything else
 * is left to the WebAuthn library, which authenticators and password
 * managers extend with fields of their own.
 */
function isWebAuthnCredentialPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const { id, response } = value as { id?: unknown; response?: unknown };
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 2048 &&
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response)
  );
}

const WEBAUTHN_PAYLOAD_MESSAGE =
  "A WebAuthn credential with an id and a response is required";

export const passkeyRegisterVerifyRequestSchema = z.object({
  response: z
    .any()
    .refine(isWebAuthnCredentialPayload, WEBAUTHN_PAYLOAD_MESSAGE)
    .meta({ description: "WebAuthn PublicKeyCredential registration payload" }),
});

export const passkeyLoginVerifyRequestSchema = z.object({
  response: z
    .any()
    .refine(isWebAuthnCredentialPayload, WEBAUTHN_PAYLOAD_MESSAGE)
    .meta({ description: "WebAuthn PublicKeyCredential assertion payload" }),
});

export const totpVerifyRequestSchema = z.object({
  code: z
    .string()
    .regex(
      /^\d{6}$|^\d{8}$/,
      "Code must be a 6-digit TOTP code or an 8-digit backup code",
    )
    .meta({ example: "123456" }),
});

export const totpEnableRequestSchema = z.object({
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d+$/, "TOTP code must contain only digits")
    .meta({ example: "123456" }),
  // The secret comes back unchanged from the setup step, which issues
  // base32. Anything else decodes to a short or empty key.
  secret: z
    .string()
    .min(1, "TOTP secret is required")
    .regex(/^[A-Z2-7]{16,64}$/, "TOTP secret is not valid")
    .meta({ example: "JBSWY3DPEHPK3PXP" }),
});

export const totpSetupResponseSchema = z.object({
  secret: z.string().max(100),
  uri: z.url().max(500),
});

export const totpEnableResponseSchema = z.object({
  backupCodes: z.array(z.string().max(8)),
});

/** A fresh set of single-use backup codes; shown to the user exactly once. */
export const backupCodesResponseSchema = z.object({
  backupCodes: z.array(z.string().max(8)),
});

/**
 * `backupCodes` is present only when this passkey left the account without
 * any unused backup code — in practice, when it is the first factor.
 */
export const passkeyRegisterVerifyResponseSchema =
  authMessageResponseSchema.extend({
    backupCodes: z.array(z.string().max(8)).optional(),
  });

export type PasskeyAuthenticatorTransport =
  "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

export interface PasskeyCredentialDescriptorResponse {
  id: string;
  type: "public-key";
  transports?: PasskeyAuthenticatorTransport[];
}

export interface PasskeyRegistrationOptionsResponse {
  challenge: string;
  rp: { id?: string; name: string };
  user: { displayName: string; id: string; name: string };
  pubKeyCredParams: { alg: number; type: "public-key" }[];
  timeout?: number;
  excludeCredentials?: PasskeyCredentialDescriptorResponse[];
}

export interface PasskeyAuthenticationOptionsResponse {
  challenge: string;
  allowCredentials?: PasskeyCredentialDescriptorResponse[];
  rpId?: string;
  timeout?: number;
  userVerification?: "discouraged" | "preferred" | "required";
}

const passkeyCredentialDescriptorSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("public-key"),
    transports: z
      .array(
        z.enum([
          "ble",
          "cable",
          "hybrid",
          "internal",
          "nfc",
          "smart-card",
          "usb",
        ]),
      )
      .optional(),
  })
  .passthrough();

export const passkeyRegistrationOptionsResponseSchema = z
  .object({
    challenge: z.string().min(1),
    rp: z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
      })
      .passthrough(),
    user: z
      .object({
        displayName: z.string(),
        id: z.string().min(1),
        name: z.string().min(1),
      })
      .passthrough(),
    pubKeyCredParams: z.array(
      z
        .object({
          alg: z.number().int(),
          type: z.literal("public-key"),
        })
        .passthrough(),
    ),
    timeout: z.number().nonnegative().optional(),
    excludeCredentials: z.array(passkeyCredentialDescriptorSchema).optional(),
  })
  .passthrough()
  .meta({ description: "Serialized WebAuthn registration options" });

export const passkeyAuthenticationOptionsResponseSchema = z
  .object({
    challenge: z.string().min(1),
    allowCredentials: z.array(passkeyCredentialDescriptorSchema).optional(),
    rpId: z.string().min(1).optional(),
    timeout: z.number().nonnegative().optional(),
    userVerification: z
      .enum(["discouraged", "preferred", "required"])
      .optional(),
  })
  .passthrough()
  .meta({ description: "Serialized WebAuthn authentication options" });

export const passkeyOptionsResponseSchema = z.union([
  passkeyRegistrationOptionsResponseSchema,
  passkeyAuthenticationOptionsResponseSchema,
]);

export type LoginRequest = z.input<typeof loginRequestSchema>;
export type OauthLoginRequest = z.input<typeof oauthLoginRequestSchema>;
export type GoogleOneTapLoginRequest = z.input<
  typeof googleOneTapLoginRequestSchema
>;
export type OauthRegisterRequest = z.input<typeof oauthRegisterRequestSchema>;
export type OauthProvider = z.output<typeof oauthProviderSchema>;
export type OauthUrlRequest = z.input<typeof oauthUrlRequestSchema>;
export type OauthUrlResponse = z.output<typeof oauthUrlResponseSchema>;
export type OauthCallbackRequest = z.input<typeof oauthCallbackRequestSchema>;
export type AuthConfigResponse = z.output<typeof authConfigResponseSchema>;
export type LoginResponse = z.output<typeof loginResponseSchema>;
export type AuthMessageResponse = z.output<typeof authMessageResponseSchema>;
export type OtpSendResponse = z.output<typeof otpSendResponseSchema>;
export type SessionParams = z.input<typeof sessionParamsSchema>;
export type SessionResponse = z.output<typeof sessionResponseSchema>;
export type DeviceLimitResponse = z.output<typeof deviceLimitResponseSchema>;
export type ResolveDeviceLimitRequest = z.input<
  typeof resolveDeviceLimitRequestSchema
>;
export type PasskeyRegisterVerifyRequest = z.input<
  typeof passkeyRegisterVerifyRequestSchema
>;
export type PasskeyLoginVerifyRequest = z.input<
  typeof passkeyLoginVerifyRequestSchema
>;
export type PasskeyRegisterVerifyResponse = z.output<
  typeof passkeyRegisterVerifyResponseSchema
>;
export type BackupCodesResponse = z.output<typeof backupCodesResponseSchema>;
export type TotpVerifyRequest = z.input<typeof totpVerifyRequestSchema>;
export type TotpEnableRequest = z.input<typeof totpEnableRequestSchema>;
