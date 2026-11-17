import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CourseBundle,
  CreateBundleRequest,
  UpdateBundleRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { bundleKeys } from "./bundles.keys";
import { bundlesService } from "./bundles.service";

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: bundleKeys.all });
}

export function useCreateBundle() {
  const refresh = useRefresh();
  return useMutation<CourseBundle, ApiError, CreateBundleRequest>({
    mutationFn: (body) => bundlesService.create(body),
    onSuccess: refresh,
  });
}

export function useUpdateBundle() {
  const refresh = useRefresh();
  return useMutation<
    CourseBundle,
    ApiError,
    { id: string; body: UpdateBundleRequest }
  >({
    mutationFn: ({ id, body }) => bundlesService.update(id, body),
    onSuccess: refresh,
  });
}

export function useDeleteBundle() {
  const refresh = useRefresh();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => bundlesService.remove(id),
    onSuccess: refresh,
  });
}
