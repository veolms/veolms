import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type QueryResult,
} from "kysely";
import type { Database } from "@veolms/database";

import { AppError } from "../../../lib/errors.ts";
import { hashToken } from "../shared/auth.utils.ts";
import { createOauthService } from "./oauth.service.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";
import type { OauthProfile } from "./oauth.provider.ts";

interface NonceRow {
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

function createFakeNonceDatabase() {
  const nonces: NonceRow[] = [];

  class FakeConnection implements DatabaseConnection {
    async executeQuery<R>(
      compiledQuery: CompiledQuery,
    ): Promise<QueryResult<R>> {
      const sqlLower = compiledQuery.sql.toLowerCase();

      // 1. Housekeeping: DELETE FROM oauth_nonces WHERE expires_at < now()
      if (
        sqlLower.startsWith('delete from "oauth_nonces"') ||
        sqlLower.startsWith("delete from oauth_nonces")
      ) {
        const now = new Date();
        for (let i = nonces.length - 1; i >= 0; i--) {
          const item = nonces[i];
          if (item && item.expires_at.getTime() < now.getTime()) {
            nonces.splice(i, 1);
          }
        }
        return { rows: [] };
      }

      // 2. Insert: INSERT INTO oauth_nonces (token_hash, expires_at, used_at) VALUES ($1, $2, $3)
      if (
        sqlLower.startsWith('insert into "oauth_nonces"') ||
        sqlLower.startsWith("insert into oauth_nonces")
      ) {
        const [tokenHash, expiresAt, usedAt] = compiledQuery.parameters as [
          string,
          Date,
          Date | null,
        ];
        nonces.push({
          token_hash: tokenHash,
          expires_at: new Date(expiresAt),
          used_at: usedAt ? new Date(usedAt) : null,
        });
        return { rows: [] };
      }

      // 3. Update / Consume: UPDATE oauth_nonces SET used_at = $1 WHERE token_hash = $2 AND used_at IS NULL AND expires_at > $3 RETURNING token_hash
      if (
        sqlLower.startsWith('update "oauth_nonces"') ||
        sqlLower.startsWith("update oauth_nonces")
      ) {
        const [usedAt, tokenHash, nowParam] = compiledQuery.parameters as [
          Date,
          string,
          Date,
        ];
        const now = new Date(nowParam || usedAt);

        const target = nonces.find(
          (n) =>
            n.token_hash === tokenHash &&
            n.used_at === null &&
            n.expires_at.getTime() > now.getTime(),
        );

        if (!target) {
          return { rows: [] };
        }

        target.used_at = new Date(usedAt);
        return { rows: [{ token_hash: target.token_hash } as unknown as R] };
      }

      return { rows: [] };
    }

    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      // not needed for nonces
    }
  }

  class FakeDriver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return new FakeConnection();
    }
  }

  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new FakeDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  return { database, nonces };
}

