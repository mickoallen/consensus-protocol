import { useEffect, useState, type RefObject } from 'react';
import type { AgentState } from '../types';

interface ConnectionLinesProps {
  containerRef: RefObject<HTMLDivElement | null>;
  agents: AgentState[];
}

interface Line {
  x1: number; y1: number;
  x2: number; y2: number;
  color1: string;
  color2: string;
}

export default function ConnectionLines({ containerRef, agents }: ConnectionLinesProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLines = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });

      const newLines: Line[] = [];
      const cards = container.querySelectorAll('[data-agent-id]');
      const cardPositions = new Map<number, { cx: number; cy: number; color: string }>();

      cards.forEach(card => {
        const id = parseInt(card.getAttribute('data-agent-id') || '0');
        const cardRect = card.getBoundingClientRect();
        const agent = agents.find(a => a.id === id);
        cardPositions.set(id, {
          cx: cardRect.left - rect.left + cardRect.width / 2,
          cy: cardRect.top - rect.top + cardRect.height / 2,
          color: agent?.color || '#3b82f6',
        });
      });

      // Draw lines between all pairs
      const ids = Array.from(cardPositions.keys());
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = cardPositions.get(ids[i])!;
          const b = cardPositions.get(ids[j])!;
          newLines.push({
            x1: a.cx, y1: a.cy,
            x2: b.cx, y2: b.cy,
            color1: a.color,
            color2: b.color,
          });
        }
      }

      setLines(newLines);
    };

    updateLines();

    const observer = new ResizeObserver(updateLines);
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, agents]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-0"
      width={dimensions.width}
      height={dimensions.height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {lines.map((line, i) => (
          <linearGradient key={`grad-${i}`} id={`line-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={line.color1} stopOpacity="0.4" />
            <stop offset="50%" stopColor={line.color1} stopOpacity="0.2" />
            <stop offset="100%" stopColor={line.color2} stopOpacity="0.4" />
          </linearGradient>
        ))}
      </defs>
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1} y1={line.y1}
          x2={line.x2} y2={line.y2}
          stroke={`url(#line-grad-${i})`}
          strokeWidth="1.5"
          className="flow-line"
        />
      ))}
    </svg>
  );
}
