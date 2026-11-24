import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateAiSettingsRequest } from "@veolms/contracts";
import { aiKeys } from "./ai.keys";
import { aiService } from "./ai.service";

export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAiSettingsRequest) =>
      aiService.updateSettings(payload),
    onSuccess: (data) => {
      qc.setQueryData(aiKeys.settings(), data);
      void qc.invalidateQueries({ queryKey: aiKeys.availability() });
    },
  });
}

export function useTestAiConnection() {
  return useMutation({ mutationFn: aiService.testConnection });
}
