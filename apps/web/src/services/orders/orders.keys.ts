export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
  invoice: (id: string) => [...orderKeys.all, "invoice", id] as const,
};
