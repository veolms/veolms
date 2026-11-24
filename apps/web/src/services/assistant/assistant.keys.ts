export const assistantKeys = {
  all: ["assistant"] as const,
  info: () => [...assistantKeys.all, "info"] as const,
  cards: (roomId: string) => [...assistantKeys.all, "cards", roomId] as const,
};
