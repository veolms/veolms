import { useQuery } from "@tanstack/react-query";
import { questionAiKeys } from "./question-ai.keys";
import { questionAiService } from "./question-ai.service";

/** While a run works, its progress is read again every few seconds. */
const RUNNING_REFRESH_MS = 3_000;

/** The course's latest AI run (questions for the whole course), if any. */
export function useLatestQuestionJob(courseId: string | null | undefined) {
  return useQuery({
    queryKey: questionAiKeys.latestJob(courseId ?? "none"),
    queryFn: () => questionAiService.latestJob(courseId!),
    enabled: Boolean(courseId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running"
        ? RUNNING_REFRESH_MS
        : false;
    },
  });
}
