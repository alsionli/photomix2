import React, { useEffect, useMemo, useRef } from 'react';

// ── Pixel-art display ───────────────────────────────────────────────────
// Renders a sequence of small pixel icons on the same 5×5px grid as the
// underlying `.speaker-grid` CSS background. Icons hold for a few seconds
// then cross-fade to the next with a random "sparkle dissolve" transition.
//
// Icons are hand-authored below as ASCII art ('#' = lit, anything else =
// off). Each icon can have multiple frames for built-in micro-animations
// (pulse, blink, sway, blinking cursor…).

interface VisualizerProps {
  width?: number;
  height?: number;
  /** Grid pitch in CSS px — must match the underlying `.speaker-grid`. */
  pitch?: number;
  /** Radius of a lit dot in CSS px. Base grid dots are 0.8px. */
  litRadius?: number;
}

const ACCENT: [number, number, number] = [232, 93, 38]; // TE orange

interface PixelIcon {
  /** ASCII frames — all frames must share the same dimensions. */
  frames: string[][];
  /** ms per internal frame (micro-animation). 0 = static. */
  frameDuration: number;
  /** ms to hold this icon on screen before transitioning to the next. */
  holdDuration: number;
}

// ── Icon library ────────────────────────────────────────────────────────
// Heart — classic 8-bit heart with a small "pulse" frame.
const HEART: PixelIcon = {
  frames: [
    [
      '...........',
      '.##.....##.',
      '#####.#####',
      '###########',
      '###########',
      '.#########.',
      '..#######..',
      '...#####...',
      '....###....',
      '.....#.....',
    ],
    [
      '...........',
      '...........',
      '..##...##..',
      '.#########.',
      '.#########.',
      '..#######..',
      '...#####...',
      '....###....',
      '.....#.....',
      '...........',
    ],
  ],
  frameDuration: 450,
  holdDuration: 3200,
};

// Robot — boxy head with antenna, eyes blink.
const ROBOT: PixelIcon = {
  frames: [
    [
      '....###....',
      '.....#.....',
      '.#########.',
      '.#.......#.',
      '.#.##.##.#.',
      '.#.##.##.#.',
      '.#.......#.',
      '.#.#####.#.',
      '.#.......#.',
      '.#########.',
      '..#.....#..',
      '.##.....##.',
    ],
    [
      '....###....',
      '.....#.....',
      '.#########.',
      '.#.......#.',
      '.#.......#.',
      '.#.##.##.#.',
      '.#.......#.',
      '.#.#####.#.',
      '.#.......#.',
      '.#########.',
      '..#.....#..',
      '.##.....##.',
    ],
  ],
  frameDuration: 1800,
  holdDuration: 3600,
};

// Leaf — teardrop silhouette with a stem, gentle sway.
const LEAF: PixelIcon = {
  frames: [
    [
      '.....#.....',
      '....###....',
      '...#####...',
      '..#######..',
      '.#########.',
      '.#########.',
      '.#########.',
      '..#######..',
      '...#####...',
      '....#......',
      '....#......',
    ],
    [
      '......#....',
      '.....###...',
      '....#####..',
      '...#######.',
      '..#########',
      '..#########',
      '..#########',
      '...#######.',
      '....#####..',
      '.....#.....',
      '.....#.....',
    ],
  ],
  frameDuration: 600,
  holdDuration: 3200,
};

// Computer — CRT monitor on a stand, cursor blinks in the screen.
const COMPUTER: PixelIcon = {
  frames: [
    [
      '#############',
      '#...........#',
      '#.#########.#',
      '#.#.......#.#',
      '#.###.....#.#',
      '#.#.......#.#',
      '#.#########.#',
      '#...........#',
      '#############',
      '..#########..',
      '.###########.',
    ],
    [
      '#############',
      '#...........#',
      '#.#########.#',
      '#.#.......#.#',
      '#.#.......#.#',
      '#.#.......#.#',
      '#.#########.#',
      '#...........#',
      '#############',
      '..#########..',
      '.###########.',
    ],
  ],
  frameDuration: 500,
  holdDuration: 3600,
};

