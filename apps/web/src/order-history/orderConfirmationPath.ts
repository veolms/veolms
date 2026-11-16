/** Where purchase history lives, and each order's own page under it. */
export const PURCHASE_HISTORY_PATH = "/purchase-history";

/** The order page's address: where checkout lands after paying. */
export function orderConfirmationPath(orderId: string): string {
  return `${PURCHASE_HISTORY_PATH}/${orderId}`;
}
