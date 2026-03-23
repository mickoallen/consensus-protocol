import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentState } from '../types';
import PixelSprite from './PixelSprite';
import ConfidenceBar from './ConfidenceBar';

interface CouncilChamberProps {
  agents: Map<number, AgentState>;
  currentRound: number;
  currentSpeaker: number | null;
  onAgentClick: (agentId: number) => void;
}

interface CharacterPos {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

// The chamber background has two open floor areas (left and right of center hex table)
// and a center area. Agents are distributed across these zones.
function getFloorPositions(count: number, chamberW: number, chamberH: number): { x: number; y: number }[] {
  // Define floor zones relative to chamber dimensions
  // Left floor area: ~15-35% x, ~55-80% y
  // Right floor area: ~65-85% x, ~55-80% y
  // Center area (around table): ~40-60% x, ~50-70% y
  const zones = [
    { cx: 0.24, cy: 0.68, rx: 0.08, ry: 0.10 }, // left floor
    { cx: 0.76, cy: 0.68, rx: 0.08, ry: 0.10 }, // right floor
    { cx: 0.50, cy: 0.62, rx: 0.06, ry: 0.06 }, // center near table
  ];

  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const zone = zones[i % zones.length];
    const agentsInZone = Math.ceil(count / zones.length);
    const localIdx = Math.floor(i / zones.length);
    const angle = (localIdx / agentsInZone) * Math.PI * 2 - Math.PI / 2;
    const jitterX = (Math.random() - 0.5) * 10;
    const jitterY = (Math.random() - 0.5) * 8;
    positions.push({
      x: chamberW * zone.cx + Math.cos(angle) * chamberW * zone.rx + jitterX,
      y: chamberH * zone.cy + Math.sin(angle) * chamberH * zone.ry + jitterY,
    });
  }
  return positions;
}

// During deliberation, agents cluster tighter toward center
function getDeliberationPositions(count: number, chamberW: number, chamberH: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  // Tighter ring around the center table
  const cx = chamberW * 0.50;
  const cy = chamberH * 0.62;
  const rx = chamberW * 0.18;
  const ry = chamberH * 0.14;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const jitterX = (Math.random() - 0.5) * 12;
    const jitterY = (Math.random() - 0.5) * 8;
    positions.push({
      x: cx + Math.cos(angle) * rx + jitterX,
      y: cy + Math.sin(angle) * ry + jitterY,
    });
  }
  return positions;
}

// Determine what to show in the speech bubble for each agent state
function getSpeechContent(agent: AgentState, roundIdx: number, isCurrentSpeaker: boolean): { text: string; style: 'thinking' | 'position' | 'voted' | 'error' } | null {
  if (agent.error) {
    return { text: agent.error, style: 'error' };
  }

  if (agent.finalVote) {
    const pos = agent.finalVote.position;
    const text = pos.length > 60 ? pos.slice(0, 60) + '...' : pos;
    return { text, style: 'voted' };
  }

  const round = agent.rounds[roundIdx];
  if (!round) return null;

  if (round.done && round.position) {
    const text = round.position.length > 60 ? round.position.slice(0, 60) + '...' : round.position;
    return { text, style: 'position' };
  }

  if (!round.done && round.thinking.length > 0) {
    const speech = round.thinking;
    const text = speech.length > 60 ? '...' + speech.slice(-60) : speech;
    return { text, style: 'thinking' };
  }

  // Agent is the current speaker but no tokens yet — show waiting indicator
  if (isCurrentSpeaker && !round.done) {
    return { text: 'Pondering...', style: 'thinking' };
  }

  return null;
}

const bubbleStyles = {
  thinking: { bg: '#fff', borderColor: '80', textColor: '#3d2b1f' },
  position: { bg: '#f0fdf4', borderColor: '60', textColor: '#166534' },
  voted: { bg: '#eff6ff', borderColor: '60', textColor: '#1e40af' },
  error: { bg: '#fef2f2', borderColor: 'cc', textColor: '#991b1b' },
};

