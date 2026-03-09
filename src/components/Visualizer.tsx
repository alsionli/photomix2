import React, { useEffect, useRef } from 'react';
import { AudioManager } from '../audio/AudioManager';

export const Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let audioManager: AudioManager | null = null;
    
    try {
        audioManager = AudioManager.getInstance();
    } catch (e) {
        console.error("Visualizer could not get AudioManager:", e);
    }

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#E85D26';
      ctx.beginPath();

      if (!audioManager || !audioManager.isInitialized) {
         // Gentle idle breathing wave
         const t = performance.now() / 2000;
         const points = 80;
         for (let i = 0; i <= points; i++) {
           const px = (i / points) * w;
           const wave = Math.sin((i / points) * Math.PI * 2 + t) * 0.1;
           const y = mid + wave * mid;
           if (i === 0) ctx.moveTo(px, y);
           else ctx.lineTo(px, y);
         }
         ctx.stroke();
         animationId = requestAnimationFrame(draw);
         return;
      }

      try {
          const values = audioManager.analyser.getValue();
          const step = Math.max(1, Math.floor(values.length / 80));
          const gain = 12;

          for (let i = 0; i < values.length; i += step) {
            const px = (i / values.length) * w;
            const v = Math.max(-1, Math.min(1, (values[i] as number) * gain));
            const y = mid + v * mid;
            if (i === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }

          ctx.lineTo(w, mid);
          ctx.stroke();
      } catch {
          // analyser disposed
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={240} 
      height={48} 
      className="w-48 h-10"
    />
  );
};
