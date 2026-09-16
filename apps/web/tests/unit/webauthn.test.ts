import { describe, expect, it } from "vitest";
import {
  formatWebAuthnError,
  toBrowserTransports,
} from "../../src/auth/webauthn.ts";

describe("WebAuthn transport conversion", () => {
  it("preserves smart-card hints while dropping legacy cable hints", () => {
    expect(toBrowserTransports(["smart-card", "cable", "usb"])).toEqual([
      "smart-card",
      "usb",
    ]);
  });
});

describe("WebAuthn error formatting", () => {
  it("formats NotAllowedError as user cancellation", () => {
    const err = new Error("The operation timed out or was not allowed.");
    err.name = "NotAllowedError";

    expect(formatWebAuthnError(err, "registration")).toBe(
      "Passkey registration was cancelled.",
    );
    expect(formatWebAuthnError(err, "authentication")).toBe(
      "Passkey sign-in was cancelled.",
    );
  });

  it("formats AbortError as cancellation", () => {
    const err = new Error("The user aborted a request.");
    err.name = "AbortError";

    expect(formatWebAuthnError(err, "registration")).toBe(
      "Passkey registration was cancelled.",
    );
    expect(formatWebAuthnError(err, "authentication")).toBe(
      "Passkey sign-in was cancelled.",
    );
  });

  it("formats InvalidStateError as already registered", () => {
    const err = new Error("The authenticator was already registered.");
    err.name = "InvalidStateError";

    expect(formatWebAuthnError(err, "registration")).toBe(
      "This passkey is already registered on your authenticator.",
    );
  });

  it("formats NotSupportedError as unsupported device", () => {
    const err = new Error("Not supported.");
    err.name = "NotSupportedError";

    expect(formatWebAuthnError(err, "registration")).toBe(
      "Passkeys are not supported on this device or browser.",
    );
  });
});
