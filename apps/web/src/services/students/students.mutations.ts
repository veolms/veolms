import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  StudentContactUpdateRequest,
  StudentContactUpdateResponse,
  StudentCreateRequest,
  StudentCreateResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { enrollmentKeys } from "../enrollments/enrollments.keys";
import { studentKeys } from "./students.keys";
import { studentsService } from "./students.service";

/**
 * Staff add a student by name and email. Settles once the student screens
 * are fresh, so the list already holds the new student.
 */
export function useCreateStudent() {
  const queryClient = useQueryClient();

  return useMutation<StudentCreateResponse, ApiError, StudentCreateRequest>({
    mutationFn: (input) => studentsService.createStudent(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      return queryClient.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}

/**
 * An admin changes a learner's email or phone number. Settles once the
 * student screens are fresh, so the details page already shows the new
 * values when the dialog closes.
 */
export function useUpdateStudentContact(username: string) {
  const queryClient = useQueryClient();

  return useMutation<
    StudentContactUpdateResponse,
    ApiError,
    StudentContactUpdateRequest
  >({
    mutationFn: (input) =>
      studentsService.updateStudentContact(username, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: studentKeys.all }),
  });
}
