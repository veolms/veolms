/**
 * The stage's sounds, made with Web Audio (no sound files): a tick for each
 * step, a rising tone before the launch, a deep boom at ignition and a
 * chime when the academy appears. Nothing plays before the visitor's first
 * click (browsers would refuse it anyway), and the mute is remembered.
 */

const MUTE_KEY = "veolms-stage-sound-off";

let context: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) !== "true";
  } catch {
    return true;
  }
}

export function isStageSoundOn(): boolean {
  return enabled;
}

export function setStageSoundOn(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem(MUTE_KEY, on ? "false" : "true");
  } catch {
    // Storage blocked: the choice lasts this visit.
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function envelope(
  a: AudioContext,
  node: AudioNode,
  peak: number,
  at: number,
  duration: number,
): void {
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  node.connect(gain);
  gain.connect(a.destination);
}

function tone(frequencies: number[], gap: number, length: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  frequencies.forEach((frequency, i) => {
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = frequency;
    envelope(a, o, 0.05, t + i * gap, length);
    o.start(t + i * gap);
    o.stop(t + i * gap + length + 0.1);
  });
}

export const stageSound = {
  tick(frequency = 880): void {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = frequency;
    envelope(a, o, 0.06, t, 0.25);
    o.start(t);
    o.stop(t + 0.3);
  },

  riser(duration: number): void {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(720, t + duration);
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(250, t);
    filter.frequency.exponentialRampToValueAtTime(5000, t + duration);
    o.connect(filter);
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + duration * 0.95);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.05);
    filter.connect(gain);
    gain.connect(a.destination);
    o.start(t);
    o.stop(t + duration + 0.1);
  },

  boom(): void {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.4);
    envelope(a, o, 0.45, t, 1.6);
    o.start(t);
    o.stop(t + 1.7);
    const length = a.sampleRate * 1.2;
    const buffer = a.createBuffer(1, length, a.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    noise.connect(filter);
    envelope(a, filter, 0.3, t, 1);
    noise.start(t);
  },

  chime(): void {
    tone([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.09, 2.2);
  },

  chimeShort(): void {
    tone([783.99, 1174.66], 0.08, 1.1);
  },
};
