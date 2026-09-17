import { api } from "../../lib/api-client";
import type {
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
};
