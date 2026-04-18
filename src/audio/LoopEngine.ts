import * as Tone from 'tone';
import type { MusicStyle } from '../store/useMixerStore';
import { STYLE_CONFIG } from './patterns';

type NoteEvent = [number, string, string, number]; // [step, note, duration, velocity]
type HitEvent = [number, number]; // [step, velocity]

interface LoopSet {
  rhythmA: Tone.ToneAudioBuffer;
  rhythmB: Tone.ToneAudioBuffer;
  melody: Tone.ToneAudioBuffer;
  atmosphere: Tone.ToneAudioBuffer;
  bpm: number;
  duration: number;
}

// ── Pattern Helpers ──

function scheduleSynth(
  synth: { triggerAttackRelease: (n: string, d: Tone.Unit.Time, t: number, v: number) => void },
  events: NoteEvent[],
  sixteenth: number,
  bars: number
) {
  for (let bar = 0; bar < bars; bar++) {
    events.forEach(([step, note, dur, vel]) => {
      const t = (bar * 16 + step) * sixteenth;
      synth.triggerAttackRelease(note, dur, t, vel * (0.9 + Math.random() * 0.2));
    });
  }
}

function scheduleHits(
  synth: { triggerAttackRelease: (d: Tone.Unit.Time, t: number, v?: number) => void },
  events: HitEvent[],
  dur: Tone.Unit.Time,
  sixteenth: number,
  bars: number
) {
  for (let bar = 0; bar < bars; bar++) {
    events.forEach(([step, vel]) => {
      const t = (bar * 16 + step) * sixteenth;
      synth.triggerAttackRelease(dur, t, vel * (0.85 + Math.random() * 0.3));
    });
  }
}

function scheduleKick(
  synth: { triggerAttackRelease: (n: string, d: Tone.Unit.Time, t: number, v?: number) => void },
  events: HitEvent[],
  note: string,
  dur: Tone.Unit.Time,
  sixteenth: number,
  bars: number
) {
  for (let bar = 0; bar < bars; bar++) {
    events.forEach(([step, vel]) => {
      const t = (bar * 16 + step) * sixteenth;
      synth.triggerAttackRelease(note, dur, t, vel * (0.9 + Math.random() * 0.2));
    });
  }
}

// ═══════════════════════════════════════════════
// LOOP ENGINE
// ═══════════════════════════════════════════════

export class LoopEngine {
  private loops = new Map<MusicStyle, LoopSet>();
  private rhythmPlayer: Tone.Player | null = null;
  private melodyPlayer: Tone.Player | null = null;
  private atmospherePlayer: Tone.Player | null = null;

  private rhythmChannel: Tone.Channel;
  private melodyChannel: Tone.Channel;
  private atmosphereChannel: Tone.Channel;
  // Sidechain bus — melody + atmosphere route through here so the kick can
  // rhythmically duck them (the classic "pumping" modern sound).
  private sidechainGain: Tone.Gain;
  private sidechainDepth = 0.35; // 0 = no duck, 1 = full silence

  private currentStyle: MusicStyle = 'Groove';
  private currentVariation = 0;
  private photoCount = 0;
  private isPlayingGroovePulse = false;
  private groovePulseBuffer: Tone.ToneAudioBuffer | null = null;

  public isLoaded = false;
  private styleReady = new Map<MusicStyle, Promise<void>>();
  private styleResolvers = new Map<MusicStyle, () => void>();
  private groovePulseReady: Promise<void> | null = null;

  constructor(output: Tone.InputNode) {
    // Rhythm goes straight to the output (don't duck itself).
    this.rhythmChannel = new Tone.Channel(-2, 0).connect(output as unknown as Tone.ToneAudioNode);
    // Sidechain bus for melody + atmosphere.
    this.sidechainGain = new Tone.Gain(1).connect(output as unknown as Tone.ToneAudioNode);
    this.melodyChannel = new Tone.Channel(-6, 0).connect(this.sidechainGain);
    this.atmosphereChannel = new Tone.Channel(-6, 0).connect(this.sidechainGain);
    // Start the MP3 fetch eagerly — it's cheap and independent of offline rendering.
    this.groovePulseReady = this.loadGroovePulse();
  }

  /** Configure how deep the sidechain duck is (0..1). */
  setSidechainDepth(depth: number) {
    this.sidechainDepth = Math.min(1, Math.max(0, depth));
  }

  /** Schedule one pump of the sidechain envelope at `time`.
   *  The gain dips to `1 - depth` instantly, then rises back to 1 by `release`. */
  triggerDuck(time: number, attack = 0.005, release = 0.25) {
    const depth = this.sidechainDepth;
    if (depth <= 0.001) return;
    const g = this.sidechainGain.gain;
    const floor = Math.max(0.0001, 1 - depth);
    // Quick dip then exponential recovery.
    g.cancelScheduledValues(time);
    g.setValueAtTime(1, time);
    g.linearRampToValueAtTime(floor, time + attack);
    g.exponentialRampToValueAtTime(1, time + attack + release);
  }

