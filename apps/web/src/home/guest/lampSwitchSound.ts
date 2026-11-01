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

/**
 * The click of a lamp's switch, made in the browser rather than loaded as a
 * file: a short snap of filtered noise for the contact, over a soft thump
 * for the button's travel. Switching on is pitched a little higher than
 * switching off, as a real rocker sounds.
 */
function playSwitchClick(context: AudioContext, turningOn: boolean) {
  const now = context.currentTime;
  const output = context.createGain();
  output.gain.value = 0.5;
  output.connect(context.destination);

  const snapSeconds = 0.03;
  const snapBuffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * snapSeconds),
    context.sampleRate,
  );
  const samples = snapBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    // Noise that dies away quickly: the contact snapping shut.
    samples[index] =
      (Math.random() * 2 - 1) * (1 - index / samples.length) ** 3;
  }
  const snap = context.createBufferSource();
  snap.buffer = snapBuffer;
  const snapTone = context.createBiquadFilter();
  snapTone.type = "bandpass";
  snapTone.frequency.value = turningOn ? 3400 : 2500;
  snapTone.Q.value = 1.4;
  const snapGain = context.createGain();
  snapGain.gain.value = 0.55;
  snap.connect(snapTone).connect(snapGain).connect(output);
  snap.start(now);

  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(turningOn ? 190 : 150, now);
  thump.frequency.exponentialRampToValueAtTime(70, now + 0.05);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.32, now + 0.004);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  thump.connect(thumpGain).connect(output);
  thump.start(now);
  thump.stop(now + 0.07);
}

const MUTED_STORAGE_KEY = "veolms-lamp-sound-muted";

/** Whether the visitor has muted the lamp switch (remembered per browser). */
export function readLampSoundMuted() {
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeLampSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Without storage the choice lasts for this visit only.
  }
}

/** Plays the lamp switch's click. Silent where audio is unavailable. */
export function playLampSwitchSound(turningOn: boolean) {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => playSwitchClick(context, turningOn))
        .catch(() => undefined);
      return;
    }
    playSwitchClick(context, turningOn);
  } catch {
    // The switch still works without its sound.
  }
}
