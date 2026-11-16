import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { FirstMoveKey } from "@veolms/contracts";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
import { ProgressRing } from "../../components/ProgressRing";
import { copyTextToClipboard } from "../../lib/clipboard";
import { canOpenShareSheet } from "../../lib/share";
import { cn } from "../../lib/utils";
import { ToastNotification, type ToastNotice } from "../../ToastNotification";
import { useFirstMoves, useMarkLinkShared } from "../../services/onboarding";

/**
 * A new academy's "first five moves" (creator-features/33 §5), at the top
 * of the admin home until all five are done. Each one ticks itself from
 * the academy's own data; the next one to do is lit, with its button.
 * Under it: help moving from another platform and, for an academy launched
 * on the sign-up stage, its launch to watch again.
 */

interface Move {
  key: FirstMoveKey;
  title: string;
  help: string;
  action: string;
}

const MOVES: readonly Move[] = [
  {
    key: "look",
    title: "Add your logo and pick a colour",
    help: "Your academy uses Ocean Blue until you choose. 16 colours, light and dark.",
    action: "Choose look",
  },
  {
    key: "payments",
    title: "Connect Razorpay to get paid",
    help: "Money goes straight to your own bank account. About 10 minutes.",
    action: "Connect Razorpay",
  },
  {
    key: "course",
    title: "Create your first course",
    help: "Upload a video, or start from an outline.",
    action: "Create course",
  },
  {
    key: "testPurchase",
    title: "Make a ₹1 test purchase",
    help: "See exactly what your students see, then refund it.",
    action: "Start test",
  },
  {
    key: "share",
    title: "Share your link",
    help: "Send it on WhatsApp or Instagram, or anywhere your students are.",
    action: "Share",
  },
];

export function FirstMovesCard({
  academyName,
  onNavigatePage,
}: {
  academyName: string;
  onNavigatePage?: ((page: string) => void) | undefined;
}) {
  const navigate = useNavigate();
  const firstMoves = useFirstMoves(true);
  const markShared = useMarkLinkShared();
  const [notice, setNotice] = useState<ToastNotice | null>(null);

  // Nothing to show until the moves are known, and nothing once all are done
  // (or for staff who can't read them).
  const moves = firstMoves.data?.moves;
  if (!moves) return null;
  const done = MOVES.filter((move) => moves[move.key]).length;
  if (done === MOVES.length) return null;
  const next = MOVES.find((move) => !moves[move.key])?.key;
  const academyLink = window.location.origin;

  const shareLink = async () => {
    const text = `Learn with ${academyName}: ${academyLink}`;
    let shared = false;
    if (canOpenShareSheet()) {
      shared = await navigator
        .share({ title: academyName, text, url: academyLink })
        .then(
          () => true,
          () => false,
        );
    } else {
      shared = await copyTextToClipboard(academyLink);
      setNotice(
        shared
          ? { message: "Link copied", type: "success", icon: "link" }
          : { message: academyLink, type: "info" },
      );
    }
    if (shared) markShared.mutate();
  };

  const act = (key: FirstMoveKey) => {
    switch (key) {
      case "look":
        void navigate("/platform/appearance");
        return;
      case "payments":
        void navigate("/platform/payments");
        return;
      case "course":
        onNavigatePage?.("Create Course");
        return;
      case "testPurchase":
        onNavigatePage?.("courses");
        return;
      case "share":
        void shareLink();
    }
  };

  return (
    <div className="mb-6 grid gap-4">
      {notice ? (
        <ToastNotification message={notice} onDismiss={() => setNotice(null)} />
      ) : null}
      <ElevatedCard
        padded
        aria-labelledby="first-moves-title"
        className="grid gap-1 p-5.5! max-[640px]:p-4!"
      >
        <div className="mb-2.5 flex items-center gap-4">
          <ProgressRing
            share={done / MOVES.length}
            className="size-14 shrink-0"
          >
            <b className="text-[13px] font-extrabold text-(--text)">
              {done}/{MOVES.length}
            </b>
          </ProgressRing>
          <div>
            <h2
              id="first-moves-title"
              className="m-0 text-lg font-bold tracking-[-0.02em] text-(--text)"
            >
              Your first five moves
            </h2>
            <p className="m-0 mt-0.75 text-[13.5px] text-(--muted)">
              Most creators finish in about 30 minutes.
            </p>
          </div>
        </div>
        <ol className="m-0 grid list-none gap-1 p-0">
          {MOVES.map((move) => {
            const isDone = moves[move.key];
            const isNext = move.key === next;
            return (
              <li
                key={move.key}
                className={cn(
                  "grid grid-cols-[28px_1fr_auto] items-center gap-3.5 rounded-[14px] p-3.5 max-[640px]:grid-cols-[28px_1fr] max-[640px]:gap-x-3",
                  isNext && "bg-(--accent-soft)",
                )}
              >
                <span
                  className={cn(
                    "grid size-6.5 place-items-center rounded-full border-2",
                    isDone
                      ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                      : "border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-transparent",
                  )}
                >
                  <Check size={14} weight="bold" aria-hidden="true" />
                  <span className="sr-only">{isDone ? "Done:" : "To do:"}</span>
                </span>
                <span className="min-w-0">
                  <b
                    className={cn(
                      "block text-[14.5px] font-semibold",
                      isDone ? "text-(--muted) line-through" : "text-(--text)",
                    )}
                  >
                    {move.title}
                  </b>
                  <span className="mt-0.5 block text-[13px] text-(--muted)">
                    {move.help}
                  </span>
                </span>
                {isDone ? null : (
                  <span className="max-[640px]:col-start-2">
                    <Button
                      variant={isNext ? "primary" : "quiet"}
                      elevation={isNext ? "raised" : "flat"}
                      className="h-9! text-[13px]!"
                      onClick={() => act(move.key)}
                      disabled={move.key === "share" && markShared.isPending}
                    >
                      {move.action}
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </ElevatedCard>
      <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
        <ElevatedCard padded className="grid content-start gap-2">
          <h3 className="m-0 text-[15px] font-bold text-(--text)">
            Moving from another platform?
          </h3>
          <p className="m-0 text-[13px] leading-4.75 text-(--muted)">
            Send us your student list and videos. We move everything for free.
          </p>
          <Button
            variant="quiet"
            className="h-8.5! justify-self-start text-[13px]!"
            onClick={() => void navigate("/support/new")}
          >
            Ask for a free move
          </Button>
        </ElevatedCard>
        {firstMoves.data?.launchReplay ? (
          <ElevatedCard padded className="grid content-start gap-2">
            <h3 className="m-0 text-[15px] font-bold text-(--text)">
              Watch your launch again
            </h3>
            <p className="m-0 text-[13px] leading-4.75 text-(--muted)">
              Replay the moment {academyName} went live.
            </p>
            <Button
              variant="quiet"
              className="h-8.5! justify-self-start text-[13px]!"
              onClick={() => void navigate("/start?replay")}
            >
              <Play size={14} weight="fill" aria-hidden="true" />
              Replay
            </Button>
          </ElevatedCard>
        ) : null}
      </div>
    </div>
  );
}
