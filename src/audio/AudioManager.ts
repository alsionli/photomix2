import * as Tone from 'tone';
import type { MusicStyle } from '../store/useMixerStore';
import { DrumSampler } from './DrumSampler';
import {
  SCALES,
  CHORD_PROGRESSIONS,
  BASS_PATTERNS,
  CHORD_RHYTHMS,
  DRUM_PATTERNS,
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
  private currentBar = 0;
  private walkingBassIndex = 0;
  private chordProgressionIndex = 0;
  private arpeggioIndex = 0;

  // ── Master Chain ──
  private masterChannel: Tone.Channel;
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;

  // ── Instrument Channels ──
  private drumChannel: Tone.Channel;
  private bassChannel: Tone.Channel;
  private chordChannel: Tone.Channel;
  private leadChannel: Tone.Channel;
  private padChannel: Tone.Channel;

  // ── Drum Sampler (pre-rendered) ──
  private drumSampler: DrumSampler;

  // ── Synths (upgraded presets) ──
  public bass: Tone.MonoSynth;
  public chords: Tone.PolySynth;
  public lead: Tone.FMSynth;
  public pad: Tone.PolySynth;

  // ── Effects ──
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private filter: Tone.Filter;
  private chorus: Tone.Chorus;
  private phaser: Tone.Phaser;
  private drumReverb: Tone.Reverb;

  // Analysis
  public analyser: Tone.Waveform;

  // Loop
  private loop: Tone.Loop | null = null;

  // ── Humanize ──

  private humanizeTime(): number {
    return (Math.random() - 0.5) * 0.025;
  }

  private humanizeVelocity(velocity: number): number {
    const variation = 0.85 + Math.random() * 0.3;
    return Math.min(1, Math.max(0.05, velocity * variation));
  }

  private getDynamicFactor(): number {
    const cycle = Math.sin(((this.currentBar % 8) / 8) * Math.PI * 2);
    return 0.75 + 0.25 * cycle;
  }

  // ── Constructor ──

  private constructor() {
    // Master chain: Channel → Compressor → Limiter → Destination
    this.masterLimiter = new Tone.Limiter(-1).toDestination();
    this.masterCompressor = new Tone.Compressor({
      threshold: -18,
      ratio: 3,
      attack: 0.01,
      release: 0.15,
      knee: 6,
    }).connect(this.masterLimiter);
    this.masterChannel = new Tone.Channel(0, 0).connect(this.masterCompressor);

    this.analyser = new Tone.Waveform(1024);
    this.masterChannel.connect(this.analyser);

    // ── Effects ──
    this.reverb = new Tone.Reverb(2.5).connect(this.masterChannel);
    this.reverb.wet.value = 0.35;
    this.delay = new Tone.FeedbackDelay('8n', 0.25).connect(this.masterChannel);
    this.delay.wet.value = 0.2;
    this.filter = new Tone.Filter(2500, 'lowpass').connect(this.masterChannel);

    this.chorus = new Tone.Chorus({
      frequency: 1.2,
      delayTime: 4,
      depth: 0.6,
      wet: 0.25,
    }).connect(this.masterChannel);
    this.chorus.start();

    this.phaser = new Tone.Phaser({
      frequency: 0.25,
      octaves: 3,
      baseFrequency: 800,
      wet: 0.15,
    }).connect(this.masterChannel);

    this.drumReverb = new Tone.Reverb(0.6).connect(this.masterChannel);
    this.drumReverb.wet.value = 0.08;

    // ── Instrument Channels ──
    this.drumChannel = new Tone.Channel(-4, 0).connect(this.drumReverb);
    this.bassChannel = new Tone.Channel(-3, 0).connect(this.filter);
    this.chordChannel = new Tone.Channel(-9, 0).connect(this.chorus);
    this.leadChannel = new Tone.Channel(-7, 0).connect(this.phaser);
    this.padChannel = new Tone.Channel(-12, 0).connect(this.reverb);

    // ── Drum Sampler ──
    this.drumSampler = new DrumSampler(this.drumChannel as unknown as Tone.InputNode);

    // ── Bass: warm FM bass with filter ──
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'fmsawtooth', modulationType: 'sine' },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.35, release: 0.4 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.15,
        sustain: 0.4,
        baseFrequency: 180,
        octaves: 3,
      },
    }).connect(this.bassChannel);

    // ── Chords: detuned for width ──
    this.chords = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.06, decay: 0.35, sustain: 0.4, release: 0.8 },
    }).connect(this.chordChannel);
    this.chords.set({ detune: 8 });

    // ── Lead: expressive FM ──
    this.lead = new Tone.FMSynth({
      harmonicity: 2.5,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.15, sustain: 0.6, release: 0.6 },
      modulation: { type: 'triangle' },
      modulationEnvelope: { attack: 0.2, decay: 0.3, sustain: 0.4, release: 0.4 },
    }).connect(this.leadChannel);

    // ── Pad: lush, filtered ──
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', count: 3, spread: 30 },
      envelope: { attack: 1.5, decay: 1, sustain: 0.8, release: 3 },
    } as unknown as Tone.SynthOptions).connect(this.padChannel);

    // ── Sequencer Loop ──
    this.loop = new Tone.Loop((time) => {
      this.step(time);
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

    if (!this.drumSampler.isLoaded) {
      await this.drumSampler.generate();
    }

    this.isInitialized = true;
    console.log('Audio Engine Initialized (Sample-based drums)');
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
    }
  }

  public updateStyle(style: MusicStyle) {
    this.currentStyle = style;
    const config = STYLE_CONFIG[style];

    // Switch drum kit
    this.drumSampler.setStyle(style);

    Tone.Transport.bpm.value = config.bpm;
    Tone.Transport.swing = config.swing;
    Tone.Transport.swingSubdivision = '8n';

    switch (style) {
      case 'Groove':
        // Dry, punchy, tight — funk/electronic
        this.reverb.decay = 0.6;
        this.reverb.wet.value = 0.08;
        this.delay.delayTime.value = 0.125;
        this.delay.feedback.value = 0.1;
        this.delay.wet.value = 0.08;
        this.filter.frequency.value = 4000;
        this.chorus.set({ wet: 0.1 });
        this.phaser.set({ wet: 0.08 });
        this.drumReverb.wet.value = 0.03;
        this.bassChannel.volume.value = -2;
        this.chordChannel.volume.value = -10;
        this.leadChannel.volume.value = -8;
        this.padChannel.volume.value = -16;
        this.bass.set({
          oscillator: { type: 'fmsquare', modulationType: 'sine' },
          envelope: { attack: 0.003, decay: 0.1, sustain: 0.15, release: 0.2 },
          filterEnvelope: { baseFrequency: 400, octaves: 3.5, attack: 0.005, decay: 0.1 },
        });
        this.chords.set({
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.003, decay: 0.06, sustain: 0.05, release: 0.08 },
          detune: 5,
        });
        this.lead.set({ harmonicity: 4, modulationIndex: 12 });
        this.pad.set({ envelope: { attack: 0.8, sustain: 0.4, release: 1.5 } });
        break;

      case 'Lounge':
        // Warm, spacious, jazzy — lots of reverb, soft everything
        this.reverb.decay = 3.0;
        this.reverb.wet.value = 0.4;
        this.delay.delayTime.value = 0.35;
        this.delay.feedback.value = 0.2;
        this.delay.wet.value = 0.18;
        this.filter.frequency.value = 1800;
        this.chorus.set({ wet: 0.3 });
        this.phaser.set({ wet: 0.05 });
        this.drumReverb.wet.value = 0.2;
        this.bassChannel.volume.value = -5;
        this.chordChannel.volume.value = -8;
        this.leadChannel.volume.value = -10;
        this.padChannel.volume.value = -10;
        this.bass.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.05, decay: 0.5, sustain: 0.25, release: 0.8 },
          filterEnvelope: { baseFrequency: 180, octaves: 1.5, attack: 0.08 },
        });
        this.chords.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.1, decay: 0.5, sustain: 0.5, release: 1.2 },
          detune: 12,
        });
        this.lead.set({ harmonicity: 1.5, modulationIndex: 2 });
        this.pad.set({ envelope: { attack: 2.5, sustain: 0.7, release: 4 } });
        break;

      case 'Upbeat':
        // Bright, driving, energetic — compressed, forward
        this.reverb.decay = 1.5;
        this.reverb.wet.value = 0.15;
        this.delay.delayTime.value = 0.25;
        this.delay.feedback.value = 0.25;
        this.delay.wet.value = 0.15;
        this.filter.frequency.value = 5000;
        this.chorus.set({ wet: 0.3 });
        this.phaser.set({ wet: 0.18 });
        this.drumReverb.wet.value = 0.08;
        this.bassChannel.volume.value = -3;
        this.chordChannel.volume.value = -7;
        this.leadChannel.volume.value = -6;
        this.padChannel.volume.value = -14;
        this.bass.set({
          oscillator: { type: 'fmsawtooth', modulationType: 'sine' },
          envelope: { attack: 0.005, decay: 0.18, sustain: 0.4, release: 0.35 },
          filterEnvelope: { baseFrequency: 350, octaves: 3, attack: 0.005 },
        });
        this.chords.set({
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.015, decay: 0.2, sustain: 0.3, release: 0.4 },
          detune: 15,
        });
        this.lead.set({ harmonicity: 3, modulationIndex: 8 });
        this.pad.set({ envelope: { attack: 1, sustain: 0.5, release: 2 } });
        break;

      case 'Chill':
        // Warm, mellow, lo-fi — filtered, soft attack
        this.reverb.decay = 2.2;
        this.reverb.wet.value = 0.3;
        this.delay.delayTime.value = 0.2;
        this.delay.feedback.value = 0.15;
        this.delay.wet.value = 0.12;
        this.filter.frequency.value = 2200;
        this.chorus.set({ wet: 0.2 });
        this.phaser.set({ wet: 0.08 });
        this.drumReverb.wet.value = 0.12;
        this.bassChannel.volume.value = -4;
        this.chordChannel.volume.value = -9;
        this.leadChannel.volume.value = -9;
        this.padChannel.volume.value = -11;
        this.bass.set({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.03, decay: 0.35, sustain: 0.2, release: 0.5 },
          filterEnvelope: { baseFrequency: 200, octaves: 2, attack: 0.04 },
        });
        this.chords.set({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.04, decay: 0.4, sustain: 0.35, release: 1 },
          detune: 8,
        });
        this.lead.set({ harmonicity: 1.5, modulationIndex: 2.5 });
        this.pad.set({ envelope: { attack: 2, sustain: 0.6, release: 3 } });
        break;

      case 'Dreamy':
        // Ethereal, vast, ambient — massive reverb, slow everything
        this.reverb.decay = 6;
        this.reverb.wet.value = 0.6;
        this.delay.delayTime.value = 0.5;
        this.delay.feedback.value = 0.45;
        this.delay.wet.value = 0.3;
        this.filter.frequency.value = 1200;
        this.chorus.set({ wet: 0.5 });
        this.phaser.set({ wet: 0.3 });
        this.drumReverb.wet.value = 0.35;
        this.bassChannel.volume.value = -8;
        this.chordChannel.volume.value = -10;
        this.leadChannel.volume.value = -12;
        this.padChannel.volume.value = -6;
        this.bass.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.5, decay: 1.5, sustain: 0.4, release: 3 },
          filterEnvelope: { baseFrequency: 80, octaves: 1, attack: 0.3 },
        });
        this.chords.set({
          oscillator: { type: 'sine' },
          envelope: { attack: 1.5, decay: 1, sustain: 0.7, release: 3 },
          detune: 20,
        });
        this.lead.set({ harmonicity: 1, modulationIndex: 1.5 });
        this.pad.set({ envelope: { attack: 4, sustain: 0.9, release: 6 } });
        break;
    }

    this.walkingBassIndex = 0;
    this.chordProgressionIndex = 0;
    this.arpeggioIndex = 0;
  }

  public setPhotos(photos: PhotoData[]) {
    this.photos = photos;
  }

  // ── Step Sequencer ──

  private step(time: number) {
    if (this.photos.length === 0) return;

    const position = Tone.Transport.position.toString().split(':');
    const bar = parseInt(position[0]);
    const beat = parseInt(position[1]);
    const sixteenth = parseInt(position[2].split('.')[0]);
    const stepIndex = beat * 4 + sixteenth;

    if (bar !== this.currentBar) {
      this.currentBar = bar;
      this.chordProgressionIndex = (this.chordProgressionIndex + 1) % 4;
      this.walkingBassIndex = 0;
    }

    const photoCount = this.photos.length;
    const avgBrightness = this.photos.reduce((sum, p) => sum + p.brightness, 0) / photoCount;
    const avgHue = this.photos.reduce((sum, p) => sum + p.hue, 0) / photoCount;
    const dynamicFactor = this.getDynamicFactor();

    this.updateEffectsFromPhotos(avgHue, avgBrightness);

    if (photoCount >= 1) this.playPad(stepIndex, time, dynamicFactor);
    this.playDrumsProgressive(stepIndex, time, photoCount, dynamicFactor);
    if (photoCount >= 2) this.playBass(stepIndex, time, avgHue, avgBrightness, photoCount, dynamicFactor);
    if (photoCount >= 3) this.playChords(stepIndex, time, avgBrightness, photoCount, dynamicFactor);
    this.playPhotoSounds(stepIndex, time, dynamicFactor);
  }

  private updateEffectsFromPhotos(avgHue: number, avgBrightness: number) {
    const config = STYLE_CONFIG[this.currentStyle];
    // Modulate relative to style base, not override
    const hueOffset = (avgHue / 360 - 0.5) * 800;
    this.filter.frequency.rampTo(config.filterFreq + hueOffset, 0.5);
    const brightFactor = avgBrightness / 255;
    const baseWet = this.reverb.wet.value;
    this.reverb.wet.rampTo(baseWet + brightFactor * 0.08, 0.5);
    this.delay.feedback.rampTo(config.delayFeedback + brightFactor * 0.05, 0.5);
  }

  private playPad(stepIndex: number, time: number, dynamicFactor: number) {
    if (stepIndex !== 0) return;
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!chords) return;
    const currentChord = chords[this.chordProgressionIndex];
    const baseVel = this.photos.length <= 2 ? 0.35 : 0.2;
    const velocity = this.humanizeVelocity(baseVel * dynamicFactor);
    this.pad.triggerAttackRelease(currentChord, '1n', time + this.humanizeTime(), velocity);
  }

  // ── Drums: use pre-rendered samples ──

  private playDrumsProgressive(stepIndex: number, time: number, photoCount: number, dynamicFactor: number) {
    const pattern = DRUM_PATTERNS[this.currentStyle];
    if (!pattern) return;

    const t = time + this.humanizeTime();

    if (photoCount === 1) {
      switch (this.currentStyle) {
        case 'Groove':
          if (stepIndex === 0 || stepIndex === 8) this.drumSampler.trigger('kick', t, this.humanizeVelocity(0.5 * dynamicFactor));
          if (stepIndex % 2 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.15 * dynamicFactor));
          if (stepIndex === 4 || stepIndex === 12) this.drumSampler.trigger('rim', t, this.humanizeVelocity(0.2 * dynamicFactor));
          break;
        case 'Lounge':
          if (stepIndex === 0) this.drumSampler.trigger('kick', t, this.humanizeVelocity(0.3 * dynamicFactor));
          if (stepIndex % 6 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.2 * dynamicFactor));
          if (stepIndex === 10) this.drumSampler.trigger('rim', t, this.humanizeVelocity(0.15 * dynamicFactor));
          break;
        case 'Upbeat':
          if (stepIndex % 4 === 0) this.drumSampler.trigger('kick', t, this.humanizeVelocity(0.55 * dynamicFactor));
          if (stepIndex % 2 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.2 * dynamicFactor));
          break;
        case 'Chill':
          if (stepIndex === 0 || stepIndex === 6) this.drumSampler.trigger('kick', t, this.humanizeVelocity(0.35 * dynamicFactor));
          if (stepIndex % 4 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.12 * dynamicFactor));
          break;
        case 'Dreamy':
          if (stepIndex === 0 && this.currentBar % 2 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.1 * dynamicFactor));
          break;
      }
      return;
    }

    if (photoCount === 2) {
      if (pattern.kick.length > 0) {
        if (stepIndex === 0 || stepIndex === 8) this.drumSampler.trigger('kick', t, this.humanizeVelocity(0.45 * dynamicFactor));
      }
      if (stepIndex % 4 === 0) this.drumSampler.trigger('hihat', t, this.humanizeVelocity(0.2 * dynamicFactor));
      if (this.currentStyle === 'Groove' && (stepIndex === 4 || stepIndex === 12))
        this.drumSampler.trigger('rim', t, this.humanizeVelocity(0.25 * dynamicFactor));
      if (this.currentStyle === 'Lounge' && stepIndex === 10)
        this.drumSampler.trigger('rim', t, this.humanizeVelocity(0.15 * dynamicFactor));
      return;
    }

    // 3+ photos: full pattern
    const density = Math.min(photoCount / 5, 1);
    const baseVelocity = (0.4 + 0.5 * density) * dynamicFactor;
    const hihatVel = this.currentStyle === 'Dreamy' ? 0.08 : (0.18 + 0.25 * density) * dynamicFactor;

    if (pattern.kick.includes(stepIndex)) {
      this.drumSampler.trigger('kick', t, this.humanizeVelocity(baseVelocity));
    }

    if (photoCount >= 4 && pattern.snare.includes(stepIndex)) {
      const snareVel = this.currentStyle === 'Lounge' ? baseVelocity * 0.35 : baseVelocity * 0.85;
      this.drumSampler.trigger('snare', t, this.humanizeVelocity(snareVel));
    }

    if (pattern.hihat.includes(stepIndex)) {
      const isAccent = pattern.accent?.includes(stepIndex);
      const vel = isAccent ? hihatVel * 1.3 : hihatVel;
      this.drumSampler.trigger('hihatClosed', t, this.humanizeVelocity(vel));
    }

    if (photoCount >= 5 && stepIndex % 8 === 4) {
      this.drumSampler.trigger('hihatOpen', t, this.humanizeVelocity(0.25 * dynamicFactor));
    }

    if (photoCount >= 5 && this.currentStyle === 'Groove' && stepIndex === 4) {
      this.drumSampler.trigger('clap', t, this.humanizeVelocity(0.3 * dynamicFactor));
    }
  }

  private playBass(stepIndex: number, time: number, hue: number, brightness: number, photoCount: number, dynamicFactor: number) {
    const bassPattern = BASS_PATTERNS[this.currentStyle];
    const scale = SCALES[this.currentStyle];
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!bassPattern || !scale || !chords) return;

    const density = Math.min(photoCount / 5, 1);
    const baseVelocity = (0.45 + 0.4 * (brightness / 255) * density) * dynamicFactor;
    const currentChord = chords[this.chordProgressionIndex];

    switch (bassPattern.style) {
      case 'syncopated':
        if (bassPattern.steps.includes(stepIndex)) {
          const noteIdx = Math.floor((hue / 360) * scale.length);
          const note = scale[noteIdx % scale.length];
          this.bass.triggerAttackRelease(note, '16n', time + this.humanizeTime(), this.humanizeVelocity(baseVelocity));
        }
        break;
      case 'walking':
        if (bassPattern.steps.includes(stepIndex)) {
          const walkNotes = bassPattern.notes || scale;
          const note = walkNotes[this.walkingBassIndex % walkNotes.length];
          this.bass.triggerAttackRelease(note, '4n', time + this.humanizeTime(), this.humanizeVelocity(baseVelocity * 0.75));
          this.walkingBassIndex++;
        }
        break;
      case 'root':
        if (bassPattern.steps.includes(stepIndex)) {
          const root = currentChord[0].replace(/[0-9]/g, '') + '2';
          this.bass.triggerAttackRelease(root, '8n', time + this.humanizeTime(), this.humanizeVelocity(baseVelocity));
        }
        break;
      case 'root-fifth':
        if (bassPattern.steps.includes(stepIndex)) {
          const isRoot = bassPattern.steps.indexOf(stepIndex) === 0;
          const root = currentChord[0];
          const fifth = currentChord[2] || currentChord[0];
          const note = isRoot ? root.replace(/[0-9]/g, '') + '2' : fifth.replace(/[0-9]/g, '') + '2';
          this.bass.triggerAttackRelease(note, '4n', time + this.humanizeTime(), this.humanizeVelocity(baseVelocity * 0.65));
        }
        break;
      case 'sustained':
        if (stepIndex === 0) {
          const noteIdx = Math.floor((hue / 360) * scale.length);
          const note = scale[noteIdx % scale.length];
          this.bass.triggerAttackRelease(note, '1n', time, this.humanizeVelocity(baseVelocity * 0.45));
        }
        break;
    }
  }

  private playChords(stepIndex: number, time: number, brightness: number, photoCount: number, dynamicFactor: number) {
    const chordRhythm = CHORD_RHYTHMS[this.currentStyle];
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!chordRhythm || !chords) return;

    const currentChord = chords[this.chordProgressionIndex];
    const density = Math.min(photoCount / 5, 1);
    const baseVelocity = (0.25 + 0.3 * (brightness / 255)) * density * dynamicFactor;

    switch (chordRhythm.style) {
      case 'staccato':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.006;
            this.chords.triggerAttackRelease([note], '32n', time + this.humanizeTime() + strumDelay, this.humanizeVelocity(baseVelocity));
          });
        }
        break;
      case 'comping':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.012;
            this.chords.triggerAttackRelease([note], '8n', time + this.humanizeTime() + strumDelay, this.humanizeVelocity(baseVelocity * 0.65));
          });
        }
        break;
      case 'arpeggio':
        if (chordRhythm.steps.includes(stepIndex)) {
          const noteIdx = this.arpeggioIndex % currentChord.length;
          this.chords.triggerAttackRelease([currentChord[noteIdx]], '8n', time + this.humanizeTime(), this.humanizeVelocity(baseVelocity));
          this.arpeggioIndex++;
        }
        break;
      case 'strummed':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.02;
            this.chords.triggerAttackRelease([note], '8n', time + this.humanizeTime() + strumDelay, this.humanizeVelocity(baseVelocity * 0.55));
          });
        }
        break;
      case 'sustained':
        if (stepIndex === 0 && this.currentBar % 2 === 0) {
          this.chords.triggerAttackRelease(currentChord, '2n', time, this.humanizeVelocity(baseVelocity * 0.3));
        }
        break;
    }
  }

  private playPhotoSounds(stepIndex: number, time: number, dynamicFactor: number) {
    const scale = SCALES[this.currentStyle];
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!scale || !chords) return;

    this.photos.forEach((photo, index) => {
      const normalizedX = Math.min(Math.max(photo.x / 800, 0), 1);
      const baseStep = Math.floor(normalizedX * 16);
      const triggerStep = (baseStep + index * 3) % 16;

      if (triggerStep !== stepIndex) return;

      const area = (photo.width || 140) * (photo.height || 140);
      const sizeFactor = Math.min(Math.max(area / 40000, 0.1), 1);

      const noteIndex = Math.floor((photo.hue / 360) * scale.length);
      const baseNote = scale[noteIndex % scale.length];

      const baseVelocity = Math.min(Math.max(photo.brightness / 255, 0.15), 0.9);
      const velocity = this.humanizeVelocity(baseVelocity * (0.25 + 0.45 * sizeFactor) * dynamicFactor);

      const duration: Tone.Unit.Time = sizeFactor < 0.3 ? '16n' : sizeFactor < 0.6 ? '8n' : '4n';

      const normalizedY = Math.min(Math.max(photo.y / 500, 0), 1);

      if (normalizedY < 0.25) {
        const note = baseNote.replace(/[0-9]/, (m) => String(parseInt(m) + 1));
        this.lead.triggerAttackRelease(note, duration, time + this.humanizeTime(), velocity);
      } else if (normalizedY < 0.5) {
        const currentChord = chords[this.chordProgressionIndex];
        const chordNote = currentChord[index % currentChord.length];
        this.chords.triggerAttackRelease([chordNote], '16n', time + this.humanizeTime(), velocity * 0.6);
      } else if (normalizedY < 0.75) {
        const currentChord = chords[this.chordProgressionIndex];
        currentChord.forEach((note, i) => {
          const strumDelay = i * 0.008;
          this.chords.triggerAttackRelease([note], '8n', time + this.humanizeTime() + strumDelay, velocity * 0.4);
        });
      } else {
        this.drumSampler.trigger('rim', time + this.humanizeTime(), velocity * 0.5);
        if (sizeFactor > 0.5) {
          this.drumSampler.trigger('kick', time + this.humanizeTime(), velocity * 0.25);
        }
      }
    });
  }
}
