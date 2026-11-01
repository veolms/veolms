import { api } from "../../lib/api-client";
import type {
  StudentContactUpdateRequest,
  StudentContactUpdateResponse,
  StudentDetailResponse,
  StudentListQuery,
  StudentListResponse,
} from "@veolms/contracts";

export const studentsService = {
  listStudents: (
    params?: StudentListQuery,
    signal?: AbortSignal,
  ): Promise<StudentListResponse> => {
    return api.get<StudentListResponse>("/students", { params, signal });
  },

  getStudentByUsername: (username: string): Promise<StudentDetailResponse> => {
    return api.get<StudentDetailResponse>(
      `/students/${encodeURIComponent(username)}`,
    );
  },

  updateStudentContact: (
    username: string,
    input: StudentContactUpdateRequest,
  ): Promise<StudentContactUpdateResponse> => {
    return api.patch<StudentContactUpdateResponse>(
      `/students/${encodeURIComponent(username)}/contact`,
      input,
    );
  },
};
