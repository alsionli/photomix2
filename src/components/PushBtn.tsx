import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

interface PushBtnProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  active?: boolean;
  label?: string;
  variant?: 'default' | 'orange' | 'white';
}

export const PushBtn: React.FC<PushBtnProps> = ({ active, label, variant = 'default', className, children, ...props }) => {
  const isOrange = variant === 'orange';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button 
        className={cn(
          "w-12 h-12 rounded-lg flex items-center justify-center transition-all relative overflow-hidden",
          "active:translate-y-[2px]",
          isOrange
            ? "text-white"
            : variant === 'white'
              ? "text-te-dark"
              : "text-te-bg",
          active && "translate-y-[1px]",
          className
        )}
        style={{
          background: isOrange
            ? 'linear-gradient(180deg, #F06A30 0%, #D44E1A 100%)'
            : variant === 'white'
              ? 'linear-gradient(180deg, #F2F2F3 0%, #E2E2E4 100%)'
              : 'linear-gradient(180deg, #4A4A4D 0%, #2E2E30 100%)',
          boxShadow: `
            0 3px 0 ${isOrange ? '#B84015' : variant === 'white' ? '#CBCBCE' : '#1A1A1C'},
            0 4px 8px rgba(0,0,0,0.15),
            inset 0 1px 0 rgba(255,255,255,${isOrange ? '0.25' : '0.15'})
          `,
        }}
        whileTap={{ y: 2 }}
        {...props}
      >
        {/* Rubber grip texture for orange variant */}
        {isOrange && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(255,255,255,0.3) 2px,
                rgba(255,255,255,0.3) 3px
              )`,
            }}
          />
        )}
        <span className="relative z-10">{children}</span>
      </motion.button>
      {label && <span className="text-[9px] font-mono font-semibold text-te-gray uppercase tracking-wider">{label}</span>}
    </div>
  );
};
