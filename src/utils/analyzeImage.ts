// Remove top-level import to prevent crash if module resolution fails
// import ColorThief from 'colorthief';

export interface ImageAnalysis {
  dominantColor: [number, number, number];
  palette: [number, number, number][];
  brightness: number; // 0-255
  contrast: number;   // 0-255
  hue: number;        // 0-360
}

export const analyzeImage = async (file: File): Promise<ImageAnalysis> => {
  // Dynamically import ColorThief
  // This handles both ESM and CommonJS interop issues better in some cases
  const module = await import('colorthief');
  const ColorThief = module.default || module; 

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      try {
        const colorThief = new ColorThief();
        const dominantColor = colorThief.getColor(img);
        const palette = colorThief.getPalette(img, 5);

        // Get brightness/contrast via Canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            reject("Could not get canvas context");
            return;
        }

        ctx.drawImage(img, 0, 0);
        
        // RGB to HSL/Brightness
        const [r, g, b] = dominantColor;
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        // Calculate Hue
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        let h = 0;
        
        if (max === min) {
          h = 0;
        } else if (max === rNorm) {
          h = (60 * (gNorm - bNorm) / (max - min) + 360) % 360;
        } else if (max === gNorm) {
          h = (60 * (bNorm - rNorm) / (max - min) + 120) % 360;
        } else {
          h = (60 * (rNorm - gNorm) / (max - min) + 240) % 360;
        }

        const contrast = palette.reduce((acc: number, col: number[]) => {
             const dist = Math.abs(col[0]-r) + Math.abs(col[1]-g) + Math.abs(col[2]-b);
             return acc + dist;
        }, 0) / palette.length;

        resolve({
          dominantColor,
          palette,
          brightness,
          contrast: Math.min(255, contrast),
          hue: h
        });

        URL.revokeObjectURL(objectUrl);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = (e) => reject(e);
    img.src = objectUrl;
  });
};
