export function getCurrencySymbol(currency: string = "INR"): string {
  switch (currency.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    case "JPY":
      return "¥";
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function formatPriceWithCurrency(
  amount: number,
  currency: string = "INR",
): string {
  const sym = getCurrencySymbol(currency);
  // Rupees are grouped the Indian way (1,00,000), not in thousands.
  const locale = currency.toUpperCase() === "INR" ? "en-IN" : "en-US";
  // A price with cents (a price for buyers outside India) shows both of
  // its decimals, rounded to the cent: $43.99, never $43.9 or $21.0000001.
  const cents = Math.round(amount * 100) / 100;
  return Number.isInteger(cents)
    ? `${sym}${cents.toLocaleString(locale)}`
    : `${sym}${cents.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
