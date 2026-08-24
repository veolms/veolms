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
}

export interface EmailServiceOptions {
  config: EmailTransportConfig;
  logger: FastifyBaseLogger;
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
   * surfaced through the returned result for callers that care.
   */
  send(to: string, content: EmailContent): Promise<EmailDeliveryResult>;
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

  // Built once and reused. A transporter per send would pay a fresh TCP
  // connection, TLS handshake and SMTP AUTH round-trip for every message.
  let transporter: Transporter | null = null;

  function getTransporter(): Transporter {
    transporter ??= createTransport({
      host: config.host,
      port: config.port,
      // Port 465 is implicit TLS; everything else negotiates STARTTLS, which
      // `requireTLS` makes mandatory so credentials never cross in the clear.
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      pool: true,
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
  ): Promise<EmailDeliveryResult> {
    if (config.transport === "console") {
      log.info(
        { to, subject: content.subject, body: content.text },
        "Email not dispatched (console transport)",
      );
      return { status: "logged" };
    }

    try {
      const info = await getTransporter().sendMail({
        from: config.from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      log.info({ to, messageId: info.messageId }, "Email sent");
      return { status: "sent", messageId: info.messageId };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      // `to` is deliberately included: without the recipient a delivery failure
      // is unactionable. The body is not, since it carries the OTP.
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
