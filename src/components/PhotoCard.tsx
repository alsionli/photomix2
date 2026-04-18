import React from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { useMixerStore } from '../store/useMixerStore';
import { X } from 'lucide-react';

interface PhotoCardProps {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
  hue?: number;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ id, url, x, y, width, height, aspectRatio, hue: _hue = 0 }) => {
  const { updatePhotoPosition, updatePhotoSize, removePhoto, canvasWidth, canvasHeight } = useMixerStore();
  const resizeStart = React.useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  
  // Use motion values for smooth dragging
  const motionX = useMotionValue(x);
  const motionY = useMotionValue(y);

  // Sync motion values when props change (e.g., from external updates)
  React.useEffect(() => {
    motionX.set(x);
    motionY.set(y);
  }, [x, y, motionX, motionY]);

  // Resize handler
  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!resizeStart.current) return;
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;
      // Use diagonal distance for uniform scaling while maintaining aspect ratio
      const delta = Math.max(deltaX, deltaY * aspectRatio);
      const nextWidth = Math.max(80, Math.min(400, resizeStart.current.width + delta));
      const nextHeight = nextWidth / aspectRatio;
      updatePhotoSize(id, nextWidth, nextHeight);
    };

    const handlePointerUp = () => {
      resizeStart.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [id, aspectRatio, updatePhotoSize]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{ left: 0, top: 0, right: Math.max(0, canvasWidth - width), bottom: Math.max(0, canvasHeight - height) }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.02, zIndex: 10 }}
      whileDrag={{ scale: 1.04, zIndex: 20, boxShadow: "0px 8px 24px rgba(0,0,0,0.15)" }}
      onDragEnd={() => {
        // Sync final position to store
        updatePhotoPosition(id, motionX.get(), motionY.get());
      }}
      className="absolute bg-te-surface p-1 cursor-grab active:cursor-grabbing group rounded-md"
      style={{
        x: motionX,
        y: motionY,
        width,
        height,
      }}
    >
      <div className="relative w-full h-full overflow-hidden rounded-[3px]">
        <img src={url} alt="mix" className="w-full h-full object-cover pointer-events-none" />
        <button 
          onClick={(e) => { e.stopPropagation(); removePhoto(id); }}
          className="absolute top-1 right-1 bg-te-dark/60 hover:bg-te-orange text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={10} />
        </button>
      </div>

      {/* Resize Handle - macOS style */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          resizeStart.current = { x: e.clientX, y: e.clientY, width, height };
        }}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        aria-label="Resize photo"
      >
        {/* Diagonal grip lines like macOS */}
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500">
          <path d="M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </motion.div>
  );
};
