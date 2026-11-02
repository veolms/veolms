/** Rows every flow test can count on; written by prepare-database.ts. */

export const FLOW_ACADEMY = {
  id: "00000000-0000-4000-8000-0000000f1000",
  name: "Flow Test Academy",
  logo_url: null,
  custom_domain: null,
  setup_completed: true,
} as const;

/** The academy's administrator. Signs in with an emailed code. */
export const FLOW_ADMIN = {
  id: "00000000-0000-4000-8000-0000000f1001",
  email: "admin@flow.test",
  username: "flow_admin",
  display_name: "Flow Admin",
  email_verified_at: new Date("2026-01-01T00:00:00Z"),
} as const;
