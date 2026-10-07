export const DISCUSSION_CONSTANTS = {
  MAX_ATTACHMENT_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  MAX_MENTIONS_PER_POST: 20,
  SUPPORTED_CODE_EXTENSIONS: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".cpp",
    ".c",
    ".html",
    ".css",
    ".json",
    ".sql",
    ".sh",
  ],
} as const;