function createTestContext(fakeDb = createFakeNonceDatabase()) {
  const authService = {
    findUserByOauthAccountIncludingDeleted: async () => ({
      id: "usr_test_123",
      email: "student@example.com",
      username: "student",
      display_name: "Test Student",
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    syncProviderAvatar: async () => {},
    requireUser: async (id: string) => ({
      id,
      email: "student@example.com",
      username: "student",
      display_name: "Test Student",
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    }),
  } as unknown as AuthService;

  const sessionService = {
    establishSession: async () => ({
      token: "mock-session-token",
      roles: ["student"],
      mfa: false,
    }),
  } as unknown as SessionService;

  const oauthService = createOauthService({
    database: fakeDb.database,
    authService,
    sessionService,
  });

  return { oauthService, nonces: fakeDb.nonces };
}

await test("Test 1 (Happy path): Calling loginWithGoogleCredential with valid token containing valid, unused nonce succeeds and records used_at", async () => {
  const { oauthService, nonces } = createTestContext();

  const { nonce } = await oauthService.createGoogleOneTapNonce();
  assert.equal(typeof nonce, "string");
  assert.ok(nonce.length >= 16);

  const tokenHash = hashToken(nonce);
  const storedNonce = nonces.find((n) => n.token_hash === tokenHash);
  assert.ok(storedNonce, "Nonce must be recorded in database");
  assert.equal(storedNonce.used_at, null);

  const mockVerify = async (_credential: string): Promise<OauthProfile> => ({
    email: "student@example.com",
    name: "Test Student",
    username: "student",
    providerUserId: "google_12345",
    nonce,
  });

  const result = await oauthService.loginWithGoogleCredential(
    "valid_google_credential",
    { ip: "127.0.0.1", userAgent: "test-browser" },
    mockVerify,
  );

  assert.equal(result.session.token, "mock-session-token");
  const consumedNonce = nonces.find((n) => n.token_hash === tokenHash);
  assert.ok(consumedNonce?.used_at, "used_at timestamp must be set");
});

await test("Test 2 (Missing nonce): Token without a nonce claim throws 401 ONE_TAP_NONCE_INVALID", async () => {
  const { oauthService } = createTestContext();

  const mockVerify = async (_credential: string): Promise<OauthProfile> => ({
    email: "student@example.com",
    name: "Test Student",
    username: "student",
    providerUserId: "google_12345",
    // nonce omitted
  });

  await assert.rejects(
    async () => {
      await oauthService.loginWithGoogleCredential(
        "token_missing_nonce",
        { ip: "127.0.0.1", userAgent: "test-browser" },
        mockVerify,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, "ONE_TAP_NONCE_INVALID");
      return true;
    },
  );
});

await test("Test 3 (Replayed nonce): Submitting the exact same credential twice succeeds on 1st and fails with 401 on 2nd", async () => {
  const { oauthService } = createTestContext();

  const { nonce } = await oauthService.createGoogleOneTapNonce();

  const mockVerify = async (_credential: string): Promise<OauthProfile> => ({
    email: "student@example.com",
    name: "Test Student",
    username: "student",
    providerUserId: "google_12345",
    nonce,
  });

  // First attempt succeeds
  const firstResult = await oauthService.loginWithGoogleCredential(
    "replay_test_credential",
    { ip: "127.0.0.1", userAgent: "legitimate-browser" },
    mockVerify,
  );
  assert.equal(firstResult.session.token, "mock-session-token");

  // Second attempt (replay) must be rejected with 401 ONE_TAP_NONCE_INVALID
  await assert.rejects(
    async () => {
      await oauthService.loginWithGoogleCredential(
        "replay_test_credential",
        { ip: "10.0.0.99", userAgent: "attacker-browser" },
        mockVerify,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, "ONE_TAP_NONCE_INVALID");
      return true;
    },
  );
});

await test("Test 4 (Expired nonce): A nonce past its expires_at is rejected with 401", async () => {
  const { oauthService, nonces } = createTestContext();

  const { nonce } = await oauthService.createGoogleOneTapNonce();
  const tokenHash = hashToken(nonce);
  const stored = nonces.find((n) => n.token_hash === tokenHash)!;

  // Artificially expire the nonce
  stored.expires_at = new Date(Date.now() - 1000);

  const mockVerify = async (_credential: string): Promise<OauthProfile> => ({
    email: "student@example.com",
    name: "Test Student",
    username: "student",
    providerUserId: "google_12345",
    nonce,
  });

  await assert.rejects(
    async () => {
      await oauthService.loginWithGoogleCredential(
        "expired_nonce_credential",
        { ip: "127.0.0.1", userAgent: "test-browser" },
        mockVerify,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, "ONE_TAP_NONCE_INVALID");
      return true;
    },
  );
});

await test("Test 5 (Cleanup): Nonce issuance cleans up nonces with expires_at < now()", async () => {
  const fakeDb = createFakeNonceDatabase();
  const { oauthService, nonces } = createTestContext(fakeDb);

  // Pre-seed an expired nonce
  const expiredHash = hashToken("expired_random_nonce_value");
  nonces.push({
    token_hash: expiredHash,
    expires_at: new Date(Date.now() - 50_000),
    used_at: null,
  });

  // Pre-seed an active valid nonce
  const activeHash = hashToken("active_random_nonce_value");
  nonces.push({
    token_hash: activeHash,
    expires_at: new Date(Date.now() + 100_000),
    used_at: null,
  });

  assert.equal(nonces.length, 2);

  // Issuing a new nonce triggers opportunistic cleanup
  await oauthService.createGoogleOneTapNonce();

  assert.equal(
    nonces.some((n) => n.token_hash === expiredHash),
    false,
    "Expired nonce must be purged",
  );
  assert.equal(
    nonces.some((n) => n.token_hash === activeHash),
    true,
    "Active nonce must remain",
  );
});