  private ensureStyleReady(style: MusicStyle) {
    if (!this.styleReady.has(style)) {
      this.styleReady.set(style, new Promise<void>((res) => this.styleResolvers.set(style, res)));
    }
  }

  /** Render a single style's buffers. Safe to call repeatedly (no-op if cached). */
  async generateStyle(style: MusicStyle) {
    this.ensureStyleReady(style);
    if (this.loops.has(style)) {
      this.styleResolvers.get(style)?.();
      return;
    }
    const bpm = STYLE_CONFIG[style].bpm;
    const sixteenth = 60 / bpm / 4;
    const bars = 4;
    const duration = bars * 4 * (60 / bpm);

    // Sequential rendering: Tone.Offline temporarily swaps the global audio
    // context, so parallel calls via Promise.all corrupt the context chain.
    const rhythmA = await this.renderRhythm(style, 'A', sixteenth, bars, duration);
    const rhythmB = await this.renderRhythm(style, 'B', sixteenth, bars, duration);
    const melody = await this.renderMelody(style, sixteenth, bars, duration);
    const atmosphere = await this.renderAtmosphere(style, sixteenth, bars, duration);

    this.loops.set(style, { rhythmA, rhythmB, melody, atmosphere, bpm, duration });
    this.styleResolvers.get(style)?.();
    if (!this.isLoaded) this.isLoaded = true;
  }

  /** Resolves when `style` has its buffers ready (creates a pending promise if not started yet). */
  whenStyleReady(style: MusicStyle): Promise<void> {
    this.ensureStyleReady(style);
    return this.styleReady.get(style)!;
  }

  /** Resolves when the 1-photo groove pulse loop is loaded. */
  whenGroovePulseReady(): Promise<void> {
    return this.groovePulseReady ?? Promise.resolve();
  }

  private loadGroovePulse(): Promise<void> {
    return new Promise((resolve) => {
      this.groovePulseBuffer = new Tone.ToneAudioBuffer(
        '/audio/groove-loop.mp3',
        () => resolve(),
        (err) => { console.warn('Failed to load groove loop:', err); resolve(); }
      );
    });
  }

  setStyle(style: MusicStyle) {
    const changed = this.currentStyle !== style;
    this.currentStyle = style;
    if (changed && this.isLoaded) this.restartAll();
  }

  setBpm(bpm: number) {
    const renderedBpm = this.loops.get(this.currentStyle)?.bpm;
    if (this.isPlayingGroovePulse && this.rhythmPlayer) {
      this.rhythmPlayer.playbackRate = bpm / 109;
    } else if (renderedBpm && this.rhythmPlayer) {
      this.rhythmPlayer.playbackRate = bpm / renderedBpm;
    }
    if (renderedBpm && this.melodyPlayer) {
      this.melodyPlayer.playbackRate = bpm / renderedBpm;
    }
    if (renderedBpm && this.atmospherePlayer) {
      this.atmospherePlayer.playbackRate = bpm / renderedBpm;
    }
  }

  updateFromPhotos(
    photos: { hue: number; brightness: number; x?: number; y?: number; width?: number; height?: number }[],
    canvasWidth = 800,
    canvasHeight = 500
  ) {
    this.photoCount = photos.length;
    if (!this.isLoaded) return;
    if (photos.length === 0) {
      this.stopAll();
      return;
    }

    const avgHue = photos.reduce((s, p) => s + p.hue, 0) / photos.length;
    const avgBright = photos.reduce((s, p) => s + p.brightness, 0) / photos.length;

    // Aggregate size: how much of the canvas is covered (0..1, clamped).
    const canvasArea = Math.max(1, canvasWidth * canvasHeight);
    const coverage = Math.min(
      1,
      photos.reduce((s, p) => s + ((p.width || 0) * (p.height || 0)), 0) / canvasArea
    );
    // Size factor per-photo average (0..1).
    const avgSize = photos.reduce((s, p) => {
      const refArea = Math.max(canvasArea * 0.08, 20000);
      const a = (p.width || 0) * (p.height || 0);
      return s + Math.min(1, a / refArea);
    }, 0) / photos.length;

    // Average horizontal position → overall stereo bias for the loop bed.
    const avgNormX = photos.reduce((s, p) => {
      const cx = (p.x || 0) + (p.width || 0) / 2;
      return s + Math.min(1, Math.max(0, cx / Math.max(1, canvasWidth)));
    }, 0) / photos.length;
    const pan = avgNormX * 2 - 1; // -1 left .. +1 right
    this.rhythmChannel.pan.rampTo(pan * 0.6, 0.3);
    this.melodyChannel.pan.rampTo(pan * 0.4, 0.3);
    // Atmosphere stays mostly centered for stability.

    const newVar = avgHue > 180 ? 1 : 0;
    if (newVar !== this.currentVariation) {
      this.currentVariation = newVar;
      if (photos.length >= 2) this.startRhythm();
    }

    // Always play atmosphere
    if (!this.atmospherePlayer) this.startAtmosphere();

    // 1 photo + Groove: play the downloaded funk groove loop
    if (photos.length === 1 && this.currentStyle === 'Groove') {
      if (!this.isPlayingGroovePulse) this.startGroovePulse();
      // Louder when the photo is bigger.
      this.rhythmChannel.volume.rampTo(-6 + avgSize * 6, 0.3);
    } else if (photos.length >= 2) {
      if (!this.rhythmPlayer || this.isPlayingGroovePulse) this.startRhythm();
      // Base volume from count, boosted by average photo size (up to +5 dB).
      const rVol = Math.min(-1, -10 + photos.length * 1.5 + avgSize * 5);
      this.rhythmChannel.volume.rampTo(rVol, 0.3);
    } else {
      this.stopRhythm();
    }

    // 3+ photos: melody; bigger photos → louder melody.
    if (photos.length >= 3) {
      if (!this.melodyPlayer) this.startMelody();
      const mVol = Math.min(-2, -10 + (photos.length - 2) * 2 + avgSize * 4);
      this.melodyChannel.volume.rampTo(mVol, 0.3);
    } else {
      this.stopMelody();
    }

    // Atmosphere volume reflects brightness AND how much the photos fill the canvas.
    const brightFactor = avgBright / 255;
    const atmoVol = -12 + brightFactor * 5 + coverage * 4;
    this.atmosphereChannel.volume.rampTo(atmoVol, 0.5);
  }

