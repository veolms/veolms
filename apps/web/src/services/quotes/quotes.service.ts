import type { DailyQuoteResponse } from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const quotesService = {
  getDaily(): Promise<DailyQuoteResponse> {
    return api.get<DailyQuoteResponse>("/quotes/daily");
  },
};
