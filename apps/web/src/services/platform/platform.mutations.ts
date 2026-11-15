import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformBrandAsset,
  PlatformSettingsResponse,
  PublicPlatformSettingsResponse,
  StaticSiteRebuildStatus,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authKeys } from "../auth";
import { platformKeys } from "./platform.keys";
import { platformService } from "./platform.service";

/**
 * The public copy of saved settings, as every visitor is sent it: without
 * the invoice and legal details.
 */
function rememberPublicSettings(
  queryClient: ReturnType<typeof useQueryClient>,
  saved: PlatformSettingsResponse,
) {
  const { appearance, security, branding } = saved.settings;
  queryClient.setQueryData<PublicPlatformSettingsResponse>(
    platformKeys.publicSettings(),
    { appearance, security, branding },
  );
}

/**
 * Saves one setting the moment it is changed, as the Settings page does. The
 * page shows the change at once and returns to the saved value if the save
 * fails.
 */
export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation<
    PlatformSettingsResponse,
    ApiError,
    UpdatePlatformSettingsRequest,
    { previous: PlatformSettingsResponse | undefined }
  >({
    mutationFn: (changes) => platformService.updateSettings(changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: platformKeys.settings() });
      const previous = queryClient.getQueryData<PlatformSettingsResponse>(
        platformKeys.settings(),
      );
      if (previous) {
        queryClient.setQueryData<PlatformSettingsResponse>(
          platformKeys.settings(),
          {
            ...previous,
            settings: {
              appearance: {
                ...previous.settings.appearance,
                ...changes.appearance,
              },
              security: { ...previous.settings.security, ...changes.security },
              branding: previous.settings.branding,
              invoice: { ...previous.settings.invoice, ...changes.invoice },
              legal: { ...previous.settings.legal, ...changes.legal },
            },
          },
        );
      }
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) {
        queryClient.setQueryData(platformKeys.settings(), context.previous);
      }
    },
    onSuccess: (saved, changes) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
      rememberPublicSettings(queryClient, saved);
      if (changes.security?.requireVerifiedPhoneForEnrollment !== undefined) {
        void queryClient.invalidateQueries({ queryKey: authKeys.config() });
      }
    },
  });
}

/** Uploads a logo for the invoices only (Platform > Invoice). */
export function useUploadInvoiceLogo() {
  const queryClient = useQueryClient();
  return useMutation<PlatformSettingsResponse, ApiError, File>({
    mutationFn: (file) => platformService.uploadInvoiceLogo(file),
    onSuccess: (saved) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
    },
  });
}

/** Invoices go back to printing the academy's logo. */
export function useRemoveInvoiceLogo() {
  const queryClient = useQueryClient();
  return useMutation<PlatformSettingsResponse, ApiError, void>({
    mutationFn: () => platformService.removeInvoiceLogo(),
    onSuccess: (saved) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
    },
  });
}

/**
 * Uploads a website logo or icon (Platform > General); the site shows it
 * at once, in this tab, and to every visitor from their next page load.
 */
export function useUploadBrandAsset(asset: PlatformBrandAsset) {
  const queryClient = useQueryClient();
  return useMutation<PlatformSettingsResponse, ApiError, File>({
    mutationFn: (file) => platformService.uploadBrandAsset(asset, file),
    onSuccess: (saved) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
      rememberPublicSettings(queryClient, saved);
    },
  });
}

/** The site goes back to its built-in logo or icon for this piece. */
export function useRemoveBrandAsset(asset: PlatformBrandAsset) {
  const queryClient = useQueryClient();
  return useMutation<PlatformSettingsResponse, ApiError, void>({
    mutationFn: () => platformService.removeBrandAsset(asset),
    onSuccess: (saved) => {
      queryClient.setQueryData(platformKeys.settings(), saved);
      rememberPublicSettings(queryClient, saved);
    },
  });
}

/** Starts a build of every public page (or joins the one under way). */
export function useRebuildStaticSite() {
  const queryClient = useQueryClient();
  return useMutation<StaticSiteRebuildStatus, ApiError>({
    mutationFn: () => platformService.rebuildStaticSite(),
    onSuccess: (status) => {
      queryClient.setQueryData(platformKeys.staticSiteRebuild(), status);
    },
  });
}
