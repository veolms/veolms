let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

/** F sharp major, spread over three octaves: the chord a Mac starts up on. */
const CHIME_NOTES_HZ = [92.5, 138.59, 185, 233.08, 277.18, 369.99, 554.37];

/**
 * A start-up chime in the manner of a Mac's, made in the browser rather than
 * loaded as a file (the real one is Apple's recording): one sustained major
 * chord, each note a pair of slightly detuned voices under a low-pass filter
 * that closes as the chord dies away.
 *
 * It must be called from the press itself, which is what lets a browser play
 * sound; `delaySeconds` holds the chord back until the logo appears.
 */
export function playLaptopBootSound(delaySeconds = 0) {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => undefined);

  const start = context.currentTime + delaySeconds;
  const length = 2.6;

  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, start);
  output.gain.exponentialRampToValueAtTime(0.2, start + 0.05);
  output.gain.exponentialRampToValueAtTime(0.0001, start + length);
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(2600, start);
  tone.frequency.exponentialRampToValueAtTime(700, start + length);
  tone.connect(output).connect(context.destination);

  CHIME_NOTES_HZ.forEach((frequency, index) => {
    // The low notes carry the chord; the high ones only colour it.
    const level = 1 / (1 + index * 0.55);
    for (const detuneCents of [-5, 5]) {
      const voice = context.createOscillator();
      voice.type = index < 2 ? "sine" : "triangle";
      voice.frequency.value = frequency;
      voice.detune.value = detuneCents;
      const voiceGain = context.createGain();
      voiceGain.gain.value = level * 0.5;
      voice.connect(voiceGain).connect(tone);
      voice.start(start);
      voice.stop(start + length + 0.05);
    }
  });
}
