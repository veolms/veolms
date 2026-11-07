/**
 * The sound of a firework from the sidebar's fountain, made in the browser
 * with the Web Audio API (no sound files to download): a launch whoosh and
 * a rising whistle (or, for some rockets, only the fuse's hiss) while it
 * climbs, then a crack and a deep boom with a faint echo where it bursts.
 * Each kind of burst sounds its own way (`BurstSound`): louder or softer,
 * deeper or brighter, a double bang, crackling pops, a long sizzle.
 *
 * The boom is low noise, never a tone: a tone falling in pitch is how a
 * drum sounds, and that is what an earlier version sounded like.
 *
 * The audio context is made on the first press, inside that gesture, as
 * browsers require. Sounds are scheduled on the audio clock, so the boom
 * lands exactly when the burst opens on screen.
 */

let context: AudioContext | null = null;
let output: AudioNode | null = null;
let noise: AudioBuffer | null = null;
let wobble: AudioBuffer | null = null;

/**
 * A slow random wander between -1 and 1 (a new point every ~25 ms, eased
 * between), for the unsteadiness of a burning fuse: a real rocket whistle
 * never holds its pitch or its loudness the way an oscillator does.
 */
function makeWobble(ctx: AudioContext) {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  const step = Math.round(ctx.sampleRate * 0.025);
  let from = Math.random() * 2 - 1;
  let to = Math.random() * 2 - 1;
  for (let index = 0; index < length; index++) {
    const phase = (index % step) / step;
    if (phase === 0 && index > 0) {
      from = to;
      to = Math.random() * 2 - 1;
    }
    samples[index] = from + (to - from) * (0.5 - Math.cos(phase * Math.PI) / 2);
  }
  return buffer;
}

function getAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }
  if (!context) {
    context = new AudioContext();

    // Keeps several overlapping booms from clipping.
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    const master = context.createGain();
    master.gain.value = 0.7;
    compressor.connect(master).connect(context.destination);

    // A faint echo, as off buildings around an open sky. Only the middle
    // of the sound echoes: a repeated low end comes back as a drum beat.
    const echo = context.createDelay(1);
    echo.delayTime.value = 0.3;
    const echoLow = context.createBiquadFilter();
    echoLow.type = "highpass";
    echoLow.frequency.value = 450;
    const echoTone = context.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 2200;
    const echoFeedback = context.createGain();
    echoFeedback.gain.value = 0.18;
    const input = context.createGain();
    input.connect(compressor);
    input.connect(echoLow).connect(echo);
    echo.connect(echoTone).connect(echoFeedback).connect(echo);
    echoTone.connect(compressor);
    output = input;

    const length = context.sampleRate * 3;
    noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < length; index++) {
      samples[index] = Math.random() * 2 - 1;
    }
    wobble = makeWobble(context);
  }
  if (context.state === "suspended") void context.resume();
  return { ctx: context, out: output!, noise: noise!, wobble: wobble! };
}

type Audio = NonNullable<ReturnType<typeof getAudio>>;

function noiseSource({ ctx, noise }: Audio, at: number, duration: number) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  // A different stretch of the noise each time, so no two sound alike.
  source.start(
    at,
    Math.random() * (noise.duration - duration - 0.05),
    duration,
  );
  return source;
}

function envelope(
  ctx: AudioContext,
  at: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return gain;
}

/** A stretch of `wobble`, scaled by `depth`, to modulate a parameter. */
function wobbleSource(
  { ctx, wobble }: Audio,
  at: number,
  duration: number,
  depth: number,
  rate = 1,
) {
  const source = ctx.createBufferSource();
  source.buffer = wobble;
  source.playbackRate.value = rate;
  const scale = ctx.createGain();
  scale.gain.value = depth;
  source.connect(scale);
  source.start(at, Math.random() * (wobble.duration - duration * rate - 0.05));
  source.stop(at + duration);
  return scale;
}

/**
 * The launch, as a real rocket sounds: a sputter as the fuse catches, a
 * rushing roar of burning powder, and (for most rockets) the whistle.
 *
 * A firework whistle is gas rushing through a tube, so it is made here the
 * same way: noise through very narrow resonances, which gives the breathy,
 * slightly rough tone of the real thing. Its pitch swoops up as the rocket
 * leaves and keeps climbing; pitch and loudness waver as the powder burns
 * unevenly; and as the rocket gets further away it grows fainter and duller
 * and its pitch sags a little, so it sounds like it is going up, not past.
 */
