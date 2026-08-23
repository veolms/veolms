import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTRY_ID,
  SUPPORTED_COUNTRIES,
  findCountry,
  normalizeEmail,
  toNationalDigits,
  validateEmail,
  validateMobile,
} from "../../src/auth/identifier.ts";
import type {
  CountryOption,
  IdentifierMethod,
} from "../../src/auth/identifier.ts";

const identifierMethods: readonly IdentifierMethod[] = ["email", "mobile"];

const india = findCountry(DEFAULT_COUNTRY_ID);

if (!india) {
  throw new Error("The default country must be one of SUPPORTED_COUNTRIES.");
}

describe("identifier methods", () => {
  it("offers email and mobile", () => {
    expect(identifierMethods).toEqual(["email", "mobile"]);
  });
});

describe("supported countries", () => {
  it("includes the default country", () => {
    expect(
      SUPPORTED_COUNTRIES.some((country) => country.id === DEFAULT_COUNTRY_ID),
    ).toBe(true);
  });

  it("finds India by its ISO code", () => {
    expect(findCountry("IN")).toEqual({
      id: "IN",
      name: "India",
      dialCode: "+91",
      nationalDigits: 10,
      flag: "🇮🇳",
    });
  });

  it("finds United States by its ISO code", () => {
    expect(findCountry("US")).toEqual({
      id: "US",
      name: "United States",
      dialCode: "+1",
      nationalDigits: 10,
      flag: "🇺🇸",
    });
  });

  it("returns undefined for an invalid country code", () => {
    expect(findCountry("XX")).toBeUndefined();
  });
});

describe("email validation", () => {
  it("accepts a well-formed address", () => {
    expect(validateEmail("learner@veolms.org")).toBeNull();
  });

  it("rejects a malformed address with the single generic message", () => {
    expect(validateEmail("learner@veolms")).toBe(
      "Please enter a valid email address.",
    );
  });

  it("rejects an empty or whitespace-only address", () => {
    expect(validateEmail("")).toBe("Please enter a valid email address.");
    expect(validateEmail("   ")).toBe("Please enter a valid email address.");
  });

  it("normalises a valid address to trimmed lowercase", () => {
    expect(normalizeEmail("  Learner@VeoLMS.org  ")).toBe("learner@veolms.org");
  });
});

describe("digit extraction", () => {
  it("keeps only the digits of a formatted number", () => {
    expect(toNationalDigits(" (98765) 43-210 ")).toBe("9876543210");
  });
});

describe("mobile validation", () => {
  it("accepts a ten-digit Indian mobile number", () => {
    expect(validateMobile("9876543210", india)).toBeNull();
  });

  it("rejects a number with too few digits", () => {
    expect(validateMobile("987654321", india)).toBe(
      "Please enter a valid 10-digit mobile number.",
    );
  });

  it("rejects a number with too many digits", () => {
    expect(validateMobile("98765432101", india)).toBe(
      "Please enter a valid 10-digit mobile number.",
    );
  });

  it("rejects a number outside India's mobile ranges", () => {
    expect(validateMobile("5876543210", india)).toBe(
      "Please enter a valid 10-digit mobile number.",
    );
  });

  it("tolerates spaces, dashes and brackets", () => {
    expect(validateMobile(" (98765) 43-210 ", india)).toBeNull();
  });

  it("tolerates a dial-code prefix", () => {
    expect(validateMobile("+91 98765 43210", india)).toBeNull();
  });

  it("tolerates a leading trunk zero", () => {
    expect(validateMobile("098765 43210", india)).toBeNull();
  });

  it("rejects an empty or whitespace-only number", () => {
    expect(validateMobile("", india)).toBe(
      "Please enter a valid 10-digit mobile number.",
    );
    expect(validateMobile("   ", india)).toBe(
      "Please enter a valid 10-digit mobile number.",
    );
  });

  it("names the country's own length instead of assuming ten", () => {
    const nineDigitCountry: CountryOption = { ...india, nationalDigits: 9 };

    expect(validateMobile("98765432", nineDigitCountry)).toBe(
      "Please enter a valid mobile number.",
    );
  });
});
