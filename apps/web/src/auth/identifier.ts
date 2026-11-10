import { otpSendRequestSchema } from "@veolms/contracts/auth/user";

export type IdentifierMethod = "email" | "mobile";

export {
  SUPPORTED_COUNTRIES,
  type CountryOption,
} from "@veolms/contracts/auth/phone-countries";
import {
  SUPPORTED_COUNTRIES,
  type CountryOption,
} from "@veolms/contracts/auth/phone-countries";

export function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌐";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const DEFAULT_COUNTRY_ID = "IN";

const NATIONAL_MOBILE_PREFIXES: Record<string, RegExp> = {
  IN: /^[6-9]/,
  US: /^[2-9]/,
  CA: /^[2-9]/,
  GB: /^[7]/,
};

const INVALID_EMAIL_MESSAGE = "Please enter a valid email address.";

export function findCountry(id: string): CountryOption | undefined {
  return SUPPORTED_COUNTRIES.find((country) => country.id === id);
}

export function findCountryByPhoneNumber(
  value: string,
): CountryOption | undefined {
  if (!value.trim().startsWith("+")) return undefined;

  const digits = toNationalDigits(value);
  return [...SUPPORTED_COUNTRIES]
    .filter((country) => digits.startsWith(toNationalDigits(country.dialCode)))
    .sort(
      (left, right) =>
        toNationalDigits(right.dialCode).length -
        toNationalDigits(left.dialCode).length,
    )[0];
}

const DEFAULT_EMAIL_DOMAIN = "gmail.com";

/**
 * What the login sends when only a name was typed: "anurag" (or "anurag@")
 * becomes "anurag@gmail.com". The field keeps what was typed; the code step
 * shows the full address. Anything with a domain of its own is left as is.
 */
export function withDefaultEmailDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const at = trimmed.indexOf("@");
  if (at === -1) return `${trimmed}@${DEFAULT_EMAIL_DOMAIN}`;
  return at === trimmed.length - 1
    ? `${trimmed}${DEFAULT_EMAIL_DOMAIN}`
    : trimmed;
}

export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const result = otpSendRequestSchema.safeParse({ email: trimmed });

  return result.success && result.data.email
    ? result.data.email
    : trimmed.toLowerCase();
}

export function validateEmail(value: string): string | null {
  const result = otpSendRequestSchema.safeParse({ email: value.trim() });

  return result.success ? null : INVALID_EMAIL_MESSAGE;
}

export function toNationalDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function toNationalNumber(
  value: string,
  country: CountryOption,
): string {
  const dialDigits = toNationalDigits(country.dialCode);
  let digits = toNationalDigits(value);

  if (value.trim().startsWith("+") && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }

  if (digits.length > country.nationalDigits && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}

export function toInternationalPhoneNumber(
  value: string,
  country: CountryOption,
): string {
  const digits = toNationalNumber(value, country).slice(
    -country.nationalDigits,
  );

  return digits ? `${country.dialCode}${digits}` : "";
}

export function formatNationalPhoneNumber(
  value: string,
  country: CountryOption,
): string {
  const digits = toNationalNumber(value, country).slice(
    0,
    country.nationalDigits,
  );

  return digits.length > 5
    ? `${digits.slice(0, 5)} ${digits.slice(5)}`
    : digits;
}

function invalidMobileMessage(country: CountryOption): string {
  // Short enough for one line beside the field's label; the country is in
  // the picker next to the field.
  return `Enter a valid ${country.nationalDigits}-digit number.`;
}

export function validateMobile(
  value: string,
  country: CountryOption,
): string | null {
  const digits = toNationalNumber(value, country);

  if (digits.length !== country.nationalDigits) {
    return invalidMobileMessage(country);
  }

  const prefix = NATIONAL_MOBILE_PREFIXES[country.id];

  if (prefix && !prefix.test(digits)) {
    return invalidMobileMessage(country);
  }

  const result = otpSendRequestSchema.safeParse({
    phoneNo: `${country.dialCode}${digits}`,
  });

  return result.success ? null : invalidMobileMessage(country);
}
