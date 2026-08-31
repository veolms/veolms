import { otpSendRequestSchema } from "@veolms/contracts";

export type IdentifierMethod = "email" | "mobile";

export interface CountryOption {
  readonly id: string;
  readonly name: string;
  readonly dialCode: string;
  readonly nationalDigits: number;
  readonly flag?: string;
}

export function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌐";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
  { id: "IN", name: "India", dialCode: "+91", nationalDigits: 10, flag: "🇮🇳" },
  { id: "US", name: "United States", dialCode: "+1", nationalDigits: 10, flag: "🇺🇸" },
  { id: "GB", name: "United Kingdom", dialCode: "+44", nationalDigits: 10, flag: "🇬🇧" },
  { id: "CA", name: "Canada", dialCode: "+1", nationalDigits: 10, flag: "🇨🇦" },
  { id: "AU", name: "Australia", dialCode: "+61", nationalDigits: 9, flag: "🇦🇺" },
  { id: "DE", name: "Germany", dialCode: "+49", nationalDigits: 10, flag: "🇩🇪" },
  { id: "FR", name: "France", dialCode: "+33", nationalDigits: 9, flag: "🇫🇷" },
  { id: "AE", name: "United Arab Emirates", dialCode: "+971", nationalDigits: 9, flag: "🇦🇪" },
  { id: "SA", name: "Saudi Arabia", dialCode: "+966", nationalDigits: 9, flag: "🇸🇦" },
  { id: "SG", name: "Singapore", dialCode: "+65", nationalDigits: 8, flag: "🇸🇬" },
  { id: "JP", name: "Japan", dialCode: "+81", nationalDigits: 10, flag: "🇯🇵" },
  { id: "CN", name: "China", dialCode: "+86", nationalDigits: 11, flag: "🇨🇳" },
  { id: "BR", name: "Brazil", dialCode: "+55", nationalDigits: 11, flag: "🇧🇷" },
  { id: "IT", name: "Italy", dialCode: "+39", nationalDigits: 10, flag: "🇮🇹" },
  { id: "ES", name: "Spain", dialCode: "+34", nationalDigits: 9, flag: "🇪🇸" },
  { id: "NL", name: "Netherlands", dialCode: "+31", nationalDigits: 9, flag: "🇳🇱" },
  { id: "SE", name: "Sweden", dialCode: "+46", nationalDigits: 9, flag: "🇸🇪" },
  { id: "CH", name: "Switzerland", dialCode: "+41", nationalDigits: 9, flag: "🇨🇭" },
  { id: "NZ", name: "New Zealand", dialCode: "+64", nationalDigits: 9, flag: "🇳🇿" },
  { id: "ZA", name: "South Africa", dialCode: "+27", nationalDigits: 9, flag: "🇿🇦" },
  { id: "MX", name: "Mexico", dialCode: "+52", nationalDigits: 10, flag: "🇲🇽" },
  { id: "ID", name: "Indonesia", dialCode: "+62", nationalDigits: 10, flag: "🇮🇩" },
  { id: "PH", name: "Philippines", dialCode: "+63", nationalDigits: 10, flag: "🇵🇭" },
  { id: "PK", name: "Pakistan", dialCode: "+92", nationalDigits: 10, flag: "🇵🇰" },
  { id: "BD", name: "Bangladesh", dialCode: "+880", nationalDigits: 10, flag: "🇧🇩" },
  { id: "NG", name: "Nigeria", dialCode: "+234", nationalDigits: 10, flag: "🇳🇬" },
  { id: "KE", name: "Kenya", dialCode: "+254", nationalDigits: 9, flag: "🇰🇪" },
  { id: "EG", name: "Egypt", dialCode: "+20", nationalDigits: 10, flag: "🇪🇬" },
  { id: "TR", name: "Turkey", dialCode: "+90", nationalDigits: 10, flag: "🇹🇷" },
  { id: "RU", name: "Russia", dialCode: "+7", nationalDigits: 10, flag: "🇷🇺" },
  { id: "KR", name: "South Korea", dialCode: "+82", nationalDigits: 10, flag: "🇰🇷" },
  { id: "AR", name: "Argentina", dialCode: "+54", nationalDigits: 10, flag: "🇦🇷" },
  { id: "CL", name: "Chile", dialCode: "+56", nationalDigits: 9, flag: "🇨🇱" },
  { id: "CO", name: "Colombia", dialCode: "+57", nationalDigits: 10, flag: "🇨🇴" },
  { id: "PL", name: "Poland", dialCode: "+48", nationalDigits: 9, flag: "🇵🇱" },
  { id: "NO", name: "Norway", dialCode: "+47", nationalDigits: 8, flag: "🇳🇴" },
  { id: "FI", name: "Finland", dialCode: "+358", nationalDigits: 10, flag: "🇫🇮" },
  { id: "DK", name: "Denmark", dialCode: "+45", nationalDigits: 8, flag: "🇩🇰" },
  { id: "IE", name: "Ireland", dialCode: "+353", nationalDigits: 9, flag: "🇮🇪" },
  { id: "PT", name: "Portugal", dialCode: "+351", nationalDigits: 9, flag: "🇵🇹" },
  { id: "GR", name: "Greece", dialCode: "+30", nationalDigits: 10, flag: "🇬🇷" },
  { id: "CZ", name: "Czech Republic", dialCode: "+420", nationalDigits: 9, flag: "🇨🇿" },
  { id: "AT", name: "Austria", dialCode: "+43", nationalDigits: 10, flag: "🇦🇹" },
  { id: "BE", name: "Belgium", dialCode: "+32", nationalDigits: 9, flag: "🇧🇪" },
  { id: "TH", name: "Thailand", dialCode: "+66", nationalDigits: 9, flag: "🇹🇭" },
  { id: "VN", name: "Vietnam", dialCode: "+84", nationalDigits: 9, flag: "🇻🇳" },
  { id: "MY", name: "Malaysia", dialCode: "+60", nationalDigits: 9, flag: "🇲🇾" },
  { id: "HK", name: "Hong Kong", dialCode: "+852", nationalDigits: 8, flag: "🇭🇰" },
  { id: "TW", name: "Taiwan", dialCode: "+886", nationalDigits: 9, flag: "🇹🇼" },
  { id: "IL", name: "Israel", dialCode: "+972", nationalDigits: 9, flag: "🇮🇱" },
  { id: "UA", name: "Ukraine", dialCode: "+380", nationalDigits: 9, flag: "🇺🇦" },
  { id: "RO", name: "Romania", dialCode: "+40", nationalDigits: 9, flag: "🇷🇴" },
  { id: "HU", name: "Hungary", dialCode: "+36", nationalDigits: 9, flag: "🇭🇺" },
  { id: "QA", name: "Qatar", dialCode: "+974", nationalDigits: 8, flag: "🇶🇦" },
  { id: "KW", name: "Kuwait", dialCode: "+965", nationalDigits: 8, flag: "🇰🇼" },
  { id: "OM", name: "Oman", dialCode: "+968", nationalDigits: 8, flag: "🇴🇲" },
  { id: "BH", name: "Bahrain", dialCode: "+973", nationalDigits: 8, flag: "🇧🇭" },
  { id: "LK", name: "Sri Lanka", dialCode: "+94", nationalDigits: 9, flag: "🇱🇰" },
  { id: "NP", name: "Nepal", dialCode: "+977", nationalDigits: 10, flag: "🇳🇵" },
  { id: "GH", name: "Ghana", dialCode: "+233", nationalDigits: 9, flag: "🇬🇭" },
  { id: "MA", name: "Morocco", dialCode: "+212", nationalDigits: 9, flag: "🇲🇦" },
  { id: "DZ", name: "Algeria", dialCode: "+213", nationalDigits: 9, flag: "🇩🇿" },
  { id: "PE", name: "Peru", dialCode: "+51", nationalDigits: 9, flag: "🇵🇪" },
  { id: "CR", name: "Costa Rica", dialCode: "+506", nationalDigits: 8, flag: "🇨🇷" },
  { id: "PA", name: "Panama", dialCode: "+507", nationalDigits: 8, flag: "🇵🇦" },
  { id: "UY", name: "Uruguay", dialCode: "+598", nationalDigits: 8, flag: "🇺🇾" },
  { id: "EC", name: "Ecuador", dialCode: "+593", nationalDigits: 9, flag: "🇪🇨" },
  { id: "IS", name: "Iceland", dialCode: "+354", nationalDigits: 7, flag: "🇮🇸" },
  { id: "LU", name: "Luxembourg", dialCode: "+352", nationalDigits: 9, flag: "🇱🇺" },
  { id: "BG", name: "Bulgaria", dialCode: "+359", nationalDigits: 9, flag: "🇧🇬" },
  { id: "HR", name: "Croatia", dialCode: "+385", nationalDigits: 9, flag: "🇭🇷" },
  { id: "RS", name: "Serbia", dialCode: "+381", nationalDigits: 9, flag: "🇷🇸" },
  { id: "SK", name: "Slovakia", dialCode: "+421", nationalDigits: 9, flag: "🇸🇰" },
  { id: "SI", name: "Slovenia", dialCode: "+386", nationalDigits: 8, flag: "🇸🇮" },
  { id: "EE", name: "Estonia", dialCode: "+372", nationalDigits: 8, flag: "🇪🇪" },
  { id: "LV", name: "Latvia", dialCode: "+371", nationalDigits: 8, flag: "🇱🇻" },
  { id: "LT", name: "Lithuania", dialCode: "+370", nationalDigits: 8, flag: "🇱🇹" },
  { id: "CY", name: "Cyprus", dialCode: "+357", nationalDigits: 8, flag: "🇨🇾" },
  { id: "MT", name: "Malta", dialCode: "+356", nationalDigits: 8, flag: "🇲🇹" },
  { id: "AF", name: "Afghanistan", dialCode: "+93", nationalDigits: 9, flag: "🇦🇫" },
  { id: "AL", name: "Albania", dialCode: "+355", nationalDigits: 9, flag: "🇦🇱" },
  { id: "AM", name: "Armenia", dialCode: "+374", nationalDigits: 8, flag: "🇦🇲" },
  { id: "AO", name: "Angola", dialCode: "+244", nationalDigits: 9, flag: "🇦🇴" },
  { id: "AZ", name: "Azerbaijan", dialCode: "+994", nationalDigits: 9, flag: "🇦🇿" },
  { id: "BA", name: "Bosnia and Herzegovina", dialCode: "+387", nationalDigits: 8, flag: "🇧🇦" },
  { id: "BO", name: "Bolivia", dialCode: "+591", nationalDigits: 8, flag: "🇧🇴" },
  { id: "BY", name: "Belarus", dialCode: "+375", nationalDigits: 9, flag: "🇧🇾" },
  { id: "CD", name: "DR Congo", dialCode: "+243", nationalDigits: 9, flag: "🇨🇩" },
  { id: "CI", name: "Ivory Coast", dialCode: "+225", nationalDigits: 10, flag: "🇨🇮" },
  { id: "CM", name: "Cameroon", dialCode: "+237", nationalDigits: 9, flag: "🇨🇲" },
  { id: "DO", name: "Dominican Republic", dialCode: "+1809", nationalDigits: 10, flag: "🇩🇴" },
  { id: "ET", name: "Ethiopia", dialCode: "+251", nationalDigits: 9, flag: "🇪🇹" },
  { id: "GE", name: "Georgia", dialCode: "+995", nationalDigits: 9, flag: "🇬🇪" },
  { id: "GT", name: "Guatemala", dialCode: "+502", nationalDigits: 8, flag: "🇬🇹" },
  { id: "HN", name: "Honduras", dialCode: "+504", nationalDigits: 8, flag: "🇭🇳" },
  { id: "IQ", name: "Iraq", dialCode: "+964", nationalDigits: 10, flag: "🇮🇶" },
  { id: "IR", name: "Iran", dialCode: "+98", nationalDigits: 10, flag: "🇮🇷" },
  { id: "JO", name: "Jordan", dialCode: "+962", nationalDigits: 9, flag: "🇯🇴" },
  { id: "KZ", name: "Kazakhstan", dialCode: "+7", nationalDigits: 10, flag: "🇰🇿" },
  { id: "LB", name: "Lebanon", dialCode: "+961", nationalDigits: 8, flag: "🇱🇧" },
  { id: "MM", name: "Myanmar", dialCode: "+95", nationalDigits: 9, flag: "🇲🇲" },
  { id: "TN", name: "Tunisia", dialCode: "+216", nationalDigits: 8, flag: "🇹🇳" },
  { id: "TZ", name: "Tanzania", dialCode: "+255", nationalDigits: 9, flag: "🇹🇿" },
  { id: "UG", name: "Uganda", dialCode: "+256", nationalDigits: 9, flag: "🇺🇬" },
  { id: "UZ", name: "Uzbekistan", dialCode: "+998", nationalDigits: 9, flag: "🇺🇿" },
  { id: "VE", name: "Venezuela", dialCode: "+58", nationalDigits: 10, flag: "🇻🇪" },
  { id: "ZW", name: "Zimbabwe", dialCode: "+263", nationalDigits: 9, flag: "🇿🇼" },
];

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

function toNationalNumber(value: string, country: CountryOption): string {
  const dialDigits = toNationalDigits(country.dialCode);
  let digits = toNationalDigits(value);

  if (digits.length > country.nationalDigits && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }

  if (digits.length > country.nationalDigits && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}

function invalidMobileMessage(country: CountryOption): string {
  return `Please enter a valid ${country.nationalDigits}-digit mobile number for ${country.name}.`;
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
