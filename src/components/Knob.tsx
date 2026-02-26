import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  label?: string;
  className?: string;
}

export const Knob: React.FC<KnobProps> = ({ value, min, max, onChange, label, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number>(0);
  const startValue = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = e.clientY - startY.current;
      const range = max - min;
      // 100px drag = full range
      const deltaValue = (deltaY / 100) * range;
      let newValue = startValue.current + deltaValue;
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  // Calculate rotation (-135 to 135 degrees)
  const percentage = (value - min) / (max - min);
  const rotation = -135 + (percentage * 270);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div 
        className="relative w-12 h-12 rounded-full bg-te-panel border-2 border-te-dark cursor-ns-resize shadow-sm"
        onMouseDown={handleMouseDown}
      >
        <motion.div 
          className="absolute w-full h-full rounded-full"
          style={{ rotate: rotation }}
        >
          <div className="w-1.5 h-3 bg-te-orange mx-auto mt-1 rounded-full" />
        </motion.div>
      </div>
      {label && <span className="text-xs font-mono font-bold text-te-dark uppercase">{label}</span>}
    </div>
  );
};
