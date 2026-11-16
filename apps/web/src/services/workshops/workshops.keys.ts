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
  registrants: (workshopId: string) =>
    [...workshopKeys.all, "admin", "registrants", workshopId] as const,
};

export const workshopPublicKeys = {
  all: ["workshops", "public"] as const,
  list: () => [...workshopPublicKeys.all, "list"] as const,
  detail: (slug: string) =>
    [...workshopPublicKeys.all, "detail", slug] as const,
  viewer: (slug: string) =>
    [...workshopPublicKeys.all, "viewer", slug] as const,
  home: () => [...workshopPublicKeys.all, "home"] as const,
  standings: () => [...workshopPublicKeys.all, "standings"] as const,
};
