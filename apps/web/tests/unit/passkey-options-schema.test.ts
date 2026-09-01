import { describe, expect, it } from "vitest";
import {
  passkeyAuthenticationOptionsResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
} from "@veolms/contracts";

const registrationOptions = {
  challenge: "dGVzdC1jaGFsbGVuZ2U",
  rp: { id: "localhost", name: "VeoLMS" },
  user: {
    id: "dXNlci0x",
    name: "ada@example.com",
    displayName: "Ada Lovelace",
  },
  pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
  timeout: 60_000,
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
  excludeCredentials: [
    {
      id: "Y3JlZGVudGlhbC0x",
      type: "public-key" as const,
      transports: ["usb"] as const,
    },
  ],
};

const authenticationOptions = {
  challenge: "dGVzdC1jaGFsbGVuZ2U",
  rpId: "localhost",
  timeout: 60_000,
  userVerification: "required" as const,
  allowCredentials: [
    {
      id: "Y3JlZGVudGlhbC0x",
      type: "public-key" as const,
      transports: ["usb"] as const,
    },
  ],
};

describe("passkey options response schemas", () => {
  it("encodes registration options without stripping WebAuthn extras", () => {
    const parsed =
      passkeyRegistrationOptionsResponseSchema.parse(registrationOptions);
    const encoded = passkeyRegistrationOptionsResponseSchema.encode(parsed);

    expect(encoded.authenticatorSelection).toEqual({
      residentKey: "required",
      userVerification: "required",
    });
    expect(encoded).toMatchObject(registrationOptions);
  });

  it("encodes authentication options", () => {
    const parsed =
      passkeyAuthenticationOptionsResponseSchema.parse(authenticationOptions);
    const encoded = passkeyAuthenticationOptionsResponseSchema.encode(parsed);

    expect(encoded).toMatchObject(authenticationOptions);
  });
});
