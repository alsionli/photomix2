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
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public async initialize() {
    if (this.isInitialized) return;
    await Tone.start();

    // Tone.Offline temporarily replaces the global audio context.
    // Save a reference so we can force-restore it after all rendering.
    const mainContext = getContext();

    await this.loopEngine.generateAll();
    await this.drumSampler.generate();

    // Belt-and-suspenders: guarantee we're back on the live context
    setContext(mainContext);

    this.isInitialized = true;
    console.log('Audio Engine Initialized (Loop + Sample hybrid)');
    this.loop?.start(0);
  }

  public setVolume(db: number) {
    this.masterChannel.volume.rampTo(db, 0.1);
  }

  public setBpm(bpm: number) {
    Tone.Transport.bpm.rampTo(bpm, 1);
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

    // Adjust trigger effects per style
    switch (style) {
      case 'Groove':
        this.triggerReverb.decay = 0.6;
        this.triggerReverb.wet.value = 0.1;
        this.triggerDelay.wet.value = 0.08;
        this.lead.set({ harmonicity: 4, modulationIndex: 10 });
        this.chords.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0.05, release: 0.1 } });
        break;
      case 'Lounge':
        this.triggerReverb.decay = 2.5;
        this.triggerReverb.wet.value = 0.35;
        this.triggerDelay.wet.value = 0.2;
        this.lead.set({ harmonicity: 1.5, modulationIndex: 3 });
        this.chords.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.4, sustain: 0.4, release: 1 } });
        break;
      case 'Upbeat':
        this.triggerReverb.decay = 1.2;
        this.triggerReverb.wet.value = 0.15;
        this.triggerDelay.wet.value = 0.12;
        this.lead.set({ harmonicity: 3, modulationIndex: 8 });
        this.chords.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.4 } });
        break;
      case 'Chill':
        this.triggerReverb.decay = 2.0;
        this.triggerReverb.wet.value = 0.3;
        this.triggerDelay.wet.value = 0.18;
        this.lead.set({ harmonicity: 1.5, modulationIndex: 2.5 });
        this.chords.set({ oscillator: { type: 'triangle' }, envelope: { attack: 0.04, decay: 0.35, sustain: 0.3, release: 0.8 } });
        break;
      case 'Dreamy':
        this.triggerReverb.decay = 5;
        this.triggerReverb.wet.value = 0.55;
        this.triggerDelay.wet.value = 0.3;
        this.lead.set({ harmonicity: 1, modulationIndex: 1.5 });
        this.chords.set({ oscillator: { type: 'sine' }, envelope: { attack: 1, decay: 1, sustain: 0.7, release: 2.5 } });
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
    this.loopEngine.updateFromPhotos(photos);
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

    // Each photo triggers its own sound based on position/color
    this.photos.forEach((photo, index) => {
      // X position → which step this photo triggers on
      const normalizedX = Math.min(Math.max(photo.x / 800, 0), 1);
      const baseStep = Math.floor(normalizedX * 16);
      const triggerStep = (baseStep + index * 3) % 16;

      if (triggerStep !== stepIndex) return;

      // Photo properties → sound parameters
      const area = (photo.width || 140) * (photo.height || 140);
      const sizeFactor = Math.min(Math.max(area / 40000, 0.1), 1);
      const noteIndex = Math.floor((photo.hue / 360) * scale.length);
      const baseNote = scale[noteIndex % scale.length];
      const baseVelocity = Math.min(Math.max(photo.brightness / 255, 0.15), 0.85);
      const velocity = this.humanizeVelocity(baseVelocity * (0.2 + 0.4 * sizeFactor));
      const duration: Tone.Unit.Time = sizeFactor < 0.3 ? '16n' : sizeFactor < 0.6 ? '8n' : '4n';

      // Y position → which instrument
      const normalizedY = Math.min(Math.max(photo.y / 500, 0), 1);

      if (normalizedY < 0.3) {
        // Top zone: Lead melody
        const note = baseNote.replace(/[0-9]/, (m) => String(parseInt(m) + 1));
        this.lead.triggerAttackRelease(note, duration, time + this.humanizeTime(), velocity);
      } else if (normalizedY < 0.6) {
        // Middle zone: Chord stab
        const currentChord = chords[this.chordProgressionIndex];
        const chordNote = currentChord[index % currentChord.length];
        this.chords.triggerAttackRelease([chordNote], '16n', time + this.humanizeTime(), velocity * 0.6);
      } else {
        // Bottom zone: Percussion accent
        this.drumSampler.trigger('rim', time + this.humanizeTime(), velocity * 0.5);
        if (sizeFactor > 0.5) {
          this.drumSampler.trigger('kick', time + this.humanizeTime(), velocity * 0.2);
        }
      }
    });
  }
}
