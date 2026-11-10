import { useCallback, useEffect, useRef, useState } from "react";

import { CHAT_VOICE_MAX_SECONDS } from "@veolms/contracts";

/**
 * Records a voice message with MediaRecorder (Opus in WebM where the
 * browser can, MP4/AAC on Safari) and samples the level for a waveform of
 * up to 64 bars, as WhatsApp draws it. Recording stops by itself at the
 * length limit.
 */

const BARS = 64;

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  waveform: number[];
}

function pickMimeType(): string {
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    )
      return type;
  }
  return "";
}

/** Squeezes level samples into `BARS` bars of 0–100. */
function toWaveform(samples: number[]): number[] {
  if (samples.length === 0) return [];
  const bars: number[] = [];
  const step = samples.length / BARS;
  for (let i = 0; i < Math.min(BARS, samples.length); i += 1) {
    const slice = samples.slice(
      Math.floor(i * step),
      Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1),
    );
    bars.push(Math.round(Math.max(...slice)));
  }
  const peak = Math.max(...bars, 1);
  return bars.map((bar) => Math.max(4, Math.round((bar / peak) * 100)));
}

export function useVoiceRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "error">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const samplesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const resolveRef = useRef<
    ((recording: VoiceRecording | null) => void) | null
  >(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Starts recording; answers why not, or null when it started. */
  const start = useCallback(async (): Promise<string | null> => {
    setError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      const message = "This browser can't record voice messages.";
      setError(message);
      setState("error");
      return message;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      chunksRef.current = [];
      samplesRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const type = (recorder.mimeType || mimeType || "audio/webm").split(
          ";",
        )[0]!;
        const blob = new Blob(chunksRef.current, { type });
        const result =
          cancelledRef.current || durationMs < 600
            ? null
            : {
                blob,
                mimeType: type,
                durationMs,
                waveform: toWaveform(samplesRef.current),
              };
        cleanup();
        setState("idle");
        setElapsedMs(0);
        setLevels([]);
        resolveRef.current?.(result);
        resolveRef.current = null;
      };

      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let lastSample = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
        const now = Date.now();
        setElapsedMs(now - startedAtRef.current);
        if (now - lastSample > 80) {
          lastSample = now;
          const level = Math.min(100, (peak / 128) * 160);
          samplesRef.current.push(level);
          setLevels((current) => [...current.slice(-47), level]);
        }
        if (now - startedAtRef.current >= CHAT_VOICE_MAX_SECONDS * 1000) {
          recorder.stop();
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      startedAtRef.current = Date.now();
      recorder.start(250);
      setState("recording");
      frameRef.current = requestAnimationFrame(tick);
      return null;
    } catch {
      cleanup();
      const message = "Allow the microphone to record a voice message.";
      setError(message);
      setState("error");
      return message;
    }
  }, [cleanup]);

  /** Stops and returns the recording (null if cancelled or too short). */
  const stop = useCallback(
    () =>
      new Promise<VoiceRecording | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        resolveRef.current = resolve;
        recorder.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else cleanup();
  }, [cleanup]);

  return { state, elapsedMs, levels, error, start, stop, cancel };
}
