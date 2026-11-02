/**
 * The real VeoLMS API, started against the flow test database, with the
 * outside world replaced: email is captured instead of sent (so a test can
 * read the sign-in code the learner would have received), and payments go
 * to a fake gateway. Everything else (routes, access rules, sessions,
 * caches, the database) is what production runs.
 */
import "./flow-env.ts";

import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { EmailContent, EmailService } from "@veolms/services";

import {
  FakePaymentGateway,
  fakePaymentGateways,
} from "./fake-payment-gateway.ts";
import { FLOW_ADMIN } from "./flow-fixtures.ts";

const { createDatabase } = await import("@veolms/database");
const { createServices } = await import("@veolms/services");
const { config } = await import("../../../src/config.ts");
const { createApp } = await import("../../../src/app.ts");

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
}

/** Keeps every email the API sends; nothing leaves the machine. */
class CapturingEmailService implements EmailService {
  readonly sent: SentEmail[] = [];

  async send(to: string, content: EmailContent) {
    this.sent.push({
      to: to.toLowerCase(),
      subject: content.subject,
      text: `${content.text ?? ""}\n${content.html ?? ""}`,
    });
    return { status: "logged" as const };
  }

  async verify() {
    return true;
  }

  async close() {}

  /** The six-digit code in the last email sent to `to`. */
  lastCodeFor(to: string): string {
    const email = this.sent.findLast((mail) => mail.to === to.toLowerCase());
    const code = email?.text.match(/\b(\d{6})\b/u)?.[1];
    if (!code) throw new Error(`No code was emailed to ${to}`);
    return code;
  }
}

const silentLogger = {
  level: "silent",
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
  silent() {},
  child() {
    return silentLogger;
  },
} as unknown as FastifyBaseLogger;

export interface FlowApp {
  app: FastifyInstance;
  database: ReturnType<typeof createDatabase>;
  email: CapturingEmailService;
  gateway: FakePaymentGateway;
  /** A new visitor with an address of their own (rate limits are per address). */
  visitor(): FlowClient;
  close(): Promise<void>;
}

let addressCounter = 0;

export interface FlowAppOptions {
  /** Print the API's errors (the browser tests' server does); silent by default. */
  logErrors?: boolean;
}

export async function startFlowApp(
  options: FlowAppOptions = {},
): Promise<FlowApp> {
  const database = createDatabase(config.DATABASE_URL, {
    applicationName: "veolms-flow-tests",
  });
  const email = new CapturingEmailService();
  const gateway = new FakePaymentGateway();
  const services = {
    ...createServices({ config, logger: silentLogger }),
    email,
    paymentGateways: fakePaymentGateways(gateway),
  };
  const app = await createApp({
    database,
    logger: options.logErrors ? { level: "error" } : false,
    services,
  });
  await app.ready();

  return {
    app,
    database,
    email,
    gateway,
    visitor: () => {
      addressCounter += 1;
      // A documentation range (TEST-NET-2), one address per visitor.
      const address = `198.51.${Math.floor(addressCounter / 250)}.${(addressCounter % 250) + 1}`;
      return new FlowClient(app, email, address);
    },
    async close() {
      await app.close();
      await database.destroy();
    },
  };
}

export interface FlowResponse<T = unknown> {
  status: number;
  body: { data?: T; error?: { code?: string; message?: string } } & Record<
    string,
    unknown
  >;
  headers: Record<string, unknown>;
}

const SESSION_COOKIE = "veolms-session";

/**
 * One browser: it keeps the cookies the API sets, as a browser would, and
 * sends them back on every request.
 */
export class FlowClient {
  readonly cookies = new Map<string, string>();
  readonly #app: FastifyInstance;
  readonly #email: CapturingEmailService;
  readonly address: string;

  constructor(
    app: FastifyInstance,
    email: CapturingEmailService,
    address: string,
  ) {
    this.#app = app;
    this.#email = email;
    this.address = address;
  }

