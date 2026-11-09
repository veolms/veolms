import { api } from "../../lib/api-client";
import type {
  CancelWorkshopRequest,
  AddWorkshopRegistrantRequest,
  CreateWorkshopRequest,
  HeroVideoPlayback,
  SetWorkshopRecordingRequest,
  VideoPlaybackToken,
  UpdateWorkshopRequest,
  WorkshopAdmin,
  WorkshopAdminListQuery,
  WorkshopAdminListResponse,
  WorkshopPublishCheck,
  WorkshopPublic,
  WorkshopPublicListResponse,
  WorkshopRegistrationResponse,
  WorkshopRegistrantsResponse,
  WorkshopHomeCard,
  WorkshopViewer,
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

  setRecording: (
    workshopId: string,
    sessionId: string,
    payload: SetWorkshopRecordingRequest,
  ): Promise<WorkshopAdmin> =>
    api.put<WorkshopAdmin>(
      `${ADMIN_BASE}/${workshopId}/sessions/${sessionId}/recording`,
      payload,
    ),

  listRegistrants: (workshopId: string): Promise<WorkshopRegistrantsResponse> =>
    api.get<WorkshopRegistrantsResponse>(
      ADMIN_BASE + "/" + workshopId + "/registrants",
    ),

  addRegistrant: (
    workshopId: string,
    payload: AddWorkshopRegistrantRequest,
  ): Promise<WorkshopRegistrantsResponse> =>
    api.post<WorkshopRegistrantsResponse>(
      ADMIN_BASE + "/" + workshopId + "/registrants",
      payload,
    ),

  removeRegistrant: (
    workshopId: string,
    userId: string,
  ): Promise<WorkshopRegistrantsResponse> =>
    api.delete<WorkshopRegistrantsResponse>(
      ADMIN_BASE + "/" + workshopId + "/registrants/" + userId,
    ),
};

// --- Learners ---

export const workshopsPublicService = {
  list: (): Promise<WorkshopPublicListResponse> =>
    api.get<WorkshopPublicListResponse>("/workshops"),

  get: (slug: string): Promise<WorkshopPublic> =>
    api.get<WorkshopPublic>(`/workshops/${encodeURIComponent(slug)}`),

  viewer: (slug: string): Promise<WorkshopViewer> =>
    api.get<WorkshopViewer>(`/workshops/${encodeURIComponent(slug)}/me`),

  homeCard: (): Promise<WorkshopHomeCard | null> =>
    api.get<WorkshopHomeCard | null>("/workshops/me/next"),

  register: (workshopId: string): Promise<WorkshopRegistrationResponse> =>
    api.post<WorkshopRegistrationResponse>(`/workshops/${workshopId}/register`),

  unregister: (workshopId: string): Promise<{ registered: false }> =>
    api.delete<{ registered: false }>(`/workshops/${workshopId}/register`),

  recordingPlayback: (
    workshopId: string,
    sessionId: string,
  ): Promise<HeroVideoPlayback> =>
    api.get<HeroVideoPlayback>(
      `/workshops/${workshopId}/sessions/${sessionId}/recording/playback`,
    ),

  recordingPlaybackToken: (
    workshopId: string,
    sessionId: string,
  ): Promise<VideoPlaybackToken> =>
    api.get<VideoPlaybackToken>(
      `/workshops/${workshopId}/sessions/${sessionId}/recording/playback-token`,
    ),
};