export default function CouncilChamber({ agents, currentRound, currentSpeaker, onAgentClick }: CouncilChamberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentArray = useMemo(() => Array.from(agents.values()), [agents]);
  const [chamberSize, setChamberSize] = useState({ w: 800, h: 450 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setChamberSize({ w: width, h: Math.min(450, width * 0.55) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Positions depend on round (spread out for R1, cluster for R2+)
  const positions = useMemo(() => {
    if (currentRound >= 2) {
      return getDeliberationPositions(agentArray.length, chamberSize.w, chamberSize.h);
    }
    return getFloorPositions(agentArray.length, chamberSize.w, chamberSize.h);
  }, [agentArray.length, chamberSize, currentRound]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border-2 overflow-hidden"
      style={{
        height: chamberSize.h,
        borderColor: '#c4a265',
        backgroundImage: 'url(/images/chamber-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        isolation: 'isolate', // Creates stacking context — agents won't overlap modals
      }}
    >

      {/* Characters */}
      <AnimatePresence>
        {agentArray.map((agent, idx) => {
          const pos = positions[idx] || { x: chamberSize.w / 2, y: chamberSize.h / 2 };
          const roundIdx = Math.max(0, currentRound - 1);
          const round = agent.rounds[roundIdx];
          const isThinking = round && !round.done && round.thinking.length > 0;
          const isDone = round?.done;
          const hasVoted = agent.finalVote !== null;
          const changedMind = agent.finalVote?.changed_mind;

          // Direction: face toward center
          const centerX = chamberSize.w / 2;
          const dir = pos.x > centerX ? 'left' : 'right';

          // Speech bubble content
          const speech = getSpeechContent(agent, roundIdx, currentSpeaker === agent.id);
          const bStyle = speech ? bubbleStyles[speech.style] : null;

          return (
            <motion.div
              key={agent.id}
              className="absolute cursor-pointer"
              style={{
                zIndex: Math.floor(pos.y),
              }}
              initial={{ x: pos.x - 40, y: pos.y - 40, opacity: 0 }}
              animate={{
                x: pos.x - 40,
                y: pos.y - 40,
                opacity: 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 50,
                damping: 15,
                delay: idx * 0.08,
              }}
              onClick={() => onAgentClick(agent.id)}
            >
              {/* Speech bubble */}
              {speech && bStyle && (
                <motion.div
                  className="absolute bottom-[84px] left-1/2 -translate-x-1/2 w-[200px] max-h-[80px] overflow-hidden rounded-lg border-2 px-2.5 py-2 shadow-lg"
                  style={{
                    backgroundColor: bStyle.bg,
                    borderColor: agent.color + bStyle.borderColor,
                    zIndex: 1000,
                  }}
                  initial={{ opacity: 0, y: 5, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  key={speech.style + '-' + roundIdx}
                >
                  {speech.style === 'thinking' && (
                    <div className="text-[8px] font-bold mb-0.5" style={{ color: agent.color }}>
                      Deliberating...
                    </div>
                  )}
                  {speech.style === 'position' && (
                    <div className="text-[8px] font-bold mb-0.5" style={{ color: '#166534' }}>
                      Position formed
                    </div>
                  )}
                  {speech.style === 'voted' && (
                    <div className="text-[8px] font-bold mb-0.5" style={{ color: '#1e40af' }}>
                      Final vote
                    </div>
                  )}
                  {speech.style === 'error' && (
                    <div className="text-[8px] font-bold mb-0.5" style={{ color: '#991b1b' }}>
                      Error
                    </div>
                  )}
                  <p className="text-[10px] leading-tight" style={{ color: bStyle.textColor, fontFamily: 'Georgia, serif' }}>
                    {speech.text}
                  </p>
                  {/* Triangle pointer */}
                  <div
                    className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r-2 border-b-2"
                    style={{ backgroundColor: bStyle.bg, borderColor: agent.color + bStyle.borderColor }}
                  />
                </motion.div>
              )}

              {/* Name label */}
              <div
                className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded"
                style={{
                  color: '#3d2b1f',
                  backgroundColor: 'rgba(255,255,255,0.92)',
                  border: `1.5px solid ${agent.color}`,
                  textShadow: '0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                {agent.name}
              </div>

              {/* Sprite with drop shadow for visibility */}
              <div style={{
                filter: currentSpeaker === agent.id
                  ? `drop-shadow(0 0 8px ${agent.color}) drop-shadow(0 2px 3px rgba(0,0,0,0.35))`
                  : 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
                transition: 'filter 0.3s ease',
              }}>
                <PixelSprite
                  persona={agent.persona}
                  color={agent.color}
                  size={80}
                  isWalking={!isThinking && !isDone && !hasVoted && currentRound > 0}
                  isTalking={isThinking}
                  direction={dir as any}
                />
              </div>

              {/* Status indicator below sprite */}
              <div className="flex flex-col items-center mt-0.5 gap-0.5">
                {/* Confidence bar */}
                {(isDone || hasVoted) && (
                  <div className="w-14">
                    <ConfidenceBar
                      confidence={hasVoted ? agent.finalVote!.confidence : round!.confidence}
                      color={agent.color}
                      showLabel={false}
                    />
                  </div>
                )}

                {/* Changed mind badge */}
                {changedMind && (
                  <motion.span
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#fbbf24', color: '#3d2b1f' }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    changed!
                  </motion.span>
                )}

                {/* Vote badge */}
                {hasVoted && !changedMind && (
                  <span className="text-[8px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                    voted
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Round label */}
      <div
        className="absolute top-3 left-3 font-pixel text-[8px] px-2 py-1 rounded border"
        style={{ backgroundColor: 'rgba(255,248,231,0.9)', borderColor: '#c4a265', color: '#8b4513' }}
      >
        {currentRound === 0 ? 'Assembling...' :
         `Round ${currentRound}`}
      </div>
    </div>
  );
}
