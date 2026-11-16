import assert from "node:assert/strict";
import { test } from "node:test";

import type { PaymentGateway } from "@veolms/contracts";
import {
  createPaymentGateways,
  setAcademyGatewaysSource,
  singleGateway,
} from "@veolms/services";

import { config } from "../../../../config.ts";

const academyGateway = {
  providerName: "razorpay",
} as unknown as PaymentGateway;

await test("an academy's own account is used before the server's keys", () => {
  const gateways = createPaymentGateways(config);
  const serverPrimary = gateways.primary;
  setAcademyGatewaysSource(() => singleGateway(academyGateway));
  try {
    assert.equal(gateways.primary, academyGateway);
    assert.equal(gateways.forCountry("IN"), academyGateway);
    assert.equal(gateways.get("razorpay"), academyGateway);
    assert.equal(
      gateways.get("cashfree"),
      undefined,
      "only the gateway it connected",
    );
    assert.deepEqual(gateways.all, [academyGateway]);
  } finally {
    setAcademyGatewaysSource(null);
  }
  assert.equal(gateways.primary, serverPrimary);
});

await test("an academy with no account of its own falls through to the server's keys", () => {
  const gateways = createPaymentGateways(config);
  const serverPrimary = gateways.primary;
  setAcademyGatewaysSource(() => undefined);
  try {
    assert.equal(gateways.primary, serverPrimary);
  } finally {
    setAcademyGatewaysSource(null);
  }
});
