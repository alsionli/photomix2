import { useEffect, useRef } from 'react';
import { useMixerStore } from '../store/useMixerStore';
import { AudioManager } from '../audio/AudioManager';

export const useAudioEngine = () => {
  const { activeStyle, isPlaying, masterVolume, bpm, photos } = useMixerStore();
  const audioManagerRef = useRef<AudioManager | null>(null);

  // Lazy Initialization
  useEffect(() => {
    if (!audioManagerRef.current) {
        try {
            audioManagerRef.current = AudioManager.getInstance();
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

  // Sync Style
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.updateStyle(activeStyle);
  }, [activeStyle]);

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

  // Sync Photos
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    manager.setPhotos(photos);
  }, [photos]);
};
