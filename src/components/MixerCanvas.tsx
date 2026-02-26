import React, { useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMixerStore } from '../store/useMixerStore';
import { analyzeImage } from '../utils/analyzeImage';
import { PhotoCard } from './PhotoCard';
import { Upload } from 'lucide-react';
import { cn } from '../utils/cn';

export const MixerCanvas: React.FC = () => {
  const { photos, addPhoto, updatePhotoAnalysis } = useMixerStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:onDrop',message:'onDrop triggered',data:{fileCount:acceptedFiles.length,hasContainerRef:!!containerRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:onDrop',message:'Container rect',data:{rectWidth:rect.width,rectHeight:rect.height,rectTop:rect.top,rectLeft:rect.left},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Process files sequentially or parallel
    for (const file of acceptedFiles) {
      // Random initial position if dropped generally, or use drop coordinates if possible
      // react-dropzone doesn't give drop coordinates easily for the 'drop' event unless we use the event directly
      // But onDrop gives files. We'll just center them or randomize slightly.
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);

      // Load image to get natural dimensions and preserve aspect ratio
      const img = new Image();
      img.src = url;
      await new Promise((resolve) => { img.onload = resolve; });

      const aspectRatio = img.naturalWidth / img.naturalHeight;
      const baseSize = 140;
      let width: number, height: number;
      if (aspectRatio >= 1) {
        width = baseSize;
        height = baseSize / aspectRatio;
      } else {
        height = baseSize;
        width = baseSize * aspectRatio;
      }

      // Center the photo with slight offset for multiple photos
      const currentPhotos = useMixerStore.getState().photos;
      const existingPhotos = currentPhotos.length;
      const offsetX = (existingPhotos % 5) * 30 - 60; // Spread horizontally (-60 to +60)
      const offsetY = (existingPhotos % 3) * 30 - 30; // Spread vertically (-30 to +30)
      const x = Math.max(0, Math.min((rect.width - width) / 2 + offsetX, rect.width - width));
      const y = Math.max(0, Math.min((rect.height - height) / 2 + offsetY, rect.height - height));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:onDrop',message:'Adding photo',data:{id,x,y,url,width,height,aspectRatio},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      addPhoto({
        id,
        url, // Note: In prod we might want to handle cleanup
        x,
        y,
        width,
        height,
        aspectRatio,
        dominantColor: [0, 0, 0],
        palette: [[0, 0, 0]],
        brightness: 128,
        contrast: 128,
        hue: 0
      });

      try {
        const analysis = await analyzeImage(file);
        updatePhotoAnalysis(id, analysis);
      } catch (error) {
        console.error("Failed to analyze image", error);
      }
    }
  }, [addPhoto, updatePhotoAnalysis]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ 
    onDrop,
    onDropRejected: (rejectedFiles) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:onDropRejected',message:'Files rejected',data:{rejectedCount:rejectedFiles.length,reasons:rejectedFiles.map(f=>({name:f.file.name,errors:f.errors}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
    },
    onDragEnter: () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:onDragEnter',message:'Drag enter detected',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    },
    accept: { 'image/*': [] },
    noClick: true // Disable click to open file dialog on the whole canvas? Maybe allow it.
  });

  const rootProps = getRootProps();
  
  return (
    <div 
        {...rootProps}
        ref={(node) => {
          // Merge refs: assign to both containerRef and dropzone's ref
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof rootProps.ref === 'function') {
            rootProps.ref(node);
          }
        }}
        className={cn(
            "w-full h-full relative bg-te-bg transition-colors overflow-hidden",
            isDragActive && "bg-te-orange/10"
        )}
        style={{
            backgroundImage: 'radial-gradient(circle at center, #888888 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0'
        }}
    >
      <input {...getInputProps()} />
      
      {/* Empty State */}
      {photos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-te-dark/40 pointer-events-none">
          <button
            type="button"
            onClick={open}
            className="w-24 h-24 border-2 border-dashed border-current rounded-xl flex items-center justify-center mb-4 hover:text-te-orange hover:border-te-orange transition-colors pointer-events-auto"
            aria-label="Upload photos"
          >
             <Upload size={32} />
          </button>
          <p className="font-mono text-sm uppercase tracking-widest">Drop Photos to Mix</p>
        </div>
      )}

      {/* Photos */}
      {(() => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/968fef06-03d0-4711-8426-0cff26aec431',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MixerCanvas.tsx:render',message:'Photos array in render',data:{photosLength:photos.length,photoIds:photos.map(p=>p.id),photoPositions:photos.map(p=>({x:p.x,y:p.y}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return null;
      })()}
      {photos.map((photo) => (
        <PhotoCard 
          key={photo.id}
          {...photo}
        />
      ))}
      
      {/* Drag Overlay Hint */}
      {isDragActive && (
         <div className="absolute inset-0 border-4 border-te-orange rounded-xl m-4 pointer-events-none flex items-center justify-center bg-white/50 z-50">
            <span className="text-te-orange font-bold font-mono text-xl">ADD TRACK</span>
         </div>
      )}
    </div>
  );
};
