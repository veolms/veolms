import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  StudentDetailResponse,
  StudentListQuery,
  StudentListResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { studentKeys } from "./students.keys";
import { studentsService } from "./students.service";

/**
 * Infinite-scrolling query for academy students.
 * Uses cursor-based pagination with a default of 30 items per page.
 */
export function useStudents(
  filter?: Omit<StudentListQuery, "cursor">,
  options?: { enabled?: boolean },
) {
  const limit = filter?.limit ?? 30;

  return useInfiniteQuery<StudentListResponse, ApiError>({
    queryKey: studentKeys.list(filter),
    queryFn: ({ pageParam }) =>
      studentsService.listStudents({
        ...filter,
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/**
 * Query for retrieving comprehensive details for a single student.
 */
export function useStudent(
  username: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<StudentDetailResponse, ApiError>({
    queryKey: username
      ? studentKeys.detail(username)
      : (["students", "detail", null] as const),
    queryFn: () => studentsService.getStudentByUsername(username!),
    enabled: Boolean(username) && (options?.enabled ?? true),
    staleTime: 60 * 1000,
  });
}
