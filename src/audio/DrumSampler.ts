import * as Tone from 'tone';

type StyleName = 'Groove' | 'Lounge' | 'Upbeat' | 'Chill' | 'Dreamy';

const DRUM_NAMES = ['kick', 'snare', 'hihat', 'hihatOpen', 'clap', 'rim'] as const;
type DrumName = (typeof DRUM_NAMES)[number];

export class DrumSampler {
  private kits = new Map<StyleName, Map<DrumName, Tone.ToneAudioBuffer>>();
  private currentStyle: StyleName = 'Groove';
  private output: Tone.InputNode;
  public isLoaded = false;

  constructor(output: Tone.InputNode) {
    this.output = output;
  }

  async generate() {
    const styles: StyleName[] = ['Groove', 'Lounge', 'Upbeat', 'Chill', 'Dreamy'];
    await Promise.all(styles.map((s) => this.generateKit(s)));
    this.isLoaded = true;
  }

  setStyle(style: StyleName) {
    this.currentStyle = style;
  }

  trigger(name: string, time: number, velocity = 0.8) {
    const kit = this.kits.get(this.currentStyle);
    const buffer = kit?.get(name as DrumName);
    if (!buffer) return;
    const source = new Tone.ToneBufferSource(buffer);
    const gain = new Tone.Gain(Math.min(1, Math.max(0.05, velocity)));
    source.connect(gain);
    gain.connect(this.output as unknown as Tone.ToneAudioNode);
    source.start(time);
    source.onended = () => { source.dispose(); gain.dispose(); };
  }

  private async generateKit(style: StyleName) {
    const renderers: Record<StyleName, () => Promise<Map<DrumName, Tone.ToneAudioBuffer>>> = {
      Groove: () => this.grooveKit(),
      Lounge: () => this.loungeKit(),
      Upbeat: () => this.upbeatKit(),
      Chill: () => this.chillKit(),
      Dreamy: () => this.dreamyKit(),
    };
    const kit = await renderers[style]();
    this.kits.set(style, kit);
  }

