import { z } from "zod";

/**
 * An email address as someone types or pastes it into a form. Spaces around
 * it and the case of its letters are not part of the address, so both are
 * removed before it is checked: " Ada@Example.com " is the address
 * "ada@example.com", not a validation error.
 *
 * The order matters. Checked first and tidied afterwards, a padded address
 * failed the check and never reached the tidying.
 */
export function emailInput(message?: string) {
  return z.string().trim().toLowerCase().email(message).max(255);
}