function playWhistle(
  audio: Audio,
  pan: StereoPannerNode,
  seconds: number,
  whistles: boolean,
) {
  const { ctx } = audio;
  const now = ctx.currentTime;
  const end = now + seconds;

  // Distance: everything from the rocket fades and dulls as it climbs.
  const distance = ctx.createBiquadFilter();
  distance.type = "lowpass";
  distance.frequency.setValueAtTime(12000, now);
  distance.frequency.exponentialRampToValueAtTime(3800, end);
  const distanceGain = ctx.createGain();
  distanceGain.gain.setValueAtTime(1, now);
  distanceGain.gain.linearRampToValueAtTime(0.45, end);
  distance.connect(distanceGain).connect(pan);

  // Ignition: a few crackling spits as the fuse catches.
  for (let index = 0; index < 7; index++) {
    const when = now + Math.random() * 0.12;
    const spit = noiseSource(audio, when, 0.02);
    const spitTone = ctx.createBiquadFilter();
    spitTone.type = "bandpass";
    spitTone.Q.value = 1.5;
    spitTone.frequency.value = 1500 + Math.random() * 3500;
    spit
      .connect(spitTone)
      .connect(envelope(ctx, when, 0.1 + Math.random() * 0.15, 0.001, 0.018))
      .connect(distance);
  }

  // Roar: the rush of burning powder, strongest as it leaves, unsteady.
  const roar = noiseSource(audio, now, seconds);
  const roarTone = ctx.createBiquadFilter();
  roarTone.type = "bandpass";
  roarTone.Q.value = 0.55;
  roarTone.frequency.setValueAtTime(700, now);
  roarTone.frequency.exponentialRampToValueAtTime(
    whistles ? 2200 : 3200,
    now + 0.25,
  );
  const roarGain = ctx.createGain();
  const roarPeak = whistles ? 0.16 : 0.32;
  roarGain.gain.setValueAtTime(0.0001, now);
  roarGain.gain.exponentialRampToValueAtTime(roarPeak, now + 0.04);
  roarGain.gain.exponentialRampToValueAtTime(roarPeak * 0.45, now + 0.3);
  roarGain.gain.exponentialRampToValueAtTime(0.0001, end);
  const roarFlutter = ctx.createGain();
  roarFlutter.gain.value = 1;
  wobbleSource(audio, now, seconds, 0.35, 2.4).connect(roarFlutter.gain);
  roar
    .connect(roarTone)
    .connect(roarGain)
    .connect(roarFlutter)
    .connect(distance);
  if (!whistles) return;

  // Whistle pitch: a fast swoop up, a slow climb, a small sag at the top.
  const low = 650 + Math.random() * 200;
  const high = 1700 + Math.random() * 500;
  const peak = high * (1.18 + Math.random() * 0.1);
  const sagAt = now + seconds * 0.82;
  const pitch = (param: AudioParam, multiple: number) => {
    param.setValueAtTime(low * multiple, now);
    param.exponentialRampToValueAtTime(high * multiple, now + 0.16);
    param.exponentialRampToValueAtTime(peak * multiple, sagAt);
    param.exponentialRampToValueAtTime(peak * 0.93 * multiple, end);
  };

  const whistleGain = ctx.createGain();
  whistleGain.gain.setValueAtTime(0.0001, now);
  whistleGain.gain.exponentialRampToValueAtTime(1, now + 0.06);
  whistleGain.gain.setValueAtTime(1, end - 0.12);
  whistleGain.gain.exponentialRampToValueAtTime(0.0001, end);
  // Loudness wavers as the powder burns.
  const flutter = ctx.createGain();
  flutter.gain.value = 1;
  wobbleSource(audio, now, seconds, 0.3, 1.6).connect(flutter.gain);
  whistleGain.connect(flutter).connect(distance);

  // The pitch wavers too, a few percent, shared by every part.
  const jitter = wobbleSource(audio, now, seconds, high * 0.035, 1.2);

  // The breathy tone: noise through narrow resonances at the pitch and its
  // first overtones, plus a little pure tone to give it its centre.
  for (const [multiple, q, level] of [
    [1, 34, 5.5],
    [2, 30, 1.6],
    [3, 26, 0.6],
  ] as const) {
    const air = noiseSource(audio, now, seconds);
    const resonance = ctx.createBiquadFilter();
    resonance.type = "bandpass";
    resonance.Q.value = q;
    pitch(resonance.frequency, multiple);
    const follow = ctx.createGain();
    follow.gain.value = multiple;
    jitter.connect(follow).connect(resonance.frequency);
    const airLevel = ctx.createGain();
    airLevel.gain.value = level * 0.1;
    air.connect(resonance).connect(airLevel).connect(whistleGain);
  }
  const core = ctx.createOscillator();
  core.type = "sine";
  pitch(core.frequency, 1);
  jitter.connect(core.frequency);
  const coreLevel = ctx.createGain();
  coreLevel.gain.value = 0.035;
  core.connect(coreLevel).connect(whistleGain);
  core.start(now);
  core.stop(end + 0.05);
}

/**
 * How a kind of burst sounds. `loudness` around 1; `depth` is how bright
 * the boom starts (lower is deeper, ~700-1800 Hz); `bangs` 2 for a double
 * bang; `crackle` for popping stars; `sizzle` (0-1) for a glittering hiss
 * as the trails fall.
 */
export interface BurstSound {
  loudness: number;
  depth: number;
  bangs?: 1 | 2;
  crackle?: boolean;
  sizzle?: number;
}

