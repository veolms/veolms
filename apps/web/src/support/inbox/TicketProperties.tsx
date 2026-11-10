import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import type {
  SupportPriority,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketStatus,
} from "@veolms/contracts/support";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

import { useSupportTeam, useUpdateSupportTicket } from "../../services/support";
import { useAuthStore } from "../../store/auth.store";
import {
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_STATUS_ORDER,
  PROBLEM_CATEGORY_ORDER,
  PROBLEM_STATUS_ORDER,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
} from "../supportCatalog";
import { PropertyPicker, type PickerOption } from "./PropertyPicker";
import {
  AssigneeAvatar,
  NO_PRIORITY,
  NoAssigneeIcon,
  PRIORITY_ORDER,
  PriorityIcon,
  QUEUE_PRIORITIES,
  QUEUE_STATUSES,
  StatusIcon,
} from "./supportQueueCatalog";

export type TicketField = "status" | "assignee" | "priority" | "category";
type Field = TicketField;

/** Keys that open a field's picker while the panel is shown. */
const FIELD_KEYS: Record<string, Field> = {
  s: "status",
  a: "assignee",
  p: "priority",
  c: "category",
};

const UNASSIGNED = "none";

/**
 * The ticket's Properties, one row per field, each a picker: Status (S),
 * Assignee (A), Priority (P) and Category (C). Read-only without
 * support.manage.
 */
