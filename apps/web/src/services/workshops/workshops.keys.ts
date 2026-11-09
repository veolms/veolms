export const workshopKeys = {
  all: ["workshops"] as const,
  adminLists: () => [...workshopKeys.all, "admin", "list"] as const,
  adminList: (filters: { tab: string; search?: string }) =>
    [...workshopKeys.adminLists(), filters] as const,
  adminDetails: () => [...workshopKeys.all, "admin", "detail"] as const,
  adminDetail: (workshopId: string) =>
    [...workshopKeys.adminDetails(), workshopId] as const,
  publishCheck: (workshopId: string) =>
    [...workshopKeys.all, "admin", "publish-check", workshopId] as const,
};
