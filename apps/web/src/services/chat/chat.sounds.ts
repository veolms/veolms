/**
 * Chat's two sounds, made on the spot (no sound file to load): a soft
 * two-note chime for a new message (Settings › Notifications › New message
 * sound) and a short pop when your message is sent (Sent message sound).
 */

const SOUND_GAP_MS = 2_000;
let lastChimeAt = 0;
let audio: AudioContext | null = null;

function tones(notes: readonly { freq: number; at: number; peak: number }[]) {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const note of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.0001, now + note.at);
      gain.gain.exponentialRampToValueAtTime(note.peak, now + note.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + note.at);
      osc.stop(now + note.at + 0.25);
    }
  } catch {
    // No sound before the page has been interacted with, or no audio.
  }
}

/** A new message: two soft notes, at most once every 2 seconds. */
export function chime() {
  if (Date.now() - lastChimeAt < SOUND_GAP_MS) return;
  lastChimeAt = Date.now();
  tones([
    { freq: 880, at: 0, peak: 0.08 },
    { freq: 1320, at: 0.09, peak: 0.08 },
  ]);
}

/** Your message was sent: one quiet, short, rising pop. */
export function sentPop() {
  tones([{ freq: 660, at: 0, peak: 0.05 }]);
}
