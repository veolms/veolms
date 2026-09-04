import { sql, type Kysely } from "kysely";

// Added after the shared database migrations that precede it in production.

/**
 * Adds the two columns needed to size a worker from probed source metadata
 * instead of just requested output qualities + file size:
 *
 *  - video_metadata (jsonb, nullable): the probed subset of ffprobe output
 *    (width/height/fps/codec/bitrate/duration; excludes the raw per-stream
 *    dump) captured when the probe Lambda ran. NULL means "queued via a
 *    direct trigger with no probe step, or probing failed" â€” every reader
 *    must treat that as "fall back to the qualities+size heuristic," never
 *    as an error. estimateJobHardware() in @veolms/fleet-types is a pure
 *    function of (video_size, qualities, video_metadata), so any reader
 *    can recompute the exact same minCpu/minMemoryMb/storageGb/profile
 *    from this column at any time â€” nothing else needs to be persisted.
 *
 *  - hardware_profile (new enum type, nullable): the nano/micro/small/
 *    medium/large tier estimateJobHardware() resolved at queue time.
 *    Informational/queryable (dashboards, "show me all large jobs", the
 *    idle-worker pull-claim pre-filter below) â€” not re-derived from it by
 *    any sizing logic, since video_metadata above is already sufficient.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create type hardware_profile_enum as enum ('nano', 'micro', 'small', 'medium', 'large')
  `.execute(database);

  await sql`
    alter table video_jobs
      add column hardware_profile hardware_profile_enum,
      add column video_metadata jsonb
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table video_jobs
      drop column if exists video_metadata,
      drop column if exists hardware_profile
  `.execute(database);

  await sql`drop type if exists hardware_profile_enum`.execute(database);
}