/**
 * One bang: a sharp crack, then the boom, low noise that sinks deeper as it
 * fades. `size` scales it.
 */
function playBang(
  audio: Audio,
  pan: StereoPannerNode,
  at: number,
  size: number,
  depth: number,
) {
  const { ctx } = audio;

  // Crack: the first sharp edge of the explosion.
  const crack = noiseSource(audio, at, 0.08);
  const crackTone = ctx.createBiquadFilter();
  crackTone.type = "highpass";
  crackTone.frequency.value = 1500;
  crack
    .connect(crackTone)
    .connect(envelope(ctx, at, 0.4 * size, 0.002, 0.06))
    .connect(pan);

  // Boom: noise, darkening as it fades, with its low end raised.
  const boomLength = 1.4 + 0.8 * size;
  const boom = noiseSource(audio, at, boomLength + 0.1);
  const boomTone = ctx.createBiquadFilter();
  boomTone.type = "lowpass";
  boomTone.Q.value = 0.7;
  boomTone.frequency.setValueAtTime(depth, at);
  boomTone.frequency.exponentialRampToValueAtTime(110, at + boomLength * 0.7);
  const weight = ctx.createBiquadFilter();
  weight.type = "lowshelf";
  weight.frequency.value = 160;
  weight.gain.value = 10;
  boom
    .connect(boomTone)
    .connect(weight)
    .connect(envelope(ctx, at, 0.75 * size, 0.004, boomLength))
    .connect(pan);

  // Weight: the deepest part, also noise (a tone here sounds like a drum),
  // short, so it is felt as the push of the blast and gone.
  const sub = noiseSource(audio, at, 0.6);
  const subTone = ctx.createBiquadFilter();
  subTone.type = "lowpass";
  subTone.Q.value = 0.5;
  subTone.frequency.value = 140;
  sub
    .connect(subTone)
    .connect(envelope(ctx, at, 1.3 * size, 0.008, 0.5))
    .connect(pan);
}

/** A glittering hiss, fluttering as the trails fall and fade. */
function playSizzle(
  audio: Audio,
  pan: StereoPannerNode,
  at: number,
  amount: number,
) {
  const { ctx } = audio;
  const start = at + 0.15;
  const length = 1.6 + amount;
  const sizzle = noiseSource(audio, start, length);
  const sizzleTone = ctx.createBiquadFilter();
  sizzleTone.type = "highpass";
  sizzleTone.frequency.value = 4500;
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const flutterRate = ctx.createOscillator();
  flutterRate.frequency.value = 13 + Math.random() * 6;
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = 0.4;
  flutterRate.connect(flutterDepth).connect(flutter.gain);
  flutterRate.start(start);
  flutterRate.stop(start + length);
  sizzle
    .connect(sizzleTone)
    .connect(flutter)
    .connect(envelope(ctx, start, 0.09 * amount, 0.25, length - 0.25))
    .connect(pan);
}

/** Crackling stars: small pops scattered through the fading burst. */
function playCrackle(audio: Audio, pan: StereoPannerNode, at: number) {
  const { ctx } = audio;
  for (let index = 0; index < 34; index++) {
    const when = at + 0.25 + Math.random() * 1.2;
    const pop = noiseSource(audio, when, 0.03);
    const popTone = ctx.createBiquadFilter();
    popTone.type = "bandpass";
    popTone.Q.value = 2;
    popTone.frequency.value = 2500 + Math.random() * 4000;
    pop
      .connect(popTone)
      .connect(envelope(ctx, when, 0.12 + Math.random() * 0.2, 0.001, 0.025))
      .connect(pan);
  }
}

/**
 * Plays a whole shot: the whistle now, the burst `riseSeconds` later.
 * `position` is where it climbs, from -1 (left) to 1 (right).
 */
export function playFireworkSound({
  riseSeconds,
  position,
  power,
  burst,
}: {
  riseSeconds: number;
  position: number;
  /** 0 to 1: a stronger shot bangs louder. */
  power: number;
  burst: BurstSound;
}) {
  const audio = getAudio();
  if (!audio) return;
  const { ctx, out } = audio;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, position));
  pan.connect(out);

  // Most rockets whistle; some only hiss.
  playWhistle(audio, pan, riseSeconds, Math.random() < 0.7);
  const burstAt = ctx.currentTime + riseSeconds;
  const size =
    burst.loudness * (0.88 + Math.random() * 0.24) * (1 + 0.25 * power);
  playBang(audio, pan, burstAt, size, burst.depth);
  if (burst.bangs === 2) {
    const second = burstAt + 0.2 + Math.random() * 0.08;
    playBang(audio, pan, second, size * 0.75, burst.depth * 1.2);
  }
  if (burst.crackle) playCrackle(audio, pan, burstAt);
  if (burst.sizzle) playSizzle(audio, pan, burstAt, burst.sizzle);

  // Let go of the panner once the tail has faded.
  window.setTimeout(() => pan.disconnect(), (riseSeconds + 4) * 1000);
}
