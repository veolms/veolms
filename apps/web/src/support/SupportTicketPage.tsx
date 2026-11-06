import { useNavigate, useParams } from "react-router";

import { ElevatedCard } from "../components/ElevatedCard";
import { PageBackButton } from "../components/PageBackButton";
import { useSupportTicket } from "../services/support";
import { supportPageClasses } from "./supportLayout";
import { SupportTicketView, useRefreshAfterRead } from "./SupportTicketView";

/** /support/:ticketId: one report or feedback and its conversation. */
export function SupportTicketPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const ticket = useSupportTicket(ticketId);
  useRefreshAfterRead(ticket.data);

  return (
    <main className={supportPageClasses}>
      <div className="flex items-center gap-2">
        <PageBackButton onClick={() => navigate("/support")} />
        <span className="text-sm font-semibold text-(--muted)">
          Help and feedback
        </span>
      </div>
      <ElevatedCard padded className="max-sm:px-4">
        {ticket.isPending ? (
          <TicketSkeleton />
        ) : ticket.error ? (
          <div className="py-10 text-center">
            <p className="m-0 font-semibold text-(--text)">
              {ticket.error.status === 404
                ? "We couldn't find this"
                : "We couldn't load this"}
            </p>
            <p className="mt-1 mb-0 text-sm text-(--muted)">
              {ticket.error.status === 404
                ? "It may have been removed, or it belongs to another account."
                : ticket.error.message}
            </p>
          </div>
        ) : (
          <SupportTicketView ticket={ticket.data} />
        )}
      </ElevatedCard>
    </main>
  );
}

function TicketSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex items-start gap-3.5">
        <span className="size-12 rounded-2xl bg-(--surface-strong)" />
        <span className="flex-1">
          <span className="block h-3 w-1/4 rounded bg-(--surface-strong)" />
          <span className="mt-2.5 block h-5 w-3/5 rounded bg-(--surface-strong)" />
        </span>
      </div>
      <span className="block h-40 rounded-2xl bg-(--surface-strong)" />
      <span className="block h-28 rounded-xl bg-(--surface-strong)" />
    </div>
  );
}
