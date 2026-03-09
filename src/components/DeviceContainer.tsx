import React from 'react';
import { cn } from '../utils/cn';

interface DeviceContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const DeviceContainer: React.FC<DeviceContainerProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen bg-[#F0F0F1] flex items-center justify-center p-8">
      <div className={cn(
        "relative bg-te-bg rounded-[20px] w-full max-w-6xl aspect-[16/10]",
        "flex overflow-hidden",
        className
      )}
        style={{
          boxShadow: `
            0 1px 0 rgba(255,255,255,0.7),
            0 -1px 0 rgba(0,0,0,0.03),
            0 8px 24px rgba(0,0,0,0.12),
            0 24px 48px rgba(0,0,0,0.08),
            inset 0 1px 0 rgba(255,255,255,0.5)
          `,
        }}
      >
        {/* Matte surface micro-texture */}
        <div
          className="absolute inset-0 rounded-[20px] pointer-events-none z-10 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='1' height='1' fill='%23000'/%3E%3C/svg%3E")`,
            backgroundSize: '2px 2px',
          }}
        />
        {children}
      </div>
    </div>
  );
};
