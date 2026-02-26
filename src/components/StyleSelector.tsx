import React from 'react';
import { useMixerStore } from '../store/useMixerStore';
import type { MusicStyle } from '../store/useMixerStore';
import { PushBtn } from './PushBtn';
import { Knob } from './Knob';
import { Play, Square, Music2 } from 'lucide-react';

const STYLES: MusicStyle[] = ['Groove', 'Lounge', 'Upbeat', 'Chill', 'Dreamy'];

export const StyleSelector: React.FC = () => {
  const { activeStyle, setStyle, isPlaying, togglePlay, masterVolume, setVolume, bpm, setBpm } = useMixerStore();

  return (
    <div className="w-64 bg-te-panel border-r-2 border-white/20 p-6 flex flex-col gap-8 h-full shadow-inner">
      {/* Transport Controls */}
      <div className="flex flex-col items-center gap-4 bg-te-dark/5 p-4 rounded-xl border border-te-dark/10">
        <div className="flex gap-4">
          <PushBtn 
            onClick={togglePlay} 
            variant={isPlaying ? 'orange' : 'default'}
            label={isPlaying ? "STOP" : "PLAY"}
          >
            {isPlaying ? <Square size={20} /> : <Play size={20} />}
          </PushBtn>
        </div>
        
        <div className="flex gap-4 w-full justify-between px-2">
           <Knob 
            value={masterVolume} 
            min={-60} 
            max={0} 
            onChange={setVolume} 
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

      {/* Style Selection */}
      <div className="flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2 mb-2 text-te-dark/60">
           <Music2 size={16} />
           <span className="text-xs font-mono font-bold uppercase tracking-wider">TAPE / STYLE</span>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {STYLES.map((style) => (
            <button
              key={style}
              onClick={() => setStyle(style)}
              className={`
                text-left px-4 py-3 rounded-lg font-mono text-sm transition-all relative overflow-hidden group
                ${activeStyle === style 
                  ? 'bg-te-orange text-white shadow-md translate-x-1' 
                  : 'bg-te-bg text-te-dark hover:bg-white hover:shadow-sm'
                }
              `}
            >
              <div className="relative z-10 flex justify-between items-center">
                <span>{style}</span>
                {activeStyle === style && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
              </div>
              
              {/* Decorative line */}
              <div className={`absolute bottom-0 left-0 h-0.5 bg-black/10 transition-all duration-300
                ${activeStyle === style ? 'w-full' : 'w-0 group-hover:w-full'}
              `} />
            </button>
          ))}
        </div>
      </div>
      
      {/* Decorative Branding */}
      <div className="mt-auto opacity-40">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-te-dark">
          <div className="w-4 h-4 border border-te-dark rounded-sm flex items-center justify-center">K</div>
          <span>Knifey v1.0</span>
        </div>
      </div>
    </div>
  );
};
