import { useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { AgentState } from '../types';
import AgentCard from './AgentCard';
import ConnectionLines from './ConnectionLines';

interface SwarmGridProps {
  agents: Map<number, AgentState>;
  currentRound: number;
  onAgentClick: (agentId: number) => void;
}

export default function SwarmGrid({ agents, currentRound, onAgentClick }: SwarmGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const agentArray = Array.from(agents.values());

  // Calculate grid columns based on agent count
  const cols = agentArray.length <= 4 ? 2 : agentArray.length <= 9 ? 3 : 4;

  return (
    <div className="relative" ref={gridRef}>
      {/* Connection lines overlay for Round 2+ */}
      {currentRound >= 2 && (
        <ConnectionLines
          containerRef={gridRef}
          agents={agentArray}
        />
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        <AnimatePresence>
          {agentArray.map(agent => (
            <div key={agent.id} data-agent-id={agent.id}>
              <AgentCard
                agent={agent}
                currentRound={currentRound}
                onClick={() => onAgentClick(agent.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
