import type {
  AcademyBrandResponse,
  AcademyLogoContentType,
  AcademyLogoPresignResponse,
  UpdateAcademyBrandRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";
import { mediaService } from "../media/media.service";

export const academyService = {
  getBrand(): Promise<AcademyBrandResponse> {
    return api.get<AcademyBrandResponse>("/academy/brand");
  },
  updateBrand(brand: UpdateAcademyBrandRequest): Promise<AcademyBrandResponse> {
    return api.put<AcademyBrandResponse>("/academy/brand", brand);
  },
  /**
   * Uploads the file straight to storage, then makes it the academy's logo.
   * The file's type must already be checked as PNG or JPEG.
   */
  async uploadLogo(file: File): Promise<AcademyBrandResponse> {
    const contentType = file.type as AcademyLogoContentType;
    const { uploadId, uploadUrl } = await api.post<AcademyLogoPresignResponse>(
      "/academy/brand/logo/presign",
      { contentType, fileSize: file.size },
    );
    await mediaService.uploadFileToPresignedUrl(uploadUrl, file);
    return await api.post<AcademyBrandResponse>(
      "/academy/brand/logo/complete",
      { uploadId, contentType },
    );
  },
  removeLogo(): Promise<AcademyBrandResponse> {
    return api.delete<AcademyBrandResponse>("/academy/brand/logo");
  },
};
