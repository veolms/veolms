import type {
  ImportWishlistRequest,
  WishlistResponse,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

/** Every call answers with the signed-in learner's whole wishlist. */
export const wishlistService = {
  list(): Promise<WishlistResponse> {
    return api.get<WishlistResponse>("/wishlist");
  },

  add(courseId: string): Promise<WishlistResponse> {
    return api.put<WishlistResponse>(
      `/wishlist/${encodeURIComponent(courseId)}`,
    );
  },

  remove(courseId: string): Promise<WishlistResponse> {
    return api.delete<WishlistResponse>(
      `/wishlist/${encodeURIComponent(courseId)}`,
    );
  },

  /** Adds courses named by id or slug; the ones that are not courses are ignored. */
  importCourses(courses: string[]): Promise<WishlistResponse> {
    return api.post<WishlistResponse>("/wishlist/import", {
      courses,
    } satisfies ImportWishlistRequest);
  },
};
