import * as Tone from 'tone';
import type { MusicStyle } from '../store/useMixerStore';
import { 
  SCALES, 
  CHORD_PROGRESSIONS, 
  BASS_PATTERNS, 
  CHORD_RHYTHMS, 
  DRUM_PATTERNS,
  STYLE_CONFIG 
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

  // Channels
  private masterChannel: Tone.Channel;
  private drumChannel: Tone.Channel;
  private bassChannel: Tone.Channel;
  private chordChannel: Tone.Channel;
  private leadChannel: Tone.Channel;
  private padChannel: Tone.Channel;

  // Synths
  public drums: { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hihat: Tone.MetalSynth };
  public bass: Tone.MonoSynth;
  public chords: Tone.PolySynth;
  public lead: Tone.FMSynth;
  public pad: Tone.PolySynth;

  // Effects
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private filter: Tone.Filter;
  private chorus: Tone.Chorus;
  private phaser: Tone.Phaser;
  
  // Analysis
  public analyser: Tone.Waveform;

  // Loop
  private loop: Tone.Loop | null = null;

  // ==========================================
  // HUMANIZE FUNCTIONS
  // ==========================================
  
  private humanizeTime(): number {
    return (Math.random() - 0.5) * 0.03;
  }
  
  private humanizeVelocity(velocity: number): number {
    const variation = 0.8 + Math.random() * 0.4;
    return Math.min(1, Math.max(0.1, velocity * variation));
  }
  
  private getDynamicFactor(): number {
    const cycle = Math.sin((this.currentBar % 8) / 8 * Math.PI * 2);
    return 0.75 + 0.25 * cycle;
  }

  private constructor() {
    this.masterChannel = new Tone.Channel(0, 0).toDestination();
    this.analyser = new Tone.Waveform(1024);
    this.masterChannel.connect(this.analyser);
    
    // Effects Bus
    this.reverb = new Tone.Reverb(2.5).connect(this.masterChannel);
    this.delay = new Tone.FeedbackDelay("8n", 0.3).connect(this.masterChannel);
    this.filter = new Tone.Filter(2500, "lowpass").connect(this.masterChannel);
    
    this.chorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      wet: 0.3
    }).connect(this.masterChannel);
    this.chorus.start();
    
    this.phaser = new Tone.Phaser({
      frequency: 0.3,
      octaves: 3,
      baseFrequency: 800,
      wet: 0.2
    }).connect(this.masterChannel);
    
    // Instrument Channels
    this.drumChannel = new Tone.Channel(-6, 0).connect(this.filter);
    this.bassChannel = new Tone.Channel(-3, 0).connect(this.filter);
    this.chordChannel = new Tone.Channel(-10, 0).connect(this.chorus);
    this.leadChannel = new Tone.Channel(-8, 0).connect(this.phaser);
    this.padChannel = new Tone.Channel(-14, 0).connect(this.reverb);
    
    // Initialize Synths
    this.drums = {
      kick: new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 1.4 }
      }).connect(this.drumChannel),
      snare: new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }
      }).connect(this.drumChannel),
      hihat: new Tone.MetalSynth({
        frequency: 300,
        envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5
      } as unknown as Tone.MetalSynthOptions).connect(this.drumChannel)
    };

    this.bass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.5 },
      filterEnvelope: { attack: 0.02, decay: 0.1, sustain: 0.5, baseFrequency: 200, octaves: 2.5 }
    }).connect(this.bassChannel);

    this.chords = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.08, decay: 0.3, sustain: 0.4, release: 1 }
    }).connect(this.chordChannel);

    this.lead = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 8,
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.8 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.3, decay: 0.2, sustain: 0.5, release: 0.5 }
    }).connect(this.leadChannel);

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 2, decay: 1, sustain: 0.8, release: 4 }
    }).connect(this.padChannel);

    // Setup Loop
    this.loop = new Tone.Loop((time) => {
      this.step(time);
    }, "16n");
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
    this.isInitialized = true;
    console.log("Audio Engine Initialized");
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
    
    Tone.Transport.bpm.value = config.bpm;
    Tone.Transport.swing = config.swing;
    Tone.Transport.swingSubdivision = '8n';
    
    this.reverb.decay = config.reverbDecay;
    this.delay.delayTime.value = config.delayTime;
    this.delay.feedback.value = config.delayFeedback;
    this.filter.frequency.value = config.filterFreq;
    
    switch (style) {
      case 'Groove':
        this.bass.set({ 
          oscillator: { type: 'square' },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.3 },
          filterEnvelope: { baseFrequency: 400, octaves: 3, attack: 0.01, decay: 0.15 }
        });
        this.chords.set({ 
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.1 }
        });
        this.pad.set({ envelope: { attack: 1, sustain: 0.5, release: 2 } });
        this.lead.set({ harmonicity: 4, modulationIndex: 12 });
        this.chorus.set({ wet: 0.2 });
        this.phaser.set({ wet: 0.15 });
        break;
        
      case 'Lounge':
        this.bass.set({ 
          oscillator: { type: 'sine' },
          envelope: { attack: 0.08, decay: 0.4, sustain: 0.3, release: 0.8 },
          filterEnvelope: { baseFrequency: 200, octaves: 2, attack: 0.1 }
        });
        this.chords.set({ 
          oscillator: { type: 'sine' },
          envelope: { attack: 0.15, decay: 0.4, sustain: 0.5, release: 1.2 }
        });
        this.pad.set({ envelope: { attack: 2.5, sustain: 0.7, release: 3 } });
        this.lead.set({ harmonicity: 2, modulationIndex: 4 });
        this.chorus.set({ wet: 0.35 });
        this.phaser.set({ wet: 0.1 });
        break;
        
      case 'Upbeat':
        this.bass.set({ 
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 },
          filterEnvelope: { baseFrequency: 350, octaves: 2.5, attack: 0.01 }
        });
        this.chords.set({ 
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 }
        });
        this.pad.set({ envelope: { attack: 1.5, sustain: 0.6, release: 2.5 } });
        this.lead.set({ harmonicity: 3, modulationIndex: 8 });
        this.chorus.set({ wet: 0.4 });
        this.phaser.set({ wet: 0.25 });
        break;
        
      case 'Chill':
        this.bass.set({ 
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.04, decay: 0.3, sustain: 0.2, release: 0.6 },
          filterEnvelope: { baseFrequency: 250, octaves: 2, attack: 0.05 }
        });
        this.chords.set({ 
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.03, decay: 0.4, sustain: 0.3, release: 1 }
        });
        this.pad.set({ envelope: { attack: 2, sustain: 0.6, release: 3 } });
        this.lead.set({ harmonicity: 1.5, modulationIndex: 3 });
        this.chorus.set({ wet: 0.3 });
        this.phaser.set({ wet: 0.15 });
        break;
        
      case 'Dreamy':
        this.bass.set({ 
          oscillator: { type: 'sine' },
          envelope: { attack: 1, decay: 2, sustain: 0.6, release: 4 },
          filterEnvelope: { baseFrequency: 100, octaves: 1.5, attack: 0.5 }
        });
        this.chords.set({ 
          oscillator: { type: 'sine' },
          envelope: { attack: 2, decay: 1.5, sustain: 0.7, release: 3 }
        });
        this.pad.set({ envelope: { attack: 4, sustain: 0.9, release: 6 } });
        this.lead.set({ harmonicity: 1, modulationIndex: 2 });
        this.chorus.set({ wet: 0.5 });
        this.phaser.set({ wet: 0.3 });
        break;
    }
    
    this.walkingBassIndex = 0;
    this.chordProgressionIndex = 0;
    this.arpeggioIndex = 0;
  }

  public setPhotos(photos: PhotoData[]) {
    this.photos = photos;
  }

  private step(time: number) {
    // No music without photos
    if (this.photos.length === 0) return;

    const position = Tone.Transport.position.toString().split(':');
    const bar = parseInt(position[0]);
    const beat = parseInt(position[1]);
    const sixteenth = parseInt(position[2].split('.')[0]);
    const stepIndex = (beat * 4) + sixteenth;
    
    if (bar !== this.currentBar) {
      this.currentBar = bar;
      this.chordProgressionIndex = (this.chordProgressionIndex + 1) % 4;
      this.walkingBassIndex = 0;
    }

    const photoCount = this.photos.length;
    const avgBrightness = this.photos.reduce((sum, p) => sum + p.brightness, 0) / photoCount;
    const avgHue = this.photos.reduce((sum, p) => sum + p.hue, 0) / photoCount;
    const dynamicFactor = this.getDynamicFactor();

    // ==========================================
    // UPDATE EFFECTS BASED ON PHOTO COLORS
    // ==========================================
    this.updateEffectsFromPhotos(avgHue, avgBrightness);

    // ==========================================
    // LAYER 1: PAD (1+ photos) - Always plays
    // ==========================================
    if (photoCount >= 1) {
      this.playPad(stepIndex, time, dynamicFactor);
    }

    // ==========================================
    // LAYER 2: DRUMS (Progressive based on count)
    // ==========================================
    this.playDrumsProgressive(stepIndex, time, photoCount, dynamicFactor);

    // ==========================================
    // LAYER 3: BASS (2+ photos)
    // ==========================================
    if (photoCount >= 2) {
      this.playBass(stepIndex, time, avgHue, avgBrightness, photoCount, dynamicFactor);
    }

    // ==========================================
    // LAYER 4: CHORDS (3+ photos)
    // ==========================================
    if (photoCount >= 3) {
      this.playChords(stepIndex, time, avgBrightness, photoCount, dynamicFactor);
    }

    // ==========================================
    // LAYER 5: PHOTO-DRIVEN SOUNDS (each photo triggers based on Y zone)
    // ==========================================
    this.playPhotoSounds(stepIndex, time, dynamicFactor);
  }

  // NEW: Update effects based on average photo colors
  private updateEffectsFromPhotos(avgHue: number, avgBrightness: number) {
    // Hue affects filter frequency (warm colors = lower, cool colors = higher)
    const filterFreq = 800 + (avgHue / 360) * 2500; // 800-3300 Hz
    this.filter.frequency.rampTo(filterFreq, 0.5);
    
    // Brightness affects reverb wet (brighter = more reverb)
    const reverbWet = 0.2 + (avgBrightness / 255) * 0.4; // 0.2-0.6
    this.reverb.wet.rampTo(reverbWet, 0.5);
    
    // Brightness also affects delay feedback
    const delayFeedback = 0.15 + (avgBrightness / 255) * 0.3; // 0.15-0.45
    this.delay.feedback.rampTo(delayFeedback, 0.5);
  }

  private playPad(stepIndex: number, time: number, dynamicFactor: number) {
    if (stepIndex !== 0) return;
    
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!chords) return;
    
    const currentChord = chords[this.chordProgressionIndex];
    const velocity = this.humanizeVelocity(0.25 * dynamicFactor);
    
    this.pad.triggerAttackRelease(currentChord, "1n", time + this.humanizeTime(), velocity);
  }

  // NEW: Progressive drums based on photo count
  private playDrumsProgressive(stepIndex: number, time: number, photoCount: number, dynamicFactor: number) {
    const pattern = DRUM_PATTERNS[this.currentStyle];
    if (!pattern) return;
    
    // 1 photo: Only soft hihat on beats
    if (photoCount === 1) {
      if (stepIndex % 4 === 0) {
        const vel = this.humanizeVelocity(0.15 * dynamicFactor);
        this.drums.hihat.triggerAttackRelease("32n", time + this.humanizeTime(), vel);
      }
      return;
    }
    
    // 2 photos: Add kick on downbeat + more hihat
    if (photoCount === 2) {
      if (stepIndex === 0 || stepIndex === 8) {
        const vel = this.humanizeVelocity(0.4 * dynamicFactor);
        this.drums.kick.triggerAttackRelease("C1", "8n", time + this.humanizeTime(), vel);
      }
      if (stepIndex % 4 === 0) {
        const vel = this.humanizeVelocity(0.2 * dynamicFactor);
        this.drums.hihat.triggerAttackRelease("32n", time + this.humanizeTime(), vel);
      }
      return;
    }
    
    // 3+ photos: Full drum pattern
    const density = Math.min(photoCount / 5, 1);
    const baseVelocity = (0.4 + 0.5 * density) * dynamicFactor;
    const hihatVel = this.currentStyle === 'Dreamy' ? 0.1 : (0.2 + 0.3 * density) * dynamicFactor;
    
    if (pattern.kick.includes(stepIndex)) {
      const vel = this.humanizeVelocity(baseVelocity);
      this.drums.kick.triggerAttackRelease("C1", "8n", time + this.humanizeTime(), vel);
    }
    
    // 4+ photos: Add snare
    if (photoCount >= 4 && pattern.snare.includes(stepIndex)) {
      const snareVel = this.currentStyle === 'Lounge' ? baseVelocity * 0.4 : baseVelocity;
      const vel = this.humanizeVelocity(snareVel);
      this.drums.snare.triggerAttackRelease("16n", time + this.humanizeTime(), vel);
    }
    
    if (pattern.hihat.includes(stepIndex)) {
      const isAccent = pattern.accent?.includes(stepIndex);
      const baseHihatVel = isAccent ? hihatVel * 1.4 : hihatVel;
      const vel = this.humanizeVelocity(baseHihatVel);
      this.drums.hihat.triggerAttackRelease("32n", time + this.humanizeTime(), vel);
    }
    
    // 5+ photos: Extra percussion accents
    if (photoCount >= 5 && stepIndex % 8 === 4) {
      const vel = this.humanizeVelocity(0.35 * dynamicFactor);
      this.drums.hihat.triggerAttackRelease("16n", time + this.humanizeTime(), vel);
    }
  }

  private playBass(stepIndex: number, time: number, hue: number, brightness: number, photoCount: number, dynamicFactor: number) {
    const bassPattern = BASS_PATTERNS[this.currentStyle];
    const scale = SCALES[this.currentStyle];
    const chords = CHORD_PROGRESSIONS[this.currentStyle];
    if (!bassPattern || !scale || !chords) return;
    
    const density = Math.min(photoCount / 5, 1);
    const baseVelocity = (0.5 + 0.4 * (brightness / 255) * density) * dynamicFactor;
    const currentChord = chords[this.chordProgressionIndex];
    
    switch (bassPattern.style) {
      case 'syncopated':
        if (bassPattern.steps.includes(stepIndex)) {
          const noteIdx = Math.floor((hue / 360) * scale.length);
          const note = scale[noteIdx % scale.length];
          const vel = this.humanizeVelocity(baseVelocity);
          this.bass.triggerAttackRelease(note, "16n", time + this.humanizeTime(), vel);
        }
        break;
        
      case 'walking':
        if (bassPattern.steps.includes(stepIndex)) {
          const walkNotes = bassPattern.notes || scale;
          const note = walkNotes[this.walkingBassIndex % walkNotes.length];
          const vel = this.humanizeVelocity(baseVelocity * 0.8);
          this.bass.triggerAttackRelease(note, "4n", time + this.humanizeTime(), vel);
          this.walkingBassIndex++;
        }
        break;
        
      case 'root':
        if (bassPattern.steps.includes(stepIndex)) {
          const root = currentChord[0].replace(/[0-9]/g, '') + '2';
          const vel = this.humanizeVelocity(baseVelocity);
          this.bass.triggerAttackRelease(root, "8n", time + this.humanizeTime(), vel);
        }
        break;
        
      case 'root-fifth':
        if (bassPattern.steps.includes(stepIndex)) {
          const isRoot = bassPattern.steps.indexOf(stepIndex) === 0;
          const root = currentChord[0];
          const fifth = currentChord[2] || currentChord[0];
          const note = isRoot ? root.replace(/[0-9]/g, '') + '2' : fifth.replace(/[0-9]/g, '') + '2';
          const vel = this.humanizeVelocity(baseVelocity * 0.7);
          this.bass.triggerAttackRelease(note, "4n", time + this.humanizeTime(), vel);
        }
        break;
        
      case 'sustained':
        if (stepIndex === 0) {
          const noteIdx = Math.floor((hue / 360) * scale.length);
          const note = scale[noteIdx % scale.length];
          const vel = this.humanizeVelocity(baseVelocity * 0.5);
          this.bass.triggerAttackRelease(note, "1n", time, vel);
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
    const baseVelocity = (0.3 + 0.35 * (brightness / 255)) * density * dynamicFactor;
    
    switch (chordRhythm.style) {
      case 'staccato':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.008;
            const vel = this.humanizeVelocity(baseVelocity);
            this.chords.triggerAttackRelease([note], "32n", time + this.humanizeTime() + strumDelay, vel);
          });
        }
        break;
        
      case 'comping':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.015;
            const vel = this.humanizeVelocity(baseVelocity * 0.7);
            this.chords.triggerAttackRelease([note], "8n", time + this.humanizeTime() + strumDelay, vel);
          });
        }
        break;
        
      case 'arpeggio':
        if (chordRhythm.steps.includes(stepIndex)) {
          const noteIdx = this.arpeggioIndex % currentChord.length;
          const vel = this.humanizeVelocity(baseVelocity);
          this.chords.triggerAttackRelease([currentChord[noteIdx]], "8n", time + this.humanizeTime(), vel);
          this.arpeggioIndex++;
        }
        break;
        
      case 'strummed':
        if (chordRhythm.steps.includes(stepIndex)) {
          currentChord.forEach((note, i) => {
            const strumDelay = i * 0.025;
            const vel = this.humanizeVelocity(baseVelocity * 0.6);
            this.chords.triggerAttackRelease([note], "8n", time + this.humanizeTime() + strumDelay, vel);
          });
        }
        break;
        
      case 'sustained':
        if (stepIndex === 0 && this.currentBar % 2 === 0) {
          const vel = this.humanizeVelocity(baseVelocity * 0.3);
          this.chords.triggerAttackRelease(currentChord, "2n", time, vel);
        }
        break;
    }
  }

  // NEW: Each photo triggers different instruments based on Y position zone
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
      
      const baseVelocity = Math.min(Math.max(photo.brightness / 255, 0.2), 1);
      const velocity = this.humanizeVelocity(baseVelocity * (0.3 + 0.5 * sizeFactor) * dynamicFactor);
      
      const duration: Tone.Unit.Time = sizeFactor < 0.3 ? "16n" : sizeFactor < 0.6 ? "8n" : "4n";
      
      // Y position determines which instrument plays
      const normalizedY = Math.min(Math.max(photo.y / 500, 0), 1);
      
      if (normalizedY < 0.25) {
        // Zone 1 (0-25%): Lead melody - higher octave
        const note = baseNote.replace(/[0-9]/, (m) => String(parseInt(m) + 1));
        this.lead.triggerAttackRelease(note, duration, time + this.humanizeTime(), velocity);
      } 
      else if (normalizedY < 0.5) {
        // Zone 2 (25-50%): Arpeggio - quick chord notes
        const currentChord = chords[this.chordProgressionIndex];
        const chordNote = currentChord[index % currentChord.length];
        this.chords.triggerAttackRelease([chordNote], "16n", time + this.humanizeTime(), velocity * 0.7);
      }
      else if (normalizedY < 0.75) {
        // Zone 3 (50-75%): Chord stab
        const currentChord = chords[this.chordProgressionIndex];
        currentChord.forEach((note, i) => {
          const strumDelay = i * 0.01;
          this.chords.triggerAttackRelease([note], "8n", time + this.humanizeTime() + strumDelay, velocity * 0.5);
        });
      }
      else {
        // Zone 4 (75-100%): Percussion accent
        this.drums.hihat.triggerAttackRelease("16n", time + this.humanizeTime(), velocity * 0.6);
        if (sizeFactor > 0.5) {
          // Bigger photos also trigger a low percussion
          this.drums.kick.triggerAttackRelease("G1", "16n", time + this.humanizeTime(), velocity * 0.3);
        }
      }
    });
  }
}
