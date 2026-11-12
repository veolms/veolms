import { CameraIcon as Camera } from "@phosphor-icons/react/Camera";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { ImagesIcon as Images } from "@phosphor-icons/react/Images";
import { MicrophoneIcon as Microphone } from "@phosphor-icons/react/Microphone";
import { StopIcon as Stop } from "@phosphor-icons/react/Stop";
import { WaveformIcon as Waveform } from "@phosphor-icons/react/Waveform";
import { MusicNotesIcon as MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { SmileyIcon as Smiley } from "@phosphor-icons/react/Smiley";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHAT_BODY_MAX_CHARS,
  CHAT_MAX_ATTACHMENTS_PER_MESSAGE,
  CHAT_UPLOAD_MIME_TYPES,
  type ChatMessage,
  type ChatRoomDetail,
} from "@veolms/contracts";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import {
  chatService,
  enqueueMessage,
  useChatMembers,
  useChatProfile,
  useEditMessage,
  type OutgoingFile,
} from "../services/chat";
import { getApiError } from "../lib/api-error";
import {
  chatDraftFiles,
  chatDrafts as drafts,
} from "../store/chatDrafts.store";
import { isTouchOnlyDevice, useChatPrefs } from "../store/chatPrefs.store";
import { ChatFileError, prepareFile } from "./chatMedia";
import { formatDuration } from "./chatFormat";
import { EmojiPanel } from "./EmojiPanel";
import { MediaStage } from "./MediaStage";
import { tidyDictation, useDictation } from "./useDictation";
import { quoteMediaOf, ReplyQuoteBody } from "./ReplyQuote";
import { useVoiceRecorder } from "./useVoiceRecorder";

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
  /** Adds "@name " where the caret is (Mention, on a person's card). */
  mention: (person: { id: string; name: string }) => void;
}

const DOCUMENT_ACCEPT = (CHAT_UPLOAD_MIME_TYPES.file as readonly string[]).join(
  ",",
);
const MEDIA_ACCEPT = [
  ...CHAT_UPLOAD_MIME_TYPES.image,
  ...CHAT_UPLOAD_MIME_TYPES.video,
].join(",");
const TYPING_EVERY_MS = 3_000;

const CANNOT_POST_TEXT: Record<string, string> = {
  staff_only: "Only admins can send messages",
  locked: "This group is locked. Nobody can send messages.",
  archived: "This group was archived.",
  muted: "You can't send messages to this group right now.",
  request_pending: "Waiting for them to accept your message request.",
  request_declined: "You can't send messages to this person.",
  direct_not_allowed: "You can't send messages to this person.",
  blocked: "You can't send messages to this person.",
  not_joined: "Join this course to send messages in its group.",
  staff_first:
    "Your instructor messages you first. Until then, ask in your course group.",
};

export const Composer = forwardRef<
  ComposerHandle,
  {
    room: ChatRoomDetail;
    viewerId: string | null;
    replyTo: ChatMessage | null;
    onCancelReply: () => void;
    editing: ChatMessage | null;
    onDoneEditing: () => void;
    onEditLast: () => void;
    onError: (message: string) => void;
  }
