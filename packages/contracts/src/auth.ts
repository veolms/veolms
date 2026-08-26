import { z } from "zod";

// 1. Passwordless OTP requests
export const otpSendRequestSchema = z
  .object({
    email: z
      .email("Invalid email address")
      .max(255)
      .toLowerCase()
      .meta({ example: "ada@example.com" })
      .optional(),
    phoneNo: z
      .string()
      .min(8, "Phone number is too short")
      .meta({ example: "+15551234567" })
      .optional(),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

export const otpVerifyRequestSchema = z
  .object({
    email: z
      .email()
      .max(255)
      .toLowerCase()
      .meta({ example: "ada@example.com" })
      .optional(),
    phoneNo: z.string().meta({ example: "+15551234567" }).optional(),
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

// 2. Custom Login and Register requests
export const registerRequestSchema = z
  .object({
    email: z
      .email("Invalid email address")
      .max(255)
      .toLowerCase()
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
      .meta({ example: "123456" })
      .optional(),
    emailCode: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits")
      .meta({ example: "123456" })
      .optional(),
    phoneCode: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits")
      .meta({ example: "123456" })
      .optional(),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username is too long")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username must contain only letters, numbers, and underscores",
      )
      .toLowerCase()
      .meta({ example: "ada_lovelace" }),
    displayName: z
      .string()
      .min(1, "Display name is required")
      .max(100)
      .meta({ example: "Ada Lovelace" }),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  })
  .refine(
    (data) =>
      data.email && data.phoneNo
        ? Boolean(data.emailCode && data.phoneCode)
        : Boolean(data.code),
    {
      message:
        "A code is required, or both emailCode and phoneCode are required when both channels are provided",
      path: ["code"],
    },
  );

export const loginRequestSchema = z
  .object({
    email: z
      .email("Invalid email address")
      .max(255)
      .toLowerCase()
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

// OAuth requests
export const oauthProviderSchema = z.enum(["google", "github"]);

export const oauthUrlRequestSchema = z.object({
  provider: oauthProviderSchema,
  redirectUri: z
    .url()
    .meta({ example: "https://app.example.com/oauth/callback" }),
});

export const oauthUrlResponseSchema = z.object({
  url: z.string().meta({
    description: "Provider consent screen the client should redirect to.",
  }),
  state: z.string().meta({
    description: "Opaque CSRF value the provider echoes back on callback.",
  }),
});

/**
 * The provider callback payload.
 *
 * `code` and `token` are accepted interchangeably for backwards compatibility;
 * the handler requires exactly one, which cannot be expressed here without
 * making either individually mandatory.
 */
export const oauthCallbackRequestSchema = z.object({
  provider: oauthProviderSchema,
  code: z.string().meta({ example: "4/0AY0e-g7..." }).optional(),
  token: z.string().meta({ example: "4/0AY0e-g7..." }).optional(),
  state: z.string().meta({ example: "8f14e45fceea167a" }).optional(),
  redirectUri: z
    .string()
    .meta({ example: "https://app.example.com/oauth/callback" })
    .optional(),
});

export const oauthLoginRequestSchema = oauthCallbackRequestSchema;

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
  githubClientId: z.string().optional(),
});

// WebAuthn Passkeys schemas
export const passkeyRegisterVerifyRequestSchema = z.object({
  response: z
    .any()
    .meta({ description: "WebAuthn PublicKeyCredential registration payload" }),
});

export const passkeyLoginVerifyRequestSchema = z.object({
  response: z
    .any()
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
  secret: z
    .string()
    .min(1, "TOTP secret is required")
    .meta({ example: "JBSWY3DPEHPK3PXP" }),
});

// Response contracts representation
export const authMessageResponseSchema = z.object({
  message: z.string().max(255),
});

export const authMenuPermissionSchema = z.object({
  canCreate: z.boolean(),
  canRead: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
});

export interface AuthMenuNode {
  id: string;
  parentId: string | null;
  label: string;
  routeLink: string;
  icon: string | null;
  expanded: boolean;
  checkList?: string | null;
  isBoth: boolean;
  permissions: {
    canCreate: boolean;
    canRead: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
  children?: AuthMenuNode[];
}

export const authMenuNodeSchema: z.ZodType<AuthMenuNode> = z.lazy(() =>
  z.object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    label: z.string(),
    routeLink: z.string(),
    icon: z.string().nullable(),
    expanded: z.boolean(),
    checkList: z.string().nullable().optional(),
    isBoth: z.boolean(),
    permissions: authMenuPermissionSchema,
    children: z.array(authMenuNodeSchema).optional(),
  }),
);

export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string().max(30),
  displayName: z.string().max(100),
  email: z.email().max(255).nullable(),
  phoneNo: z.string().max(15).nullable(),
  roles: z.array(z.string().max(50)).default([]),
  permissions: z.array(z.string().max(50)).default([]),
  menus: z.array(authMenuNodeSchema).default([]),
});

export const loginResponseSchema = z.object({
  user: authUserSchema,
  mfaRequired: z.boolean(),
  mfaMandatory: z.boolean().meta({
    description:
      "True if the account is required to have MFA enrolled (e.g. creator accounts). " +
      "When mfaRequired is true but neither totpEnabled nor passkeyEnabled is true, " +
      "the client must prompt for MFA enrollment rather than step-up verification.",
  }),
  totpEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
});

