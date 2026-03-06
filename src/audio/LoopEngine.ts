import * as Tone from 'tone';
import type { MusicStyle } from '../store/useMixerStore';
import { STYLE_CONFIG } from './patterns';

type NoteEvent = [number, string, string, number]; // [step, note, duration, velocity]
type HitEvent = [number, number]; // [step, velocity]

interface LoopSet {
  rhythmA: Tone.ToneAudioBuffer;
  rhythmB: Tone.ToneAudioBuffer;
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
  private atmospherePlayer: Tone.Player | null = null;

  private rhythmChannel: Tone.Channel;
  private atmosphereChannel: Tone.Channel;

  private currentStyle: MusicStyle = 'Groove';
  private currentVariation = 0;
  private photoCount = 0;

  public isLoaded = false;

  constructor(output: Tone.InputNode) {
    this.rhythmChannel = new Tone.Channel(-2, 0).connect(output as unknown as Tone.ToneAudioNode);
    this.atmosphereChannel = new Tone.Channel(-6, 0).connect(output as unknown as Tone.ToneAudioNode);
  }

  async generateAll() {
    const styles: MusicStyle[] = ['Groove', 'Lounge', 'Upbeat', 'Chill', 'Dreamy'];
    for (const style of styles) {
      const bpm = STYLE_CONFIG[style].bpm;
      const sixteenth = 60 / bpm / 4;
      const bars = 4;
      const duration = bars * 4 * (60 / bpm);

      // Sequential rendering: Tone.Offline temporarily swaps the global audio
      // context, so parallel calls via Promise.all corrupt the context chain.
      const rhythmA = await this.renderRhythm(style, 'A', sixteenth, bars, duration);
      const rhythmB = await this.renderRhythm(style, 'B', sixteenth, bars, duration);
      const atmosphere = await this.renderAtmosphere(style, sixteenth, bars, duration);

      this.loops.set(style, { rhythmA, rhythmB, atmosphere, bpm, duration });
    }
    this.isLoaded = true;
  }

  setStyle(style: MusicStyle) {
    const changed = this.currentStyle !== style;
    this.currentStyle = style;
    if (changed && this.isLoaded) this.restartAll();
  }

  updateFromPhotos(photos: { hue: number; brightness: number }[]) {
    this.photoCount = photos.length;
    if (!this.isLoaded) return;
    if (photos.length === 0) {
      this.stopAll();
      return;
    }

    const avgHue = photos.reduce((s, p) => s + p.hue, 0) / photos.length;
    const avgBright = photos.reduce((s, p) => s + p.brightness, 0) / photos.length;

    const newVar = avgHue > 180 ? 1 : 0;
    if (newVar !== this.currentVariation) {
      this.currentVariation = newVar;
      this.startRhythm();
    }

    // Always play atmosphere
    if (!this.atmospherePlayer) this.startAtmosphere();
    this.atmosphereChannel.volume.rampTo(photos.length >= 2 ? -6 : -10, 0.3);

    // 2+ photos: rhythm
    if (photos.length >= 2) {
      if (!this.rhythmPlayer) this.startRhythm();
      const rVol = Math.min(-2, -8 + photos.length * 1.5);
      this.rhythmChannel.volume.rampTo(rVol, 0.3);
    } else {
      this.stopRhythm();
    }

    // Brightness affects atmosphere brightness (subtle pitch/filter feel via volume)
    const brightFactor = avgBright / 255;
    this.atmosphereChannel.volume.rampTo(-10 + brightFactor * 6, 0.5);
  }

  stopAll() {
    this.stopRhythm();
    this.stopAtmosphere();
  }

  // ── Player Management ──

  private restartAll() {
    if (this.photoCount >= 2) this.startRhythm();
    if (this.photoCount >= 1) this.startAtmosphere();
  }

  private startRhythm() {
    this.stopRhythm();
    const set = this.loops.get(this.currentStyle);
    if (!set) return;
    const buf = this.currentVariation === 0 ? set.rhythmA : set.rhythmB;
    this.rhythmPlayer = new Tone.Player(buf);
    this.rhythmPlayer.loop = true;
    this.rhythmPlayer.connect(this.rhythmChannel);
    this.rhythmPlayer.sync().start(0);
  }

