import React from 'react';
import { DeviceContainer } from './components/DeviceContainer';
import { StyleSelector } from './components/StyleSelector';
import { MixerCanvas } from './components/MixerCanvas';
import { Visualizer } from './components/Visualizer';
import { useAudioEngine } from './hooks/useAudioEngine';

function App() {
  // Initialize Audio Engine Logic
  useAudioEngine();

  return (
    <DeviceContainer>
      <StyleSelector />
      <div className="flex-1 relative bg-te-bg rounded-r-2xl overflow-hidden flex flex-col">
         {/* Top Bar */}
         <div className="h-12 border-b border-te-dark/10 flex items-center px-6 font-mono text-xs text-te-dark/60 justify-between select-none">
            <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-te-orange animate-pulse" />
                READY
            </span>
            <Visualizer />
            <span>STEREO OUT L/R</span>
         </div>
         
         <div className="flex-1 relative">
            <MixerCanvas />
         </div>
      </div>
    </DeviceContainer>
  );
}

export default App;