>(function Composer(
  {
    room,
    viewerId,
    replyTo,
    onCancelReply,
    editing,
    onDoneEditing,
    onEditLast,
    onError,
  },
  ref,
) {
  const client = useQueryClient();
  const [text, setText] = useState(() => drafts.get(room.id) ?? "");
  const [files, setFiles] = useState<OutgoingFile[]>(() =>
    chatDraftFiles.get<OutgoingFile>(room.id),
  );
  /** The draft that was in the box before Edit, put back afterwards. */
  const draftBeforeEditRef = useRef("");
  /** The chat the files on screen belong to (kept as its draft). */
  const filesRoomRef = useRef(room.id);
  const prefs = useChatPrefs();
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [slowUntil, setSlowUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // The media preview covers the messages down to this box's top.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootHeight, setRootHeight] = useState(72);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRootHeight(entry.borderBoxSize[0]?.blockSize ?? 72);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const lastTypingRef = useRef(0);
  const recorder = useVoiceRecorder();
  // Voice typing: what was in the box when it started; the words heard go
  // after it, live, as in Claude's and ChatGPT's message box.
  const dictationBaseRef = useRef("");
  const dictation = useDictation({
    lang: prefs.dictationLang,
    onText: (said) => {
      const base = dictationBaseRef.current;
      const startsSentence = base.trim() === "" || /[.?!]\s*$/.test(base);
      const words = tidyDictation(said, startsSentence);
      const gap = base && words && !/\s$/.test(base) ? " " : "";
      updateText((base + gap + words).slice(0, CHAT_BODY_MAX_CHARS));
      requestAnimationFrame(() => {
        const area = textareaRef.current;
        if (area) area.scrollTop = area.scrollHeight;
      });
    },
    onError,
  });
  const listening = dictation.state !== "idle";
  function toggleDictation() {
    if (listening) {
      dictation.stop();
      return;
    }
    dictationBaseRef.current = text;
    dictation.start();
    textareaRef.current?.focus({ preventScroll: true });
  }
  const editMessage = useEditMessage();
  const isGroup = room.kind !== "direct";
  // Settings › Chats › Enter is send (off: Enter starts a new line and
  // Ctrl/⌘ + Enter sends). On a phone Enter starts a new line unless
  // turned on there, as in WhatsApp.
  const accountEnterToSend = useChatProfile().data?.enterToSend ?? true;
  const enterToSend = isTouchOnlyDevice()
    ? prefs.phoneEnterToSend
    : accountEnterToSend;
  const members = useChatMembers(
    isGroup && mentionQuery !== null ? room.id : null,
    mentionQuery ?? "",
  );

  // Picked files stay with their chat's draft (declared before the switch
  // below, so a chat's files are never saved under the next chat).
  useEffect(() => {
    if (filesRoomRef.current === room.id) chatDraftFiles.set(room.id, files);
  }, [files, room.id]);

  // Each chat keeps its own draft; on desktop the box is ready to type in.
  useEffect(() => {
    filesRoomRef.current = room.id;
    setText(drafts.get(room.id) ?? "");
    setFiles(chatDraftFiles.get<OutgoingFile>(room.id));
    setMentions(new Map());
    if (window.matchMedia("(pointer: fine)").matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [room.id]);

  useEffect(() => {
    if (editing) {
      draftBeforeEditRef.current = drafts.get(room.id) ?? "";
      setText(editing.body);
      requestAnimationFrame(() => {
        const area = textareaRef.current;
        area?.focus({ preventScroll: true });
        area?.setSelectionRange(area.value.length, area.value.length);
      });
    }
    // Only when Edit starts; the chat is the same while editing.
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus({ preventScroll: true });
  }, [replyTo]);

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 152)}px`;
  }, [text]);

  useEffect(() => {
    if (slowUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [slowUntil]);

  async function addFiles(picked: File[], asDocument = false) {
    if (!room.attachmentsAllowed && !room.me.canModerate) {
      onError("Files can't be sent in this group.");
      return;
    }
    const room_left = CHAT_MAX_ATTACHMENTS_PER_MESSAGE - files.length;
    for (const file of picked.slice(0, room_left)) {
      try {
        const prepared = await prepareFile(file, asDocument);
        setFiles((current) => [...current, prepared]);
      } catch (error) {
        onError(
          error instanceof ChatFileError
            ? error.message
            : "This file can't be sent.",
        );
      }
    }
    if (picked.length > room_left) {
      onError(`Up to ${CHAT_MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
    }
    textareaRef.current?.focus({ preventScroll: true });
  }

  useImperativeHandle(ref, () => ({
    addFiles: (picked) => void addFiles(picked),
    focus: () => textareaRef.current?.focus({ preventScroll: true }),
    mention: (person) => {
      const area = textareaRef.current;
      const caret = area?.selectionStart ?? text.length;
      const lead = text.slice(0, caret);
      const before = `${lead}${lead && !/\s$/.test(lead) ? " " : ""}@${person.name} `;
      setMentions((current) => new Map(current).set(person.id, person.name));
      updateText(before + text.slice(caret));
      requestAnimationFrame(() => {
        area?.focus({ preventScroll: true });
        area?.setSelectionRange(before.length, before.length);
      });
    },
  }));

  function updateText(value: string) {
    setText(value);
    // The text of a message being edited is not this chat's draft.
    if (!editing) drafts.set(room.id, value);
    // "@na…" at the caret opens the member picker.
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const match = /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u.exec(
      value.slice(0, caret),
    );
    setMentionQuery(isGroup && match ? match[2]! : null);
    if (
      room.kind !== "course" &&
      value &&
      Date.now() - lastTypingRef.current > TYPING_EVERY_MS
    ) {
      lastTypingRef.current = Date.now();
      void chatService.typing(room.id).catch(() => {});
    }
  }

  function insertMention(person: { id: string; name: string }) {
    const area = textareaRef.current;
    const caret = area?.selectionStart ?? text.length;
    const before = text
      .slice(0, caret)
      .replace(/@[\p{L}\p{N}_.-]*$/u, `@${person.name} `);
    const next = before + text.slice(caret);
    setMentions((current) => new Map(current).set(person.id, person.name));
    setMentionQuery(null);
    updateText(next);
    requestAnimationFrame(() => {
      area?.focus({ preventScroll: true });
      area?.setSelectionRange(before.length, before.length);
    });
  }

  function send() {
    if (listening) dictation.stop();
    const body = text.trim();
    if (editing) {
      if (!body || body === editing.body) {
        onDoneEditing();
        setText(draftBeforeEditRef.current);
        return;
      }
      editMessage.mutate(
        { roomId: room.id, seq: editing.seq, body },
        { onError: (error) => onError(getApiError(error).message) },
      );
      onDoneEditing();
      setText(draftBeforeEditRef.current);
      return;
    }
    if (!body && files.length === 0) return;
    if (body.length > CHAT_BODY_MAX_CHARS) {
      onError(`Messages can be up to ${CHAT_BODY_MAX_CHARS} characters.`);
      return;
    }
    const mentioned = [...mentions]
      .filter(([id, name]) => id !== "everyone" && body.includes(`@${name}`))
      .map(([id]) => id);
    enqueueMessage(client, viewerId, {
      roomId: room.id,
      body,
      replyTo: replyTo
        ? {
            seq: replyTo.seq,
            senderName: replyTo.sender?.name ?? null,
            preview: replyTo.body.slice(0, 120),
            media: quoteMediaOf(replyTo.attachments),
            ...(replyTo.seq === 0 ? { clientId: replyTo.id } : {}),
          }
        : null,
      mentions: mentioned,
      mentionAll: room.me.canModerate && /(^|\s)@everyone\b/.test(body),
      files,
    });
    setText("");
    drafts.delete(room.id);
    setFiles([]);
    setMentions(new Map());
    onCancelReply();
    if (room.slowModeSeconds > 0 && !room.me.canModerate) {
      setSlowUntil(Date.now() + room.slowModeSeconds * 1000);
      setNow(Date.now());
    }
  }

  async function sendVoice() {
    const recording = await recorder.stop();
    if (!recording) return;
    enqueueMessage(client, viewerId, {
      roomId: room.id,
      body: "",
      replyTo: replyTo
        ? {
            seq: replyTo.seq,
            senderName: replyTo.sender?.name ?? null,
            preview: replyTo.body.slice(0, 120),
            media: quoteMediaOf(replyTo.attachments),
            ...(replyTo.seq === 0 ? { clientId: replyTo.id } : {}),
          }
        : null,
      mentions: [],
      mentionAll: false,
      files: [
        {
          localId: crypto.randomUUID(),
          file: recording.blob,
          kind: "audio",
          name: `Voice message ${new Date().toISOString().slice(0, 16).replace("T", " ")}.${recording.mimeType.includes("mp4") ? "m4a" : "weba"}`,
          mimeType: recording.mimeType,
          durationMs: recording.durationMs,
          waveform: recording.waveform,
          previewUrl: null,
          progress: 0,
          attachment: null,
        },
      ],
    });
    onCancelReply();
  }

  if (!room.me.canPost) {
    return (
      <div className="border-t border-solid border-(--chat-line) bg-(--chat-panel) px-4 py-4 text-center text-[0.88rem] text-(--muted)">
        {room.me.cannotPostReason === "muted" && room.me.restriction?.until
          ? `You can't send messages to this group until ${new Date(room.me.restriction.until).toLocaleString()}.`
          : (CANNOT_POST_TEXT[room.me.cannotPostReason ?? ""] ??
            "You can't send messages here.")}
      </div>
    );
  }

  const slowLeft = Math.max(0, Math.ceil((slowUntil - now) / 1000));
  const canSend =
    (text.trim().length > 0 || files.length > 0) && slowLeft === 0;
  const iconButton =
    "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--chat-hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      ref={rootRef}
      className="relative border-t border-solid border-(--chat-line) bg-(--chat-panel) px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {replyTo || editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-solid border-(--accent) bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-3 py-2">
          {editing ? (
            <PencilSimple
              size={16}
              className="text-(--accent-ink)"
              aria-hidden="true"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <ReplyQuoteBody
              title={
                editing
                  ? "Edit message"
                  : replyTo?.sender?.id === viewerId
                    ? "You"
                    : (replyTo?.sender?.name ?? "Message")
              }
              text={(editing ?? replyTo)?.body ?? ""}
              media={quoteMediaOf((editing ?? replyTo)?.attachments ?? [])}
            />
          </div>
          <button
            type="button"
            className={iconButton}
            aria-label={editing ? "Cancel editing" : "Cancel reply"}
            onClick={() => {
              if (editing) {
                onDoneEditing();
                setText(draftBeforeEditRef.current);
              } else onCancelReply();
            }}
          >
            <X size={18} />
          </button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <MediaStage
          files={files}
          composerHeight={rootHeight}
          onAddMore={() => mediaInputRef.current?.click()}
          onClear={() =>
            setFiles((current) => {
              for (const file of current) {
                if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
              }
              return [];
            })
          }
          onReorder={(from, to) =>
            setFiles((current) => {
              const next = [...current];
              const [moved] = next.splice(from, 1);
              if (moved) next.splice(to, 0, moved);
              return next;
            })
          }
          onRemove={(localId) =>
            setFiles((current) => {
              const gone = current.find((f) => f.localId === localId);
              if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
              return current.filter((f) => f.localId !== localId);
            })
          }
        />
      ) : null}

      {mentionQuery !== null ? (
        <div className="absolute right-3 bottom-full left-3 mb-1 max-h-60 overflow-y-auto rounded-xl border border-(--chat-line) bg-(--chat-in) p-1 shadow-[0_18px_48px_rgb(0_0_0/0.3)]">
          {room.me.canModerate &&
          "everyone".startsWith(mentionQuery.toLowerCase()) ? (
            <MentionOption
              name="everyone"
              note="Notify the whole group"
              onPick={() => insertMention({ id: "everyone", name: "everyone" })}
            />
          ) : null}
          {(members.data?.pages[0]?.members ?? [])
            .filter((m) => m.id !== viewerId)
            .slice(0, 6)
            .map((member) => (
              <MentionOption
                key={member.id}
                name={member.name}
                note={member.isAdmin ? "Group admin" : undefined}
                onPick={() => insertMention(member)}
              />
            ))}
        </div>
      ) : null}

      {emojiOpen ? (
        <EmojiPanel
          // WhatsApp: the panel spans the chat above the message box.
          className="absolute inset-x-2 bottom-full mb-2"
          onPick={(emoji) => {
            const area = textareaRef.current;
            const start = area?.selectionStart ?? text.length;
            const end = area?.selectionEnd ?? text.length;
            updateText(text.slice(0, start) + emoji + text.slice(end));
            requestAnimationFrame(() => {
              area?.focus({ preventScroll: true });
              area?.setSelectionRange(
                start + emoji.length,
                start + emoji.length,
              );
            });
          }}
        />
      ) : null}

      {recorder.state === "recording" ? (
        <div className="flex items-center gap-3 py-1">
          <button
            type="button"
            className={iconButton}
            aria-label="Cancel recording"
            onClick={recorder.cancel}
          >
            <Trash size={20} />
          </button>
          <span
            className="size-2.5 animate-pulse rounded-full bg-red-500"
            aria-hidden="true"
          />
          <span
            className="text-[0.9rem] text-(--text) tabular-nums"
            aria-live="polite"
          >
            {formatDuration(recorder.elapsedMs)}
          </span>
          <div
            className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden"
            aria-hidden="true"
          >
            {recorder.levels.map((level, index) => (
              <span
                key={index}
                className="w-[3px] shrink-0 rounded-full bg-(--accent)"
                style={{ height: `${Math.max(10, level)}%` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void sendVoice()}
            aria-label="Send voice message"
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover)"
          >
            <PaperPlaneRight size={20} weight="fill" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className={iconButton} aria-label="Attach">
              <Plus size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-60 min-w-0 p-1.5"
            >
              {(
                [
                  ["Photos & videos", Images, "bg-[#007bfc]", mediaInputRef],
                  ["Document", FileText, "bg-[#7f66ff]", documentInputRef],
                  ["Camera", Camera, "bg-[#ff2e74]", cameraInputRef],
                  ["Audio", MusicNotes, "bg-[#ff7a1a]", audioInputRef],
                ] as const
              ).map(([label, Icon, tone, inputRef]) => (
                <DropdownMenuItem
                  key={label}
                  onClick={() => inputRef.current?.click()}
                  className="gap-3 py-2"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-white",
                      tone,
                    )}
                    aria-hidden="true"
                  >
                    <Icon size={17} weight="fill" />
                  </span>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className={cn(iconButton, emojiOpen && "text-(--accent-ink)")}
            aria-label="Emoji"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smiley size={22} />
          </button>
          <label className="flex min-h-10 min-w-0 flex-1 items-center rounded-2xl bg-(--chat-input) px-3.5">
            <span className="sr-only">Type a message</span>
            <textarea
              id="chat-composer"
              ref={textareaRef}
              rows={1}
              value={text}
              maxLength={CHAT_BODY_MAX_CHARS}
              placeholder={
                listening
                  ? "Listening… speak now"
                  : files.length > 0
                    ? "Add a caption"
                    : "Type a message"
              }
              onChange={(event) => updateText(event.target.value)}
              onPaste={(event) => {
                const pasted = [...event.clipboardData.files];
                if (pasted.length > 0) {
                  event.preventDefault();
                  void addFiles(pasted);
                }
              }}
              onDrop={(event) => {
                if (event.dataTransfer.files.length === 0) return;
                event.preventDefault();
                void addFiles([...event.dataTransfer.files]);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  mentionQuery !== null &&
                  members.data?.pages[0]?.members[0]
                ) {
                  event.preventDefault();
                  insertMention(members.data.pages[0].members[0]);
                } else if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  (enterToSend
                    ? !event.shiftKey
                    : event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault();
                  send();
                } else if (event.key === "Escape") {
                  if (mentionQuery !== null) setMentionQuery(null);
                  else if (emojiOpen) setEmojiOpen(false);
                  else if (editing) {
                    onDoneEditing();
                    setText(draftBeforeEditRef.current);
                  } else if (replyTo) onCancelReply();
                  else return;
                  event.stopPropagation();
                } else if (
                  event.key === "ArrowUp" &&
                  text === "" &&
                  files.length === 0
                ) {
                  event.preventDefault();
                  onEditLast();
                }
              }}
              className="max-h-38 min-h-6 w-full resize-none border-0 bg-transparent py-2 text-[0.94rem] leading-6 text-(--text) outline-none placeholder:text-(--muted)"
            />
            {dictation.supported ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  toggleDictation();
                }}
                aria-pressed={listening}
                aria-label={listening ? "Stop voice typing" : "Voice typing"}
                title={
                  listening
                    ? "Stop voice typing"
                    : "Voice typing: speak, and your words are typed here"
                }
                className={cn(
                  "relative -mr-1.5 ml-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center self-end rounded-full border-0 bg-transparent text-(--muted) hover:text-(--text)",
                  "mb-1",
                  listening && "bg-red-500 text-white hover:text-white",
                )}
              >
                {listening ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 animate-ping rounded-full bg-red-500/40 motion-reduce:animate-none"
                    />
                    <Stop size={14} weight="fill" className="relative" />
                  </>
                ) : (
                  <Waveform size={19} />
                )}
              </button>
            ) : null}
          </label>
          {canSend || editing || slowLeft > 0 || files.length > 0 ? (
            <button
              type="button"
              onClick={send}
              disabled={!canSend && !editing}
              aria-label={
                editing
                  ? "Save"
                  : slowLeft > 0
                    ? `Slow mode: wait ${slowLeft} seconds`
                    : "Send"
              }
              className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {slowLeft > 0 ? (
                <span className="text-[0.75rem] font-bold tabular-nums">
                  {slowLeft}
                </span>
              ) : (
                <PaperPlaneRight size={19} weight="fill" />
              )}
            </button>
          ) : (
            <button
              type="button"
              className={iconButton}
              aria-label="Record voice message"
              onClick={() => {
                void recorder.start().then((problem) => {
                  if (problem) onError(problem);
                });
              }}
            >
              <Microphone size={22} />
            </button>
          )}
        </div>
      )}

      {room.slowModeSeconds > 0 && !room.me.canModerate ? (
        <p className="m-0 px-2 pt-1 text-[0.7rem] text-(--muted)">
          Slow mode: one message every {room.slowModeSeconds} s
        </p>
      ) : null}

      <input
        ref={mediaInputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept={(CHAT_UPLOAD_MIME_TYPES.audio as readonly string[]).join(",")}
        multiple
        hidden
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])], true);
          event.target.value = "";
        }}
      />
    </div>
  );
});

function MentionOption({
  name,
  note,
  onPick,
}: {
  name: string;
  note?: string | undefined;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[0.88rem] text-(--text) hover:bg-(--chat-hover)"
    >
      <span className="font-semibold">@{name}</span>
      {note ? (
        <span className="text-[0.75rem] text-(--muted)">{note}</span>
      ) : null}
    </button>
  );
}
