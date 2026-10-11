import {Injectable, NgZone} from '@angular/core';
import {Celebration} from './motivation';

/** Single-die and two-dice recordings (see assets/sounds/LICENSE.txt). */
const ONE_DIE = [1, 2, 3, 4].map(n => `assets/sounds/die-throw-${n}.wav`);
const TWO_DICE = [1, 2, 3].map(n => `assets/sounds/dice-throw-${n}.wav`);
/** About when a thrown die first reaches the felt, in seconds. */
const LANDING_DELAY = 0.25;
/** The second recording starts this long after the first, so the die seems to tumble to a stop. */
const TUMBLE_GAP = 0.34;
/** The volume slider's top end, as a share of each sound's own level. Halfway keeps the effects in the background. */
const MAX_VOLUME = 0.4;

/** Vibration patterns in milliseconds: buzz, pause, buzz... */
const VIBRATIONS: Record<'land' | 'big-burst' | 'crack', number[]> = {
  'land': [20],
  'big-burst': [30, 60, 30, 60, 90],
  'crack': [220],
};

type AudioContextClass = typeof AudioContext;

/**
 * Dice sounds and vibration. The dice are recordings; the natural 20 chime, natural 1 trombone
 * and badge tick are synthesized. Everything runs outside Angular, so audio callbacks don't
 * trigger change detection.
 */
@Injectable({providedIn: 'root'})
export class SoundService {
  sound = true;
  vibration = true;
  readonly canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private level = 0.5;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private reducedMotion = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;

  constructor(private zone: NgZone) {
    // Lets the iPhone's silent switch mute us, like other "ambient" app sounds (Safari 17+).
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) {
        session.type = 'ambient';
      }
    } catch {
      // Not supported; sounds just ignore the silent switch.
    }
  }

  /** The player's volume, from 0 to 1. */
  set volume(volume: number) {
    this.level = volume;
    if (this.out) {
      this.out.gain.value = volume * MAX_VOLUME;
    }
  }

  /** Call from the click that throws the dice: browsers only start audio from a user gesture. */
  diceThrown(dice: 1 | 2): void {
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const list = dice === 2 ? TWO_DICE : ONE_DIE;
      const first = Math.floor(Math.random() * list.length);
      const second = (first + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      const start = ctx.currentTime + LANDING_DELAY;
      const felt = feltFilter(ctx, this.output(ctx));
      this.play(ctx, felt, list[first], start, 0.95 + Math.random() * 0.1, 1);
      this.play(ctx, felt, list[second], start + TUMBLE_GAP, 0.85, 0.5);
    });
  }

  /** The dice came to rest with this result. */
  landed(celebration: Celebration): void {
    const ctx = this.context();
    if (ctx) {
      this.zone.runOutsideAngular(() => {
        const out = masterGain(ctx, this.output(ctx));
        const at = ctx.currentTime + 0.03;
        if (celebration === 'big-burst') {
          sting(ctx, out, at);
        } else if (celebration === 'crack') {
          trombone(ctx, out, at);
        }
      });
    }
    this.vibrate(celebration === 'big-burst' || celebration === 'crack' ? celebration : 'land');
  }

  /** `delay` (seconds) lets the tick wait for a crit's fanfare to finish. */
  badgeUnlocked(delay = 0): void {
    const ctx = this.context();
    if (ctx) {
      this.zone.runOutsideAngular(() => tick(ctx, masterGain(ctx, this.output(ctx)), ctx.currentTime + 0.03 + delay));
    }
  }

  private vibrate(kind: keyof typeof VIBRATIONS): void {
    if (this.vibration && this.canVibrate && !this.reducedMotion?.matches) {
      try {
        navigator.vibrate(VIBRATIONS[kind]);
      } catch {
        // Some browsers refuse without a recent tap; nothing to do.
      }
    }
  }

  private context(): AudioContext | null {
    if (!this.sound) {
      return null;
    }
    // Older Safari only has the prefixed constructor.
    const w = window as { AudioContext?: AudioContextClass, webkitAudioContext?: AudioContextClass };
    const AudioCtx = w.AudioContext ?? w.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    try {
      const ctx = this.ctx ??= new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      return ctx;
    } catch {
      return null;
    }
  }

  /** The one node every sound ends in, which sets the overall volume. */
  private output(ctx: AudioContext): GainNode {
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.level * MAX_VOLUME;
      this.out.connect(ctx.destination);
    }
    return this.out;
  }

  private buffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then(r => r.arrayBuffer())
        .then(data => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  /** Plays a recording at `at`, or as soon as it has loaded if that's later (only the first throw waits). */
  private play(ctx: AudioContext, out: AudioNode, url: string, at: number, rate: number, gain: number): void {
    void this.buffer(ctx, url).then(buffer => {
      if (!buffer) {
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const level = ctx.createGain();
      level.gain.value = gain;
      src.connect(level).connect(out);
      src.start(Math.max(at, ctx.currentTime));
    });
  }
}

function masterGain(ctx: AudioContext, out: AudioNode, gain = 0.6): GainNode {
  const node = ctx.createGain();
  node.gain.value = gain;
  node.connect(out);
  return node;
}

/** Felt soaks up the highs: a gentle low-pass and a little extra low end. */
function feltFilter(ctx: AudioContext, out: AudioNode): AudioNode {
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3200;
  lowpass.Q.value = 0.5;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'lowshelf';
  shelf.frequency.value = 250;
  shelf.gain.value = 4;
  lowpass.connect(shelf).connect(out);
  return lowpass;
}

function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, at: number, duration: number,
              level: number, attack = 0.01): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** A C major arpeggio up to the octave, a held chord, and a shimmer on top. */
function sting(ctx: AudioContext, out: AudioNode, at: number): void {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, out, 'triangle', f, at + i * 0.075, 0.5, 0.32));
  [1046.5, 1318.5, 1568].forEach(f => tone(ctx, out, 'triangle', f, at + 0.32, 1.1, 0.14, 0.03));
  for (let i = 0; i < 6; i++) {
    tone(ctx, out, 'sine', 2093 * (1 + (i % 3) * 0.25), at + 0.35 + i * 0.07, 0.25, 0.05);
  }
}

/** A low thud for the crack, then a sad trombone: four notes down, the last one wobbling. */
function trombone(ctx: AudioContext, out: AudioNode, at: number): void {
  const thud = ctx.createOscillator();
  thud.frequency.setValueAtTime(110, at);
  thud.frequency.exponentialRampToValueAtTime(45, at + 0.25);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.7, at);
  thudGain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
  thud.connect(thudGain).connect(out);
  thud.start(at);
  thud.stop(at + 0.32);

  let t = at + 0.35;
  for (const [freq, duration] of [[392, 0.32], [369.99, 0.32], [349.23, 0.32], [329.63, 1.1]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    if (duration > 0.5) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(9, t + 0.3);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + duration);
      osc.frequency.linearRampToValueAtTime(freq * 0.94, t + duration);
    }
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 6;
    lowpass.frequency.setValueAtTime(300, t);
    lowpass.frequency.linearRampToValueAtTime(1400, t + 0.08);
    lowpass.frequency.exponentialRampToValueAtTime(380, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.setValueAtTime(0.22, t + duration - 0.06);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(lowpass).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    t += duration + 0.03;
  }
}

/** Two quick high blips. */
function tick(ctx: AudioContext, out: AudioNode, at: number): void {
  tone(ctx, out, 'sine', 1318.5, at, 0.08, 0.3, 0.003);
  tone(ctx, out, 'sine', 1760, at + 0.08, 0.12, 0.3, 0.003);
}
