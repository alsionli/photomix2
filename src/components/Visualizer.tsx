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
      // Get data
      if (!audioManager || !audioManager.isInitialized) {
         // Draw flat line
         ctx.clearRect(0, 0, canvas.width, canvas.height);
         ctx.beginPath();
         ctx.moveTo(0, canvas.height / 2);
         ctx.lineTo(canvas.width, canvas.height / 2);
         ctx.strokeStyle = '#FF4F00';
         ctx.lineWidth = 2;
         ctx.stroke();
         animationId = requestAnimationFrame(draw);
         return;
      }

      // Safe access
      try {
          const values = audioManager.analyser.getValue();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#FF4F00'; // TE Orange
          ctx.beginPath();

          const sliceWidth = canvas.width / values.length;
          let x = 0;

          for (let i = 0; i < values.length; i++) {
            const v = values[i] as number; 
            const y = (1 + v) * canvas.height / 2; // Map -1..1 to 0..height

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }

            x += sliceWidth;
          }

          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
      } catch (e) {
          // If analyser fails (e.g. disposed)
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={40} 
      className="w-48 h-10 opacity-80"
    />
  );
};
