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
  return `${sym}${amount.toLocaleString(locale)}`;
}
