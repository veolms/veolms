/**
 * Prints a new VAPID key pair for web push, as the two env lines to put in
 * the API's environment (every API server and the notification worker).
 * Changing the pair later orphans every browser subscription; browsers
 * subscribe again on their next visit.
 */
import { generateVapidKeys } from "../modules/notifications/push/web-push.client.ts";

const keys = generateVapidKeys();
process.stdout.write(
  `WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}\n`,
);
