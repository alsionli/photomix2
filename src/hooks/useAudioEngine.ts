import { useEffect, useRef } from 'react';
import { useMixerStore } from '../store/useMixerStore';
import { AudioManager } from '../audio/AudioManager';
import { STYLE_CONFIG } from '../audio/patterns';

export const useAudioEngine = () => {
  const { activeStyle, isPlaying, masterVolume, bpm, photos, setBpm, canvasWidth, canvasHeight } = useMixerStore();
  const audioManagerRef = useRef<AudioManager | null>(null);

  // Eager buffer generation on mount (no user gesture needed)
  useEffect(() => {
    if (!audioManagerRef.current) {
        try {
            audioManagerRef.current = AudioManager.getInstance();
            audioManagerRef.current.warmUp();
        } catch (e) {
            console.error("Failed to initialize Audio Engine:", e);
        }
    }
  }, []);

  // Sync Playback
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    
    const handlePlay = async () => {
        if (isPlaying) {
            await manager.initialize();
            manager.togglePlay(true);
        } else {
            manager.togglePlay(false);
        }
    };
    handlePlay();
  }, [isPlaying]);

  // Sync Style — also update store BPM to match the style's default
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.updateStyle(activeStyle);
    const config = STYLE_CONFIG[activeStyle];
    if (config) {
      setBpm(config.bpm);
    }
  }, [activeStyle, setBpm]);

  // Sync Volume
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.setVolume(masterVolume);
  }, [masterVolume]);

  // Sync BPM
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.setBpm(bpm);
  }, [bpm]);

  // Sync canvas dimensions so the audio engine can normalize photo coords.
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.setCanvasSize(canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight]);

  // Sync Photos — auto-play when first photo is added
  const prevPhotoCount = useRef(0);
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.setPhotos(photos);

    if (photos.length > 0 && prevPhotoCount.current === 0 && !isPlaying) {
      useMixerStore.getState().togglePlay();
    }
    if (photos.length === 0 && prevPhotoCount.current > 0 && isPlaying) {
      useMixerStore.getState().togglePlay();
    }
    prevPhotoCount.current = photos.length;
  }, [photos, isPlaying]);
};
