export const legalPagesKeys = {
  all: ["legal-pages"] as const,
  list: () => [...legalPagesKeys.all, "list"] as const,
};
