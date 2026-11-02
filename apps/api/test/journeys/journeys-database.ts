/**
 * The browser tests' database. Imported before flow-env.ts, which reads it:
 * the browser tests and the flow tests each rebuild a database of their own,
 * so running one never wipes the other's.
 */
process.env.FLOW_TEST_DATABASE_URL ??=
  process.env.JOURNEY_TEST_DATABASE_URL ??
  "postgresql://veolms:veolms@localhost:5433/veolms_e2e_test";