  private stopRhythm() {
    if (this.rhythmPlayer) {
      this.rhythmPlayer.unsync();
      this.rhythmPlayer.stop();
      this.rhythmPlayer.dispose();
      this.rhythmPlayer = null;
    }
  }

  private startAtmosphere() {
    this.stopAtmosphere();
    const set = this.loops.get(this.currentStyle);
    if (!set) return;
    this.atmospherePlayer = new Tone.Player(set.atmosphere);
    this.atmospherePlayer.loop = true;
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

  private grooveAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1.5).toDestination(); verb.wet.value = 0.3;
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.5, decay: 0.5, sustain: 0.6, release: 1.5 } }).connect(verb);
      pad.volume.value = -8;
      const chordProg: NoteEvent[][] = [
        [[0,'E3','1n',.4],[0,'G#3','1n',.35],[0,'B3','1n',.35],[0,'D4','1n',.3]],
        [[0,'A3','1n',.4],[0,'C#4','1n',.35],[0,'E4','1n',.35],[0,'G4','1n',.3]],
      ];
      for (let bar = 0; bar < bars; bar++) {
        const chord = chordProg[bar % chordProg.length];
        chord.forEach(([, note, d, vel]) => pad.triggerAttackRelease(note, d, bar * 16 * s, vel as number));
      }
    }, dur);
  }

  private loungeAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(3).toDestination(); verb.wet.value = 0.45;
      const chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 5, depth: 0.5, wet: 0.3 }).connect(verb);
      chorus.start();
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 1.5, decay: 1, sustain: 0.7, release: 3 } }).connect(chorus);
      pad.volume.value = -6;
      const chords = [
        ['D3','F3','A3','C4'],
        ['G3','B3','D4','F4'],
        ['C3','E3','G3','B3'],
        ['C3','E3','G3','B3'],
      ];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.35));
      }
    }, dur);
  }

  private upbeatAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(1.5).toDestination(); verb.wet.value = 0.2;
      const delay = new Tone.FeedbackDelay('8n', 0.2).connect(verb); delay.wet.value = 0.15;
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.5, release: 1.5 } }).connect(delay);
      pad.volume.value = -10;
      pad.set({ detune: 10 });
      const chords = [['E3','G3','B3'],['G3','B3','D4'],['D3','F#3','A3'],['A3','C#4','E4']];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.3));
      }
    }, dur);
  }

  private chillAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const lpf = new Tone.Filter(3000, 'lowpass').toDestination();
      const verb = new Tone.Reverb(2.5).connect(lpf); verb.wet.value = 0.35;
      const chorus = new Tone.Chorus({ frequency: 0.5, delayTime: 4, depth: 0.4, wet: 0.25 }).connect(verb);
      chorus.start();
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 2, decay: 1, sustain: 0.7, release: 3 } }).connect(chorus);
      pad.volume.value = -5;
      const chords = [['C3','E3','G3','B3'],['A3','C4','E4','G4'],['D3','F3','A3','C4'],['G3','B3','D4','F4']];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.35));
      }
    }, dur);
  }

  private dreamyAtmo(s: number, bars: number, dur: number) {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(6).toDestination(); verb.wet.value = 0.7;
      const delay = new Tone.FeedbackDelay('4n', 0.4).connect(verb); delay.wet.value = 0.3;
      const chorus = new Tone.Chorus({ frequency: 0.3, delayTime: 6, depth: 0.7, wet: 0.4 }).connect(delay);
      chorus.start();
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 3, decay: 2, sustain: 0.85, release: 5 } }).connect(chorus);
      pad.volume.value = -3;
      const chords = [['C3','G3','C4','E4'],['G3','D4','G4','B4'],['A3','E4','A4','C5'],['F3','C4','F4','A4']];
      for (let bar = 0; bar < bars; bar++) {
        const ch = chords[bar % chords.length];
        ch.forEach(n => pad.triggerAttackRelease(n, '1n', bar * 16 * s, 0.3));
      }
    }, dur);
  }
}