export const userProfileResponseSchema = z.object({
  id: z.uuid(),
  username: z.string().max(30),
  displayName: z.string().max(100),
  email: z.email().max(255).nullable(),
  phoneNo: z.string().max(15).nullable(),
  roles: z.array(z.string().max(50)).default([]),
  permissions: z.array(z.string().max(50)).default([]),
  menus: z.array(authMenuNodeSchema).default([]),
  mfaVerified: z.boolean(),
  totpEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
});

export const sessionResponseSchema = z.object({
  id: z.uuid(),
  ipAddress: z.string().max(45).nullable(),
  userAgent: z.string().max(255).nullable(),
  isCurrent: z.boolean(),
  createdAt: z.iso.datetime().optional().or(z.string().max(30)),
  lastUsedAt: z.iso.datetime().optional().or(z.string().max(30)),
});

export const totpSetupResponseSchema = z.object({
  secret: z.string().max(100),
  uri: z.url().max(500),
});

export const totpEnableResponseSchema = z.object({
  backupCodes: z.array(z.string().max(8)),
});

export const sessionParamsSchema = z.object({
  id: z.uuid().describe("The UUID of the session to revoke."),
});

// Platform setup contracts
export const setupTokenRequestSchema = z.object({
  token: z.string().meta({ example: "veo_setup_token_123" }),
});

export const creatorRegisterRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .meta({ example: "Ada Lovelace" }),
  email: z
    .email("Invalid email address")
    .max(255)
    .toLowerCase()
    .meta({ example: "ada@example.com" }),
  phoneNo: z
    .string()
    .min(8)
    .meta({ example: "+15551234567" })
    .nullable()
    .optional(),
});

export const academyRequestSchema = z.object({
  name: z.string().min(1).max(255).meta({ example: "Acme Academy" }),
  logoUrl: z
    .url()
    .meta({ example: "https://cdn.example.com/logo.png" })
    .nullable()
    .optional(),
  customDomain: z
    .string()
    .max(255)
    .meta({ example: "learn.example.com" })
    .nullable()
    .optional(),
});

export const academyResponseSchema = z.object({
  id: z.uuid(),
  name: z.string().max(255),
  logoUrl: z.string().nullable(),
  customDomain: z.string().nullable(),
  setupCompleted: z.boolean(),
});

export type PasskeyAuthenticatorTransport =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";

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
  .passthrough()
  .transform((value): PasskeyCredentialDescriptorResponse => value);

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
  .transform((value): PasskeyRegistrationOptionsResponse => value)
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
  .transform((value): PasskeyAuthenticationOptionsResponse => value)
  .meta({ description: "Serialized WebAuthn authentication options" });

export const passkeyOptionsResponseSchema = z.union([
  passkeyRegistrationOptionsResponseSchema,
  passkeyAuthenticationOptionsResponseSchema,
]);

export type OtpSendRequest = z.input<typeof otpSendRequestSchema>;
export type OtpVerifyRequest = z.input<typeof otpVerifyRequestSchema>;
export type RegisterRequest = z.input<typeof registerRequestSchema>;
export type LoginRequest = z.input<typeof loginRequestSchema>;
export type OauthLoginRequest = z.input<typeof oauthLoginRequestSchema>;
export type OauthRegisterRequest = z.input<typeof oauthRegisterRequestSchema>;
export type PasskeyRegisterVerifyRequest = z.input<
  typeof passkeyRegisterVerifyRequestSchema
>;
export type PasskeyLoginVerifyRequest = z.input<
  typeof passkeyLoginVerifyRequestSchema
>;
export type OauthProvider = z.output<typeof oauthProviderSchema>;
export type OauthUrlRequest = z.input<typeof oauthUrlRequestSchema>;
export type OauthUrlResponse = z.output<typeof oauthUrlResponseSchema>;
export type OauthCallbackRequest = z.input<typeof oauthCallbackRequestSchema>;
export type AuthConfigResponse = z.output<typeof authConfigResponseSchema>;
export type LoginResponse = z.output<typeof loginResponseSchema>;
export type AuthMessageResponse = z.output<typeof authMessageResponseSchema>;
export type SessionParams = z.input<typeof sessionParamsSchema>;
export type SetupTokenRequest = z.input<typeof setupTokenRequestSchema>;
export type CreatorRegisterRequest = z.input<
  typeof creatorRegisterRequestSchema
>;
export type AcademyRequest = z.input<typeof academyRequestSchema>;
export type AcademyResponse = z.output<typeof academyResponseSchema>;
export type UserProfileResponse = z.output<typeof userProfileResponseSchema>;
export type AuthUser = z.output<typeof authUserSchema>;
export type AuthMenuPermission = z.output<typeof authMenuPermissionSchema>;
export type SessionResponse = z.output<typeof sessionResponseSchema>;
export type TotpVerifyRequest = z.input<typeof totpVerifyRequestSchema>;
export type TotpEnableRequest = z.input<typeof totpEnableRequestSchema>;

