import { api } from "../../lib/api-client";
import type {
  StudentContactUpdateRequest,
  StudentContactUpdateResponse,
  StudentCreateRequest,
  StudentCreateResponse,
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

  /** Staff add a student; courses chosen here are opened with the account. */
  createStudent: (
    input: StudentCreateRequest,
  ): Promise<StudentCreateResponse> => {
    return api.post<StudentCreateResponse>("/students", input);
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
