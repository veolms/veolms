export const teamKeys = {
  all: ["team"] as const,
  roles: () => [...teamKeys.all, "roles"] as const,
  members: () => [...teamKeys.all, "members"] as const,
  memberList: (search: string) => [...teamKeys.members(), search] as const,
  userSearch: (q: string) => [...teamKeys.all, "user-search", q] as const,
  invitations: () => [...teamKeys.all, "invitations"] as const,
  invitationList: (status: string) =>
    [...teamKeys.invitations(), status] as const,
  invitationPreview: (token: string) =>
    [...teamKeys.all, "invitation-preview", token] as const,
};
