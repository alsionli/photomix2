import * as Tone from 'tone';
import { getContext, setContext } from 'tone';
import type { MusicStyle } from '../store/useMixerStore';
import { LoopEngine } from './LoopEngine';
import { DrumSampler } from './DrumSampler';
import {
  SCALES,
  CHORD_PROGRESSIONS,
  STYLE_CONFIG,
} from './patterns';

interface PhotoData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hue: number;
  brightness: number;
  contrast: number;
}

export class AudioManager {
  private static instance: AudioManager;

  public isInitialized = false;

  // State
  private currentStyle: MusicStyle = 'Groove';
  private photos: PhotoData[] = [];
  private chordProgressionIndex = 0;
  private currentBar = 0;
  private canvasWidth = 800;
  private canvasHeight = 500;

  // ── Master Chain ──
  private masterChannel: Tone.Channel;
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;

  // ── Loop Engine (background music) ──
  private loopEngine: LoopEngine;

  // ── Drum Sampler (photo-triggered one-shots) ──
  private drumSampler: DrumSampler;
  private triggerChannel: Tone.Channel;

  // ── Photo-triggered synths ──
  public lead: Tone.FMSynth;
  public chords: Tone.PolySynth;
  private leadChannel: Tone.Channel;
  private chordTriggerChannel: Tone.Channel;

  // ── Effects for photo triggers ──
  private triggerReverb: Tone.Reverb;
  private triggerDelay: Tone.FeedbackDelay;

  // Analysis
  public analyser: Tone.Waveform;

  // Loop for photo triggers
  private loop: Tone.Loop | null = null;
  // Sidechain pump — fires every beat to duck melody/atmosphere against kick.
  private sidechainLoop: Tone.Loop | null = null;

  // ── Humanize ──

  private humanizeTime(): number {
    return (Math.random() - 0.5) * 0.02;
  }

  private humanizeVelocity(velocity: number): number {
    return Math.min(1, Math.max(0.05, velocity * (0.85 + Math.random() * 0.3)));
  }

  // ── Constructor ──

  private constructor() {
    // Master: Compressor → Limiter → Destination
    this.masterLimiter = new Tone.Limiter(-1).toDestination();
    this.masterCompressor = new Tone.Compressor({ threshold: -16, ratio: 3, attack: 0.01, release: 0.15, knee: 6 }).connect(this.masterLimiter);
    this.masterChannel = new Tone.Channel(0, 0).connect(this.masterCompressor);

    this.analyser = new Tone.Waveform(1024);
    this.masterChannel.connect(this.analyser);

    // ── Loop Engine (background music through master) ──
    this.loopEngine = new LoopEngine(this.masterChannel as unknown as Tone.InputNode);

    // ── Photo trigger effects ──
    this.triggerReverb = new Tone.Reverb(1.5).connect(this.masterChannel);
    this.triggerReverb.wet.value = 0.25;
    this.triggerDelay = new Tone.FeedbackDelay('8n', 0.2).connect(this.masterChannel);
    this.triggerDelay.wet.value = 0.15;

    // ── Photo trigger channels ──
    this.triggerChannel = new Tone.Channel(-6, 0).connect(this.triggerReverb);
    this.leadChannel = new Tone.Channel(-8, 0).connect(this.triggerDelay);
    this.chordTriggerChannel = new Tone.Channel(-12, 0).connect(this.triggerReverb);

    // ── Drum Sampler for one-shots ──
    this.drumSampler = new DrumSampler(this.triggerChannel as unknown as Tone.InputNode);

    // ── Lead: expressive FM for photo triggers ──
    this.lead = new Tone.FMSynth({
      harmonicity: 2.5,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.15, sustain: 0.5, release: 0.6 },
      modulation: { type: 'triangle' },
      modulationEnvelope: { attack: 0.2, decay: 0.3, sustain: 0.4, release: 0.4 },
    }).connect(this.leadChannel);