// Cat — pointy-eared face, dark pupils and nose/mouth as unlit dots.
const CAT: PixelIcon = {
  frames: [
    [
      '.#.......#.',
      '###.....###',
      '###########',
      '###########',
      '###.###.###',
      '###########',
      '####.#.####',
      '###########',
      '#####.#####',
      '.#########.',
      '..#######..',
    ],
  ],
  frameDuration: 0,
  holdDuration: 3200,
};

// Flower — 4-fold symmetric daisy silhouette with a single stem pixel.
const FLOWER: PixelIcon = {
  frames: [
    [
      '....###....',
      '...#####...',
      '...#####...',
      '.##.###.##.',
      '#####.#####',
      '###.#.#.###',
      '#####.#####',
      '.##.###.##.',
      '...#####...',
      '.....#.....',
      '.....#.....',
    ],
  ],
  frameDuration: 0,
  holdDuration: 3200,
};

// Coffee cup — side view with handle; steam wisps sway between frames.
const COFFEE: PixelIcon = {
  frames: [
    [
      '..#..#..#..',
      '...#..#..#.',
      '..#..#..#..',
      '..######...',
      '..#....###.',
      '..#....#..#',
      '..#....#..#',
      '..#....###.',
      '..#....#...',
      '..######...',
      '.########..',
      '###########',
    ],
    [
      '...#..#..#.',
      '..#..#..#..',
      '...#..#..#.',
      '..######...',
      '..#....###.',
      '..#....#..#',
      '..#....#..#',
      '..#....###.',
      '..#....#...',
      '..######...',
      '.########..',
      '###########',
    ],
  ],
  frameDuration: 550,
  holdDuration: 3400,
};

// Cassette tape — two reels with spokes that rotate between frames.
const CASSETTE: PixelIcon = {
  frames: [
    [
      '####################',
      '#..................#',
      '#..###........###..#',
      '#.#.#.#......#.#.#.#',
      '#.###.#.####.#.###.#',
      '#.#.#.#.####.#.#.#.#',
      '#..###........###..#',
      '#..................#',
      '####################',
    ],
    [
      '####################',
      '#..................#',
      '#..###........###..#',
      '#.#####......#####.#',
      '#.#.#.#.####.#.#.#.#',
      '#.#####.####.#####.#',
      '#..###........###..#',
      '#..................#',
      '####################',
    ],
  ],
  frameDuration: 220,
  holdDuration: 3800,
};

// Vinyl record — round disc with a radial mark that rotates across frames.
const VINYL: PixelIcon = {
  frames: [
    [
      '...#####...',
      '.####.####.',
      '####...####',
      '###.###.###',
      '##.##.##.##',
      '##.#.#.#.##',
      '##.##.##.##',
      '###.###.###',
      '####...####',
      '.####.####.',
      '...#####...',
    ],
    [
      '...#####...',
      '.#########.',
      '####...####',
      '###.....###',
      '##.#####.##',
      '##.#.#.#.##',
      '##.#####.##',
      '###.....###',
      '####...####',
      '.#########.',
      '...#####...',
    ],
  ],
  frameDuration: 250,
  holdDuration: 3800,
};

// Music note — beamed eighth notes that bob up and down a pixel.
const NOTE: PixelIcon = {
  frames: [
    [
      '...#.....#.',
      '...#.....#.',
      '...#######.',
      '...#######.',
      '...#.....#.',
      '...#.....#.',
      '...#.....#.',
      '...#.....#.',
      '.###.....#.',
      '###.....###',
      '.#.......#.',
      '...........',
    ],
    [
      '...........',
      '...#.....#.',
      '...#.....#.',
      '...#######.',
      '...#######.',
      '...#.....#.',
      '...#.....#.',
      '...#.....#.',
      '...#.....#.',
      '.###.....#.',
      '###.....###',
      '.#.......#.',
    ],
  ],
  frameDuration: 500,
  holdDuration: 3400,
};

const ICONS: PixelIcon[] = [
  HEART,
  CAT,
  ROBOT,
  FLOWER,
  LEAF,
  COFFEE,
  COMPUTER,
  CASSETTE,
  VINYL,
  NOTE,
];

const TRANSITION_MS = 420;

// ── Helpers ─────────────────────────────────────────────────────────────
interface Bitmap {
  bits: Uint8Array; // rows × cols, row-major
  cols: number;
  rows: number;
}

