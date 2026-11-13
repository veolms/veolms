/**
 * A stand-in for Firebase Cloud Messaging: phone pushes the notification
 * worker sends are kept here instead of leaving the machine.
 *
 * Import it before anything else: it sets the push environment (one app in
 * PUSH_APPS, with a throwaway key) before the API's config is read. Pass
 * `fakeFcm` to createPushPipeline as `fcm`.
 */
import crypto from "node:crypto";

import type { FcmClient } from "../../../src/modules/notifications/push/fcm.client.ts";

/** The package name the flow tests' phones register with. */
export const FLOW_PHONE_APP_ID = "org.veolms.flowtest";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const serviceAccount = Buffer.from(
  JSON.stringify({
    project_id: "veolms-flow-test",
    client_email: "push@veolms-flow-test.iam.gserviceaccount.com",
    private_key: privateKey,
  }),
).toString("base64");

Object.assign(process.env, {
  PUSH_ENABLED: "true",
  PUSH_APPS: JSON.stringify([
    { applicationId: FLOW_PHONE_APP_ID, serviceAccountBase64: serviceAccount },
  ]),
});

export interface SentPhonePush {
  fid: string;
  data: Record<string, string>;
  android?: Record<string, unknown>;
}

const sent: SentPhonePush[] = [];

export const fakeFcm: FcmClient & {
  sent: SentPhonePush[];
  /** The pushes this phone (FID) received, oldest first. */
  pushesFor(fid: string): SentPhonePush[];
} = {
  sent,
  async send(_account, body) {
    const message = body.message as {
      fid?: string;
      token?: string;
      data?: Record<string, string>;
      android?: Record<string, unknown>;
    };
    sent.push({
      fid: message.fid ?? message.token ?? "",
      data: message.data ?? {},
      android: message.android,
    });
    return {
      ok: true,
      messageId: `projects/veolms-flow-test/messages/${sent.length}`,
    };
  },
  pushesFor(fid) {
    return sent.filter((push) => push.fid === fid);
  },
};
