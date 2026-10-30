import { readLampSoundMuted } from "../guest/lampSwitchSound";

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

/** A burst of noise that dies away, the faster the higher `sharpness` is. */
function createNoiseBurst(
  context: AudioContext,
  seconds: number,
  sharpness: number,
) {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      (Math.random() * 2 - 1) * (1 - index / samples.length) ** sharpness;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

/** Noise through a band of its own, at a loudness of its own. */
function playNoise(
  context: AudioContext,
  output: AudioNode,
  at: number,
  {
    seconds,
    sharpness,
    frequency,
    q,
    gain,
  }: {
    seconds: number;
    sharpness: number;
    frequency: number;
    q: number;
    gain: number;
  },
) {
  const noise = createNoiseBurst(context, seconds, sharpness);
  const tone = context.createBiquadFilter();
  tone.type = "bandpass";
  tone.frequency.value = frequency;
  tone.Q.value = q;
  const level = context.createGain();
  level.gain.value = gain;
  noise.connect(tone).connect(level).connect(output);
  noise.start(at);
}

/** A short falling tone: the body of the keyboard taking the blow. */
function playThump(
  context: AudioContext,
  output: AudioNode,
  at: number,
  {
    from,
    to,
    seconds,
    gain,
  }: { from: number; to: number; seconds: number; gain: number },
) {
  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(from, at);
  thump.frequency.exponentialRampToValueAtTime(to, at + seconds * 0.8);
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  thump.connect(level).connect(output);
  thump.start(at);
  thump.stop(at + seconds + 0.01);
}

/**
 * The Enter key of a mechanical keyboard, made in the browser rather than
 * loaded as a file.
 *
 * Going down, the switch clicks, the key bottoms out with a deep knock (the
 * "thock" of a large key on a heavy board) and the wire that steadies a key
 * this wide rattles a moment after. Coming back up it only ticks against
 * the top of its housing, higher and quieter.
 */
function playKeyStroke(context: AudioContext, stroke: "down" | "up") {
  const now = context.currentTime;
  const output = context.createGain();
  output.gain.value = 0.55;
  output.connect(context.destination);

  if (stroke === "up") {
    playNoise(context, output, now, {
      seconds: 0.02,
      sharpness: 3,
      frequency: 2900,
      q: 1.3,
      gain: 0.3,
    });
    playThump(context, output, now, {
      from: 240,
      to: 130,
      seconds: 0.04,
      gain: 0.1,
    });
    return;
  }

  // The switch's click.
  playNoise(context, output, now, {
    seconds: 0.014,
    sharpness: 4,
    frequency: 2300,
    q: 1.2,
    gain: 0.5,
  });
  // The key bottoming out.
  playNoise(context, output, now + 0.006, {
    seconds: 0.05,
    sharpness: 3,
    frequency: 340,
    q: 2.4,
    gain: 0.9,
  });
  playThump(context, output, now + 0.006, {
    from: 150,
    to: 62,
    seconds: 0.075,
    gain: 0.42,
  });
  // The stabiliser's rattle.
  playNoise(context, output, now + 0.02, {
    seconds: 0.012,
    sharpness: 4,
    frequency: 3300,
    q: 1.6,
    gain: 0.14,
  });
}

/**
 * Gets the sound ready before the key is pressed. Starting the browser's
 * audio takes a long moment (some 90ms), and done at the press it held the
 * lesson's opening back by that much. Called when the pointer comes over
 * the key's row or the key takes the focus; the audio is only started at
 * the press.
 */
export function prepareEnterKeySound() {
  if (audioContext || readLampSoundMuted()) return;
  try {
    getAudioContext();
  } catch {
    // Made at the press instead.
  }
}

/**
 * Plays the Enter key going down or coming back up. It keeps to the mute of
 * the hero's other sounds (the lamp's switch), and is silent where audio is
 * unavailable. It must be called from the press itself, which is what lets
 * a browser play sound.
 */
export function playEnterKeySound(stroke: "down" | "up") {
  if (readLampSoundMuted()) return;
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => playKeyStroke(context, stroke))
        .catch(() => undefined);
      return;
    }
    playKeyStroke(context, stroke);
  } catch {
    // The key still works without its sound.
  }
}
