import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Category, CreateCategoryRequest } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, ApiError, CreateCategoryRequest>({
    mutationFn: (payload) => coursesService.createCategory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.categories() });
    },
  });
}
