import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import {
  formatStorageBytes,
  type MyStorageResponse,
  type StorageRequest,
} from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../components/Button";
import { useCancelStorageRequest, useMyStorage } from "../services/storage";
import { RequestStorageDialog } from "./RequestStorageDialog";
import { StorageUsageBar } from "./StorageUsageBar";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

function RequestStatus({ request }: { request: StorageRequest }) {
  const cancel = useCancelStorageRequest();
  if (request.status === "pending") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-(--accent)/10 px-3 py-2 text-[0.76rem] text-(--text)">
        <span>
          <strong className="font-semibold">Request sent</strong>{" "}
          {dateFormat.format(new Date(request.createdAt))}. An admin will look
          at it soon.
        </span>
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
          className="cursor-pointer border-0 bg-transparent p-0 text-[0.76rem] font-semibold text-(--accent-ink) hover:underline disabled:opacity-55"
        >
          Withdraw
        </button>
      </div>
    );
  }
  if (request.status === "approved") {
    return (
      <p className="m-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-[0.76rem] text-(--text)">
        <strong className="font-semibold">Request approved.</strong> You now
        have{" "}
        {formatStorageBytes(request.grantedLimitBytes ?? request.limitBytes)}.
        {request.decisionNote ? ` “${request.decisionNote}”` : ""}
      </p>
    );
  }
  if (request.status === "declined") {
    return (
      <p className="m-0 rounded-lg bg-amber-500/10 px-3 py-2 text-[0.76rem] text-(--text)">
        <strong className="font-semibold">Request not approved.</strong>
        {request.decisionNote ? ` “${request.decisionNote}”` : ""} You can ask
        again.
      </p>
    );
  }
  return null;
}

function Breakdown({ data }: { data: MyStorageResponse }) {
  const rows = [
    ["Chats", data.breakdown.chatBytes],
    ["Discussions and notes", data.breakdown.discussionBytes],
    ["Support", data.breakdown.supportBytes],
  ] as const;
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[0.74rem]">
      {rows.map(([label, bytes]) => (
        <div key={label} className="contents">
          <dt className="text-(--muted)">{label}</dt>
          <dd className="m-0 text-right font-semibold text-(--text) tabular-nums">
            {formatStorageBytes(bytes)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The space a learner's files take in the academy (what they send in
 * chats, discussions and support), their limit, any request for more, and
 * "Request more space". Staff have no limit and see what they use. Shown in
 * Settings > Learning and in Chats > Settings > Storage.
 */
export function StorageSpaceDetails() {
  const storage = useMyStorage();
  const [asking, setAsking] = useState(false);
  const data = storage.data;

  return (
    <>
      {!data ? (
        <p className="m-0 py-2 text-[0.76rem] text-(--muted)">
          {storage.isError ? "Couldn’t load your storage space." : "Loading…"}
        </p>
      ) : (
        <div className="grid gap-3 py-1">
          <p className="m-0 text-[0.7rem] leading-snug text-(--muted)">
            Photos, videos, voice messages and documents you send in chats,
            discussions and support.
          </p>
          {data.limitBytes === null ? (
            <p className="m-0 text-[0.8rem] text-(--text)">
              <span className="font-semibold tabular-nums">
                {formatStorageBytes(data.usedBytes)}
              </span>{" "}
              <span className="text-(--muted)">
                used. Staff accounts have no limit.
              </span>
            </p>
          ) : (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-[0.84rem] text-(--text)">
                  <span className="font-bold tabular-nums">
                    {formatStorageBytes(data.usedBytes)}
                  </span>{" "}
                  <span className="text-(--muted)">
                    of {formatStorageBytes(data.limitBytes)} used
                  </span>
                </p>
                {data.state === "full" ? (
                  <span className="text-[0.7rem] font-semibold text-rose-500">
                    Full
                  </span>
                ) : data.state === "near_full" ? (
                  <span className="text-[0.7rem] font-semibold text-amber-500">
                    Almost full
                  </span>
                ) : null}
              </div>
              <StorageUsageBar
                usedBytes={data.usedBytes}
                limitBytes={data.limitBytes}
                blocked={Boolean(data.blocked)}
                label="Storage space used"
              />
            </div>
          )}
          <Breakdown data={data} />
          {data.blocked ? (
            <p className="m-0 rounded-lg bg-rose-500/10 px-3 py-2 text-[0.76rem] text-(--text)">
              <strong className="font-semibold">
                Sending files is turned off for you.
              </strong>{" "}
              {data.blocked.reason ??
                "Contact support if you think this is a mistake."}
            </p>
          ) : null}
          {data.request ? <RequestStatus request={data.request} /> : null}
          {data.limitBytes !== null &&
          !data.blocked &&
          data.request?.status !== "pending" ? (
            <div>
              <Button
                variant={
                  data.state === "full" || data.state === "near_full"
                    ? "primary"
                    : "quiet"
                }
                elevation="flat"
                className="h-9 text-[0.8rem]!"
                onClick={() => setAsking(true)}
              >
                Request more space
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <RequestStorageDialog open={asking} onClose={() => setAsking(false)} />
    </>
  );
}

/** Settings > Learning: the learner's storage space, as a settings card. */
export function StorageUsageCard() {
  return (
    <section
      className="settings-learning-card"
      aria-labelledby="storage-space-heading"
    >
      <header className="settings-learning-card__heading">
        <CloudArrowUp size={21} weight="duotone" />
        <h3 id="storage-space-heading">Your storage space</h3>
      </header>
      <StorageSpaceDetails />
    </section>
  );
}
