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
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { fuzzyMatches } from "../lib/fuzzySearch";
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
import {
  saveSendQuality,
  savedSendQuality,
  type SendQuality,
} from "./mediaQuality";
import { formatDuration } from "./chatFormat";
import { EmojiPanel } from "./EmojiPanel";
import { EmojiSuggestions } from "./EmojiSuggestions";
import {
  findEmojiShortcode,
  getEmojiSuggestions,
  type EmojiShortcodeSpan,
  type EmojiSuggestion,
} from "./emojiShortcodeData";
import {
  findEmoticon,
  getEmoticonSuggestions,
  type EmoticonSpan,
} from "./emoticonData";
import {
  continueList,
  shortcutFor,
  toggleInline,
  toggleLines,
  type InlineMark,
  type LineMark,
} from "./composerFormat";
import { FormatBar } from "./FormatBar";
import { MediaStage } from "./MediaStage";
import { tidyDictation, useDictation } from "./useDictation";
import { quoteMediaOf, quoteTitle, ReplyQuoteBody } from "./ReplyQuote";
import { useVoiceRecorder } from "./useVoiceRecorder";

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
  /** Adds "@name " where the caret is (Mention, on a person's card). */
  mention: (person: { id: string; name: string }) => void;
  /** Starts the message with `prefix` (the assistant's job types). */
  startWith: (prefix: string) => void;
}

const DOCUMENT_ACCEPT = (CHAT_UPLOAD_MIME_TYPES.file as readonly string[]).join(
  ",",
);
const MEDIA_ACCEPT = [
  ...CHAT_UPLOAD_MIME_TYPES.image,
  ...CHAT_UPLOAD_MIME_TYPES.video,
].join(",");
const TYPING_EVERY_MS = 3_000;
const MENTION_QUERY_MAX_CHARS = 60;
const MENTION_QUERY_CHARS = /^[\p{L}\p{M}\p{N}_.\- \t]*$/u;
const MENTION_QUERY_END = /[\p{L}\p{M}\p{N}_.-]$/u;
const NEW_MENTION = /(^|\s)@([\p{L}\p{M}\p{N}_.-]{0,30})$/u;

type EmojiTrigger =
  | (EmojiShortcodeSpan & { readonly kind: "shortcode" })
  | (EmoticonSpan & { readonly kind: "emoticon" });

function sameEmojiTrigger(
  current: EmojiTrigger | null,
  next: EmojiTrigger,
): boolean {
  if (
    !current ||
    current.kind !== next.kind ||
    current.start !== next.start ||
    current.end !== next.end
  ) {
    return false;
  }
  if (current.kind === "shortcode" && next.kind === "shortcode") {
    return current.query === next.query;
  }
  return current.kind === "emoticon" && next.kind === "emoticon"
    ? current.emoticon === next.emoticon
    : false;
}

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
    /** "Reply privately": the group the quoted message is from. */
    replyGroupName?: string | null;
    onCancelReply: () => void;
    editing: ChatMessage | null;
    onDoneEditing: () => void;
    onEditLast: () => void;
    onError: (message: string) => void;
    mediaSlot: HTMLElement | null;
  }
