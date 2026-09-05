import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 011-create-fleet-manager-tables.ts creates these tables and constraints.
  // Drop/re-add the constraints so this migration also upgrades databases
  // that already ran the original, prematurely numbered migration 010.
  await sql`alter table workers drop constraint if exists workers_provider_valid`.execute(
    database,
  );
  await sql`alter table workers add constraint workers_provider_valid check (provider in ('local', 'docker', 'aws'))`.execute(
    database,
  );

  await sql`alter table worker_events drop constraint if exists worker_events_event_valid`.execute(
    database,
  );
  await sql`alter table worker_events add constraint worker_events_event_valid check (event in (
    'worker_created', 'worker_provisioning', 'worker_ready', 'job_assigned',
    'job_started', 'progress_updated', 'heartbeat_recorded',
    'heartbeat_timeout', 'job_completed', 'job_failed',
    'worker_termination_requested', 'worker_terminated', 'worker_error',
    'spot_interrupted', 'orphan_instance_terminated', 'job_output_verified',
    'job_output_verification_failed', 'test_fault_requested', 'test_fault_applied'
  ))`.execute(database);

  await database.schema
    .createTable("fleet_test_controls")
    .ifNotExists()
    .addColumn("worker_id", "uuid", (column) =>
      column.primaryKey().references("workers.id").onDelete("cascade"),
    )
    .addColumn("fault", "text", (column) => column.notNull())
    .addColumn("requested_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("applied_at", "timestamptz")
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addCheckConstraint(
      "fleet_test_controls_fault_valid",
      sql`fault in ('interrupt', 'heartbeat-loss', 'progress-stall', 'worker-failure', 'storage-failure')`,
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Remove rows that would violate the older provider/event constraints before
  // restoring them. Delete dependent events first because worker_events has a
  // foreign key to workers.
  await sql`
    delete from worker_events
    where worker_id in (select id from workers where provider = 'docker')
       or event in ('test_fault_requested', 'test_fault_applied')
  `.execute(database);
  await sql`delete from workers where provider = 'docker'`.execute(database);
  await database.schema.dropTable("fleet_test_controls").ifExists().execute();

  await sql`alter table worker_events drop constraint if exists worker_events_event_valid`.execute(
    database,
  );
  await sql`alter table worker_events add constraint worker_events_event_valid check (event in (
    'worker_created', 'worker_provisioning', 'worker_ready', 'job_assigned',
    'job_started', 'progress_updated', 'heartbeat_recorded',
    'heartbeat_timeout', 'job_completed', 'job_failed',
    'worker_termination_requested', 'worker_terminated', 'worker_error',
    'spot_interrupted', 'orphan_instance_terminated', 'job_output_verified',
    'job_output_verification_failed'
  ))`.execute(database);
  await sql`alter table workers drop constraint if exists workers_provider_valid`.execute(
    database,
  );
  await sql`alter table workers add constraint workers_provider_valid check (provider in ('local', 'aws'))`.execute(
    database,
  );
}
