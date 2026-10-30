import { useQuery } from "@tanstack/react-query";
import type { WishlistResponse } from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { wishlistKeys } from "./wishlist.keys";
import { wishlistService } from "./wishlist.service";

/** The signed-in learner's wishlist. Not asked for while nobody is signed in. */
export function useWishlist(userId: string | undefined) {
  return useQuery<WishlistResponse, ApiError>({
    queryKey: wishlistKeys.items(userId ?? ""),
    queryFn: wishlistService.list,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
}
