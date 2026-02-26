import React from 'react';
import { cn } from '../utils/cn';

interface DeviceContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const DeviceContainer: React.FC<DeviceContainerProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen bg-neutral-200 flex items-center justify-center p-8">
      <div className={cn(
        "relative bg-te-bg rounded-3xl p-6 shadow-2xl border-4 border-white/50 w-full max-w-6xl aspect-[16/10]", 
        "flex gap-6 overflow-hidden",
        className
      )}>
         {/* Subtle texture overlay could go here */}
        {children}
      </div>
    </div>
  );
};
