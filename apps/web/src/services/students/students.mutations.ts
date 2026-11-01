import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  StudentContactUpdateRequest,
  StudentContactUpdateResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { studentKeys } from "./students.keys";
import { studentsService } from "./students.service";

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
