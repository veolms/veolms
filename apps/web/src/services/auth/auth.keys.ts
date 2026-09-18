export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
  avatars: () => [...authKeys.all, "avatars"] as const,
  sessions: () => [...authKeys.all, "sessions"] as const,
};

export const AUTH_QUERY_KEYS = {
  me: authKeys.me(),
  avatars: authKeys.avatars(),
  sessions: authKeys.sessions(),
} as const;
