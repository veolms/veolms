import {
  readMarketingDesign,
  DEFAULT_MARKETING_AUDIENCE,
  MARKETING_AUTOMATION_KEYS,
  MARKETING_AUTOMATIONS,
  MARKETING_RECIPIENTS_PAGE_SIZE,
  marketingAudienceSchema,
  marketingAutomationKeySchema,
  marketingAutomationSettingsSchema,
  marketingBlocksSchema,
  marketingEmailProblems,
  type MarketingAudience,
  type MarketingAutomation,
  type MarketingAutomationKey,
  type MarketingAutomationSettings,
  type MarketingEmail,
  type MarketingEmailSummary,
  type MarketingPreviewRequest,
  type MarketingRecipientsQuery,
  type MarketingTemplateKey,
  type UpdateMarketingEmailRequest,
} from "@veolms/contracts";
import type { Database, MarketingEmailStatus } from "@veolms/database";
import type { EmailService } from "@veolms/services/email";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import { renderMarketingEmail, siteUrl } from "./marketing-render.ts";
import {
  automationTemplate,
  broadcastTemplate,
} from "./marketing-templates.ts";
import * as repository from "./marketing.repository.ts";

/** The longest a broadcast may be scheduled ahead. */
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
/** Test emails per staff member per hour: enough to iterate, not to spam. */
const TESTS_PER_HOUR = 20;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function notFound(): AppError {
  return new AppError(
    404,
    "MARKETING_EMAIL_NOT_FOUND",
    "This email was not found.",
  );
}

function defaultSettings(
  key: MarketingAutomationKey,
): MarketingAutomationSettings {
  return { wait: MARKETING_AUTOMATIONS[key].default, courseId: null };
}

function readSettings(
  key: MarketingAutomationKey,
  value: unknown,
): MarketingAutomationSettings {
  const parsed = marketingAutomationSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSettings(key);
}

function toSummary(
  row: repository.MarketingEmailRow,
  stats = repository.EMPTY_STATS,
): MarketingEmailSummary {
  const key = marketingAutomationKeySchema.safeParse(row.automation_key);
  return {
    id: row.id,
    kind: row.kind,
    automationKey: key.success ? key.data : null,
    name: row.name,
    subject: row.subject,
    status: row.status,
    scheduledAt: iso(row.scheduled_at),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    stats,
  };
}

function toEmail(
  row: repository.MarketingEmailRow,
  stats = repository.EMPTY_STATS,
): MarketingEmail {
  const blocks = marketingBlocksSchema.safeParse(row.blocks);
  const audience = marketingAudienceSchema.safeParse(row.audience);
  const key = marketingAutomationKeySchema.safeParse(row.automation_key);
  return {
    ...toSummary(row, stats),
    preheader: row.preheader,
    blocks: blocks.success ? blocks.data : [],
    design: readMarketingDesign(row.design),
    audience:
      row.kind === "broadcast"
        ? audience.success
          ? audience.data
          : DEFAULT_MARKETING_AUDIENCE
        : null,
    settings: key.success ? readSettings(key.data, row.settings) : null,
    enabledAt: iso(row.enabled_at),
    resendOf: row.resend_of,
  };
}

function checkSettings(
  key: MarketingAutomationKey,
  settings: MarketingAutomationSettings,
): MarketingAutomationSettings {
  const meta = MARKETING_AUTOMATIONS[key];
  if (settings.wait < meta.min || settings.wait > meta.max) {
    throw new AppError(
      400,
      "MARKETING_WAIT_OUT_OF_RANGE",
      `Choose between ${meta.min} and ${meta.max} ${meta.unit}.`,
    );
  }
  return {
    wait: settings.wait,
    courseId: meta.perCourse ? settings.courseId : null,
  };
}