const parseFrame = (lines: string[]): Bitmap => {
  const rows = lines.length;
  const cols = Math.max(...lines.map(l => l.length));
  const bits = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const line = lines[r];
    for (let c = 0; c < cols; c++) {
      if (line[c] === '#') bits[r * cols + c] = 1;
    }
  }
  return { bits, cols, rows };
};

const getBit = (bmp: Bitmap, col: number, row: number): 0 | 1 => {
  if (col < 0 || row < 0 || col >= bmp.cols || row >= bmp.rows) return 0;
  return bmp.bits[row * bmp.cols + col] ? 1 : 0;
};

export const Visualizer: React.FC<VisualizerProps> = ({
  width = 216,
  height = 80,
  pitch = 5,
  litRadius = 1.4,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-parse all frames once.
  const library = useMemo(
    () => ICONS.map(icon => ({
      ...icon,
      parsed: icon.frames.map(parseFrame),
    })),
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const cols = Math.floor(width / pitch);
    const rowsCount = Math.floor(height / pitch);

    // Per-cell noise used for the sparkle-dissolve transition. A fixed
    // random threshold per cell means cells light/extinguish in a
    // consistent but "random-looking" order as the transition progresses.
    const noise = new Float32Array(cols * rowsCount);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random();

    let animationId = 0;
    const startedAt = performance.now();
    // Per-icon cycle offset so each icon's internal frame animation has its
    // own clock (doesn't reset every time we land on it).
    const iconClocks = library.map(() => Math.random() * 2000);

    const resolveState = (now: number) => {
      // Total cycle length across all icons.
      const cycle = library.reduce(
        (acc, l) => acc + l.holdDuration + TRANSITION_MS,
        0
      );
      const t = ((now - startedAt) % cycle + cycle) % cycle;

      let cursor = 0;
      for (let i = 0; i < library.length; i++) {
        const { holdDuration } = library[i];
        if (t < cursor + holdDuration) {
          return {
            currentIdx: i,
            nextIdx: (i + 1) % library.length,
            transition: 0, // fully on currentIdx
          };
        }
        cursor += holdDuration;
        if (t < cursor + TRANSITION_MS) {
          return {
            currentIdx: i,
            nextIdx: (i + 1) % library.length,
            transition: (t - cursor) / TRANSITION_MS, // 0..1
          };
        }
        cursor += TRANSITION_MS;
      }
      return { currentIdx: 0, nextIdx: 1, transition: 0 };
    };

    const drawDot = (cx: number, cy: number, alpha: number) => {
      ctx.fillStyle = `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, litRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    const bitAt = (iconIdx: number, gridCol: number, gridRow: number, now: number): 0 | 1 => {
      const icon = library[iconIdx];
      const frames = icon.parsed;
      const frameIdx =
        icon.frameDuration > 0
          ? Math.floor((now + iconClocks[iconIdx]) / icon.frameDuration) % frames.length
          : 0;
      const bmp = frames[frameIdx];
      // Center the icon in the grid.
      const offsetC = Math.floor((cols - bmp.cols) / 2);
      const offsetR = Math.floor((rowsCount - bmp.rows) / 2);
      return getBit(bmp, gridCol - offsetC, gridRow - offsetR);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const now = performance.now();
      const { currentIdx, nextIdx, transition } = resolveState(now);

      for (let r = 0; r < rowsCount; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * pitch + pitch / 2;
          const cy = r * pitch + pitch / 2;

          const curBit = bitAt(currentIdx, c, r, now);

          if (transition === 0) {
            // Steady state — no transition in progress.
            if (curBit) drawDot(cx, cy, 1);
            continue;
          }

          const nextBit = bitAt(nextIdx, c, r, now);
          // Each cell reveals the NEW icon once progress passes its
          // random threshold. Adds a little "shimmer" feel instead of a
          // uniform wipe.
          const showNext = noise[r * cols + c] < transition;
          const on = showNext ? nextBit : curBit;

          if (on) {
            // Light a small glint on cells that *just* flipped for extra
            // sparkle — alpha peaks right around the threshold moment.
            const dist = Math.abs(noise[r * cols + c] - transition);
            const sparkle = dist < 0.05 ? 1 - dist / 0.05 : 0;
            drawDot(cx, cy, Math.min(1, 0.88 + sparkle * 0.12));
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [width, height, pitch, litRadius, library]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
      className="block absolute inset-0"
    />
  );
};