  stopAll() {
    this.stopRhythm();
    this.stopMelody();
    this.stopAtmosphere();
  }

  // ── Player Management ──

  private restartAll() {
    this.stopAll();
    if (this.photoCount >= 1) this.startAtmosphere();
    if (this.photoCount >= 2) this.startRhythm();
    if (this.photoCount >= 3) this.startMelody();
  }

  private startGroovePulse() {
    this.stopRhythm();
    if (!this.groovePulseBuffer) return;
    this.rhythmPlayer = new Tone.Player(this.groovePulseBuffer);
    this.rhythmPlayer.loop = true;
    this.rhythmPlayer.playbackRate = Tone.Transport.bpm.value / 109;
    this.rhythmPlayer.connect(this.rhythmChannel);
    this.rhythmPlayer.sync().start(0);
    this.isPlayingGroovePulse = true;
  }

  private startRhythm() {
    this.stopRhythm();
    const set = this.loops.get(this.currentStyle);
    if (!set) return;
    const buf = this.currentVariation === 0 ? set.rhythmA : set.rhythmB;
    this.rhythmPlayer = new Tone.Player(buf);
    this.rhythmPlayer.loop = true;
    this.rhythmPlayer.playbackRate = Tone.Transport.bpm.value / set.bpm;
    this.rhythmPlayer.connect(this.rhythmChannel);
    this.rhythmPlayer.sync().start(0);
  }

  private stopRhythm() {
    this.isPlayingGroovePulse = false;
    if (this.rhythmPlayer) {
      this.rhythmPlayer.unsync();
      this.rhythmPlayer.stop();
      this.rhythmPlayer.dispose();
      this.rhythmPlayer = null;
    }
  }

  private startMelody() {
    this.stopMelody();
    const set = this.loops.get(this.currentStyle);
    if (!set) return;
    this.melodyPlayer = new Tone.Player(set.melody);
    this.melodyPlayer.loop = true;
    this.melodyPlayer.playbackRate = Tone.Transport.bpm.value / set.bpm;
    this.melodyPlayer.connect(this.melodyChannel);
    this.melodyPlayer.sync().start(0);
  }

  private stopMelody() {
    if (this.melodyPlayer) {
      this.melodyPlayer.unsync();
      this.melodyPlayer.stop();
      this.melodyPlayer.dispose();
      this.melodyPlayer = null;
    }
  }

  private startAtmosphere() {
    this.stopAtmosphere();
    const set = this.loops.get(this.currentStyle);
    if (!set) return;
    this.atmospherePlayer = new Tone.Player(set.atmosphere);
    this.atmospherePlayer.loop = true;
    this.atmospherePlayer.playbackRate = Tone.Transport.bpm.value / set.bpm;
    this.atmospherePlayer.connect(this.atmosphereChannel);
    this.atmospherePlayer.sync().start(0);
  }

  private stopAtmosphere() {
    if (this.atmospherePlayer) {
      this.atmospherePlayer.unsync();
      this.atmospherePlayer.stop();
      this.atmospherePlayer.dispose();
      this.atmospherePlayer = null;
    }
  }

