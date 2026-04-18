import { DeviceContainer } from './components/DeviceContainer';
import { StyleSelector } from './components/StyleSelector';
import { MixerCanvas } from './components/MixerCanvas';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useMixerStore } from './store/useMixerStore';

function App() {
  useAudioEngine();
  const hasPhotos = useMixerStore(s => s.photos.length > 0);

  return (
    <DeviceContainer>
      <StyleSelector />
      <div className="flex-1 relative bg-te-bg overflow-hidden flex flex-col">
         <div className="h-14 flex items-center px-6 font-mono text-[10px] text-te-gray justify-between select-none"
           style={{
             borderBottom: '1px solid rgba(0,0,0,0.06)',
             boxShadow: '0 1px 0 rgba(255,255,255,0.4)',
           }}
         >
            <span className="flex items-center gap-2.5 uppercase tracking-[0.15em] font-semibold">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${hasPhotos ? 'bg-green-500' : 'bg-te-amber'}`}
                  style={{ boxShadow: `0 0 6px ${hasPhotos ? 'rgba(34,197,94,0.5)' : 'rgba(232,160,32,0.5)'}` }}
                />
                Ready
            </span>

            <span className="uppercase tracking-[0.15em] font-semibold">Stereo Out</span>
         </div>
         
         <div className="flex-1 relative">
            <MixerCanvas />
         </div>
      </div>
    </DeviceContainer>
  );
}

export default App;
