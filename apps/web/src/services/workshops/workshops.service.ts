import { api } from "../../lib/api-client";
import type {
  CancelWorkshopRequest,
  CreateWorkshopRequest,
  UpdateWorkshopRequest,
  WorkshopAdmin,
  WorkshopAdminListQuery,
  WorkshopAdminListResponse,
  WorkshopPublishCheck,
} from "@veolms/contracts";

const ADMIN_BASE = "/workshops/admin";

export const workshopsService = {
  listAdmin: (
    query: Partial<WorkshopAdminListQuery>,
  ): Promise<WorkshopAdminListResponse> =>
    api.get<WorkshopAdminListResponse>(ADMIN_BASE, { params: query }),

  getAdmin: (workshopId: string): Promise<WorkshopAdmin> =>
    api.get<WorkshopAdmin>(`${ADMIN_BASE}/${workshopId}`),

  create: (payload: CreateWorkshopRequest): Promise<WorkshopAdmin> =>
    api.post<WorkshopAdmin>(ADMIN_BASE, payload),

  update: (
    workshopId: string,
    payload: UpdateWorkshopRequest,
  ): Promise<WorkshopAdmin> =>
    api.patch<WorkshopAdmin>(`${ADMIN_BASE}/${workshopId}`, payload),

  publishCheck: (workshopId: string): Promise<WorkshopPublishCheck> =>
    api.get<WorkshopPublishCheck>(`${ADMIN_BASE}/${workshopId}/publish-check`),

  publish: (workshopId: string): Promise<WorkshopAdmin> =>
    api.post<WorkshopAdmin>(`${ADMIN_BASE}/${workshopId}/publish`),

  unpublish: (workshopId: string): Promise<WorkshopAdmin> =>
    api.post<WorkshopAdmin>(`${ADMIN_BASE}/${workshopId}/unpublish`),

  cancel: (
    workshopId: string,
    payload: CancelWorkshopRequest,
  ): Promise<WorkshopAdmin> =>
    api.post<WorkshopAdmin>(`${ADMIN_BASE}/${workshopId}/cancel`, payload),

  remove: (workshopId: string): Promise<{ deleted: true }> =>
    api.delete<{ deleted: true }>(`${ADMIN_BASE}/${workshopId}`),
};