  // ═══════════════════════════════════════
  // RHYTHM RENDERERS (drums + bass)
  // ═══════════════════════════════════════

  private async renderRhythm(
    style: MusicStyle, variant: 'A' | 'B', sixteenth: number, bars: number, duration: number
  ): Promise<Tone.ToneAudioBuffer> {
    switch (style) {
      case 'Groove': return this.grooveRhythm(variant, sixteenth, bars, duration);
      case 'Lounge': return this.loungeRhythm(variant, sixteenth, bars, duration);
      case 'Upbeat': return this.upbeatRhythm(variant, sixteenth, bars, duration);
      case 'Chill': return this.chillRhythm(variant, sixteenth, bars, duration);
      case 'Dreamy': return this.dreamyRhythm(variant, sixteenth, bars, duration);
    }
  }

  // ── GROOVE: Funky electronic, tight ──
  private grooveRhythm(v: 'A' | 'B', s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const comp = new Tone.Compressor(-16, 4).toDestination();
      const dist = new Tone.Distortion(0.06).connect(comp);
      const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.003, decay: 0.4, sustain: 0, release: 0.2 } }).connect(dist);
      const snr = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.08 } });
      snr.connect(new Tone.Filter(4000, 'bandpass').connect(comp)); snr.volume.value = -3;
      const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.015 } });
      hat.connect(new Tone.Filter(8000, 'highpass').connect(comp)); hat.volume.value = -10;
      const bass = new Tone.MonoSynth({ oscillator: { type: 'square' }, envelope: { attack: 0.003, decay: 0.1, sustain: 0.15, release: 0.2 }, filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.3, baseFrequency: 400, octaves: 3 } }).connect(comp);
      bass.volume.value = -4;

      const kickA: HitEvent[] = [[0,1],[3,.8],[6,.9],[10,1],[12,.85],[15,.7]];
      const kickB: HitEvent[] = [[0,1],[4,.7],[6,.9],[8,.8],[10,1],[14,.75]];
      scheduleKick(kick, v === 'A' ? kickA : kickB, 'C1', '8n', s, bars);
      scheduleHits(snr, [[4,.9],[12,.95]], '16n', s, bars);

      const hatP: HitEvent[] = Array.from({ length: 16 }, (_, i) => [i, i % 4 === 0 ? 0.5 : 0.25]);
      scheduleHits(hat, hatP, '32n', s, bars);

      const bassA: NoteEvent[] = [[0,'E2','16n',.8],[3,'G2','16n',.7],[6,'A2','16n',.85],[10,'E2','16n',.9],[14,'B2','16n',.6]];
      const bassB: NoteEvent[] = [[0,'E2','16n',.85],[2,'G2','16n',.6],[6,'A2','8n',.8],[10,'B2','16n',.75],[13,'E2','16n',.7]];
      scheduleSynth(bass, v === 'A' ? bassA : bassB, s, bars);
    }, dur);
  }

  // ── LOUNGE: Jazz swing, walking bass, brush ride ──
  private loungeRhythm(v: 'A' | 'B', s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1.5).toDestination(); verb.wet.value = 0.25;
      const kick = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 4, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 } }).connect(verb);
      kick.volume.value = -6;
      const ride = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.1, sustain: 0.01, release: 0.08 } });
      ride.connect(new Tone.Filter({ frequency: 6000, type: 'bandpass', Q: 0.8 }).connect(verb)); ride.volume.value = -8;
      const ghost = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.04 } });
      ghost.connect(new Tone.Filter(2000, 'bandpass').connect(verb)); ghost.volume.value = -14;
      const bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.4, sustain: 0.25, release: 0.6 }, filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.3, baseFrequency: 180, octaves: 1.5 } }).connect(verb);
      bass.volume.value = -4;

      scheduleKick(kick, [[0,.5],[10,.35]], 'C1', '4n', s, bars);
      const rideP: HitEvent[] = [[0,.6],[3,.3],[4,.55],[6,.25],[8,.6],[10,.3],[12,.55],[14,.25]];
      scheduleHits(ride, rideP, '16n', s, bars);
      scheduleHits(ghost, [[7,.15],[15,.12]], '32n', s, bars);

      const walkA: NoteEvent[] = [[0,'C2','4n',.7],[4,'E2','4n',.65],[8,'G2','4n',.7],[12,'A2','4n',.6]];
      const walkB: NoteEvent[] = [[0,'D2','4n',.65],[4,'F2','4n',.7],[8,'A2','4n',.65],[12,'B2','4n',.6]];
      scheduleSynth(bass, v === 'A' ? walkA : walkB, s, bars);
    }, dur);
  }

  // ── UPBEAT: Driving pop/rock, four-on-the-floor ──
  private upbeatRhythm(v: 'A' | 'B', s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const comp = new Tone.Compressor(-12, 5).toDestination();
      const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 9, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.25 } }).connect(comp);
      const snr = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 } });
      snr.connect(new Tone.Filter(3500, 'bandpass').connect(comp)); snr.volume.value = -2;
      const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } });
      hat.connect(new Tone.Filter(9000, 'highpass').connect(comp)); hat.volume.value = -8;
      const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.3 }, filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.4, baseFrequency: 300, octaves: 2.5 } }).connect(comp);
      bass.volume.value = -3;

      const kickA: HitEvent[] = [[0,1],[4,.9],[8,1],[12,.9]];
      const kickB: HitEvent[] = [[0,1],[4,.85],[8,1],[10,.7],[12,.9]];
      scheduleKick(kick, v === 'A' ? kickA : kickB, 'D1', '8n', s, bars);
      scheduleHits(snr, [[4,1],[12,.95]], '16n', s, bars);
      const hatP: HitEvent[] = [[0,.5],[2,.35],[4,.5],[6,.35],[8,.5],[10,.35],[12,.5],[14,.35]];
      scheduleHits(hat, hatP, '32n', s, bars);

      const bassA: NoteEvent[] = [[0,'E2','8n',.9],[4,'E2','8n',.75],[8,'G2','8n',.85],[12,'A2','8n',.8]];
      const bassB: NoteEvent[] = [[0,'E2','8n',.85],[2,'E2','16n',.5],[4,'G2','8n',.8],[8,'A2','8n',.85],[12,'B2','8n',.75]];
      scheduleSynth(bass, v === 'A' ? bassA : bassB, s, bars);
    }, dur);
  }

  // ── CHILL: Lo-fi hip hop, mellow groove ──
  private chillRhythm(v: 'A' | 'B', s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const lpf = new Tone.Filter(4000, 'lowpass').toDestination();
      const verb = new Tone.Reverb(0.8).connect(lpf); verb.wet.value = 0.15;
      const kick = new Tone.MembraneSynth({ pitchDecay: 0.07, octaves: 5, oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.35, sustain: 0, release: 0.25 } }).connect(verb);
      kick.volume.value = -3;
      const snr = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.003, decay: 0.12, sustain: 0, release: 0.08 } });
      snr.connect(verb); snr.volume.value = -6;
      const hat = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.03 } });
      hat.connect(new Tone.Filter({ frequency: 5000, type: 'bandpass', Q: 1 }).connect(lpf)); hat.volume.value = -12;
      const bass = new Tone.MonoSynth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.03, decay: 0.3, sustain: 0.2, release: 0.4 }, filterEnvelope: { attack: 0.03, decay: 0.15, sustain: 0.3, baseFrequency: 200, octaves: 2 } }).connect(verb);
      bass.volume.value = -3;

      const kickA: HitEvent[] = [[0,.8],[3,.5],[6,.75],[10,.8],[12,.65]];
      const kickB: HitEvent[] = [[0,.75],[5,.6],[8,.7],[12,.65],[14,.4]];
      scheduleKick(kick, v === 'A' ? kickA : kickB, 'B0', '8n', s, bars);
      scheduleHits(snr, [[4,.6],[7,.3],[10,.5],[14,.55]], '16n', s, bars);
      const hatP: HitEvent[] = [[0,.3],[2,.2],[4,.3],[6,.2],[8,.3],[10,.2],[12,.3],[14,.2]];
      scheduleHits(hat, hatP, '32n', s, bars);

      const bassA: NoteEvent[] = [[0,'C2','4n',.7],[10,'G2','8n',.55]];
      const bassB: NoteEvent[] = [[0,'C2','4n',.65],[6,'Eb2','8n',.5],[10,'G2','8n',.55]];
      scheduleSynth(bass, v === 'A' ? bassA : bassB, s, bars);
    }, dur);
  }

  // ── DREAMY: Minimal, ambient pulse ──
  private dreamyRhythm(v: 'A' | 'B', s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(3).toDestination(); verb.wet.value = 0.5;
      const lpf = new Tone.Filter(1500, 'lowpass').connect(verb);
      const kick = new Tone.MembraneSynth({ pitchDecay: 0.15, octaves: 3, oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.5, sustain: 0, release: 0.4 } }).connect(lpf);
      kick.volume.value = -6;
      const shimmer = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.02, release: 0.15 } });
      shimmer.connect(new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 0.4 }).connect(verb)); shimmer.volume.value = -10;
      const bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.3, decay: 1, sustain: 0.3, release: 1.5 }, filterEnvelope: { attack: 0.2, decay: 0.5, sustain: 0.3, baseFrequency: 80, octaves: 1 } }).connect(verb);
      bass.volume.value = -4;

      const kickA: HitEvent[] = [[0,.45]];
      const kickB: HitEvent[] = [[0,.4],[8,.25]];
      scheduleKick(kick, v === 'A' ? kickA : kickB, 'G0', '4n', s, bars);
      scheduleHits(shimmer, [[0,.3],[8,.2]], '8n', s, bars);

      const bassA: NoteEvent[] = [[0,'C2','1n',.4]];
      const bassB: NoteEvent[] = [[0,'G1','1n',.35]];
      scheduleSynth(bass, v === 'A' ? bassA : bassB, s, bars);
    }, dur);
  }

  // ═══════════════════════════════════════
  // MELODY RENDERERS (lead lines + arps)
  // ═══════════════════════════════════════

  private async renderMelody(
    style: MusicStyle, sixteenth: number, bars: number, duration: number
  ): Promise<Tone.ToneAudioBuffer> {
    switch (style) {
      case 'Groove': return this.grooveMelody(sixteenth, bars, duration);
      case 'Lounge': return this.loungeMelody(sixteenth, bars, duration);
      case 'Upbeat': return this.upbeatMelody(sixteenth, bars, duration);
      case 'Chill': return this.chillMelody(sixteenth, bars, duration);
      case 'Dreamy': return this.dreamyMelody(sixteenth, bars, duration);
    }
  }

  // Groove: Funky syncopated synth riff
  private grooveMelody(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(0.6).toDestination(); verb.wet.value = 0.12;
      const delay = new Tone.FeedbackDelay('8n', 0.15).connect(verb); delay.wet.value = 0.1;
      const lead = new Tone.FMSynth({ harmonicity: 3, modulationIndex: 8, oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.2, release: 0.25 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.15, release: 0.1 } }).connect(delay);
      lead.volume.value = -6;
      const bar1: NoteEvent[] = [[0,'E4','16n',.7],[3,'G4','16n',.6],[6,'A4','8n',.75],[10,'B4','16n',.65],[13,'G4','16n',.55]];
      const bar2: NoteEvent[] = [[0,'A4','16n',.7],[2,'E4','16n',.5],[6,'D4','8n',.7],[10,'E4','16n',.65],[14,'G4','16n',.6]];
      const bar3: NoteEvent[] = [[0,'B4','8n',.75],[4,'A4','16n',.6],[7,'G4','16n',.55],[10,'E4','8n',.7],[14,'D4','16n',.5]];
      const bar4: NoteEvent[] = [[0,'G4','16n',.65],[3,'A4','16n',.6],[6,'B4','8n',.75],[12,'E4','4n',.7]];
      [bar1, bar2, bar3, bar4].forEach((notes, bar) => {
        if (bar < bars) notes.forEach(([step, note, d, vel]) => lead.triggerAttackRelease(note, d, (bar * 16 + step) * s, vel * (0.85 + Math.random() * 0.3)));
      });
    }, dur);
  }

  // Lounge: Smooth jazz lick with vibrato
  private loungeMelody(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(2).toDestination(); verb.wet.value = 0.35;
      const chorus = new Tone.Chorus({ frequency: 2.5, delayTime: 3, depth: 0.3, wet: 0.2 }).connect(verb);
      chorus.start();
      const lead = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.08, decay: 0.3, sustain: 0.5, release: 0.8 } }).connect(chorus);
      lead.volume.value = -5;
      const bar1: NoteEvent[] = [[0,'D4','4n',.55],[6,'F4','8n',.5],[10,'A4','4n',.6]];
      const bar2: NoteEvent[] = [[2,'G4','8n',.5],[6,'B4','4n',.55],[12,'D5','8n',.5]];
      const bar3: NoteEvent[] = [[0,'C5','4n',.6],[6,'E4','8n',.45],[10,'G4','4n',.55]];
      const bar4: NoteEvent[] = [[2,'B4','4n',.5],[8,'A4','8n',.45],[12,'G4','4n',.5]];
      [bar1, bar2, bar3, bar4].forEach((notes, bar) => {
        if (bar < bars) notes.forEach(([step, note, d, vel]) => lead.triggerAttackRelease(note, d, (bar * 16 + step) * s, vel * (0.9 + Math.random() * 0.2)));
      });
    }, dur);
  }

  // Upbeat: Bright catchy hook + arp
  private upbeatMelody(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1.2).toDestination(); verb.wet.value = 0.18;
      const delay = new Tone.FeedbackDelay('8n', 0.2).connect(verb); delay.wet.value = 0.15;
      const lead = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.35, release: 0.3 } }).connect(delay);
      lead.volume.value = -7;
      const arp = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.15 } }).connect(verb);
      arp.volume.value = -10;
      const bar1: NoteEvent[] = [[0,'E4','8n',.7],[4,'G4','8n',.65],[8,'B4','8n',.7],[12,'E5','4n',.75]];
      const bar2: NoteEvent[] = [[0,'D5','8n',.65],[4,'B4','8n',.6],[8,'G4','8n',.65],[12,'A4','4n',.7]];
      const bar3: NoteEvent[] = [[0,'F#4','8n',.65],[4,'A4','8n',.6],[8,'D5','8n',.7],[12,'F#5','4n',.75]];
      const bar4: NoteEvent[] = [[0,'E5','8n',.7],[4,'C#5','8n',.6],[8,'A4','8n',.65],[12,'E4','4n',.6]];
      [bar1, bar2, bar3, bar4].forEach((notes, bar) => {
        if (bar < bars) notes.forEach(([step, note, d, vel]) => lead.triggerAttackRelease(note, d, (bar * 16 + step) * s, vel * (0.9 + Math.random() * 0.2)));
      });
      // 16th note arp underneath
      const arpNotes = ['E4','G4','B4','E5','B4','G4'];
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < 16; step += 2) {
          const n = arpNotes[(bar * 8 + step / 2) % arpNotes.length];
          arp.triggerAttackRelease(n, '16n', (bar * 16 + step) * s, 0.25 + Math.random() * 0.1);
        }
      }
    }, dur);
  }

  // Chill: Lo-fi keys melody, gentle and wistful
  private chillMelody(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const lpf = new Tone.Filter(3500, 'lowpass').toDestination();
      const verb = new Tone.Reverb(1.8).connect(lpf); verb.wet.value = 0.3;
      const lead = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.35, release: 0.6 } }).connect(verb);
      lead.volume.value = -5;
      const bar1: NoteEvent[] = [[0,'E4','4n',.5],[8,'G4','8n',.45],[12,'B4','4n',.55]];
      const bar2: NoteEvent[] = [[4,'A4','4n',.5],[12,'C5','8n',.45]];
      const bar3: NoteEvent[] = [[0,'D4','4n',.5],[6,'F4','8n',.4],[10,'A4','4n',.5]];
      const bar4: NoteEvent[] = [[2,'G4','4n',.45],[10,'E4','4n',.5]];
      [bar1, bar2, bar3, bar4].forEach((notes, bar) => {
        if (bar < bars) notes.forEach(([step, note, d, vel]) => lead.triggerAttackRelease(note, d, (bar * 16 + step) * s, vel * (0.9 + Math.random() * 0.2)));
      });
    }, dur);
  }

  // Dreamy: Ethereal arpeggiated sequence, long tails
  private dreamyMelody(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(5).toDestination(); verb.wet.value = 0.6;
      const delay = new Tone.FeedbackDelay('4n', 0.35).connect(verb); delay.wet.value = 0.3;
      const lead = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.3, decay: 0.8, sustain: 0.4, release: 2 } }).connect(delay);
      lead.volume.value = -4;
      const arpPattern = ['C4','E4','G4','C5','G4','E4','A4','C5','E5','C5','A4','E4','F4','A4','C5','F5'];
      for (let bar = 0; bar < bars; bar++) {
        for (let beat = 0; beat < 4; beat++) {
          const idx = (bar * 4 + beat) % arpPattern.length;
          const t = (bar * 16 + beat * 4) * s;
          lead.triggerAttackRelease(arpPattern[idx], '4n', t, 0.3 + Math.random() * 0.1);
        }
      }
    }, dur);
  }

  // ═══════════════════════════════════════
  // ATMOSPHERE RENDERERS (pads + texture)
  // ═══════════════════════════════════════

  private async renderAtmosphere(
    style: MusicStyle, sixteenth: number, bars: number, duration: number
  ): Promise<Tone.ToneAudioBuffer> {
    switch (style) {
      case 'Groove': return this.grooveAtmo(sixteenth, bars, duration);
      case 'Lounge': return this.loungeAtmo(sixteenth, bars, duration);
      case 'Upbeat': return this.upbeatAtmo(sixteenth, bars, duration);
      case 'Chill': return this.chillAtmo(sixteenth, bars, duration);
      case 'Dreamy': return this.dreamyAtmo(sixteenth, bars, duration);
    }
  }

  // Groove: Rhythmic stab chords + subtle pad, funky pulse
  private grooveAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1).toDestination(); verb.wet.value = 0.2;
      const delay = new Tone.FeedbackDelay('8n', 0.12).connect(verb); delay.wet.value = 0.08;

      // Sustained pad underneath
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.5, release: 1.5 } }).connect(verb);
      pad.volume.value = -12;

      // Rhythmic stab synth — the main groove character
      const stab = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0.02, release: 0.06 } }).connect(delay);
      stab.volume.value = -6;

      const chords = [['E3','G#3','B3','D4'],['A3','C#4','E4','G4']];
      // Stab pattern: offbeat funk scratches
      const stabSteps = [2, 5, 7, 10, 13, 15];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        // Sustained pad per bar
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.3));
        // Stab hits on offbeats
        stabSteps.forEach(step => {
          const vel = step % 4 === 2 ? 0.55 : 0.35;
          ch.forEach(n => stab.triggerAttackRelease(n, '32n', (bar * 16 + step) * s, vel * (0.85 + Math.random() * 0.3)));
        });
      }
    }, dur);
  }

  // Lounge: Rhodes-like comping with gentle swing feel
  private loungeAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(2.5).toDestination(); verb.wet.value = 0.35;
      const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 4, depth: 0.3, wet: 0.2 }).connect(verb);
      chorus.start();

      // Warm sustained pad
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 1.5, decay: 1, sustain: 0.6, release: 2.5 } }).connect(verb);
      pad.volume.value = -10;

      // Rhodes-like comping hits
      const keys = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.15, release: 0.5 } }).connect(chorus);
      keys.volume.value = -5;

      const chords = [['D3','F3','A3','C4'],['G3','B3','D4','F4'],['C3','E3','G3','B3'],['C3','E3','G3','B3']];
      // Syncopated comping: irregular hits like a jazz pianist
      const compSteps = [[0, .5], [6, .35], [10, .4], [14, .3]];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.25));
        compSteps.forEach(([step, vel]) => {
          ch.forEach(n => keys.triggerAttackRelease(n, '8n', (bar * 16 + step) * s, (vel as number) * (0.9 + Math.random() * 0.2)));
        });
      }
    }, dur);
  }

  // Upbeat: Pulsing synth pad with rhythmic sidechain feel
  private upbeatAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1.5).toDestination(); verb.wet.value = 0.2;
      const delay = new Tone.FeedbackDelay('8n', 0.18).connect(verb); delay.wet.value = 0.12;

      // Pulsing pad stabs on 8th notes with varying volume for sidechain feel
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.15, release: 0.25 } }).connect(delay);
      pad.volume.value = -8;
      pad.set({ detune: 8 });

      const chords = [['E3','G3','B3'],['G3','B3','D4'],['D3','F#3','A3'],['A3','C#4','E4']];
      // Pumping 8th notes: downbeats louder (faux sidechain)
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        for (let step = 0; step < 16; step += 2) {
          const isDown = step % 4 === 0;
          const vel = isDown ? 0.15 : 0.35;
          ch.forEach(n => pad.triggerAttackRelease(n, '16n', (bar * 16 + step) * s, vel * (0.9 + Math.random() * 0.2)));
        }
      }
    }, dur);
  }

  // Chill: Lo-fi keys with lazy rhythmic comping + warm pad
  private chillAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const lpf = new Tone.Filter(3000, 'lowpass').toDestination();
      const verb = new Tone.Reverb(2).connect(lpf); verb.wet.value = 0.3;
      const chorus = new Tone.Chorus({ frequency: 0.5, delayTime: 4, depth: 0.4, wet: 0.2 }).connect(verb);
      chorus.start();

      // Warm pad
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 2, decay: 1, sustain: 0.6, release: 2.5 } }).connect(chorus);
      pad.volume.value = -8;

      // Gentle rhythmic keys
      const keys = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.03, decay: 0.35, sustain: 0.1, release: 0.4 } }).connect(verb);
      keys.volume.value = -6;

      const chords = [['C3','E3','G3','B3'],['A3','C4','E4','G4'],['D3','F3','A3','C4'],['G3','B3','D4','F4']];
      // Lazy bossa-style comping
      const compPattern = [[0, .5], [3, .3], [6, .4], [10, .35], [14, .3]];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.3));
        compPattern.forEach(([step, vel]) => {
          ch.forEach(n => keys.triggerAttackRelease(n, '8n', (bar * 16 + step) * s, (vel as number) * (0.85 + Math.random() * 0.3)));
        });
      }
    }, dur);
  }

  // Dreamy: Slow evolving arp + lush reverb pad
  private dreamyAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(6).toDestination(); verb.wet.value = 0.65;
      const delay = new Tone.FeedbackDelay('4n', 0.35).connect(verb); delay.wet.value = 0.25;
      const chorus = new Tone.Chorus({ frequency: 0.3, delayTime: 6, depth: 0.7, wet: 0.4 }).connect(delay);
      chorus.start();

      // Deep pad
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 3, decay: 2, sustain: 0.8, release: 4 } }).connect(chorus);
      pad.volume.value = -6;

      // Slow arp that floats over the pad
      const arp = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.15, decay: 0.5, sustain: 0.3, release: 1.5 } }).connect(delay);
      arp.volume.value = -8;

      const chords = [['C3','G3','C4','E4'],['G3','D4','G4','B4'],['A3','E4','A4','C5'],['F3','C4','F4','A4']];
      const arpNotes = ['E4','G4','C5','G4','A4','E5','A4','F4','C5','A4','F4','C4'];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.25));
        // One arp note per beat (quarter notes)
        for (let beat = 0; beat < 4; beat++) {
          const idx = (bar * 4 + beat) % arpNotes.length;
          arp.triggerAttackRelease(arpNotes[idx], '4n', (bar * 16 + beat * 4) * s, 0.25 + Math.random() * 0.08);
        }
      }
    }, dur);
  }
}
