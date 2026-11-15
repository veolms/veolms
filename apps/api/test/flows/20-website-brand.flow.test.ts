/**
 * The website's artwork (Platform > General): a logo for light pages, one
 * for dark pages and a square icon. Every visitor's browser is sent them
 * with the public settings; only an administrator uploads or removes them,
 * and only through an upload the server checked.
 *
 * Storage is unreachable in these flows, so no file is uploaded here; the
 * checks on an uploaded file are unit-tested (academy-image-dimensions).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";

const flow = await startFlowApp();
// An administrator of their own: the main admin's sign-in codes for the day
// are used up by the files before this one.
const adminAccount = await signedUpLearner(flow, "brandadmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);
const { client: learner } = await signedUpLearner(flow, "brand");
const visitor = flow.visitor();

interface Branding {
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  iconUrl: string | null;
}

test.after(async () => {
  await flow.close();
});

test("every visitor is sent the website's artwork, none until one is uploaded", async () => {
  const response = await visitor.get<{ branding: Branding; invoice?: unknown }>(
    "/v1/platform/public-settings",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data?.branding, {
    logoLightUrl: null,
    logoDarkUrl: null,
    iconUrl: null,
  });
  assert.equal(response.body.data?.invoice, undefined);
});

test("an administrator gets an upload address for each piece, and can remove each", async () => {
  for (const asset of ["logo-light", "logo-dark", "icon"]) {
    const presign = await admin.post<{ uploadId: string; uploadUrl: string }>(
      `/v1/platform/settings/brand-assets/${asset}/presign`,
      { contentType: "image/png", fileSize: 20_000 },
    );
    assert.equal(presign.status, 200, JSON.stringify(presign.body.error));
    assert.match(presign.body.data?.uploadId ?? "", /^[0-9a-f-]{36}$/);
    assert.ok(presign.body.data?.uploadUrl);

    const removed = await admin.delete<{ settings: { branding: Branding } }>(
      `/v1/platform/settings/brand-assets/${asset}`,
    );
    assert.equal(removed.status, 200, JSON.stringify(removed.body.error));
    assert.deepEqual(removed.body.data?.settings.branding, {
      logoLightUrl: null,
      logoDarkUrl: null,
      iconUrl: null,
    });
  }
});

test("only a known piece of artwork, and only a PNG or JPEG up to 2 MB, can be uploaded", async () => {
  const unknown = await admin.post(
    "/v1/platform/settings/brand-assets/banner/presign",
    { contentType: "image/png", fileSize: 20_000 },
  );
  assert.equal(unknown.status, 400);

  const svg = await admin.post(
    "/v1/platform/settings/brand-assets/icon/presign",
    { contentType: "image/svg+xml", fileSize: 2_000 },
  );
  assert.equal(svg.status, 400);

  const large = await admin.post(
    "/v1/platform/settings/brand-assets/logo-light/presign",
    { contentType: "image/png", fileSize: 3 * 1024 * 1024 },
  );
  assert.equal(large.status, 400);
});

test("an address cannot be saved as artwork without an upload the server checked", async () => {
  const response = await admin.patch("/v1/platform/settings", {
    branding: { iconUrl: "https://elsewhere.example.com/icon.png" },
  });
  assert.equal(response.status, 400);
});

test("learners and visitors cannot change the artwork", async () => {
  for (const client of [learner, visitor]) {
    const presign = await client.post(
      "/v1/platform/settings/brand-assets/icon/presign",
      { contentType: "image/png", fileSize: 20_000 },
    );
    assert.ok(
      presign.status === 401 || presign.status === 403,
      `answered ${presign.status}`,
    );
    const removed = await client.delete(
      "/v1/platform/settings/brand-assets/icon",
    );
    assert.ok(
      removed.status === 401 || removed.status === 403,
      `answered ${removed.status}`,
    );
  }
});
