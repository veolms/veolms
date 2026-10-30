export const wishlistKeys = {
  all: ["wishlist"] as const,
  /** One list per account, so a second account on the browser starts clean. */
  items: (userId: string) => [...wishlistKeys.all, "items", userId] as const,
};
