import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  CourseCertificatesResponse,
  CourseCertificateStatus,
  MyCertificatesResponse,
  PublicCertificate,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { certificatesKeys } from "./certificates.keys";
import { certificatesService } from "./certificates.service";

/** Where the signed-in learner stands with one course's certificate. */
export function useCourseCertificateStatus(
  courseKey: string,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseCertificateStatus, ApiError>({
    queryKey: certificatesKeys.courseStatus(courseKey),
    queryFn: () => certificatesService.courseStatus(courseKey),
    enabled: (options?.enabled ?? true) && Boolean(courseKey),
    staleTime: 30_000,
  });
}

export function useMyCertificates(options?: { enabled?: boolean }) {
  return useQuery<MyCertificatesResponse, ApiError>({
    queryKey: certificatesKeys.mine(),
    queryFn: () => certificatesService.mine(),
    enabled: options?.enabled ?? true,
  });
}

export function usePublicCertificate(code: string) {
  return useQuery<PublicCertificate, ApiError>({
    queryKey: certificatesKeys.public(code),
    queryFn: () => certificatesService.publicCertificate(code),
    enabled: Boolean(code),
    retry: (count, error) => error.status !== 404 && count < 2,
  });
}

/** A course's certificates for staff, newest first, loaded as the list scrolls. */
export function useCourseCertificates(courseId: string, q: string) {
  return useInfiniteQuery<
    CourseCertificatesResponse,
    ApiError,
    InfiniteData<CourseCertificatesResponse, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: certificatesKeys.course(courseId, q),
    queryFn: ({ pageParam }) =>
      certificatesService.courseCertificates(courseId, {
        cursor: pageParam,
        q: q || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(courseId),
  });
}
