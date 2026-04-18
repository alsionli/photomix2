import React from 'react';
import { useMixerStore } from '../store/useMixerStore';
import type { MusicStyle } from '../store/useMixerStore';
import { PushBtn } from './PushBtn';
import { Knob } from './Knob';
import { Visualizer } from './Visualizer';
import { Play, Square } from 'lucide-react';

const STYLES: MusicStyle[] = ['Groove', 'Lounge', 'Upbeat', 'Chill', 'Dreamy'];

export const StyleSelector: React.FC = () => {
  const { activeStyle, setStyle, isPlaying, togglePlay, masterVolume, setVolume, bpm, setBpm } = useMixerStore();

  return (
    <div className="w-64 bg-te-panel flex flex-col h-full relative"
      style={{
        boxShadow: `
          inset -1px 0 0 rgba(255,255,255,0.3),
          1px 0 0 rgba(0,0,0,0.06)
        `,
      }}
    >
      {/* Transport Controls */}
      <div className="p-5 flex flex-col items-center gap-5">
        <div className="flex gap-4">
          <PushBtn 
            onClick={togglePlay} 
            variant={isPlaying ? 'orange' : 'default'}
            label={isPlaying ? "STOP" : "PLAY"}
          >
            {isPlaying ? <Square size={18} /> : <Play size={18} />}
          </PushBtn>
        </div>
        
        <div className="flex gap-6 w-full justify-center">
           <Knob 
            value={Math.round((masterVolume + 60) / 60 * 100)} 
            min={0} 
            max={100} 
            onChange={(v) => setVolume(v / 100 * 60 - 60)} 
            label="VOL" 
          />
          <Knob 
            value={bpm} 
            min={60} 
            max={180} 
            onChange={setBpm} 
            label="BPM" 
          />
        </div>
      </div>

      {/* Divider groove */}
      <div className="mx-4 h-px bg-te-dark/8" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.4)' }} />

      {/* Style Selection */}
      <div className="flex flex-col gap-2 flex-1 p-5">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-te-gray mb-1">Style</span>
        
        <div className="flex flex-col gap-1.5">
          {STYLES.map((style) => (
            <button
              key={style}
              onClick={() => setStyle(style)}
              className={`
                text-left px-3 py-2 rounded-md font-mono text-sm transition-all relative overflow-hidden
                ${activeStyle === style 
                  ? 'bg-te-orange text-white braun-raised' 
                  : 'bg-te-surface/60 text-te-dark/70 hover:bg-te-surface hover:text-te-dark'
                }
              `}
            >
              <div className="relative z-10 flex justify-between items-center">
                <span className="font-medium">{style}</span>
                {activeStyle === style && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Speaker grid — static dot matrix with an audio-reactive LED overlay. */}
      <div className="mx-5 mb-4 flex-shrink-0">
        <div className="h-20 relative overflow-hidden">
          <div className="speaker-grid absolute inset-0 opacity-20" />
          <Visualizer width={216} height={80} />
        </div>
      </div>
      
      {/* Branding */}
      <div className="px-5 pb-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-te-gray/60 font-semibold">PhotoMix</span>
      </div>
    </div>
  );
};