    // ── Chords: for photo stab triggers ──
    this.chords = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.04, decay: 0.3, sustain: 0.3, release: 0.6 },
    }).connect(this.chordTriggerChannel);

    // ── Step sequencer for photo-triggered sounds only ──
    this.loop = new Tone.Loop((time) => {
      this.photoTriggerStep(time);
    }, '16n');

    // ── Sidechain pump, runs in lockstep with perceived kick on each beat ──
    this.sidechainLoop = new Tone.Loop((time) => {
      // Skip ducking when no photos are on canvas (silence = nothing to pump).
      if (this.photos.length === 0) return;
      this.loopEngine.triggerDuck(time);
    }, '4n');
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private bufferReady: Promise<void> | null = null;

  /** Pre-generate all offline buffers (no user gesture needed). */
  public warmUp() {
    if (this.bufferReady) return;
    this.bufferReady = this.generateBuffers();
  }

  private async generateBuffers() {
    const mainContext = getContext();
    const allStyles: MusicStyle[] = ['Groove', 'Lounge', 'Upbeat', 'Chill', 'Dreamy'];
    // Render the active style's LoopEngine + DrumSampler first so playback can
    // start as soon as possible. Remaining styles follow in the same sequence.
    const ordered: MusicStyle[] = [
      this.currentStyle,
      ...allStyles.filter(s => s !== this.currentStyle),
    ];
    for (const s of ordered) {
      await this.loopEngine.generateStyle(s);
      await this.drumSampler.generateKitFor(s);
    }
    setContext(mainContext);
    console.log('Audio buffers pre-generated');
  }

  /** Resolves as soon as the active style's buffers exist — not the full set. */
  private async waitForActiveStyle() {
    // Ensure generation has at least started.
    if (!this.bufferReady) {
      this.bufferReady = this.generateBuffers();
    }
    await Promise.all([
      this.loopEngine.whenStyleReady(this.currentStyle),
      this.drumSampler.whenKitReady(this.currentStyle),
      // The 1-photo groove pulse only matters on Groove; loading MP3 is fast.
      this.currentStyle === 'Groove' ? this.loopEngine.whenGroovePulseReady() : Promise.resolve(),
    ]);
  }

  public async initialize() {
    if (this.isInitialized) return;

    // Buffers MUST finish first — Tone.Offline swaps the global audio context,
    // so calling Tone.start() while offline renders are in-flight would resume
    // the wrong (offline) context, leaving the real one suspended = silence.
    await this.waitForActiveStyle();

    // Now safe to start the real audio context (user gesture still valid)
    await Tone.start();

    this.isInitialized = true;
    console.log('Audio Engine Initialized');
    this.loop?.start(0);
    this.sidechainLoop?.start(0);

    this.updateStyle(this.currentStyle);
    if (this.photos.length > 0) {
      this.loopEngine.updateFromPhotos(this.photos, this.canvasWidth, this.canvasHeight);
    }
  }

  public setVolume(db: number) {
    this.masterChannel.volume.rampTo(db, 0.1);
  }

  public setBpm(bpm: number) {
    Tone.Transport.bpm.rampTo(bpm, 1);
    this.loopEngine.setBpm(bpm);
  }

  public togglePlay(isPlaying: boolean) {
    if (isPlaying) {
      if (!this.isInitialized) this.initialize();
      if (Tone.Transport.state !== 'started') Tone.Transport.start();
    } else {
      Tone.Transport.stop();
      this.loopEngine.stopAll();
    }
  }

  public updateStyle(style: MusicStyle) {
    this.currentStyle = style;
    const config = STYLE_CONFIG[style];

    Tone.Transport.bpm.value = config.bpm;
    Tone.Transport.swing = config.swing;
    Tone.Transport.swingSubdivision = '8n';

    // Switch loop engine and drum sampler to new style
    this.loopEngine.setStyle(style);
    this.drumSampler.setStyle(style);

    // If this style's buffers haven't been rendered yet, re-apply once they are
    // so the user isn't stuck in silence.
    Promise.all([
      this.loopEngine.whenStyleReady(style),
      this.drumSampler.whenKitReady(style),
    ]).then(() => {
      if (this.currentStyle !== style) return; // user switched again
      this.loopEngine.setStyle(style);
      if (this.photos.length > 0) {
        this.loopEngine.updateFromPhotos(this.photos, this.canvasWidth, this.canvasHeight);
      }
    });

    // Adjust trigger effects + sidechain depth per style.
    // Depth 0 = no duck; 1 = full silence on each beat.
    switch (style) {
      case 'Groove':
        this.triggerReverb.decay = 0.6;
        this.triggerReverb.wet.value = 0.1;
        this.triggerDelay.wet.value = 0.08;
        this.lead.set({ harmonicity: 4, modulationIndex: 10 });
        this.chords.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0.05, release: 0.1 } });
        this.loopEngine.setSidechainDepth(0.45);
        break;
      case 'Lounge':
        this.triggerReverb.decay = 2.5;
        this.triggerReverb.wet.value = 0.35;
        this.triggerDelay.wet.value = 0.2;
        this.lead.set({ harmonicity: 1.5, modulationIndex: 3 });
        this.chords.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.4, sustain: 0.4, release: 1 } });
        this.loopEngine.setSidechainDepth(0.15);
        break;
      case 'Upbeat':
        this.triggerReverb.decay = 1.2;
        this.triggerReverb.wet.value = 0.15;
        this.triggerDelay.wet.value = 0.12;
        this.lead.set({ harmonicity: 3, modulationIndex: 8 });
        this.chords.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.4 } });
        this.loopEngine.setSidechainDepth(0.55);
        break;
      case 'Chill':
        this.triggerReverb.decay = 2.0;
        this.triggerReverb.wet.value = 0.3;
        this.triggerDelay.wet.value = 0.18;
        this.lead.set({ harmonicity: 1.5, modulationIndex: 2.5 });
        this.chords.set({ oscillator: { type: 'triangle' }, envelope: { attack: 0.04, decay: 0.35, sustain: 0.3, release: 0.8 } });
        this.loopEngine.setSidechainDepth(0.25);
        break;
      case 'Dreamy':
        this.triggerReverb.decay = 5;
        this.triggerReverb.wet.value = 0.55;
        this.triggerDelay.wet.value = 0.3;
        this.lead.set({ harmonicity: 1, modulationIndex: 1.5 });
        this.chords.set({ oscillator: { type: 'sine' }, envelope: { attack: 1, decay: 1, sustain: 0.7, release: 2.5 } });
        this.loopEngine.setSidechainDepth(0.1);
        break;
    }

    this.chordProgressionIndex = 0;

    // Re-apply photo state to loop engine
    if (this.photos.length > 0) {
      this.loopEngine.updateFromPhotos(this.photos);
    }
  }

  public setPhotos(photos: PhotoData[]) {
    this.photos = photos;
    this.loopEngine.updateFromPhotos(photos, this.canvasWidth, this.canvasHeight);
  }

  public setCanvasSize(width: number, height: number) {
    if (width > 0) this.canvasWidth = width;
    if (height > 0) this.canvasHeight = height;
    if (this.photos.length > 0) {
      this.loopEngine.updateFromPhotos(this.photos, this.canvasWidth, this.canvasHeight);
    }
  }

  // ═══════════════════════════════════════
  // PHOTO-TRIGGERED SOUNDS (step sequencer)
  // Each photo triggers unique sounds based on its properties
  // ═══════════════════════════════════════

  private photoTriggerStep(time: number) {
    if (this.photos.length === 0) return;

    const position = Tone.Transport.position.toString().split(':');
    const bar = parseInt(position[0]);
    const beat = parseInt(position[1]);
    const sixteenth = parseInt(position[2].split('.')[0]);
    const stepIndex = beat * 4 + sixteenth;

    if (bar !== this.currentBar) {
      this.currentBar = bar;
      this.chordProgressionIndex = (this.chordProgressionIndex + 1) % 4;
    }

    const scale = SCALES[this.currentStyle];
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!scale || !chords) return;

    const cw = this.canvasWidth || 800;
    const ch = this.canvasHeight || 500;
    const refArea = Math.max(cw * ch * 0.08, 20000);

    // ── Beat weight for probabilistic gating ──
    // Downbeats (0,4,8,12) always play; "&" positions (2,6,10,14) often play;
    // "e" and "a" (odd 16ths) play rarely. Avoids a muddy wall of notes.
    const beatWeight =
      stepIndex % 4 === 0 ? 1.0 :
      stepIndex % 4 === 2 ? 0.7 :
      0.35;

    // Current harmonic context
    const currentChord = chords[this.chordProgressionIndex];

    this.photos.forEach((photo, index) => {
      const centerX = photo.x + (photo.width || 0) / 2;
      const centerY = photo.y + (photo.height || 0) / 2;
      const normalizedX = Math.min(Math.max(centerX / cw, 0), 1);
      const normalizedY = Math.min(Math.max(centerY / ch, 0), 1);

      // X position → which 16th-note step this photo is anchored to
      const baseStep = Math.min(15, Math.floor(normalizedX * 16));
      const triggerStep = (baseStep + index * 3) % 16;
      if (triggerStep !== stepIndex) return;

      // Probabilistic thinning. Density grows slowly with photo count, so
      // 1 photo → nearly always fires; 5 photos → thinned to leave air.
      const densityFromCount = Math.max(0.4, 1 - (this.photos.length - 1) * 0.08);
      const playChance = beatWeight * densityFromCount;
      if (Math.random() > playChance) return;

      const area = (photo.width || 140) * (photo.height || 140);
      const sizeFactor = Math.min(Math.max(area / refArea, 0.1), 1);
      const baseVelocity = Math.min(Math.max(photo.brightness / 255, 0.2), 0.9);
      const velocity = this.humanizeVelocity(baseVelocity * (0.25 + 0.8 * sizeFactor));
      const duration: Tone.Unit.Time = sizeFactor < 0.25 ? '16n' : sizeFactor < 0.55 ? '8n' : sizeFactor < 0.8 ? '4n' : '2n';
      const pan = normalizedX * 2 - 1;

      // ── Pitch selection: prefer CHORD TONES, scale only for passing notes ──
      const useChordTone = stepIndex % 4 === 0 || stepIndex % 4 === 2 || Math.random() < 0.55;
      const pool = useChordTone ? currentChord : scale;
      // Hue gives each photo a stable index into the pool (so the same photo
      // always picks the same "slot" of the chord/scale, like a voice).
      const poolIdx = Math.floor((photo.hue / 360) * pool.length) % pool.length;
      const baseNote = pool[(poolIdx + pool.length) % pool.length];

      if (normalizedY < 0.33) {
        // Top zone: Lead melody — bump up an octave for presence.
        this.leadChannel.pan.rampTo(pan, 0.05);
        const octaveBump = sizeFactor > 0.6 ? 2 : 1;
        const note = baseNote.replace(/[0-9]/, (m) => String(parseInt(m) + octaveBump));
        this.lead.triggerAttackRelease(note, duration, time + this.humanizeTime(), velocity);
      } else if (normalizedY < 0.66) {
        // Middle zone: Chord stab — voice with chord tones under the selection.
        this.chordTriggerChannel.pan.rampTo(pan, 0.05);
        const voices = Math.max(1, Math.round(1 + sizeFactor * (currentChord.length - 1)));
        // Build a voicing centered on the pool pick, extending with chord tones.
        const notes = Array.from({ length: voices }, (_, i) =>
          currentChord[(poolIdx + i) % currentChord.length]
        );
        this.chords.triggerAttackRelease(notes, duration, time + this.humanizeTime(), velocity * 0.7);
      } else {
        // Bottom zone: Percussion accent — big photos also hit kick.
        this.triggerChannel.pan.rampTo(pan, 0.05);
        this.drumSampler.trigger('rim', time + this.humanizeTime(), velocity * 0.7);
        if (sizeFactor > 0.45) {
          this.drumSampler.trigger('kick', time + this.humanizeTime(), velocity * (0.25 + 0.5 * sizeFactor));
        }
      }
    });
  }
}
