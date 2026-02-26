import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

interface PushBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label?: string;
  variant?: 'default' | 'orange' | 'white';
}

export const PushBtn: React.FC<PushBtnProps> = ({ active, label, variant = 'default', className, children, ...props }) => {
  const baseStyles = "w-12 h-12 rounded-md shadow-[0_4px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[4px] transition-all border-2 border-te-dark flex items-center justify-center";
  
  const variants = {
    default: "bg-te-dark text-te-bg",
    orange: "bg-te-orange text-white",
    white: "bg-te-bg text-te-dark"
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button 
        className={cn(baseStyles, variants[variant], active && "translate-y-[2px] shadow-[0_2px_0_0_rgba(0,0,0,0.2)]", className)}
        whileTap={{ scale: 0.95 }}
        {...props}
      >
        {children}
      </motion.button>
      {label && <span className="text-[10px] font-mono font-bold text-te-dark uppercase">{label}</span>}
    </div>
  );
};
