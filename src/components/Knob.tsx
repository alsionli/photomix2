import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const knobRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);

  const angleToValue = useCallback((clientX: number, clientY: number) => {
    const el = knobRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = -(clientY - cy);
    // Clock angle: 0° = up, positive = clockwise
    let angle = Math.atan2(dx, dy) * (180 / Math.PI);
    // Dead zone at the bottom: clamp to [-135, 135]
    angle = Math.max(-135, Math.min(135, angle));
    const pct = (angle + 135) / 270;
    return clamp(Math.round(min + pct * (max - min)));
  }, [min, max, value, clamp]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    onChange(angleToValue(e.clientX, e.clientY));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      onChange(angleToValue(e.clientX, e.clientY));
    };
    const handleMouseUp = () => setIsDragging(false);

    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, angleToValue, onChange]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const step = Math.max(1, Math.round((max - min) / 60));
    onChange(clamp(Math.round(value + (e.deltaY < 0 ? step : -step))));
  }, [value, min, max, onChange, clamp]);

  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const percentage = (value - min) / (max - min);
  const rotation = -135 + percentage * 270;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {/* Outer chrome ring */}
      <div
        className="relative w-14 h-14 rounded-full p-[3px]"
        style={{
          background: 'linear-gradient(135deg, #D6D6D8 0%, #B8B8BB 50%, #D0D0D3 100%)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        {/* Inner knob body */}
        <div
          ref={knobRef}
          className={cn(
            "w-full h-full rounded-full cursor-grab relative",
            isDragging && "cursor-grabbing"
          )}
          style={{
            background: 'linear-gradient(145deg, #EAEAEC 0%, #E0E0E2 100%)',
            boxShadow: `
              inset 0 1px 2px rgba(255,255,255,0.6),
              inset 0 -1px 2px rgba(0,0,0,0.06),
              ${isDragging ? '0 0 0 2px #E85D26' : '0 0 0 0 transparent'}
            `,
            transition: 'box-shadow 0.15s ease',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Concentric groove ring */}
          <div
            className="absolute inset-[6px] rounded-full pointer-events-none"
            style={{
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)',
            }}
          />
          {/* Indicator line */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ rotate: rotation }}
          >
            <div className="w-1 h-3 bg-te-orange mx-auto mt-[5px] rounded-full" />
          </motion.div>
        </div>
      </div>
      {label && <span className="text-[10px] font-mono font-semibold text-te-gray uppercase tracking-wider">{label}</span>}
    </div>
  );
};
