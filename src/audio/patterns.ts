// ============================================
// SCALES - 每种风格的音阶
// ============================================
export const SCALES: Record<string, string[]> = {
  // Groove: Dorian/Minor pentatonic for that groovy feel
  Groove: ['C2', 'D2', 'Eb2', 'F2', 'G2', 'A2', 'Bb2', 'C3'],
  
  // Lounge: Blues scale with chromatic passing tones
  Lounge: ['C2', 'D2', 'Eb2', 'E2', 'F2', 'Gb2', 'G2', 'A2', 'Bb2', 'B2', 'C3'],
  
  // Upbeat: Major scale, bright and anthemic
  Upbeat: ['E2', 'F#2', 'G#2', 'A2', 'B2', 'C#3', 'D#3', 'E3'],
  
  // Chill: Major with lydian touches
  Chill: ['C2', 'D2', 'E2', 'F#2', 'G2', 'A2', 'B2', 'C3'],
  
  // Dreamy: Pentatonic for peaceful, open sound
  Dreamy: ['C2', 'D2', 'E2', 'G2', 'A2', 'C3', 'D3', 'E3', 'G3', 'A3'],
};

// ============================================
// CHORD_PROGRESSIONS - 每种风格的和弦进行
// ============================================
export const CHORD_PROGRESSIONS: Record<string, string[][]> = {
  // Groove: 9th chords, tight and punchy
  Groove: [
    ['E3', 'G#3', 'B3', 'D4'],      // E7
    ['A3', 'C#4', 'E4', 'G4'],      // A7
    ['E3', 'G#3', 'B3', 'D4'],      // E7
    ['B3', 'D#4', 'F#4', 'A4'],     // B7
  ],
  
  // Lounge: ii-V-I progression with 7th chords
  Lounge: [
    ['D3', 'F3', 'A3', 'C4'],       // Dm7
    ['G3', 'B3', 'D4', 'F4'],       // G7
    ['C3', 'E3', 'G3', 'B3'],       // Cmaj7
    ['C3', 'E3', 'G3', 'B3'],       // Cmaj7
  ],
  
  // Upbeat: Anthemic progression
  Upbeat: [
    ['E3', 'G3', 'B3'],             // Em
    ['G3', 'B3', 'D4'],             // G
    ['D3', 'F#3', 'A3'],            // D
    ['A3', 'C#4', 'E4'],            // A
  ],
  
  // Chill: Smooth maj7 and m7 chords
  Chill: [
    ['C3', 'E3', 'G3', 'B3'],       // Cmaj7
    ['A3', 'C4', 'E4', 'G4'],       // Am7
    ['D3', 'F3', 'A3', 'C4'],       // Dm7
    ['G3', 'B3', 'D4', 'F4'],       // G7
  ],
  
  // Dreamy: Open, sustained chords
  Dreamy: [
    ['C3', 'G3', 'C4', 'E4'],       // Cmaj (open)
    ['G3', 'D4', 'G4', 'B4'],       // G (open)
    ['A3', 'E4', 'A4', 'C5'],       // Am (open)
    ['F3', 'C4', 'F4', 'A4'],       // F (open)
  ],
};

// ============================================
// BASS_PATTERNS - Bass 演奏模式
// ============================================
export type BassStyle = 'syncopated' | 'walking' | 'root' | 'root-fifth' | 'sustained';

