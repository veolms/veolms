import type {
  CourseBundle,
  CourseBundleOffersResponse,
  CreateBundleRequest,
  UpdateBundleRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

/** Course bundles (creator-features/bundles-in-checkout). */
export const bundlesService = {
  /** The bundles a course's price card offers, priced for this visitor. */
  offersForCourse(courseId: string): Promise<CourseBundleOffersResponse> {
    return api.get<CourseBundleOffersResponse>(
      `/bundles/for-course/${encodeURIComponent(courseId)}`,
    );
  },
  /** Every bundle, any state (staff). */
  listAll(): Promise<CourseBundle[]> {
    return api.get<CourseBundle[]>("/bundles/manage");
  },
  create(body: CreateBundleRequest): Promise<CourseBundle> {
    return api.post<CourseBundle>("/bundles", body);
  },
  update(id: string, body: UpdateBundleRequest): Promise<CourseBundle> {
    return api.patch<CourseBundle>(`/bundles/${encodeURIComponent(id)}`, body);
  },
  remove(id: string): Promise<unknown> {
    return api.delete(`/bundles/${encodeURIComponent(id)}`);
  },
};
