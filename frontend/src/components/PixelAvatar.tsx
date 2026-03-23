interface PixelAvatarProps {
  persona: string;
  color: string;
  size?: number;
  isThinking?: boolean;
  isSpeaking?: boolean;
}

// Medieval-themed 8x8 pixel art characters
const PIXEL_ART: Record<string, number[][]> = {
  // Knight with helmet visor
  skeptic: [
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,0,1,0,0,1,0,1],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
  ],
  // Smiling bard with hat
  optimist: [
    [0,0,0,1,0,0,0,0],
    [0,0,1,1,1,0,0,0],
    [0,1,1,1,1,1,0,0],
    [0,1,0,1,0,1,0,0],
    [0,1,0,0,0,1,0,0],
    [0,1,0,1,1,1,0,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  // Scholar with scroll
  historian: [
    [0,1,1,1,1,1,1,0],
    [1,0,0,0,0,0,0,1],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,1,1,1,1,0,0],
  ],
  // Hooded rogue
  contrarian: [
    [0,1,1,1,1,1,1,0],
    [1,1,0,0,0,0,1,1],
    [1,0,0,0,0,0,0,1],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,0,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
  ],
  // Blacksmith with apron
  pragmatist: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  // Wizard with pointed hat
  futurist: [
    [0,0,0,0,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  // Monk with halo
  ethicist: [
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  // Cartographer with monocle
  systems_thinker: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,1,1,0,1,0,1],
    [1,0,1,1,0,0,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  // Alchemist with goggles
  empiricist: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,1,1,0,0,1,1,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  // Demon with horns
  devils_advocate: [
    [1,0,0,0,0,0,0,1],
    [1,1,0,0,0,0,1,1],
    [0,1,1,1,1,1,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,1,0,1,0,0],
    [0,0,1,0,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ],
};

const DEFAULT_FACE: number[][] = [
  [0,0,1,1,1,1,0,0],
  [0,1,0,0,0,0,1,0],
  [1,0,1,0,0,1,0,1],
  [1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,1],
  [0,1,0,0,0,0,1,0],
  [0,0,1,1,1,1,0,0],
];

export default function PixelAvatar({ persona, color, size = 48, isThinking, isSpeaking }: PixelAvatarProps) {
  const grid = PIXEL_ART[persona] || DEFAULT_FACE;
  const pixelSize = size / 8;

  return (
    <div
      className={`relative inline-block ${isSpeaking ? 'talking' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          filter: isThinking ? 'saturate(1.5)' : undefined,
        }}
      >
        {grid.map((row, y) =>
          row.map((pixel, x) =>
            pixel ? (
              <rect
                key={`${x}-${y}`}
                x={x * pixelSize}
                y={y * pixelSize}
                width={pixelSize + 0.5}
                height={pixelSize + 0.5}
                fill={color}
              />
            ) : null
          )
        )}
      </svg>

      {/* Speech bubbles when talking */}
      {isSpeaking && (
        <div className="absolute -right-2 -top-1 flex gap-[2px]">
          <span className="block w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '0ms' }} />
          <span className="block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '200ms' }} />
          <span className="block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '400ms' }} />
        </div>
      )}
    </div>
  );
}