>(function Composer(
  {
    room,
    viewerId,
    replyTo,
    replyGroupName = null,
    onCancelReply,
    editing,
    onDoneEditing,
    onEditLast,
    onError,
    mediaSlot,
  },
  ref,
) {
  const client = useQueryClient();
  // A quote from another chat is a "Reply privately" (from a group).
  const privateQuote =
    replyTo && replyTo.roomId !== room.id
      ? { roomId: replyTo.roomId, roomName: replyGroupName }
      : null;
  const [text, setText] = useState(() => drafts.get(room.id) ?? "");
  const [files, setFiles] = useState<OutgoingFile[]>(() =>
    chatDraftFiles.get<OutgoingFile>(room.id),
  );
  // Standard (smaller) or HD for photos, videos and audio; this device
  // remembers the last choice, as WhatsApp does.
  const [quality, setQuality] = useState<SendQuality>(savedSendQuality);
  function changeQuality(next: SendQuality) {
    setQuality(next);
    saveSendQuality(next);
  }
  /** The draft that was in the box before Edit, put back afterwards. */
  const draftBeforeEditRef = useRef("");
  /** The chat the files on screen belong to (kept as its draft). */
  const filesRoomRef = useRef(room.id);
  const prefs = useChatPrefs();
  /** Text selected in the box: the formatting bar shows. */
  const [hasSelection, setHasSelection] = useState(false);
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStartRef = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState<EmojiTrigger | null>(null);
  const emojiSpanRef = useRef<EmojiTrigger | null>(null);
  const emojiRequestRef = useRef(0);
  const [emojiSuggestions, setEmojiSuggestions] = useState<
    readonly EmojiSuggestion[]
  >([]);
  const [emojiSuggestionIndex, setEmojiSuggestionIndex] = useState(0);
  const [emojiLoading, setEmojiLoading] = useState(false);
  const emojiListboxId = useId();
  const [slowUntil, setSlowUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const recorder = useVoiceRecorder();
  const isGroup = room.kind !== "direct";

  function clearMentionQuery() {
    mentionStartRef.current = null;
    setMentionQuery(null);
  }

  function startMention(value: string, caret: number) {
    const match = NEW_MENTION.exec(value.slice(0, caret));
    if (!match) return;
    const query = match[2]!;
    mentionStartRef.current = caret - query.length - 1;
    setMentionQuery(query);
  }

  function activeMentionAt(value: string, caret: number) {
    const start = mentionStartRef.current;
    if (start === null || caret <= start || value[start] !== "@") return null;
    if (value.slice(start + 1, caret) !== mentionQuery) return null;
    return { start, end: caret };
  }

  const clearEmojiQuery = useCallback(() => {
    emojiRequestRef.current += 1;
    emojiSpanRef.current = null;
    setEmojiQuery(null);
    setEmojiSuggestions((current) => (current.length === 0 ? current : []));
    setEmojiSuggestionIndex(0);
    setEmojiLoading(false);
  }, []);

  function startEmoji(value: string, caret: number) {
    let found: EmojiTrigger | null = null;
    const emoticon = findEmoticon(value, caret);
    if (emoticon) {
      found = { kind: "emoticon", ...emoticon };
    } else {
      const shortcode = findEmojiShortcode(value, caret);
      if (shortcode) found = { kind: "shortcode", ...shortcode };
    }
    if (!found) {
      clearEmojiQuery();
      return;
    }
    const next = found;
    emojiSpanRef.current = next;
    setEmojiQuery((current) =>
      sameEmojiTrigger(current, next) ? current : next,
    );
  }

  function activeEmojiAt(value: string, caret: number) {
    const trigger = emojiSpanRef.current;
    if (!trigger || emojiOpen || mentionQuery !== null) return null;
    if (caret !== trigger.end) return null;
    const typed = value.slice(trigger.start, trigger.end);
    if (trigger.kind === "shortcode") {
      return typed === `:${trigger.query}` ? trigger : null;
    }
    return typed === trigger.emoticon ? trigger : null;
  }

  function updateText(value: string, fromTyping = false) {
    setText(value);
    if (!editing) drafts.set(room.id, value);
    const caret = textareaRef.current?.selectionStart ?? value.length;

    if (!fromTyping || !isGroup) {
      clearMentionQuery();
    } else {
      const start = mentionStartRef.current;
      if (start !== null && start < caret && value[start] === "@") {
        const rest = value.slice(start + 1, caret);
        if (
          rest.length <= MENTION_QUERY_MAX_CHARS &&
          !rest.startsWith(" ") &&
          !rest.includes("@") &&
          MENTION_QUERY_CHARS.test(rest)
        ) {
          setMentionQuery(
            rest === "" || MENTION_QUERY_END.test(rest) ? rest : null,
          );
        } else {
          clearMentionQuery();
          startMention(value, caret);
        }
      } else {
        clearMentionQuery();
        startMention(value, caret);
      }
    }
    if (!fromTyping || emojiOpen || NEW_MENTION.test(value.slice(0, caret))) {
      clearEmojiQuery();
    } else {
      startEmoji(value, caret);
    }
    if (
      room.kind !== "course" &&
      value &&
      Date.now() - lastTypingRef.current > TYPING_EVERY_MS
    ) {
      lastTypingRef.current = Date.now();
      void chatService.typing(room.id).catch(() => {});
    }
  }

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
  // Settings › Chats › Enter is send (off: Enter starts a new line and
  // Ctrl/⌘ + Enter sends). On a phone Enter starts a new line unless
  // turned on there, as in WhatsApp.
  const accountEnterToSend = useChatProfile().data?.enterToSend ?? true;
  const enterToSend = isTouchOnlyDevice()
    ? prefs.phoneEnterToSend
    : accountEnterToSend;
  const memberSearch = mentionQuery?.trim().split(/\s+/u)[0] ?? "";
  const members = useChatMembers(
    isGroup && mentionQuery !== null ? room.id : null,
    memberSearch,
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
    mentionStartRef.current = null;
    setMentionQuery(null);
    clearEmojiQuery();
    if (window.matchMedia("(pointer: fine)").matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [room.id, clearEmojiQuery]);

  useEffect(() => {
    if (!emojiQuery || emojiOpen || mentionQuery !== null) return;
    const request = ++emojiRequestRef.current;
    let live = true;
    setEmojiSuggestions((current) => (current.length === 0 ? current : []));
    setEmojiSuggestionIndex(0);
    setEmojiLoading(true);
    if (emojiQuery.kind === "emoticon") {
      setEmojiSuggestions(getEmoticonSuggestions(emojiQuery.emoticon));
      setEmojiLoading(false);
      return;
    }
    void getEmojiSuggestions(emojiQuery.query)
      .then((results) => {
        if (!live || request !== emojiRequestRef.current) return;
        setEmojiSuggestions(results);
        setEmojiLoading(false);
      })
      .catch(() => {
        if (!live || request !== emojiRequestRef.current) return;
        setEmojiSuggestions([]);
        setEmojiLoading(false);
      });
    return () => {
      live = false;
    };
  }, [emojiQuery, emojiOpen, mentionQuery]);

  useEffect(() => {
    if (editing) {
      draftBeforeEditRef.current = drafts.get(room.id) ?? "";
      mentionStartRef.current = null;
      setMentionQuery(null);
      clearEmojiQuery();
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
        const prepared = await prepareFile(
          file,
          asDocument,
          room.me.uploadMaxBytes,
        );
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
    startWith: (prefix) => {
      const area = textareaRef.current;
      const rest = text.replace(
        /^\s*(fix|build|research|ask|review):\s*/iu,
        "",
      );
      const value = `${prefix} ${rest}`;
      updateText(value);
      requestAnimationFrame(() => {
        area?.focus({ preventScroll: true });
        area?.setSelectionRange(value.length, value.length);
      });
    },
  }));

  function insertMention(person: { id: string; name: string }) {
    const area = textareaRef.current;
    const value = area?.value ?? text;
    const caret = area?.selectionStart ?? value.length;
    const active =
      area && area.selectionStart !== area.selectionEnd
        ? null
        : activeMentionAt(value, caret);
    if (!active) {
      clearMentionQuery();
      return;
    }
    const next = `${value.slice(0, active.start)}@${person.name} ${value.slice(active.end)}`;
    const afterMention = active.start + person.name.length + 2;
    setMentions((current) => new Map(current).set(person.id, person.name));
    clearMentionQuery();
    updateText(next);
    requestAnimationFrame(() => {
      area?.focus({ preventScroll: true });
      area?.setSelectionRange(afterMention, afterMention);
    });
  }

  function insertEmoji(suggestion: EmojiSuggestion) {
    const area = textareaRef.current;
    const value = area?.value ?? text;
    const caret = area?.selectionStart ?? value.length;
    const active =
      area && area.selectionStart !== area.selectionEnd
        ? null
        : activeEmojiAt(value, caret);
    if (!active) {
      clearEmojiQuery();
      return;
    }
    const next =
      value.slice(0, active.start) + suggestion.emoji + value.slice(active.end);
    if (next.length > CHAT_BODY_MAX_CHARS) return;
    const afterEmoji = active.start + suggestion.emoji.length;
    clearEmojiQuery();
    updateText(next);
    requestAnimationFrame(() => {
      area?.focus({ preventScroll: true });
      area?.setSelectionRange(afterEmoji, afterEmoji);
    });
  }

  /** Applies a WhatsApp format to the selection (or at the caret). */
  function applyFormat(mark: InlineMark | LineMark) {
    const area = textareaRef.current;
    if (!area) return;
    clearEmojiQuery();
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const edited =
      mark === "bullet" || mark === "number" || mark === "quote"
        ? toggleLines(text, start, end, mark)
        : toggleInline(text, start, end, mark);
    updateText(edited.text);
    requestAnimationFrame(() => {
      area.focus({ preventScroll: true });
      area.setSelectionRange(edited.start, edited.end);
    });
  }

  function send() {
    if (listening) dictation.stop();
    clearEmojiQuery();
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
            ...privateQuote,
          }
        : null,
      mentions: mentioned,
      mentionAll: room.me.canModerate && /(^|\s)@everyone\b/.test(body),
      files,
      quality,
    });
    setText("");
    drafts.delete(room.id);
    setFiles([]);
    setMentions(new Map());
    clearMentionQuery();
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
            ...privateQuote,
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
  const mentionQueryText = mentionQuery ?? "";
  const mentionOptions =
    members.data?.pages[0]?.members
      ?.filter((member) => member.id !== viewerId)
      .map((member) => ({
        member,
        fuzzy: fuzzyMatches(mentionQueryText, member.name, member.title),
      }))
      .sort((a, b) => Number(b.fuzzy) - Number(a.fuzzy))
      .slice(0, 6)
      .map(({ member }) => member) ?? [];
  const showMentionEveryone =
    mentionQuery !== null &&
    room.me.canModerate &&
    fuzzyMatches(mentionQueryText, "everyone");
  const showMentionPicker =
    mentionQuery !== null &&
    emojiQuery === null &&
    !emojiOpen &&
    (!members.isLoading || showMentionEveryone || mentionOptions.length > 0);
  const showMentionEmpty =
    showMentionPicker &&
    !members.isLoading &&
    !showMentionEveryone &&
    mentionOptions.length === 0;
  const showEmojiSuggestions =
    emojiQuery !== null &&
    emojiOpen === false &&
    mentionQuery === null &&
    (emojiSuggestions.length > 0 || emojiLoading);
  const activeEmojiSuggestion = emojiSuggestions[emojiSuggestionIndex] ?? null;
  const emojiOptionIds = emojiSuggestions.map(
    (_, index) => `${emojiListboxId}-option-${index}`,
  );
  const activeEmojiOptionId =
    showEmojiSuggestions && activeEmojiSuggestion
      ? (emojiOptionIds[emojiSuggestionIndex] ?? null)
      : null;

  return (
    <div className="relative z-30 border-t border-solid border-(--chat-line) bg-(--chat-panel) px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
                  : quoteTitle(
                      replyTo?.sender?.id === viewerId
                        ? "You"
                        : (replyTo?.sender?.name ?? "Message"),
                      privateQuote?.roomName,
                    )
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

      {files.length > 0 && mediaSlot
        ? createPortal(
            <MediaStage
              files={files}
              quality={quality}
              onQualityChange={changeQuality}
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
            />,
            mediaSlot,
          )
        : null}

      {showMentionPicker ? (
        <div className="absolute right-3 bottom-full left-3 z-40 mb-1 max-h-60 overflow-y-auto rounded-xl border border-(--chat-line) bg-(--chat-in) p-1 shadow-[0_18px_48px_rgb(0_0_0/0.3)]">
          {showMentionEveryone ? (
            <MentionOption
              name="everyone"
              note="Notify the whole group"
              onPick={() => insertMention({ id: "everyone", name: "everyone" })}
            />
          ) : null}
          {mentionOptions.map((member) => (
            <MentionOption
              key={member.id}
              name={member.name}
              note={member.isAdmin ? "Group admin" : undefined}
              onPick={() => insertMention(member)}
            />
          ))}
          {showMentionEmpty ? (
            <p className="px-2.5 py-2 text-[0.88rem] text-(--muted)">
              No members found
            </p>
          ) : null}
        </div>
      ) : null}

      {showEmojiSuggestions ? (
        <EmojiSuggestions
          listboxId={emojiListboxId}
          optionIds={emojiOptionIds}
          suggestions={emojiSuggestions}
          activeIndex={emojiSuggestionIndex}
          loading={emojiLoading}
          onPick={insertEmoji}
          onActiveChange={setEmojiSuggestionIndex}
        />
      ) : null}

      {hasSelection && !emojiOpen && !showEmojiSuggestions ? (
        <FormatBar onFormat={applyFormat} />
      ) : null}

      {emojiOpen ? (
        <EmojiPanel
          // WhatsApp: the panel spans the chat above the message box.
          className="absolute inset-x-2 bottom-full z-40 mb-2"
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
            onClick={() => {
              clearEmojiQuery();
              setEmojiOpen((open) => !open);
            }}
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
              aria-controls={showEmojiSuggestions ? emojiListboxId : undefined}
              aria-activedescendant={activeEmojiOptionId ?? undefined}
              placeholder={
                listening
                  ? "Listening… speak now"
                  : files.length > 0
                    ? "Add a caption"
                    : "Type a message"
              }
              onChange={(event) => updateText(event.target.value, true)}
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
              onSelect={(event) => {
                const area = event.currentTarget;
                setHasSelection(area.selectionStart !== area.selectionEnd);
                if (
                  emojiSpanRef.current &&
                  (area.selectionStart !== area.selectionEnd ||
                    !activeEmojiAt(area.value, area.selectionStart))
                ) {
                  clearEmojiQuery();
                }
              }}
              onBlur={() => {
                setHasSelection(false);
                clearMentionQuery();
                clearEmojiQuery();
              }}
              onKeyDown={(event) => {
                // WhatsApp's formatting keys: Ctrl/⌘+B, I, Shift+X, Shift+M…
                const format = shortcutFor(event);
                if (format) {
                  event.preventDefault();
                  applyFormat(format);
                  return;
                }
                const area = event.currentTarget;
                const emojiActive =
                  showEmojiSuggestions &&
                  activeEmojiAt(area.value, area.selectionStart);
                if (!event.nativeEvent.isComposing && emojiActive) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    if (emojiSuggestions.length > 0) {
                      const direction = event.key === "ArrowDown" ? 1 : -1;
                      setEmojiSuggestionIndex(
                        (current) =>
                          (current + direction + emojiSuggestions.length) %
                          emojiSuggestions.length,
                      );
                    }
                    return;
                  }
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    if (activeEmojiSuggestion) {
                      insertEmoji(activeEmojiSuggestion);
                    }
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    clearEmojiQuery();
                    return;
                  }
                }
                const sending =
                  event.key === "Enter" &&
                  (enterToSend
                    ? !event.shiftKey
                    : event.ctrlKey || event.metaKey);
                // A new line in a list or quote carries it on.
                if (
                  event.key === "Enter" &&
                  !sending &&
                  !event.nativeEvent.isComposing &&
                  mentionQuery === null
                ) {
                  const area = event.currentTarget;
                  if (area.selectionStart === area.selectionEnd) {
                    const next = continueList(text, area.selectionStart);
                    if (next) {
                      event.preventDefault();
                      updateText(next.text);
                      requestAnimationFrame(() =>
                        area.setSelectionRange(next.caret, next.caret),
                      );
                      return;
                    }
                  }
                }
                const firstMentionOption = mentionOptions[0];
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  mentionQuery !== null &&
                  firstMentionOption
                ) {
                  event.preventDefault();
                  insertMention(firstMentionOption);
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
                  if (mentionQuery !== null) clearMentionQuery();
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
