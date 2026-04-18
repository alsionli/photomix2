import { create } from 'zustand';

export type MusicStyle = 'Groove' | 'Lounge' | 'Upbeat' | 'Chill' | 'Dreamy';

interface PhotoData {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: [number, number, number];
  palette: [number, number, number][];
  hue: number;
  brightness: number;
  contrast: number;
}

interface MixerState {
  activeStyle: MusicStyle;
  isPlaying: boolean;
  masterVolume: number; // -60 to 0 dB
  bpm: number;
  photos: PhotoData[];
  canvasWidth: number;
  canvasHeight: number;

  // Actions
  setStyle: (style: MusicStyle) => void;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  setBpm: (bpm: number) => void;
  addPhoto: (photo: PhotoData) => void;
  removePhoto: (id: string) => void;
  updatePhotoPosition: (id: string, x: number, y: number) => void;
  updatePhotoSize: (id: string, width: number, height: number) => void;
  updatePhotoAnalysis: (id: string, analysis: Pick<PhotoData, 'dominantColor' | 'palette' | 'brightness' | 'contrast' | 'hue'>) => void;
  setCanvasSize: (width: number, height: number) => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  activeStyle: 'Groove',
  isPlaying: false,
  masterVolume: -10,
  bpm: 120,
  photos: [],
  canvasWidth: 800,
  canvasHeight: 500,

  setStyle: (style) => set({ activeStyle: style }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (vol) => set({ masterVolume: vol }),
  setBpm: (bpm) => set({ bpm }),
  
  addPhoto: (photo) => set((state) => ({ photos: [...state.photos, photo] })),
  removePhoto: (id) => set((state) => ({ photos: state.photos.filter(p => p.id !== id) })),
  updatePhotoPosition: (id, x, y) => set((state) => ({
    photos: state.photos.map(p => p.id === id ? { ...p, x, y } : p)
  })),
  updatePhotoSize: (id, width, height) => set((state) => ({
    photos: state.photos.map(p => p.id === id ? { ...p, width, height } : p)
  })),
  updatePhotoAnalysis: (id, analysis) => set((state) => ({
    photos: state.photos.map(p => p.id === id ? { ...p, ...analysis } : p)
  })),
  setCanvasSize: (width, height) => set({ canvasWidth: width, canvasHeight: height }),
}));
