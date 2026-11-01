import { sql, type Kysely } from "kysely";

/**
 * Two-factor sign-in (an authenticator app, passkeys, backup codes) is for
 * the academy's team only: admins and anyone holding a role other than
 * student. Students no longer have it, so what a student set up before is
 * removed, and they sign in as if they never had: the API asks no student
 * for a second step whatever is stored, and this leaves nothing stored.
 *
 * A student is an account with no role other than student, the API's
 * `isStaffAccount` rule. Team members keep their factors. The Platform
 * page's switch for students is retired with it.
 *
 * Nothing removed here can be put back by `down`: a factor is a secret the
 * account holder set up, and they would set it up again.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  const students = sql`(
    select users.id from users
    where not exists (
      select 1 from user_roles
      join roles on roles.id = user_roles.role_id
      where user_roles.user_id = users.id
        and lower(roles.name) <> 'student'
    )
  )`;

  await sql`delete from passkeys where user_id in ${students}`.execute(
    database,
  );
  await sql`
    delete from user_totp_credentials where user_id in ${students}
  `.execute(database);
  await sql`
    delete from mfa_backup_codes where user_id in ${students}
  `.execute(database);
  await sql`
    delete from webauthn_challenges where user_id in ${students}
  `.execute(database);
  await sql`
    update users set mfa_mandatory = false
    where mfa_mandatory and id in ${students}
  `.execute(database);
  await sql`
    update platform_settings
    set settings = settings #- '{security,studentTwoFactorEnabled}'
    where settings #> '{security,studentTwoFactorEnabled}' is not null
  `.execute(database);
}

export async function down(): Promise<void> {
  // See above: removed factors are set up again by their owners.
}
