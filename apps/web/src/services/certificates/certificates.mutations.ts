import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  CourseCertificateSettings,
  CourseCertificatesResponse,
  CourseCertificateStatus,
  MyCertificate,
  MyCertificatesResponse,
  PublicCertificate,
  StaffCertificate,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { certificatesKeys } from "./certificates.keys";
import { certificatesService } from "./certificates.service";

type StaffPages = InfiniteData<CourseCertificatesResponse, string | null>;

/**
 * Writes a learner's certificate into every cached view of it (their list,
 * the course card, the public page), so what they open next shows it at
 * once instead of asking the server again.
 */
function storeMyCertificate(
  queryClient: QueryClient,
  certificate: MyCertificate,
  courseKey?: string,
) {
  queryClient.setQueryData<MyCertificatesResponse>(
    certificatesKeys.mine(),
    (previous) =>
      previous
        ? {
            items: [
              certificate,
              ...previous.items.filter(
                (item) => item.code !== certificate.code,
              ),
            ],
          }
        : previous,
  );
  if (courseKey) {
    queryClient.setQueryData<CourseCertificateStatus>(
      certificatesKeys.courseStatus(courseKey),
      (previous) =>
        previous ? { ...previous, state: "issued", certificate } : previous,
    );
  }
  queryClient.setQueryData<PublicCertificate>(
    certificatesKeys.public(certificate.code),
    (previous) => ({
      linkedInOrganizationId: previous?.linkedInOrganizationId ?? null,
      code: certificate.code,
      displayCode: certificate.displayCode,
      status: certificate.status === "active" ? "valid" : "revoked",
      recipientName: certificate.recipientName,
      courseTitle: certificate.courseTitle,
      courseSlug: certificate.courseSlug,
      academyName: certificate.academyName,
      issuedOn: certificate.issuedOn,
      revokedOn: previous?.revokedOn ?? null,
      verifyUrl: certificate.verifyUrl,
    }),
  );
}

/** Claims the course's certificate for the learner's profile name. */
export function useClaimCertificate(courseKey: string) {
  const queryClient = useQueryClient();
  return useMutation<MyCertificate, ApiError, void>({
    mutationFn: () => certificatesService.claim(courseKey),
    onSuccess: (certificate) => {
      storeMyCertificate(queryClient, certificate, courseKey);
      // The public page's LinkedIn page id is the only part not known here.
      void queryClient.invalidateQueries({
        queryKey: certificatesKeys.public(certificate.code),
        refetchType: "none",
      });
    },
  });
}

/**
 * Puts the profile's current name on a certificate. Shown at once; put
 * back if the server refuses.
 */
export function useUpdateCertificateName() {
  const queryClient = useQueryClient();
  return useMutation<
    MyCertificate,
    ApiError,
    { code: string; profileName: string },
    {
      mine: MyCertificatesResponse | undefined;
      page: PublicCertificate | undefined;
    }
  >({
    mutationFn: ({ code }) => certificatesService.updateNameFromProfile(code),
    onMutate: async ({ code, profileName }) => {
      const mineKey = certificatesKeys.mine();
      const pageKey = certificatesKeys.public(code);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: mineKey }),
        queryClient.cancelQueries({ queryKey: pageKey }),
      ]);
      const mine = queryClient.getQueryData<MyCertificatesResponse>(mineKey);
      const page = queryClient.getQueryData<PublicCertificate>(pageKey);
      if (mine) {
        queryClient.setQueryData<MyCertificatesResponse>(mineKey, {
          items: mine.items.map((item) =>
            item.code === code
              ? {
                  ...item,
                  recipientName: profileName,
                  nameCorrectionsLeft: Math.max(
                    0,
                    item.nameCorrectionsLeft - 1,
                  ),
                }
              : item,
          ),
        });
      }
      if (page) {
        queryClient.setQueryData<PublicCertificate>(pageKey, {
          ...page,
          recipientName: profileName,
        });
      }
      return { mine, page };
    },
    onError: (_error, { code }, context) => {
      queryClient.setQueryData(certificatesKeys.mine(), context?.mine);
      queryClient.setQueryData(certificatesKeys.public(code), context?.page);
    },
    onSuccess: (certificate) => storeMyCertificate(queryClient, certificate),
  });
}

export function useUpdateCertificateSettings(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation<CourseCertificateSettings, ApiError, number>({
    mutationFn: (thresholdPercent) =>
      certificatesService.updateSettings(courseId, thresholdPercent),
    onSuccess: ({ thresholdPercent }) => {
      queryClient.setQueriesData<StaffPages>(
        { queryKey: [...certificatesKeys.all, "course", courseId] },
        (previous) =>
          previous
            ? {
                ...previous,
                pages: previous.pages.map((page) => ({
                  ...page,
                  thresholdPercent,
                })),
              }
            : previous,
      );
      // A learner's own card asks again the next time it is shown.
      void queryClient.invalidateQueries({
        queryKey: [...certificatesKeys.all, "course-status"],
        refetchType: "none",
      });
    },
  });
}

/**
 * Changes one certificate in a course's staff list at once (revoke or
 * restore), and puts the list back if the server refuses.
 */
function useStaffListChange<Variables extends { certificateId: string }>(
  request: (variables: Variables) => Promise<StaffCertificate>,
  optimistic: (
    item: StaffCertificate,
    variables: Variables,
  ) => StaffCertificate,
) {
  const queryClient = useQueryClient();
  const listKey = [...certificatesKeys.all, "course"];
  const replace = (
    update: (item: StaffCertificate) => StaffCertificate,
    certificateId: string,
  ) =>
    queryClient.setQueriesData<StaffPages>({ queryKey: listKey }, (previous) =>
      previous
        ? {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === certificateId ? update(item) : item,
              ),
              issuedCount:
                page.issuedCount +
                page.items.reduce((change, item) => {
                  if (item.id !== certificateId) return change;
                  const next = update(item);
                  if (item.status === next.status) return change;
                  return change + (next.status === "active" ? 1 : -1);
                }, 0),
            })),
          }
        : previous,
    );

  return useMutation<
    StaffCertificate,
    ApiError,
    Variables,
    { snapshot: [readonly unknown[], StaffPages | undefined][] }
  >({
    mutationFn: request,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const snapshot = queryClient.getQueriesData<StaffPages>({
        queryKey: listKey,
      });
      replace((item) => optimistic(item, variables), variables.certificateId);
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (saved) => {
      replace(() => saved, saved.id);
      void queryClient.invalidateQueries({
        queryKey: certificatesKeys.public(saved.code),
        refetchType: "none",
      });
    },
  });
}

export function useRevokeCertificate() {
  return useStaffListChange<{ certificateId: string; reason: string }>(
    ({ certificateId, reason }) =>
      certificatesService.revoke(certificateId, reason),
    (item, { reason }) => ({
      ...item,
      status: "revoked",
      revokeReason: reason,
      revokedAt: new Date().toISOString(),
    }),
  );
}

export function useRestoreCertificate() {
  return useStaffListChange<{ certificateId: string }>(
    ({ certificateId }) => certificatesService.restore(certificateId),
    (item) => ({
      ...item,
      status: "active",
      revokeReason: null,
      revokedAt: null,
    }),
  );
}