export function createMarketingService({
  database,
  email,
}: {
  database: Kysely<Database>;
  email: EmailService;
}) {
  const testsSent = new Map<string, number[]>();

  async function withStats(
    row: repository.MarketingEmailRow,
  ): Promise<MarketingEmail> {
    const stats = await repository.statsFor(database, [row.id]);
    return toEmail(row, stats.get(row.id));
  }

  async function findViewer(userId: string | null) {
    const person = userId
      ? (await repository.findPeople(database, [userId])).get(userId)
      : undefined;
    return {
      displayName: person?.display_name ?? null,
      email: person?.email ?? null,
    };
  }

  async function requireEmail(
    id: string,
  ): Promise<repository.MarketingEmailRow> {
    const row = await repository.findEmail(database, id);
    if (!row) throw notFound();
    return row;
  }

  async function requireBroadcast(
    id: string,
  ): Promise<repository.MarketingEmailRow> {
    const row = await requireEmail(id);
    if (row.kind !== "broadcast") throw notFound();
    return row;
  }

  function assertReady(row: repository.MarketingEmailRow) {
    const blocks = marketingBlocksSchema.safeParse(row.blocks);
    const problems = marketingEmailProblems({
      subject: row.subject,
      blocks: blocks.success ? blocks.data : [],
    });
    if (problems.length) {
      throw new AppError(400, "MARKETING_EMAIL_NOT_READY", problems.join(" "));
    }
  }

  /** The automation's email, made from its template the first time. */
  async function openAutomation(
    key: MarketingAutomationKey,
    userId: string | null,
  ) {
    const existing = await repository.findAutomationEmail(database, key);
    if (existing) return await withStats(existing);
    const start = automationTemplate(key, siteUrl());
    const row = await repository.insertAutomationEmailOnce(database, {
      kind: "automation",
      automationKey: key,
      ...start,
      audience: null,
      settings: defaultSettings(key),
      status: "paused",
      createdBy: userId,
    });
    return await withStats(row);
  }

  return {
    async listBroadcasts(): Promise<MarketingEmailSummary[]> {
      const rows = await repository.listEmails(database, "broadcast");
      const stats = await repository.statsFor(
        database,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toSummary(row, stats.get(row.id)));
    },

    async create(template: MarketingTemplateKey, userId: string | null) {
      const start = broadcastTemplate(template, siteUrl());
      const row = await repository.insertEmail(database, {
        kind: "broadcast",
        automationKey: null,
        ...start,
        audience: DEFAULT_MARKETING_AUDIENCE,
        settings: null,
        status: "draft",
        createdBy: userId,
      });
      return toEmail(row);
    },

    async get(id: string) {
      return await withStats(await requireEmail(id));
    },

    async update(id: string, patch: UpdateMarketingEmailRequest) {
      const current = await requireEmail(id);
      const key = marketingAutomationKeySchema.safeParse(
        current.automation_key,
      );
      // A broadcast can change until it starts sending; an automation's
      // email any time (it applies to the emails not yet sent).
      const statuses: MarketingEmailStatus[] =
        current.kind === "broadcast"
          ? ["draft", "scheduled"]
          : ["active", "paused"];
      const saved = await repository.updateEmail(
        database,
        id,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
          ...(patch.preheader !== undefined
            ? { preheader: patch.preheader }
            : {}),
          ...(patch.blocks !== undefined ? { blocks: patch.blocks } : {}),
          ...(patch.design !== undefined ? { design: patch.design } : {}),
          ...(patch.audience !== undefined && current.kind === "broadcast"
            ? { audience: patch.audience }
            : {}),
          ...(patch.settings !== undefined && key.success
            ? { settings: checkSettings(key.data, patch.settings) }
            : {}),
        },
        statuses,
      );
      if (!saved) {
        throw new AppError(
          409,
          "MARKETING_EMAIL_LOCKED",
          "This email is already being sent, so it can't be changed.",
        );
      }
      // A scheduled broadcast whose subject or content was emptied goes back to draft.
      if (saved.status === "scheduled") {
        const blocks = marketingBlocksSchema.safeParse(saved.blocks);
        if (
          marketingEmailProblems({
            subject: saved.subject,
            blocks: blocks.success ? blocks.data : [],
          }).length
        ) {
          const draft = await repository.setStatus(
            database,
            id,
            ["scheduled"],
            "draft",
            {
              scheduled_at: null,
            },
          );
          return await withStats(draft ?? saved);
        }
      }
      return await withStats(saved);
    },

    async duplicate(id: string, userId: string | null) {
      const source = await requireBroadcast(id);
      const audience = marketingAudienceSchema.safeParse(source.audience);
      const row = await repository.insertEmail(database, {
        kind: "broadcast",
        automationKey: null,
        name: `${source.name} (copy)`.slice(0, 120),
        subject: source.subject,
        preheader: source.preheader,
        blocks: source.blocks,
        design: source.design,
        // A copy of a resend goes to the whole audience again.
        audience:
          audience.success && audience.data.segment.type !== "not_opened"
            ? audience.data
            : DEFAULT_MARKETING_AUDIENCE,
        settings: null,
        status: "draft",
        createdBy: userId,
      });
      return toEmail(row);
    },

    async remove(id: string) {
      const row = await requireBroadcast(id);
      if (row.status === "sending") {
        throw new AppError(
          409,
          "MARKETING_EMAIL_SENDING",
          "Stop sending this email before deleting it.",
        );
      }
      await repository.softDeleteEmail(database, id);
    },

    async schedule(id: string, sendAt: string | null) {
      const row = await requireBroadcast(id);
      if (row.status !== "draft" && row.status !== "scheduled") {
        throw new AppError(
          409,
          "MARKETING_EMAIL_LOCKED",
          "This email has already been sent.",
        );
      }
      assertReady(row);
      const audience = marketingAudienceSchema.safeParse(row.audience);
      if (!audience.success) {
        throw new AppError(
          400,
          "MARKETING_AUDIENCE_MISSING",
          "Choose who gets this email.",
        );
      }
      if ((await repository.countAudience(database, audience.data)) === 0) {
        throw new AppError(
          400,
          "MARKETING_AUDIENCE_EMPTY",
          "Nobody in this audience can get the email yet. Choose another audience.",
        );
      }
      const now = Date.now();
      const when = sendAt ? new Date(sendAt) : new Date(now);
      if (sendAt && when.getTime() < now - 60_000) {
        throw new AppError(
          400,
          "MARKETING_SCHEDULE_PAST",
          "Choose a time in the future.",
        );
      }
      if (when.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
        throw new AppError(
          400,
          "MARKETING_SCHEDULE_TOO_FAR",
          "Choose a time within a year.",
        );
      }
      // Now: queued at once, so the page shows it sending straight away.
      const saved = sendAt
        ? await repository.setStatus(
            database,
            id,
            ["draft", "scheduled"],
            "scheduled",
            {
              scheduled_at: when,
            },
          )
        : await database
            .transaction()
            .execute((trx) =>
              repository.startBroadcast(trx, id, audience.data, when),
            );
      if (!saved)
        throw new AppError(
          409,
          "MARKETING_EMAIL_LOCKED",
          "This email has already been sent.",
        );
      return await withStats(saved);
    },

    /** A scheduled email goes back to draft; one that is sending stops. */
    async cancel(id: string) {
      const row = await requireBroadcast(id);
      const saved =
        row.status === "scheduled"
          ? await repository.setStatus(database, id, ["scheduled"], "draft", {
              scheduled_at: null,
            })
          : row.status === "sending"
            ? await repository.setStatus(database, id, ["sending"], "cancelled")
            : null;
      if (!saved) {
        throw new AppError(
          409,
          "MARKETING_EMAIL_NOT_CANCELLABLE",
          "This email can't be stopped now.",
        );
      }
      return await withStats(saved);
    },

    /** A new draft of a sent email, for those who did not open it. */
    async resend(id: string, subject: string, userId: string | null) {
      const source = await requireBroadcast(id);
      if (source.status !== "sent" && source.status !== "cancelled") {
        throw new AppError(
          409,
          "MARKETING_EMAIL_NOT_SENT",
          "You can resend once the email has finished sending.",
        );
      }
      const audience: MarketingAudience = {
        segment: { type: "not_opened", emailId: source.id },
        excludeCourseIds: [],
      };
      const row = await repository.insertEmail(database, {
        kind: "broadcast",
        automationKey: null,
        name: `${source.name} (resend)`.slice(0, 120),
        subject,
        preheader: source.preheader,
        blocks: source.blocks,
        design: source.design,
        audience,
        settings: null,
        status: "draft",
        resendOf: source.id,
        createdBy: userId,
      });
      return toEmail(row);
    },

    async preview(input: MarketingPreviewRequest, viewerId: string | null) {
      const viewer = await findViewer(viewerId);
      const content = await renderMarketingEmail(database, {
        subject: input.subject,
        preheader: input.preheader,
        blocks: input.blocks,
        design: input.design,
        person: viewer,
        course:
          input.automationKey &&
          MARKETING_AUTOMATIONS[input.automationKey].aboutCourse
            ? { title: "your course", slug: "your-course" }
            : null,
      });
      return { subject: content.subject, html: content.html };
    },

    async sendTest(id: string, viewerId: string) {
      const row = await requireEmail(id);
      const viewer = { id: viewerId, ...(await findViewer(viewerId)) };
      if (!viewer.email) {
        throw new AppError(
          400,
          "MARKETING_TEST_NO_EMAIL",
          "Your account has no email address.",
        );
      }
      const hourAgo = Date.now() - 60 * 60 * 1000;
      const recent = (testsSent.get(viewer.id) ?? []).filter(
        (at) => at > hourAgo,
      );
      if (recent.length >= TESTS_PER_HOUR) {
        throw new AppError(
          429,
          "MARKETING_TEST_LIMIT",
          "That's a lot of tests. Try again in a little while.",
        );
      }
      const key = marketingAutomationKeySchema.safeParse(row.automation_key);
      const content = await renderMarketingEmail(database, {
        subject: `[Test] ${row.subject || row.name}`,
        preheader: row.preheader,
        blocks: row.blocks,
        design: readMarketingDesign(row.design),
        person: { displayName: viewer.displayName },
        course:
          key.success && MARKETING_AUTOMATIONS[key.data].aboutCourse
            ? { title: "your course", slug: "your-course" }
            : null,
      });
      const result = await email.send(viewer.email, content);
      if (result.status === "failed") {
        throw new AppError(
          502,
          "MARKETING_TEST_FAILED",
          "The test email could not be sent. Try again.",
        );
      }
      testsSent.set(viewer.id, [...recent, Date.now()]);
      return { sentTo: viewer.email };
    },

    async countAudience(audience: MarketingAudience) {
      return { count: await repository.countAudience(database, audience) };
    },

    async audienceOptions() {
      return await repository.listAudienceOptions(database);
    },

    async report(id: string) {
      const row = await requireEmail(id);
      const [stats, revenue] = await Promise.all([
        repository.statsFor(database, [row.id]),
        repository.revenueFor(database, row.id),
      ]);
      return { stats: stats.get(row.id) ?? repository.EMPTY_STATS, revenue };
    },

    async recipients(id: string, query: MarketingRecipientsQuery) {
      await requireEmail(id);
      const { rows, total } = await repository.listRecipients(
        database,
        id,
        query.filter,
        query.page,
        MARKETING_RECIPIENTS_PAGE_SIZE,
      );
      return {
        recipients: rows.map((row) => ({
          userId: row.user_id,
          name: row.display_name,
          email: row.email,
          status: row.status,
          sentAt: iso(row.sent_at),
          openedAt: iso(row.opened_at ?? row.clicked_at),
          clickedAt: iso(row.clicked_at),
          unsubscribedAt: iso(row.unsubscribed_at),
          error: row.status === "sent" ? null : row.last_error,
        })),
        total,
        page: query.page,
        pageSize: MARKETING_RECIPIENTS_PAGE_SIZE,
      };
    },

    async listAutomations(): Promise<MarketingAutomation[]> {
      const rows = await repository.listEmails(database, "automation");
      const stats = await repository.statsFor(
        database,
        rows.map((row) => row.id),
      );
      return MARKETING_AUTOMATION_KEYS.map((key) => {
        const row = rows.find((candidate) => candidate.automation_key === key);
        return {
          key,
          email: row ? toSummary(row, stats.get(row.id)) : null,
          settings: row
            ? readSettings(key, row.settings)
            : defaultSettings(key),
        };
      });
    },

    openAutomation,

    async setAutomationActive(
      key: MarketingAutomationKey,
      active: boolean,
      userId: string | null,
    ) {
      const row = await repository.findAutomationEmail(database, key);
      const email =
        row ??
        (await repository.findEmail(
          database,
          (await openAutomation(key, userId)).id,
        ));
      if (!email) throw notFound();
      if (active) {
        assertReady(email);
        const saved =
          email.status === "active"
            ? email
            : await repository.setStatus(
                database,
                email.id,
                ["paused"],
                "active",
                {
                  enabled_at: new Date(),
                },
              );
        return await withStats(saved ?? email);
      }
      const saved = await repository.setStatus(
        database,
        email.id,
        ["active"],
        "paused",
      );
      return await withStats(saved ?? email);
    },
  };
}

export type MarketingService = ReturnType<typeof createMarketingService>;
