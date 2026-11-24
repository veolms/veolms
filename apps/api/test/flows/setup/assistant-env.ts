/**
 * The chat assistant switched on for 20-assistant.flow.test.ts, with a known
 * agent token. Imported before flow-env.ts (the API reads its config once).
 */
import { createHash } from "node:crypto";

export const FLOW_AGENT_TOKEN =
  "flow-agent-token-0123456789abcdef0123456789abcdef";

Object.assign(process.env, {
  ASSISTANT_ENABLED: "true",
  ASSISTANT_AGENT_TOKEN_SHA256: createHash("sha256")
    .update(FLOW_AGENT_TOKEN)
    .digest("hex"),
  ASSISTANT_ALLOWED_ROLES: "admin,instructor",
});
