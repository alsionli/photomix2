import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMixerStore } from '../store/useMixerStore';
import { analyzeImage } from '../utils/analyzeImage';
import { PhotoCard } from './PhotoCard';
import { Play, Upload } from 'lucide-react';
import { cn } from '../utils/cn';

const DEMO_SCENES = [
  {
    name: 'sunset-drive.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#F2B36F"/><stop offset=".55" stop-color="#DF6A4D"/><stop offset="1" stop-color="#713B55"/></linearGradient>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#423748"/><stop offset="1" stop-color="#171B28"/></linearGradient>
      </defs>
      <rect width="960" height="640" fill="url(#sky)"/>
      <circle cx="735" cy="180" r="78" fill="#FFE9B8" opacity=".9"/>
      <path d="M0 382 155 280l118 102 132-152 185 152 150-117 220 117v92H0Z" fill="#5C3A4C" opacity=".72"/>
      <path d="M0 430 210 360l153 58 182-91 415 108v205H0Z" fill="url(#road)"/>
      <path d="m445 640 45-210h29l54 210Z" fill="#D7B27C" opacity=".75"/>
      <path d="m492 575 8-42h10l10 42Z" fill="#F6E3B2"/>
    </svg>`,
  },
  {
    name: 'coastal-light.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#BBD9DA"/><stop offset=".46" stop-color="#5F9FA8"/><stop offset="1" stop-color="#245E72"/></linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F1D7A5"/><stop offset="1" stop-color="#C89A65"/></linearGradient>
      </defs>
      <rect width="720" height="960" fill="#DCE7E2"/>
      <rect y="190" width="720" height="770" fill="url(#sea)"/>
      <path d="M0 504c132-70 226-47 343 1 128 53 242 60 377-27v482H0Z" fill="url(#sand)"/>
      <path d="M0 452c125-54 235-43 345 4 126 54 244 57 375-33" fill="none" stroke="#F4F2E8" stroke-width="24" opacity=".85"/>
      <path d="M92 340c72-43 146-42 219-6M406 288c70-30 138-25 203 13" fill="none" stroke="#DCEFEB" stroke-width="9" stroke-linecap="round" opacity=".6"/>
      <circle cx="128" cy="132" r="54" fill="#FAE5A8"/>
      <path d="M524 680c54-31 106-29 153 4l-17 148H534Z" fill="#B36246" opacity=".8"/>
    </svg>`,
  },
  {
    name: 'city-after-dark.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101936"/><stop offset=".58" stop-color="#263466"/><stop offset="1" stop-color="#5E315C"/></linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#47C7C4"/><stop offset=".5" stop-color="#E96C80"/><stop offset="1" stop-color="#F3B85E"/></linearGradient>
      </defs>
      <rect width="960" height="640" fill="url(#night)"/>
      <circle cx="770" cy="114" r="58" fill="#E8E5D4" opacity=".88"/>
      <path d="M0 280h132v-83h119v142h104V153h132v172h91V224h128v78h109V174h145v466H0Z" fill="#11182D"/>
      <g fill="#F4C06B" opacity=".8">
        <path d="M34 326h18v25H34zm44 0h18v25H78zm89-81h18v25h-18zm42 0h18v25h-18zm184-43h18v25h-18zm45 0h18v25h-18zm183 68h18v25h-18zm44 0h18v25h-18zm179-50h18v25h-18zm46 0h18v25h-18z"/>
      </g>
      <rect y="472" width="960" height="168" fill="#0A1022"/>
      <path d="M0 520h960" stroke="url(#glow)" stroke-width="8" opacity=".85"/>
      <path d="M120 640 386 488h188L834 640Z" fill="#1D2948"/>
      <path d="m467 640 9-120h18l9 120Z" fill="#E6D1A3" opacity=".7"/>
    </svg>`,
  },
] as const;

const createDemoFiles = () => DEMO_SCENES.map(({ name, svg }) => (
  new File([svg], name, { type: 'image/svg+xml' })
));

export const MixerCanvas: React.FC = () => {
  const { photos, addPhoto, updatePhotoAnalysis, setCanvasSize } = useMixerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

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

  const loadDemo = useCallback(async () => {
    if (isLoadingDemo) return;
    setIsLoadingDemo(true);
    try {
      await onDrop(createDemoFiles());
    } finally {
      setIsLoadingDemo(false);
    }
  }, [isLoadingDemo, onDrop]);

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
          <button
            type="button"
            onClick={loadDemo}
            disabled={isLoadingDemo}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-te-gray/30 bg-te-surface/70 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-te-dark/70 transition-all pointer-events-auto hover:-translate-y-0.5 hover:border-te-orange/50 hover:bg-te-surface hover:text-te-orange hover:shadow-sm disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0"
            aria-label="Load demo photos"
          >
            <Play size={11} strokeWidth={2} fill="currentColor" />
            {isLoadingDemo ? 'Loading demo' : 'Try demo'}
          </button>
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
