import React, { useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMixerStore } from '../store/useMixerStore';
import { analyzeImage } from '../utils/analyzeImage';
import { PhotoCard } from './PhotoCard';
import { Upload } from 'lucide-react';
import { cn } from '../utils/cn';

export const MixerCanvas: React.FC = () => {
  const { photos, addPhoto, updatePhotoAnalysis, setCanvasSize } = useMixerStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Observe canvas size and report to the store so the audio engine can
  // normalize photo positions/sizes against the real canvas dimensions.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize(rect.width, rect.height);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasSize]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

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
      const baseSize = 240;
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
    onDropRejected: () => {},
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
            isDragActive && "bg-te-orange/5"
        )}
        style={{
            backgroundImage: 'radial-gradient(circle at center, #C0C0C2 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0'
        }}
    >
      <input {...getInputProps()} />
      
      {/* Empty State */}
      {photos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-te-gray pointer-events-none">
          <button
            type="button"
            onClick={open}
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 hover:text-te-orange hover:border-te-orange/40 transition-colors pointer-events-auto bg-te-bg border-2 border-dashed border-te-gray/30"
            aria-label="Upload photos"
          >
             <Upload size={28} strokeWidth={1.5} />
          </button>
          <p className="font-mono text-xs tracking-wide text-te-gray/80">Drop photos to mix</p>
        </div>
      )}

      {photos.map((photo) => (
        <PhotoCard 
          key={photo.id}
          {...photo}
        />
      ))}
      
      {/* Drag Overlay */}
      {isDragActive && (
         <div className="absolute inset-0 border-2 border-te-orange/40 rounded-lg m-6 pointer-events-none flex items-center justify-center bg-te-surface/60 z-50">
            <span className="text-te-orange font-semibold font-mono text-sm uppercase tracking-[0.15em]">Add Track</span>
         </div>
      )}
    </div>
  );
};
