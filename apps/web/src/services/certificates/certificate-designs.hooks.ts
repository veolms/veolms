import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificateDesign,
  CertificateDesignLayout,
  CertificateDesignsResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { certificateDesignsService } from "./certificate-designs.service";
import { certificatesKeys } from "./certificates.keys";

export function useCertificateDesigns() {
  return useQuery<CertificateDesignsResponse, ApiError>({
    queryKey: certificatesKeys.designs(),
    queryFn: () => certificateDesignsService.list(),
  });
}

function useStoreDesign() {
  const queryClient = useQueryClient();
  return (design: CertificateDesign) =>
    queryClient.setQueryData<CertificateDesignsResponse>(
      certificatesKeys.designs(),
      (previous) =>
        previous
          ? {
              items: previous.items.some((item) => item.id === design.id)
                ? previous.items.map((item) =>
                    item.id === design.id ? design : item,
                  )
                : [previous.items[0]!, design, ...previous.items.slice(1)],
            }
          : previous,
    );
}

export function useUploadCertificateDesign() {
  const store = useStoreDesign();
  return useMutation<
    CertificateDesign,
    Error,
    { file: File; name: string; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ file, name, onProgress }) =>
      certificateDesignsService.upload(file, name, onProgress),
    onSuccess: store,
  });
}

export function useUpdateCertificateDesign() {
  const store = useStoreDesign();
  return useMutation<
    CertificateDesign,
    ApiError,
    { id: string; name?: string; layout?: CertificateDesignLayout }
  >({
    mutationFn: ({ id, ...body }) => certificateDesignsService.update(id, body),
    onSuccess: store,
  });
}

/**
 * Finalises a design. Shown at once; the server's list replaces it, or the
 * old one comes back if it refuses.
 */
export function useActivateCertificateDesign() {
  const queryClient = useQueryClient();
  const key = certificatesKeys.designs();
  return useMutation<
    CertificateDesignsResponse,
    ApiError,
    string,
    { previous: CertificateDesignsResponse | undefined }
  >({
    mutationFn: (id) => certificateDesignsService.activate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<CertificateDesignsResponse>(key);
      if (previous) {
        queryClient.setQueryData<CertificateDesignsResponse>(key, {
          items: previous.items.map((item) => ({
            ...item,
            isActive: item.id === id,
          })),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) =>
      queryClient.setQueryData(key, context?.previous),
    onSuccess: (designs) => queryClient.setQueryData(key, designs),
  });
}

export function useDeleteCertificateDesign() {
  const queryClient = useQueryClient();
  const key = certificatesKeys.designs();
  return useMutation<
    { deleted: true },
    ApiError,
    string,
    { previous: CertificateDesignsResponse | undefined }
  >({
    mutationFn: (id) => certificateDesignsService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<CertificateDesignsResponse>(key);
      if (previous) {
        queryClient.setQueryData<CertificateDesignsResponse>(key, {
          items: previous.items.filter((item) => item.id !== id),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) =>
      queryClient.setQueryData(key, context?.previous),
  });
}
