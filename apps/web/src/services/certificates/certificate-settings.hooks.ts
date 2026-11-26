import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificateAcademySettings,
  UpdateCertificateAcademySettingsRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { certificateSettingsService } from "./certificate-settings.service";
import { certificatesKeys } from "./certificates.keys";

export function useCertificateAcademySettings() {
  return useQuery<CertificateAcademySettings, ApiError>({
    queryKey: certificatesKeys.settings(),
    queryFn: () => certificateSettingsService.get(),
  });
}

/**
 * What else shows the academy's settings: courses that use its share, the
 * learners' cards, and the sample certificates (they print the signature).
 */
function useRefreshDependents() {
  const queryClient = useQueryClient();
  return {
    threshold: () => {
      void queryClient.invalidateQueries({
        queryKey: [...certificatesKeys.all, "course"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...certificatesKeys.all, "course-status"],
        refetchType: "none",
      });
    },
    signature: () => {
      // Shown samples are drawn again; others when next shown.
      void queryClient.invalidateQueries({
        queryKey: [...certificatesKeys.all, "design-image"],
      });
      queryClient.removeQueries({
        queryKey: [...certificatesKeys.all, "signature-image"],
      });
    },
  };
}

/** Shown at once; put back if the server refuses. */
export function useUpdateCertificateAcademySettings() {
  const queryClient = useQueryClient();
  const refresh = useRefreshDependents();
  const key = certificatesKeys.settings();
  return useMutation<
    CertificateAcademySettings,
    ApiError,
    UpdateCertificateAcademySettingsRequest,
    { previous: CertificateAcademySettings | undefined }
  >({
    mutationFn: (body) => certificateSettingsService.update(body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<CertificateAcademySettings>(key);
      if (previous) {
        queryClient.setQueryData<CertificateAcademySettings>(key, {
          ...previous,
          ...body,
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) =>
      queryClient.setQueryData(key, context?.previous),
    onSuccess: (settings, body) => {
      queryClient.setQueryData(key, settings);
      if (body.thresholdPercent !== undefined) refresh.threshold();
    },
  });
}

export function useUploadCertificateSignature() {
  const queryClient = useQueryClient();
  const refresh = useRefreshDependents();
  return useMutation<
    CertificateAcademySettings,
    Error,
    { file: File; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ file, onProgress }) =>
      certificateSettingsService.uploadSignature(file, onProgress),
    onSuccess: (settings) => {
      queryClient.setQueryData(certificatesKeys.settings(), settings);
      refresh.signature();
    },
  });
}

export function useRemoveCertificateSignature() {
  const queryClient = useQueryClient();
  const refresh = useRefreshDependents();
  const key = certificatesKeys.settings();
  return useMutation<
    CertificateAcademySettings,
    ApiError,
    void,
    { previous: CertificateAcademySettings | undefined }
  >({
    mutationFn: () => certificateSettingsService.removeSignature(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<CertificateAcademySettings>(key);
      if (previous) {
        queryClient.setQueryData<CertificateAcademySettings>(key, {
          ...previous,
          signature: null,
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) =>
      queryClient.setQueryData(key, context?.previous),
    onSuccess: (settings) => {
      queryClient.setQueryData(key, settings);
      refresh.signature();
    },
  });
}

/** The uploaded signature as a picture, kept for the visit by version. */
export function useCertificateSignatureImage(version: string | null) {
  return useQuery({
    queryKey: [...certificatesKeys.all, "signature-image", version],
    queryFn: async () => {
      const blob = await certificateSettingsService.signatureFile();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The signature could not be read."));
        reader.readAsDataURL(blob);
      });
    },
    enabled: version !== null,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