  // ═══════════════════════════════════════
  // GROOVE: Tight 808-style electronic kit
  // ═══════════════════════════════════════
  private async grooveKit() {
    const m = new Map<DrumName, Tone.ToneAudioBuffer>();

    m.set('kick', await Tone.Offline(() => {
      const comp = new Tone.Compressor(-20, 6).toDestination();
      const dist = new Tone.Distortion(0.15).connect(comp);
      new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 10,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.003, decay: 0.4, sustain: 0.01, release: 0.25 },
      }).connect(dist).triggerAttackRelease('C1', 0.3, 0, 1);
      const click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.008, sustain: 0, release: 0.005 } });
      click.connect(new Tone.Filter(5000, 'highpass').connect(comp));
      click.volume.value = -14;
      click.triggerAttackRelease(0.008, 0);
    }, 0.6));

    m.set('snare', await Tone.Offline(() => {
      const comp = new Tone.Compressor(-12, 5).toDestination();
      const noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.08 } });
      noise.connect(new Tone.Filter({ frequency: 4000, type: 'bandpass', Q: 1.5 }).connect(comp));
      noise.triggerAttackRelease(0.14, 0);
      new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 4, oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } })
        .connect(comp).triggerAttackRelease('E3', 0.08, 0, 0.7);
    }, 0.35));

    m.set('hihat', await Tone.Offline(() => {
      const hpf = new Tone.Filter(8000, 'highpass').toDestination();
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.015 } })
        .connect(hpf).triggerAttackRelease(0.03, 0);
    }, 0.1));

    m.set('hihatOpen', await Tone.Offline(() => {
      const hpf = new Tone.Filter(6000, 'highpass').toDestination();
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0.02, release: 0.12 } })
        .connect(hpf).triggerAttackRelease(0.2, 0);
    }, 0.4));

    m.set('clap', await Tone.Offline(() => {
      const verb = new Tone.Reverb(0.3).toDestination(); verb.wet.value = 0.2;
      const bpf = new Tone.Filter(1800, 'bandpass').connect(verb);
      for (let i = 0; i < 3; i++) {
        const n = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 } });
        n.connect(bpf); n.volume.value = -4; n.triggerAttackRelease(0.018, i * 0.01);
      }
      const tail = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 } });
      tail.connect(bpf); tail.triggerAttackRelease(0.12, 0.03);
    }, 0.4));

    m.set('rim', await Tone.Offline(() => {
      const hpf = new Tone.Filter(3000, 'highpass').toDestination();
      new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.02 } })
        .connect(hpf).triggerAttackRelease('D5', 0.025, 0, 0.8);
    }, 0.1));

    return m;
  }

  // ═══════════════════════════════════════
  // LOUNGE: Jazz brushes, soft ride, warm
  // ═══════════════════════════════════════
  private async loungeKit() {
    const m = new Map<DrumName, Tone.ToneAudioBuffer>();

    m.set('kick', await Tone.Offline(() => {
      const lpf = new Tone.Filter(200, 'lowpass').toDestination();
      new Tone.MembraneSynth({
        pitchDecay: 0.08, octaves: 4,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.35, sustain: 0, release: 0.4 },
      }).connect(lpf).triggerAttackRelease('A0', 0.3, 0, 0.5);
    }, 0.6));

    m.set('snare', await Tone.Offline(() => {
      const verb = new Tone.Reverb(0.8).toDestination(); verb.wet.value = 0.3;
      const bpf = new Tone.Filter({ frequency: 2000, type: 'bandpass', Q: 0.5 }).connect(verb);
      new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.02, release: 0.2 } })
        .connect(bpf).triggerAttackRelease(0.25, 0);
    }, 0.6));

    m.set('hihat', await Tone.Offline(() => {
      const verb = new Tone.Reverb(0.5).toDestination(); verb.wet.value = 0.15;
      const bpf = new Tone.Filter({ frequency: 6000, type: 'bandpass', Q: 0.8 }).connect(verb);
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.01, release: 0.08 } })
        .connect(bpf).triggerAttackRelease(0.12, 0);
    }, 0.3));

    m.set('hihatOpen', await Tone.Offline(() => {
      const verb = new Tone.Reverb(1.0).toDestination(); verb.wet.value = 0.25;
      const bpf = new Tone.Filter({ frequency: 5000, type: 'bandpass', Q: 0.6 }).connect(verb);
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.05, release: 0.3 } })
        .connect(bpf).triggerAttackRelease(0.4, 0);
    }, 0.8));

    m.set('clap', await Tone.Offline(() => {
      const verb = new Tone.Reverb(1.2).toDestination(); verb.wet.value = 0.4;
      new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.06 } })
        .connect(verb).triggerAttackRelease(0.08, 0);
    }, 0.4));

    m.set('rim', await Tone.Offline(() => {
      const verb = new Tone.Reverb(0.4).toDestination(); verb.wet.value = 0.1;
      new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.025 } })
        .connect(verb).triggerAttackRelease('A5', 0.03, 0, 0.5);
    }, 0.15));

    return m;
  }

  // ═══════════════════════════════════════
  // UPBEAT: Big rock/pop kit, punchy
  // ═══════════════════════════════════════
  private async upbeatKit() {
    const m = new Map<DrumName, Tone.ToneAudioBuffer>();

    m.set('kick', await Tone.Offline(() => {
      const comp = new Tone.Compressor(-15, 4).toDestination();
      const dist = new Tone.Distortion(0.08).connect(comp);
      new Tone.MembraneSynth({
        pitchDecay: 0.04, octaves: 9,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 },
      }).connect(dist).triggerAttackRelease('D1', 0.4, 0, 1);
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.008 } })
        .connect(new Tone.Filter(6000, 'highpass').connect(comp)).triggerAttackRelease(0.01, 0);
    }, 0.7));

    m.set('snare', await Tone.Offline(() => {
      const comp = new Tone.Compressor(-10, 6).toDestination();
      const verb = new Tone.Reverb(0.5).connect(comp); verb.wet.value = 0.15;
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.12 } })
        .connect(new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 1 }).connect(verb)).triggerAttackRelease(0.2, 0);
      new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 5, oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.06 } })
        .connect(verb).triggerAttackRelease('D3', 0.1, 0, 0.9);
    }, 0.5));

    m.set('hihat', await Tone.Offline(() => {
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.025 } })
        .connect(new Tone.Filter(9000, 'highpass').toDestination()).triggerAttackRelease(0.05, 0);
    }, 0.12));

    m.set('hihatOpen', await Tone.Offline(() => {
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0.03, release: 0.2 } })
        .connect(new Tone.Filter(7000, 'highpass').toDestination()).triggerAttackRelease(0.3, 0);
    }, 0.5));

    m.set('clap', await Tone.Offline(() => {
      const comp = new Tone.Compressor(-15, 4).toDestination();
      for (let i = 0; i < 4; i++) {
        const n = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.015 } });
        n.connect(comp); n.volume.value = -3; n.triggerAttackRelease(0.02, i * 0.008);
      }
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } })
        .connect(comp).triggerAttackRelease(0.15, 0.032);
    }, 0.4));

    m.set('rim', await Tone.Offline(() => {
      new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 } })
        .connect(new Tone.Filter(2500, 'highpass').toDestination()).triggerAttackRelease('F5', 0.03, 0, 0.9);
    }, 0.1));

    return m;
  }

  // ═══════════════════════════════════════
  // CHILL: Lo-fi, warm, vinyl feel
  // ═══════════════════════════════════════
  private async chillKit() {
    const m = new Map<DrumName, Tone.ToneAudioBuffer>();

    m.set('kick', await Tone.Offline(() => {
      const lpf = new Tone.Filter(300, 'lowpass').toDestination();
      new Tone.MembraneSynth({
        pitchDecay: 0.07, octaves: 5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.3 },
      }).connect(lpf).triggerAttackRelease('B0', 0.3, 0, 0.7);
    }, 0.6));

    m.set('snare', await Tone.Offline(() => {
      const lpf = new Tone.Filter(4000, 'lowpass').toDestination();
      const verb = new Tone.Reverb(0.6).connect(lpf); verb.wet.value = 0.2;
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.003, decay: 0.12, sustain: 0, release: 0.1 } })
        .connect(verb).triggerAttackRelease(0.12, 0);
    }, 0.4));

    m.set('hihat', await Tone.Offline(() => {
      const lpf = new Tone.Filter(8000, 'lowpass').toDestination();
      const bpf = new Tone.Filter({ frequency: 5000, type: 'bandpass', Q: 1 }).connect(lpf);
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.04 } })
        .connect(bpf).triggerAttackRelease(0.06, 0);
    }, 0.15));

    m.set('hihatOpen', await Tone.Offline(() => {
      const lpf = new Tone.Filter(7000, 'lowpass').toDestination();
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.003, decay: 0.2, sustain: 0.02, release: 0.15 } })
        .connect(lpf).triggerAttackRelease(0.2, 0);
    }, 0.4));

    m.set('clap', await Tone.Offline(() => {
      const lpf = new Tone.Filter(3000, 'lowpass').toDestination();
      const verb = new Tone.Reverb(0.8).connect(lpf); verb.wet.value = 0.3;
      new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.003, decay: 0.1, sustain: 0, release: 0.08 } })
        .connect(verb).triggerAttackRelease(0.1, 0);
    }, 0.4));

    m.set('rim', await Tone.Offline(() => {
      const lpf = new Tone.Filter(5000, 'lowpass').toDestination();
      new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 } })
        .connect(lpf).triggerAttackRelease('G5', 0.04, 0, 0.5);
    }, 0.12));

    return m;
  }

  // ═══════════════════════════════════════
  // DREAMY: Ethereal textures, ambient
  // ═══════════════════════════════════════
  private async dreamyKit() {
    const m = new Map<DrumName, Tone.ToneAudioBuffer>();

    m.set('kick', await Tone.Offline(() => {
      const verb = new Tone.Reverb(2.0).toDestination(); verb.wet.value = 0.5;
      const lpf = new Tone.Filter(150, 'lowpass').connect(verb);
      new Tone.MembraneSynth({
        pitchDecay: 0.15, octaves: 3,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.6, sustain: 0, release: 0.5 },
      }).connect(lpf).triggerAttackRelease('G0', 0.5, 0, 0.4);
    }, 1.2));

    m.set('snare', await Tone.Offline(() => {
      const verb = new Tone.Reverb(2.5).toDestination(); verb.wet.value = 0.6;
      const bpf = new Tone.Filter({ frequency: 1500, type: 'bandpass', Q: 0.4 }).connect(verb);
      new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.3 } })
        .connect(bpf).triggerAttackRelease(0.4, 0);
    }, 1.0));

    m.set('hihat', await Tone.Offline(() => {
      const verb = new Tone.Reverb(1.5).toDestination(); verb.wet.value = 0.5;
      const bpf = new Tone.Filter({ frequency: 4000, type: 'bandpass', Q: 0.5 }).connect(verb);
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.03, release: 0.15 } })
        .connect(bpf).triggerAttackRelease(0.2, 0);
    }, 0.6));

    m.set('hihatOpen', await Tone.Offline(() => {
      const verb = new Tone.Reverb(3.0).toDestination(); verb.wet.value = 0.6;
      new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.02, decay: 0.8, sustain: 0.08, release: 0.5 } })
        .connect(new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 0.3 }).connect(verb)).triggerAttackRelease(0.8, 0);
    }, 1.5));

    m.set('clap', await Tone.Offline(() => {
      const verb = new Tone.Reverb(2.0).toDestination(); verb.wet.value = 0.5;
      new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.12 } })
        .connect(verb).triggerAttackRelease(0.15, 0);
    }, 0.8));

    m.set('rim', await Tone.Offline(() => {
      const verb = new Tone.Reverb(2.0).toDestination(); verb.wet.value = 0.4;
      new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.06 } })
        .connect(verb).triggerAttackRelease('C6', 0.08, 0, 0.3);
    }, 0.5));

    return m;
  }
}
