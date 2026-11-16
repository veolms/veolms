import type {
  AcademyAddressResponse,
  AcademyHandoffResponse,
  FirstMovesResponse,
  LaunchAcademyRequest,
  LaunchAcademyResponse,
  OnboardingDraft,
  OnboardingStateResponse,
  SaveOnboardingDraftRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

/**
 * Creator sign-up on the platform site (answered only by VeoLMS Cloud), the
 * hand-over to the academy's own address, and the admin home's first moves.
 */
export const onboardingService = {
  getState(): Promise<OnboardingStateResponse> {
    return api.get<OnboardingStateResponse>("/onboarding/state");
  },
  saveDraft(body: SaveOnboardingDraftRequest): Promise<OnboardingDraft> {
    return api.put<OnboardingDraft>("/onboarding/draft", body);
  },
  checkAddress(slug: string): Promise<AcademyAddressResponse> {
    return api.get<AcademyAddressResponse>(
      `/onboarding/address?slug=${encodeURIComponent(slug)}`,
    );
  },
  launch(body: LaunchAcademyRequest): Promise<LaunchAcademyResponse> {
    return api.post<LaunchAcademyResponse>("/onboarding/academies", body);
  },
  openAcademy(academyId: string): Promise<AcademyHandoffResponse> {
    return api.post<AcademyHandoffResponse>(
      `/onboarding/academies/${encodeURIComponent(academyId)}/handoff`,
      {},
    );
  },
  getFirstMoves(): Promise<FirstMovesResponse> {
    return api.get<FirstMovesResponse>("/academy/first-moves");
  },
  markLinkShared(): Promise<FirstMovesResponse> {
    return api.post<FirstMovesResponse>("/academy/first-moves/share", {});
  },
};