export function TicketProperties({
  ticket,
  canManage,
  openField,
  onOpenFieldChange: setOpenField,
}: {
  ticket: SupportTicketDetail;
  canManage: boolean;
  /** The picker open now; kept by the panel so a note's "Hand off to…" can open Assignee. */
  openField: TicketField | null;
  onOpenFieldChange: (field: TicketField | null) => void;
}) {
  const update = useUpdateSupportTicket(ticket.id);
  const team = useSupportTeam(canManage);
  const viewerId = useAuthStore((state) => state.user?.id);
  const staff = ticket.staff;
  const isProblem = ticket.kind === "problem";

  // S, A, P and C open their picker; left to fields, menus and dialogs.
  useEffect(() => {
    if (!canManage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
      if (event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], .cm-editor, [role=menu], [role=listbox], [role=dialog]",
        ) ||
        document.querySelector("dialog[open], [role=alertdialog]")
      )
        return;
      const field = FIELD_KEYS[event.key.toLowerCase()];
      if (!field) return;
      event.preventDefault();
      setOpenField(field);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canManage, setOpenField]);

  const statusOrder = isProblem ? PROBLEM_STATUS_ORDER : FEEDBACK_STATUS_ORDER;
  const statusOptions: PickerOption<SupportTicketStatus>[] = statusOrder.map(
    (status, index) => ({
      value: status,
      label: SUPPORT_STATUSES[status].staffLabel,
      description: QUEUE_STATUSES[status].description,
      icon: <StatusIcon status={status} size={17} />,
      shortcut: String(index + 1),
    }),
  );

  const members = team.data?.members ?? [];
  const assigneeOptions: PickerOption<string>[] = [
    {
      value: UNASSIGNED,
      label: "No assignee",
      icon: <NoAssigneeIcon size={22} />,
      shortcut: "0",
    },
    ...members.map((member) => {
      const open = isProblem ? member.openReports : member.openFeedback;
      return {
        value: member.id,
        label: member.name,
        note: member.id === viewerId ? "(you)" : undefined,
        description: `${member.roleLabel} · ${open} ${isProblem ? "open" : "feedback"}`,
        icon: <AssigneeAvatar person={member} size={22} />,
        group: member.id === viewerId ? undefined : "Team",
      };
    }),
  ];
  // Someone assigned who has since left the team still shows as assigned.
  const assignee = staff?.assignee ?? null;

  const priorityOptions: PickerOption<SupportPriority | typeof NO_PRIORITY>[] =
    PRIORITY_ORDER.map((priority, index) => ({
      value: priority,
      label: QUEUE_PRIORITIES[priority].label,
      icon: (
        <PriorityIcon
          priority={priority === NO_PRIORITY ? null : priority}
          size={17}
        />
      ),
      shortcut: String(index),
    }));

  const categoryOptions: PickerOption<SupportTicketCategory>[] = (
    isProblem ? PROBLEM_CATEGORY_ORDER : FEEDBACK_CATEGORY_ORDER
  ).map((category) => {
    const info = SUPPORT_CATEGORIES[category];
    const CategoryGlyph = info.icon;
    return {
      value: category,
      label: info.label,
      icon: (
        <CategoryGlyph
          size={17}
          weight="duotone"
          aria-hidden="true"
          className="shrink-0"
          style={{ color: info.color }}
        />
      ),
    };
  });

  const category = SUPPORT_CATEGORIES[ticket.category];
  const CategoryGlyph = category.icon;
  const pickerProps = (field: Field) => ({
    open: openField === field,
    onOpenChange: (next: boolean) => setOpenField(next ? field : null),
    disabled: !canManage || update.isPending,
  });

  return (
    <section
      aria-label="Properties"
      className="rounded-2xl bg-(--surface-strong) px-2 py-1.5"
    >
      <dl className="m-0 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-y-0.5">
        <Row label={isProblem ? "Status" : "Triage"}>
          <PropertyPicker
            label="Status"
            value={ticket.status}
            options={statusOptions}
            onSelect={(status) => update.mutate({ status })}
            searchPlaceholder="Change status…"
            shortcutKey="S"
            trigger={
              <>
                <StatusIcon status={ticket.status} />
                <span className="truncate">
                  {SUPPORT_STATUSES[ticket.status].staffLabel}
                </span>
              </>
            }
            footer="Changes are logged in Activity and visible to the team only."
            {...pickerProps("status")}
          />
        </Row>
        <Row label="Assignee">
          <PropertyPicker
            label="Assignee"
            value={assignee?.id ?? UNASSIGNED}
            options={assigneeOptions}
            onSelect={(id) =>
              update.mutate({ assigneeId: id === UNASSIGNED ? null : id })
            }
            searchPlaceholder="Assign to…"
            shortcutKey="A"
            trigger={
              <>
                <AssigneeAvatar person={assignee} size={20} />
                <span className="truncate">
                  {assignee ? assignee.name : "Assign…"}
                  {assignee && assignee.id === viewerId ? (
                    <span className="ml-1 font-normal text-(--muted)">
                      (you)
                    </span>
                  ) : null}
                </span>
              </>
            }
            footer={
              <>
                <EnvelopeSimple size={13} aria-hidden="true" />
                <span className="flex-1">
                  The assignee is notified by email and in the app.
                </span>
                <Link
                  to="/team"
                  className="font-semibold text-(--accent) hover:underline"
                >
                  Manage team
                </Link>
              </>
            }
            {...pickerProps("assignee")}
          />
        </Row>
        <Row label="Priority">
          <PropertyPicker
            label="Priority"
            value={staff?.priority ?? NO_PRIORITY}
            options={priorityOptions}
            onSelect={(priority) =>
              update.mutate({
                priority: priority === NO_PRIORITY ? null : priority,
              })
            }
            searchPlaceholder="Set priority…"
            shortcutKey="P"
            trigger={
              <>
                <PriorityIcon priority={staff?.priority ?? null} />
                <span className="truncate">
                  {QUEUE_PRIORITIES[staff?.priority ?? NO_PRIORITY].label}
                </span>
              </>
            }
            {...pickerProps("priority")}
          />
        </Row>
        <Row label={isProblem ? "Category" : "Type"}>
          <PropertyPicker
            label="Category"
            value={ticket.category}
            options={categoryOptions}
            onSelect={(next) => update.mutate({ category: next })}
            searchPlaceholder="Change category…"
            shortcutKey="C"
            trigger={
              <>
                <CategoryGlyph
                  size={15}
                  weight="duotone"
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ color: category.color }}
                />
                <span className="truncate">{category.label}</span>
              </>
            }
            {...pickerProps("category")}
          />
        </Row>
      </dl>
      {update.error ? (
        <p role="alert" className="m-0 px-2 pb-1.5 text-xs text-rose-500">
          {update.error.message}
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="px-2 text-[0.8rem] text-(--muted)">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}
