/**
 * What the text in a "pay what you want" box means.
 *
 * Amounts are whole units of the course's currency, so only digits make an
 * amount. Anything else is `unreadable`: the caller shows the text exactly
 * as it was typed, says why it cannot be used, and takes no payment until it
 * is corrected.
 *
 * The text is never repaired. Two earlier versions each turned a typed
 * "199.50" into 19950: one stripped the "." and kept the digits, the other
 * refused the "." keystroke but left "199" in the box, so the "50" typed
 * next was appended to it.
 */
export type CustomAmountEntry =
  | { kind: "empty" }
  | { kind: "unreadable" }
  | { kind: "amount"; amount: number; overMaximum: boolean };

export function readCustomAmount(
  raw: string,
  maximum: number,
): CustomAmountEntry {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (!/^\d+$/.test(text)) return { kind: "unreadable" };

  const parsed = Number(text);
  return {
    kind: "amount",
    amount: Math.min(parsed, maximum),
    overMaximum: parsed > maximum,
  };
}
