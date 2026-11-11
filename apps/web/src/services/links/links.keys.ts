export const linksKeys = {
  all: ["links"] as const,
  list: () => [...linksKeys.all, "list"] as const,
  pathCheck: (path: string, linkId?: string) =>
    [...linksKeys.all, "path-check", path, linkId ?? null] as const,
};
