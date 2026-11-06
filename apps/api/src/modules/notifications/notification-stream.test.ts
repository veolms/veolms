import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import type { FastifyReply, FastifyRequest } from "fastify";

import {
  decodeNotificationSignal,
  encodeNotificationSignal,
} from "./notification-signal.ts";
import {
  createNotificationStreamHandler,
  formatServerSentEvent,
  type NotificationStreamHub,
} from "./notification-stream.ts";

const userId = "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b";

await test("a signal round-trips its user ids, once each", () => {
  const [payload, ...rest] = encodeNotificationSignal([userId, userId]);
  assert.equal(rest.length, 0);
  assert.deepEqual(decodeNotificationSignal(payload), [userId]);
});

await test("a large fan-out is split under the NOTIFY size limit", () => {
  const ids = Array.from(
    { length: 1000 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const payloads = encodeNotificationSignal(ids);
  assert.ok(payloads.length > 1);
  for (const payload of payloads) {
    assert.ok(Buffer.byteLength(payload) < 8000);
  }
  assert.deepEqual(
    payloads.flatMap((p) => decodeNotificationSignal(p)!),
    ids,
  );
});

await test("payloads that are not ours are ignored", () => {
  assert.equal(decodeNotificationSignal("not json"), null);
  assert.equal(decodeNotificationSignal('{"v":2,"u":[]}'), null);
  assert.equal(decodeNotificationSignal(undefined), null);
});

/** A hub without a database: tests trigger `changed` themselves. */
function fakeHub() {
  const subscribers = new Map<
    string,
    Set<{ changed(): void; close(): void }>
  >();
  const hub: NotificationStreamHub = {
    subscribe(id, subscriber) {
      const set = subscribers.get(id) ?? new Set();
      set.add(subscriber);
      subscribers.set(id, set);
      return () => set.delete(subscriber);
    },
    countFor: (id) => subscribers.get(id)?.size ?? 0,
    isListening: () => true,
    async stop() {
      for (const set of subscribers.values()) {
        for (const subscriber of [...set]) subscriber.close();
      }
    },
  };
  const changed = (id: string) => {
    for (const subscriber of subscribers.get(id) ?? []) subscriber.changed();
  };
  return { hub, changed };
}

/** A raw response that records what was written. */
function fakeReply() {
  const raw = new EventEmitter() as EventEmitter & {
    chunks: string[];
    status?: number;
    headers?: Record<string, string>;
    ended: boolean;
    writeHead(status: number, headers: Record<string, string>): void;
    write(chunk: string): boolean;
    end(): void;
  };
  raw.chunks = [];
  raw.ended = false;
  raw.writeHead = (status, headers) => {
    raw.status = status;
    raw.headers = headers;
  };
  raw.write = (chunk) => {
    raw.chunks.push(chunk);
    return true;
  };
  raw.end = () => {
    raw.ended = true;
    raw.emit("close");
  };
  const replyHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "https://www.example.test",
    "Access-Control-Allow-Credentials": "true",
  };
  let hijacked = false;
  const reply = {
    raw,
    getHeader: (name: string) => replyHeaders[name],
    hijack: () => {
      hijacked = true;
    },
  } as unknown as FastifyReply;
  return { reply, raw, isHijacked: () => hijacked };
}

const request = { user: { id: userId } } as unknown as FastifyRequest;

await test("the stream opens with retry and ready, as text/event-stream", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const { hub } = fakeHub();
  const handler = createNotificationStreamHandler({
    hub,
    enabled: true,
    maxStreamsPerUser: 3,
  });
  const { reply, raw, isHijacked } = fakeReply();
  await handler(request, reply);

  assert.ok(isHijacked());
  assert.equal(raw.status, 200);
  assert.match(raw.headers!["Content-Type"]!, /^text\/event-stream/);
  assert.equal(
    raw.headers!["Access-Control-Allow-Origin"],
    "https://www.example.test",
  );
  assert.deepEqual(raw.chunks, [
    "retry: 5000\n\n",
    formatServerSentEvent("ready", {}),
  ]);

  t.mock.timers.tick(25_000);
  assert.equal(raw.chunks.at(-1), ": ping\n\n");
  raw.emit("close");
  assert.equal(hub.countFor(userId), 0);
});

await test("a burst of changes is sent at most once a second", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  t.mock.timers.setTime(10_000);
  const { hub, changed } = fakeHub();
  const handler = createNotificationStreamHandler({
    hub,
    enabled: true,
    maxStreamsPerUser: 3,
  });
  const { reply, raw } = fakeReply();
  await handler(request, reply);
  const changedEvent = formatServerSentEvent("changed", {});
  const count = () => raw.chunks.filter((c) => c === changedEvent).length;

  changed(userId);
  assert.equal(count(), 1);
  changed(userId);
  changed(userId);
  assert.equal(count(), 1);
  t.mock.timers.tick(1_000);
  assert.equal(count(), 2);
  raw.emit("close");
});

await test("past the per-user limit a stream is refused before it opens", async () => {
  const { hub } = fakeHub();
  const handler = createNotificationStreamHandler({
    hub,
    enabled: true,
    maxStreamsPerUser: 1,
  });
  const first = fakeReply();
  await handler(request, first.reply);
  const second = fakeReply();
  await assert.rejects(handler(request, second.reply), { statusCode: 429 });
  assert.equal(second.isHijacked(), false);
  first.raw.emit("close");
});

await test("turned off, the stream answers 503 so the tab keeps polling", async () => {
  const { hub } = fakeHub();
  const handler = createNotificationStreamHandler({
    hub,
    enabled: false,
    maxStreamsPerUser: 3,
  });
  const { reply, isHijacked } = fakeReply();
  await assert.rejects(handler(request, reply), { statusCode: 503 });
  assert.equal(isHijacked(), false);
});

await test("shutting down ends every open stream", async () => {
  const { hub } = fakeHub();
  const handler = createNotificationStreamHandler({
    hub,
    enabled: true,
    maxStreamsPerUser: 3,
  });
  const { reply, raw } = fakeReply();
  await handler(request, reply);
  await hub.stop();
  assert.equal(raw.ended, true);
});
