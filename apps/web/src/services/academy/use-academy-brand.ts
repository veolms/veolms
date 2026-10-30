import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcademyBrandResponse,
  UpdateAcademyBrandRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { academyKeys } from "./academy.keys";
import { academyService } from "./academy.service";

/** The academy's name and logo (administrators only). */
export function useAcademyBrand() {
  return useQuery<AcademyBrandResponse, ApiError>({
    queryKey: academyKeys.brand(),
    queryFn: () => academyService.getBrand(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Uploads a new logo and makes it the academy's logo. */
export function useUploadAcademyLogo() {
  const queryClient = useQueryClient();
  return useMutation<AcademyBrandResponse, ApiError, File>({
    mutationFn: (file) => academyService.uploadLogo(file),
    onSuccess: (saved) => {
      queryClient.setQueryData(academyKeys.brand(), saved);
    },
  });
}

export function useRemoveAcademyLogo() {
  const queryClient = useQueryClient();
  return useMutation<AcademyBrandResponse, ApiError, void>({
    mutationFn: () => academyService.removeLogo(),
    onSuccess: (saved) => {
      queryClient.setQueryData(academyKeys.brand(), saved);
    },
  });
}

export function useUpdateAcademyBrand() {
  const queryClient = useQueryClient();
  return useMutation<AcademyBrandResponse, ApiError, UpdateAcademyBrandRequest>(
    {
      mutationFn: (brand) => academyService.updateBrand(brand),
      onSuccess: (saved) => {
        queryClient.setQueryData(academyKeys.brand(), saved);
      },
    },
  );
}
