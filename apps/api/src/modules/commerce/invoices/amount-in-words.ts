import { minorUnitsPerMajor } from "../shared/currency.ts";

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

/** 0–999 in words; empty for 0, so a group of zeros adds nothing. */
function underThousand(value: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds > 0) words.push(ONES[hundreds]!, "Hundred");
  if (rest >= 20) {
    words.push(TENS[Math.floor(rest / 10)]!);
    if (rest % 10 > 0) words.push(ONES[rest % 10]!);
  } else if (rest > 0) {
    words.push(ONES[rest]!);
  }
  return words.join(" ");
}

/**
 * A whole number in words. Indian grouping (thousand, lakh, crore) for INR,
 * as an Indian invoice reads; thousand, million, billion otherwise.
 */
export function integerInWords(value: number, indian: boolean): string {
  if (value === 0) return ONES[0]!;
  const scales: [number, string][] = indian
    ? [
        [10_000_000, "Crore"],
        [100_000, "Lakh"],
        [1_000, "Thousand"],
      ]
    : [
        [1_000_000_000, "Billion"],
        [1_000_000, "Million"],
        [1_000, "Thousand"],
      ];

  const words: string[] = [];
  let rest = value;
  for (const [size, name] of scales) {
    const count = Math.floor(rest / size);
    if (count > 0) {
      // A count past the largest scale ("150 crore") is itself spelt out.
      words.push(
        count >= 1000 ? integerInWords(count, indian) : underThousand(count),
        name,
      );
      rest %= size;
    }
  }
  if (rest > 0) words.push(underThousand(rest));
  return words.join(" ");
}

/**
 * An invoice total written out, e.g. "Seven Hundred Ninety Nine INR Only" or
 * "Ninety Nine INR and Fifty Paise Only". Takes minor units.
 */
export function amountInWords(amountMinor: number, currency: string): string {
  const code = currency.toUpperCase();
  const perMajor = minorUnitsPerMajor(code);
  const major = Math.floor(amountMinor / perMajor);
  const minor = amountMinor % perMajor;
  const indian = code === "INR";

  let words = `${integerInWords(major, indian)} ${code}`;
  if (minor > 0) {
    words += indian
      ? ` and ${integerInWords(minor, true)} Paise`
      : ` and ${String(minor).padStart(2, "0")}/${perMajor}`;
  }
  return `${words} Only`;
}