  get signedIn(): boolean {
    return this.cookies.has(SESSION_COOKIE);
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ): Promise<FlowResponse<T>> {
    const cookie = [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    const response = await this.#app.inject({
      method,
      url,
      remoteAddress: this.address,
      headers: {
        "user-agent": "veolms-flow-tests",
        // A raw body (a webhook delivery) is sent exactly as given.
        ...(typeof payload === "string"
          ? { "content-type": "application/json" }
          : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(payload === undefined ? {} : { payload: payload as string | object }),
    });
    for (const set of response.cookies as {
      name: string;
      value: string;
      maxAge?: number;
      expires?: Date;
    }[]) {
      const cleared =
        set.value === "" ||
        set.maxAge === 0 ||
        (set.expires !== undefined && set.expires.getTime() <= Date.now());
      if (cleared) this.cookies.delete(set.name);
      else this.cookies.set(set.name, set.value);
    }
    let body: FlowResponse<T>["body"] = {};
    try {
      body = response.body ? JSON.parse(response.body) : {};
    } catch {
      body = { raw: response.body };
    }
    return { status: response.statusCode, body, headers: response.headers };
  }

  get<T = unknown>(url: string) {
    return this.request<T>("GET", url);
  }

  post<T = unknown>(url: string, payload: unknown = {}) {
    return this.request<T>("POST", url, payload);
  }

  patch<T = unknown>(url: string, payload: unknown = {}) {
    return this.request<T>("PATCH", url, payload);
  }

  delete<T = unknown>(url: string) {
    return this.request<T>("DELETE", url);
  }

  /**
   * Who the API takes this browser to be: the user's id, or null. `/auth/me`
   * answers 200 either way (with no user when there is no session), as the
   * web asks it on every page.
   */
  async whoAmI(): Promise<string | null> {
    const me = await this.get<{ id: string } | null>("/v1/auth/me");
    if (me.status !== 200) {
      throw new Error(`/auth/me answered ${me.status}`);
    }
    return me.body.data?.id ?? null;
  }

  /** Asks for a code and returns the one that was emailed. */
  async requestCode(emailAddress: string): Promise<string> {
    let sent = await this.post("/v1/auth/otp/send", { email: emailAddress });
    // Asked again within the resend wait (1 s in these tests): wait it out,
    // as the sign-in screen's countdown makes a learner do.
    for (let retry = 0; sent.status === 429 && retry < 3; retry += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      sent = await this.post("/v1/auth/otp/send", { email: emailAddress });
    }
    if (sent.status !== 200) {
      throw new Error(
        `Sending a code to ${emailAddress} answered ${sent.status}: ${JSON.stringify(sent.body)}`,
      );
    }
    return this.#email.lastCodeFor(emailAddress);
  }

  /** Signs a new learner up, as the sign-up screen does. */
  async signUp(
    learner: NewLearner,
  ): Promise<FlowResponse<{ user: { id: string } }>> {
    const code = await this.requestCode(learner.email);
    return this.post("/v1/auth/register", {
      email: learner.email,
      code,
      username: learner.username,
      displayName: learner.displayName,
    });
  }

  /** Signs an existing account in with an emailed code. */
  async signIn(emailAddress: string) {
    const code = await this.requestCode(emailAddress);
    return this.post<{ user: { id: string } }>("/v1/auth/login", {
      email: emailAddress,
      code,
    });
  }
}

export interface NewLearner {
  email: string;
  username: string;
  displayName: string;
}

let learnerCounter = 0;

/** A learner nobody has signed up yet. */
export function newLearner(label = "learner"): NewLearner {
  learnerCounter += 1;
  const id = `${process.pid}${learnerCounter}${Math.floor(Math.random() * 1e6)}`;
  return {
    email: `${label}.${id}@flow.test`,
    username: `${label}_${id}`.slice(0, 30),
    displayName: `Flow ${label} ${learnerCounter}`,
  };
}

/** Signs up a learner in a browser of their own and returns that browser. */
export async function signedUpLearner(
  flow: FlowApp,
  label?: string,
): Promise<{ client: FlowClient; learner: NewLearner; userId: string }> {
  const learner = newLearner(label);
  const client = flow.visitor();
  const response = await client.signUp(learner);
  if (response.status !== 201) {
    throw new Error(
      `Sign-up answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return { client, learner, userId: response.body.data!.user.id };
}

/** The academy's administrator, signed in. */
export async function signedInAdmin(flow: FlowApp): Promise<FlowClient> {
  const client = flow.visitor();
  const response = await client.signIn(FLOW_ADMIN.email);
  if (response.status !== 200) {
    throw new Error(
      `Admin sign-in answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return client;
}
