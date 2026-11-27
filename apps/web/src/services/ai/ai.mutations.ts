import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AiSettingsResponse,
  UpdateAiSettingsRequest,
} from "@veolms/contracts";
import { aiKeys } from "./ai.keys";
import { aiService } from "./ai.service";

/** Every settings change answers with the new settings: show them at once. */
function useSettingsMutation<T>(
  mutationFn: (payload: T) => Promise<AiSettingsResponse>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      qc.setQueryData(aiKeys.settings(), data);
      void qc.invalidateQueries({ queryKey: aiKeys.availability() });
    },
  });
}

export function useUpdateAiSettings() {
  return useSettingsMutation((payload: UpdateAiSettingsRequest) =>
    aiService.updateSettings(payload),
  );
}

/** Save, replace or remove one provider's key. */
export function useSaveAiProvider() {
  return useSettingsMutation(aiService.saveProvider);
}

export function useAddAiModel() {
  return useSettingsMutation(aiService.addModel);
}

export function useRemoveAiModel() {
  return useSettingsMutation(aiService.removeModel);
}

export function useTestAiConnection() {
  return useMutation({ mutationFn: aiService.testConnection });
}
