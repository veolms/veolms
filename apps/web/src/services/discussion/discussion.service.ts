import type { DiscussionUploadResponse } from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const discussionService = {
  uploadAttachment(file: File): Promise<DiscussionUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api.post<DiscussionUploadResponse>(
      "/dev/discussion-uploads",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
};
