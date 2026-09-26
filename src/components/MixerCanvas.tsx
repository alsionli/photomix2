import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMixerStore } from '../store/useMixerStore';
import { analyzeImage } from '../utils/analyzeImage';
import { PhotoCard } from './PhotoCard';
import { Play, Upload } from 'lucide-react';
import { cn } from '../utils/cn';

const DEMO_PHOTOS = [
  {
    name: 'sunset-drive.jpg',
    url: 'https://images.unsplash.com/photo-1769138602665-b8610d4ed904?auto=format&fit=crop&w=1400&q=82',
  },
  {
    name: 'coastal-light.jpg',
    url: 'https://images.unsplash.com/photo-1771002382315-9be24abde4e4?auto=format&fit=crop&w=1400&q=82',
  },
  {
    name: 'city-after-dark.jpg',
    url: 'https://images.unsplash.com/photo-1773504091990-0513ff879767?auto=format&fit=crop&w=1400&q=82',
  },
] as const;

const DEMO_LAYOUT = [
  { x: 0.199, y: 0.361 },
  { x: 0.419, y: 0.425 },
  { x: 0.530, y: 0.198 },
] as const;

const createDemoFiles = async () => Promise.all(DEMO_PHOTOS.map(async ({ name, url }) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load demo photo: ${name}`);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}));

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
    const initialPhotoCount = useMixerStore.getState().photos.length;

    const preparedPhotos = await Promise.all(acceptedFiles.map(async (file) => {
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);

      // Load image to get natural dimensions and preserve aspect ratio
      const img = new Image();
      img.src = url;
      await new Promise((resolve) => { img.onload = resolve; });

      const aspectRatio = img.naturalWidth / img.naturalHeight;
      const baseSize = 240;
      const width = aspectRatio >= 1 ? baseSize : baseSize * aspectRatio;
      const height = aspectRatio >= 1 ? baseSize / aspectRatio : baseSize;

      return { file, id, url, aspectRatio, width, height };
    }));

    const useDemoLayout = initialPhotoCount === 0
      && preparedPhotos.length === DEMO_LAYOUT.length
      && preparedPhotos.every((photo, index) => photo.file.name === DEMO_PHOTOS[index].name);

    // A fresh multi-photo mix reads best as a row of cards whose edges just
    // touch. Scale the row down on narrow canvases while preserving the overlap.
    const useEdgeOverlapLayout = initialPhotoCount === 0 && preparedPhotos.length > 1;
    const overlap = 24;
    const naturalRowWidth = preparedPhotos.reduce((sum, photo) => sum + photo.width, 0)
      - overlap * Math.max(0, preparedPhotos.length - 1);
    const rowScale = useEdgeOverlapLayout
      ? Math.min(1, Math.max(1, rect.width - 48) / naturalRowWidth)
      : 1;
    const scaledOverlap = overlap * rowScale;
    const rowWidth = preparedPhotos.reduce((sum, photo) => sum + photo.width * rowScale, 0)
      - scaledOverlap * Math.max(0, preparedPhotos.length - 1);
    let rowX = (rect.width - rowWidth) / 2;

    // Process files sequentially or parallel
    for (const [index, preparedPhoto] of preparedPhotos.entries()) {
      const { file, id, url, aspectRatio } = preparedPhoto;
      const width = preparedPhoto.width * rowScale;
      const height = preparedPhoto.height * rowScale;

      const currentPhotos = useMixerStore.getState().photos;
      const existingPhotos = currentPhotos.length;
      const offsetX = (existingPhotos % 5) * 30 - 60;
      const offsetY = (existingPhotos % 3) * 30 - 30;
      const x = useDemoLayout
        ? Math.max(0, Math.min(rect.width * DEMO_LAYOUT[index].x, rect.width - width))
        : useEdgeOverlapLayout
        ? Math.max(0, rowX)
        : Math.max(0, Math.min((rect.width - width) / 2 + offsetX, rect.width - width));
      const y = useDemoLayout
        ? Math.max(0, Math.min(rect.height * DEMO_LAYOUT[index].y, rect.height - height))
        : Math.max(0, Math.min(
          (rect.height - height) / 2 + (useEdgeOverlapLayout ? (index % 2 === 0 ? -8 : 8) : offsetY),
          rect.height - height,
        ));

      if (useEdgeOverlapLayout && !useDemoLayout) {
        rowX += width - scaledOverlap;
      }

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
      await onDrop(await createDemoFiles());
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
