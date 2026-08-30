import { describe, expect, it } from "vitest";
import { toBrowserTransports } from "../../src/auth/webauthn.ts";

describe("WebAuthn transport conversion", () => {
  it("preserves smart-card hints while dropping legacy cable hints", () => {
    expect(toBrowserTransports(["smart-card", "cable", "usb"])).toEqual([
      "smart-card",
      "usb",
    ]);
  });
});