export const BASS_PATTERNS: Record<string, {
  style: BassStyle;
  steps: number[];
  notes?: string[];  // For walking bass
}> = {
  // Groove: Syncopated slap bass
  Groove: {
    style: 'syncopated',
    steps: [0, 3, 6, 8, 10, 14],  // Funky syncopation
  },
  
  // Lounge: Walking bass - one note per beat
  Lounge: {
    style: 'walking',
    steps: [0, 4, 8, 12],  // Quarter notes
    notes: ['C2', 'E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'G3'],  // Walking line
  },
  
  // Upbeat: Steady root notes, driving
  Upbeat: {
    style: 'root',
    steps: [0, 4, 8, 12],  // Straight quarter notes
  },
  
  // Chill: Root and fifth alternating
  Chill: {
    style: 'root-fifth',
    steps: [0, 10],  // Classic bossa bass rhythm
  },
  
  // Dreamy: Long sustained notes
  Dreamy: {
    style: 'sustained',
    steps: [0],  // One note per bar, held long
  },
};

// ============================================
// CHORD_RHYTHMS - 和弦演奏节奏和方式
// ============================================
export type ChordStyle = 'staccato' | 'arpeggio' | 'sustained' | 'comping' | 'strummed';

export const CHORD_RHYTHMS: Record<string, {
  style: ChordStyle;
  steps: number[];
  duration: string;  // Tone.js duration
}> = {
  // Groove: Staccato chicken scratch
  Groove: {
    style: 'staccato',
    steps: [2, 5, 7, 10, 13, 15],  // Off-beat scratching
    duration: '32n',  // Very short
  },
  
  // Lounge: Comping - irregular, responsive
  Lounge: {
    style: 'comping',
    steps: [0, 6, 10, 14],  // Syncopated comping
    duration: '8n',
  },
  
  // Upbeat: Strummed arpeggios
  Upbeat: {
    style: 'arpeggio',
    steps: [0, 2, 4, 6, 8, 10, 12, 14],  // 8th note arpeggios
    duration: '8n',
  },
  
  // Chill: Gentle strumming
  Chill: {
    style: 'strummed',
    steps: [0, 3, 6, 8, 10, 14],  // Bossa guitar pattern
    duration: '8n',
  },
  
  // Dreamy: Long sustained pads
  Dreamy: {
    style: 'sustained',
    steps: [0],  // Once per bar
    duration: '1n',  // Whole note
  },
};

// ============================================
// DRUM_PATTERNS - 16步鼓点模式
// ============================================
export const DRUM_PATTERNS: Record<string, {
  kick: number[];
  snare: number[];
  hihat: number[];
  accent?: number[];  // 重音位置
}> = {
  // Groove: Heavy syncopation, 16th note feel
  Groove: {
    kick: [0, 3, 6, 10, 12, 15],   // Strong syncopation
    snare: [4, 12],                 // Backbeat
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],  // 16th notes!
    accent: [0, 4, 8, 12],          // Accent on beats
  },
  
  // Lounge: Swing ride pattern
  Lounge: {
    kick: [0, 10],                  // Light, supportive
    snare: [7, 15],                 // Ghost notes
    hihat: [0, 3, 4, 6, 8, 10, 12, 14, 15],  // Swing: ding-ding-a-ding
    accent: [0, 6, 12],
  },
  
  // Upbeat: Driving rock beat
  Upbeat: {
    kick: [0, 8],                   // Solid foundation
    snare: [4, 12],                 // Strong backbeat
    hihat: [0, 2, 4, 6, 8, 10, 12, 14],  // 8th notes
    accent: [4, 12],                // Snare accents
  },
  
  // Chill: Classic Brazilian pattern
  Chill: {
    kick: [0, 3, 6, 10, 12],        // Surdo pattern
    snare: [4, 7, 10, 14],          // Rim click
    hihat: [0, 2, 4, 6, 8, 10, 12, 14],  // Shaker
    accent: [0, 6, 12],
  },
  
  // Dreamy: Minimal, spacious
  Dreamy: {
    kick: [],                       // No kick
    snare: [],                      // No snare
    hihat: [0],                     // Just a shimmer
    accent: [],
  },
};

// ============================================
// STYLE_CONFIG - 每种风格的全局配置
// ============================================
export const STYLE_CONFIG: Record<string, {
  bpm: number;
  swing: number;
  reverbDecay: number;
  delayTime: number;
  delayFeedback: number;
  filterFreq: number;
}> = {
  Groove: {
    bpm: 105,
    swing: 0,
    reverbDecay: 0.8,
    delayTime: 0.125,
    delayFeedback: 0.15,
    filterFreq: 3500,
  },
  Lounge: {
    bpm: 120,
    swing: 0.6,
    reverbDecay: 2.5,
    delayTime: 0.3,
    delayFeedback: 0.25,
    filterFreq: 2000,
  },
  Upbeat: {
    bpm: 125,
    swing: 0,
    reverbDecay: 1.8,
    delayTime: 0.25,
    delayFeedback: 0.3,
    filterFreq: 4500,
  },
  Chill: {
    bpm: 75,
    swing: 0.15,
    reverbDecay: 2.0,
    delayTime: 0.2,
    delayFeedback: 0.2,
    filterFreq: 2500,
  },
  Dreamy: {
    bpm: 70,
    swing: 0,
    reverbDecay: 6,
    delayTime: 0.5,
    delayFeedback: 0.5,
    filterFreq: 1500,
  },
};

// Legacy export for backward compatibility
export const CHORDS = CHORD_PROGRESSIONS;
