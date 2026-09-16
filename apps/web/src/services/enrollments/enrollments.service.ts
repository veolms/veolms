import { api } from "../../lib/api-client";
import type { EnrolledCoursesResponse } from "@veolms/contracts";

export const enrollmentsService = {
  listEnrolledCourses: (): Promise<EnrolledCoursesResponse> => {
    return api.get<EnrolledCoursesResponse>("/enrollments/courses");
  },
  enrollFreeCourse: (courseId: string): Promise<unknown> => {
    return api.post("/checkout/orders", {
      items: [{ itemType: "course", courseId }],
    });
  },
};
