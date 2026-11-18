import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice typing ("dictation"), as the mic in Claude's and ChatGPT's message
 * box: the words appear in the box while you speak, then you edit and send.
 *
 * Uses the browser's own speech recognition (the Web Speech API): Chrome,
 * Edge and Samsung Internet on Android and computers, Safari on Mac and
 * iPhone. Nothing to install and no server of ours: the browser listens and
 * turns speech into text (Chrome and Safari through their makers' speech
 * services). Firefox has none, so the button is not shown there.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: RecognitionResult;
  };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Off until it has been tried on real phones and computers: browsers'
 * speech recognition varied too much (Android repeats words, sessions end
 * on their own, accuracy depends on the browser's speech service). Turn on
 * here when it is ready.
 */
export const VOICE_TYPING_ENABLED = false;

export function dictationSupported(): boolean {
  return VOICE_TYPING_ENABLED && recognitionClass() !== null;
}

/** Android Chrome repeats words in continuous mode: one phrase per session. */
function isAndroid() {
  return (
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
  );
}

/** What the browser's errors mean for the person speaking. */
const ERRORS: Record<string, string> = {
  "not-allowed":
    "Allow the microphone for this site to type with your voice (the lock icon in the address bar).",
  "service-not-allowed":
    "Voice typing is turned off in this browser's settings.",
  "audio-capture": "No microphone was found.",
  network: "Voice typing needs an internet connection.",
  "language-not-supported": "Voice typing doesn't support this language here.",
};

/** Speech words for punctuation, the way phone keyboards take them. */
const SPOKEN: Array<[RegExp, string]> = [
  [/\s*\b(full stop|period)\b/gi, "."],
  [/\s*\bcomma\b/gi, ","],
  [/\s*\bquestion mark\b/gi, "?"],
  [/\s*\bexclamation (mark|point)\b/gi, "!"],
  [/\s*\bnew line\b\s*/gi, "\n"],
];

/** Tidies recognised text: spoken punctuation, capitals after a sentence. */
export function tidyDictation(text: string, startsSentence: boolean): string {
  let out = text;
  for (const [pattern, mark] of SPOKEN) out = out.replace(pattern, mark);
  out = out.replace(
    /((?:[.?!]\s+)|(?:\n\s*))(\p{Ll})/gu,
    (_, end: string, letter: string) => end + letter.toUpperCase(),
  );
  if (startsSentence) {
    out = out.replace(/^\s*(\p{Ll})/u, (letter) => letter.toUpperCase());
  }
  return out;
}

export type DictationState = "idle" | "starting" | "listening";

/**
 * `onText(said, done)`: everything recognised since dictation started (the
 * last words may still change while `done` is false).
 */
export function useDictation({
  lang,
  onText,
  onError,
}: {
  lang: string;
  onText: (said: string, done: boolean) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<DictationState>("idle");
  const recognitionRef = useRef<Recognition | null>(null);
  /** Still wanted: a session the browser ended is started again. */
  const wantedRef = useRef(false);
  /** Final words from earlier sessions of this dictation. */
  const committedRef = useRef("");
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  const join = (a: string, b: string) =>
    !a ? b.trim() : !b.trim() ? a : `${a.replace(/\s+$/, "")} ${b.trim()}`;

  function startSession() {
    const Recognition = recognitionClass();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = !isAndroid();
    recognition.maxAlternatives = 1;
    let sessionFinal = "";
    recognition.onresult = (event) => {
      // Rebuilt from all results each time (the safest across browsers).
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const words = result[0]?.transcript ?? "";
        if (result.isFinal) finals = join(finals, words);
        else interim = join(interim, words);
      }
      sessionFinal = finals;
      setState("listening");
      handlers.current.onText(
        join(join(committedRef.current, finals), interim),
        false,
      );
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      wantedRef.current = false;
      handlers.current.onError(
        ERRORS[event.error] ?? "Voice typing stopped. Try again.",
      );
    };
    recognition.onend = () => {
      committedRef.current = join(committedRef.current, sessionFinal);
      handlers.current.onText(committedRef.current, !wantedRef.current);
      if (wantedRef.current) {
        // The browser stops after a pause (or each phrase on Android):
        // keep listening until the person stops it.
        try {
          sessionRef.current();
          return;
        } catch {
          wantedRef.current = false;
        }
      }
      recognitionRef.current = null;
      setState("idle");
    };
    recognitionRef.current = recognition;
    recognition.start();
  }
  // The newest startSession (it reads this render's language).
  const sessionRef = useRef(startSession);
  sessionRef.current = startSession;

  const start = useCallback(() => {
    if (wantedRef.current) return;
    wantedRef.current = true;
    committedRef.current = "";
    setState("starting");
    try {
      sessionRef.current();
    } catch {
      wantedRef.current = false;
      setState("idle");
      handlers.current.onError("Voice typing couldn't start. Try again.");
    }
  }, []);

  /** Stops listening; the words heard so far stay in the box. */
  const stop = useCallback(() => {
    wantedRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  // Leaving the chat (or the page) stops the microphone.
  useEffect(
    () => () => {
      wantedRef.current = false;
      recognitionRef.current?.abort();
    },
    [],
  );

  return { state, start, stop, supported: dictationSupported() };
}
