import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateShortLinkRequest,
  ShortLink,
  UpdateShortLinkRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { linksKeys } from "./links.keys";
import { linksService } from "./links.service";

function useInvalidateLinks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: linksKeys.all });
}

export function useCreateShortLink() {
  const invalidate = useInvalidateLinks();
  return useMutation<ShortLink, ApiError, CreateShortLinkRequest>({
    mutationFn: (body) => linksService.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateShortLink() {
  const invalidate = useInvalidateLinks();
  return useMutation<
    ShortLink,
    ApiError,
    { id: string; body: UpdateShortLinkRequest }
  >({
    mutationFn: ({ id, body }) => linksService.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteShortLink() {
  const invalidate = useInvalidateLinks();
  return useMutation<{ deleted: true }, ApiError, string>({
    mutationFn: (id) => linksService.remove(id),
    onSuccess: invalidate,
  });
}
