import { api } from "../../lib/api-client";
import type { CourseSummary, PublicCourse } from "@veolms/contracts";

export const coursesService = {
  list: (): Promise<{ courses: CourseSummary[] }> => {
    return api.get<{ courses: CourseSummary[] }>("/courses");
  },

  getBySlug: (slug: string): Promise<PublicCourse> => {
    return api.get<PublicCourse>(`/courses/${slug}`);
  },
};
