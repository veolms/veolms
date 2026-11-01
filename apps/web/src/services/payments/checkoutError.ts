import { getApiError } from "../../lib/api-error";

/**
 * What to tell a buyer when a checkout could not be started.
 *
 * The API client rejects with a plain `ApiError` object, not an `Error`, so
 * an `instanceof Error` test never sees the server's reason. This reads the
 * message from either shape.
 *
 * When the payment provider could not be reached or refused to start the
 * order, the attempt never reached the point of paying. That is said
 * plainly, with what matters most to the buyer.
 */
export function readCheckoutStartError(
  error: unknown,
  fallback: string,
): string {
  if (getApiError(error).code === "PAYMENT_GATEWAY_ERROR") {
    return "Payments are unavailable right now. Nothing was charged for this attempt. Please try again in a little while.";
  }
  return error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : fallback;
}
