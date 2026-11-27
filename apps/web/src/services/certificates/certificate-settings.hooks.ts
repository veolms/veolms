import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificateAcademySettings,
  CertificateImageKind,
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
 * learners' cards, and the sample certificates (they print the images).
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
    image: (kind: CertificateImageKind) => {
      // Shown samples are drawn again; others when next shown.
      void queryClient.invalidateQueries({
        queryKey: [...certificatesKeys.all, "design-image"],
      });
      queryClient.removeQueries({
        queryKey: [...certificatesKeys.all, `${kind}-image`],
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

/** Uploads a signature, badge or background and prints it from then on. */
export function useUploadCertificateImage(kind: CertificateImageKind) {
  const queryClient = useQueryClient();
  const refresh = useRefreshDependents();
  return useMutation<
    CertificateAcademySettings,
    Error,
    { file: File; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ file, onProgress }) =>
      certificateSettingsService.uploadImage(kind, file, onProgress),
    onSuccess: (settings) => {
      queryClient.setQueryData(certificatesKeys.settings(), settings);
      refresh.image(kind);
    },
  });
}

/** Goes back to the design's own image; shown at once, put back on refusal. */
export function useRemoveCertificateImage(kind: CertificateImageKind) {
  const queryClient = useQueryClient();
  const refresh = useRefreshDependents();
  const key = certificatesKeys.settings();
  return useMutation<
    CertificateAcademySettings,
    ApiError,
    void,
    { previous: CertificateAcademySettings | undefined }
  >({
    mutationFn: () => certificateSettingsService.removeImage(kind),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<CertificateAcademySettings>(key);
      if (previous) {
        queryClient.setQueryData<CertificateAcademySettings>(key, {
          ...previous,
          [kind]: null,
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) =>
      queryClient.setQueryData(key, context?.previous),
    onSuccess: (settings) => {
      queryClient.setQueryData(key, settings);
      refresh.image(kind);
    },
  });
}

/** An uploaded image as a picture, kept for the visit by version. */
export function useCertificateImage(
  kind: CertificateImageKind,
  version: string | null,
) {
  return useQuery({
    queryKey: [...certificatesKeys.all, `${kind}-image`, version],
    queryFn: async () => {
      const blob = await certificateSettingsService.imageFile(kind);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(blob);
      });
    },
    enabled: version !== null,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}

/** The uploaded signature as a picture (the design editor's marker). */
export function useCertificateSignatureImage(version: string | null) {
  return useCertificateImage("signature", version);
}
