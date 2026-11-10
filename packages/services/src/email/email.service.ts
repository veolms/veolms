import { createTransport, type Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

import type { EmailContent } from "./email.templates.ts";

export interface EmailTransportConfig {
  /** `console` renders the message to the logger and dispatches nothing. */
  transport: "smtp" | "console";
  host: string;
  port: number;
  user?: string | undefined;
  pass?: string | undefined;
  /** Envelope sender; must be a verified identity with the SMTP provider. */
  from: string;
  /** Where replies go; a mailbox someone reads. Unset: replies go to `from`. */
  replyTo?: string | undefined;
  /**
   * Messages per second this process may hand the provider. Nodemailer
   * holds further messages in its pool queue, so a burst of queued mail
   * never arrives at the provider as a burst.
   */
  ratePerSecond?: number | undefined;
  /** SMTP connections kept open at once. */
  maxConnections?: number | undefined;
}

export interface EmailServiceOptions {
  config: EmailTransportConfig;
  logger: FastifyBaseLogger;
}

/** A file sent with a message, such as an order's invoice PDF. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailSendOptions {
  attachments?: readonly EmailAttachment[];
  /** A calendar invitation, sent as the email's text/calendar part. */
  calendar?: { method: "REQUEST" | "CANCEL"; content: string };
  /**
   * Extra message headers: `List-Unsubscribe`, `List-Unsubscribe-Post`,
   * `Precedence`, `X-Entity-Ref-ID`. Set by the queue for notification
   * mail; sign-in codes and other direct sends carry none.
   */
  headers?: Readonly<Record<string, string>>;
}

export type EmailDeliveryResult =
  | { status: "sent"; messageId: string }
  | { status: "logged" }
  | { status: "failed"; error: Error };

export interface EmailService {
  /**
   * Dispatches a message. Never throws: delivery is routinely invoked as
   * fire-and-forget from request handlers, where a rejected promise would take
   * the process down rather than fail the one email. Failures are logged and
   * surfaced through the returned result for callers that care. The error
   * keeps nodemailer's `code`, `responseCode` and `response`, so the queue
   * can tell a dead address from a throttled provider.
   */
  send(
    to: string,
    content: EmailContent,
    options?: EmailSendOptions,
  ): Promise<EmailDeliveryResult>;
  /** Opens a connection and authenticates, to validate credentials at boot. */
  verify(): Promise<boolean>;
  /** Releases pooled connections during shutdown. */
  close(): Promise<void>;
}

export function createEmailService({
  config,
  logger,
}: EmailServiceOptions): EmailService {
  const log = logger.child({ service: "email" });

  let transporter: Transporter | null = null;

  function getTransporter(): Transporter {
    transporter ??= createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      pool: true,
      // Two connections: one for the queue worker, one for a sign-in code
      // sent inside a request. Nodemailer's default of five, in every API
      // process, used to hit providers with a dozen parallel connections.
      maxConnections: config.maxConnections ?? 2,
      maxMessages: 100,
      // The rate limit is per transporter, so per process; the queue sends
      // from one process (an advisory lock), so this is the account's rate.
      rateDelta: 1000,
      rateLimit: config.ratePerSecond ?? 5,
      // Nodemailer's defaults are ~2min connect / 10min socket — and the
      // OTP path sends synchronously inside the login request, so a slow
      // SMTP server used to be able to hold logins for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });

    return transporter;
  }

  async function send(
    to: string,
    content: EmailContent,
    options: EmailSendOptions = {},
  ): Promise<EmailDeliveryResult> {
    const attachments = options.attachments ?? [];
    if (config.transport === "console") {
      log.info(
        {
          to,
          subject: content.subject,
          body: content.text,
          attachments: attachments.map((file) => file.filename),
          calendar: options.calendar?.method ?? null,
          headers: options.headers,
        },
        "Email not dispatched (console transport)",
      );
      return { status: "logged" };
    }

    try {
      const info = await getTransporter().sendMail({
        from: config.from,
        to,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        subject: content.subject,
        text: content.text,
        html: content.html,
        ...(options.calendar
          ? {
              icalEvent: {
                method: options.calendar.method,
                content: options.calendar.content,
              },
            }
          : {}),
        ...(options.headers ? { headers: { ...options.headers } } : {}),
        ...(attachments.length > 0
          ? {
              attachments: attachments.map((file) => ({
                filename: file.filename,
                content: file.content,
                contentType: file.contentType,
              })),
            }
          : {}),
      });

      log.info({ to, messageId: info.messageId }, "Email sent");
      return { status: "sent", messageId: info.messageId };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      log.error({ err: error, to, subject: content.subject }, "Email failed");
      return { status: "failed", error };
    }
  }

  async function verify(): Promise<boolean> {
    if (config.transport === "console") {
      return true;
    }

    try {
      await getTransporter().verify();
      log.info({ host: config.host, port: config.port }, "SMTP ready");
      return true;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      log.error(
        { err: error, host: config.host, port: config.port },
        "SMTP unavailable; email delivery will fail",
      );
      return false;
    }
  }

  async function close(): Promise<void> {
    transporter?.close();
    transporter = null;
  }

  return { send, verify, close };
}
