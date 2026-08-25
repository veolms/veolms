export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
  sessions: () => [...authKeys.all, "sessions"] as const,
};

export const AUTH_QUERY_KEYS = {
  me: authKeys.me(),
  sessions: authKeys.sessions(),
} as const;
