import * as Tone from 'tone';

export class DrumSampler {
  private buffers = new Map<string, Tone.ToneAudioBuffer>();
  private output: Tone.InputNode;
  public isLoaded = false;

  constructor(output: Tone.InputNode) {
    this.output = output;
  }

  async generate() {
    const [kick, snare, hihatClosed, hihatOpen, clap, rim] = await Promise.all([
      this.renderKick(),
      this.renderSnare(),
      this.renderHihatClosed(),
      this.renderHihatOpen(),
      this.renderClap(),
      this.renderRim(),
    ]);
    this.buffers.set('kick', kick);
    this.buffers.set('snare', snare);
    this.buffers.set('hihatClosed', hihatClosed);
    this.buffers.set('hihatOpen', hihatOpen);
    this.buffers.set('clap', clap);
    this.buffers.set('rim', rim);
    this.isLoaded = true;
  }

  trigger(name: string, time: number, velocity = 0.8) {
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = new Tone.ToneBufferSource(buffer);
    const gain = new Tone.Gain(Math.min(1, Math.max(0.05, velocity)));
    source.connect(gain);
    gain.connect(this.output as unknown as Tone.ToneAudioNode);
    source.start(time);
    source.onended = () => {
      source.dispose();
      gain.dispose();
    };
  }

  // ── Kick: sub body + click transient + saturation ──
  private renderKick(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const comp = new Tone.Compressor(-18, 5).toDestination();
      const dist = new Tone.Distortion(0.08).connect(comp);
      const lpf = new Tone.Filter(120, 'lowpass', -24).connect(comp);

      const body = new Tone.MembraneSynth({
        pitchDecay: 0.06,
        octaves: 8,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.003, decay: 0.45, sustain: 0, release: 0.3 },
      }).connect(dist);

      const sub = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 },
      }).connect(lpf);
      sub.volume.value = -6;

      const click = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.008 },
      });
      const clickHpf = new Tone.Filter(4000, 'highpass').connect(comp);
      click.connect(clickHpf);
      click.volume.value = -18;

      body.triggerAttackRelease('C1', 0.35, 0, 0.95);
      sub.triggerAttackRelease('C1', 0.5, 0, 0.7);
      click.triggerAttackRelease(0.012, 0);
    }, 0.8);
  }

  // ── Snare: noise body + tone + compression ──
  private renderSnare(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const comp = new Tone.Compressor(-15, 4).toDestination();
      const verb = new Tone.Reverb(0.4).connect(comp);
      verb.wet.value = 0.15;

      const noise = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 },
      });
      const bpf = new Tone.Filter(3500, 'bandpass').connect(verb);
      noise.connect(bpf);
      noise.volume.value = -4;

      const tone = new Tone.MembraneSynth({
        pitchDecay: 0.015,
        octaves: 4,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
      }).connect(verb);
      tone.volume.value = -10;

      const snap = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.015 },
      });
      const snapHpf = new Tone.Filter(6000, 'highpass').connect(comp);
      snap.connect(snapHpf);
      snap.volume.value = -12;

      noise.triggerAttackRelease(0.18, 0);
      tone.triggerAttackRelease('E3', 0.1, 0, 0.8);
      snap.triggerAttackRelease(0.025, 0);
    }, 0.5);
  }

  // ── Hi-hat closed: filtered noise, tight ──
  private renderHihatClosed(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const hpf = new Tone.Filter(7000, 'highpass').toDestination();
      const bpf = new Tone.Filter(10000, 'bandpass').connect(hpf);

      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      }).connect(bpf);

      const metal = new Tone.MetalSynth({
        frequency: 400,
        envelope: { attack: 0.001, decay: 0.035, release: 0.015 },
        harmonicity: 5.1,
        modulationIndex: 40,
        resonance: 5000,
        octaves: 1.5,
      } as unknown as Tone.MetalSynthOptions).connect(hpf);
      metal.volume.value = -10;

      noise.triggerAttackRelease(0.04, 0);
      metal.triggerAttackRelease(0.035, 0, 0.6);
    }, 0.15);
  }

  // ── Hi-hat open: longer decay ──
  private renderHihatOpen(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const hpf = new Tone.Filter(6000, 'highpass').toDestination();

      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.02, release: 0.15 },
      }).connect(hpf);

      const metal = new Tone.MetalSynth({
        frequency: 350,
        envelope: { attack: 0.001, decay: 0.2, release: 0.1 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4500,
        octaves: 1.5,
      } as unknown as Tone.MetalSynthOptions).connect(hpf);
      metal.volume.value = -8;

      noise.triggerAttackRelease(0.25, 0);
      metal.triggerAttackRelease(0.2, 0, 0.5);
    }, 0.5);
  }

  // ── Clap: layered noise bursts ──
  private renderClap(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const verb = new Tone.Reverb(0.6).toDestination();
      verb.wet.value = 0.25;
      const bpf = new Tone.Filter(1500, 'bandpass').connect(verb);

      for (let i = 0; i < 3; i++) {
        const n = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.015 },
        }).connect(bpf);
        n.volume.value = -6;
        n.triggerAttackRelease(0.02, i * 0.012);
      }

      const tail = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      }).connect(bpf);
      tail.volume.value = -4;
      tail.triggerAttackRelease(0.15, 0.036);
    }, 0.5);
  }

  // ── Rim shot: sharp, metallic ──
  private renderRim(): Promise<Tone.ToneAudioBuffer> {
    return Tone.Offline(() => {
      const hpf = new Tone.Filter(2000, 'highpass').toDestination();

      const tone = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
      }).connect(hpf);
      tone.volume.value = -6;

      const noise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
      }).connect(hpf);
      noise.volume.value = -12;

      tone.triggerAttackRelease('D5', 0.04, 0, 0.9);
      noise.triggerAttackRelease(0.015, 0);
    }, 0.2);
  }
}
