import { z } from "zod";

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

export const userProfileResponseSchema = z.object({
  id: z.uuid(),
  username: z.string().max(30),
  displayName: z.string().max(100),
  email: z.email().max(255).nullable(),
  phoneNo: z.string().max(15).nullable(),
  roles: z.array(z.string().max(50)),
  permissions: z.array(z.string().max(50)),
  mfaVerified: z.boolean(),
  totpEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
  mfaMandatory: z.boolean(),
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

export const setupTokenRequestSchema = z.object({
  token: z.string().meta({ example: "veo_setup_token_123" }),
});

export type OtpSendRequest = z.input<typeof otpSendRequestSchema>;
export type OtpVerifyRequest = z.input<typeof otpVerifyRequestSchema>;
export type RegisterRequest = z.input<typeof registerRequestSchema>;
export type UserProfileResponse = z.output<typeof userProfileResponseSchema>;
export type CreatorRegisterRequest = z.input<typeof creatorRegisterRequestSchema>;
export type AcademyRequest = z.input<typeof academyRequestSchema>;
export type AcademyResponse = z.output<typeof academyResponseSchema>;
export type SetupTokenRequest = z.input<typeof setupTokenRequestSchema>;
