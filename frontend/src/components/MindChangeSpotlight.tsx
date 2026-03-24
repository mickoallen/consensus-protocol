import { motion } from 'framer-motion';
import type { AgentState } from '../types';

interface MindChangeSpotlightProps {
  agents: Map<number, AgentState>;
}

export default function MindChangeSpotlight({ agents }: MindChangeSpotlightProps) {
  const changers = Array.from(agents.values()).filter(
    a => a.finalVote?.changed_mind && a.finalVote.what_changed_it && a.finalVote.what_changed_it !== 'N/A'
  );

  if (changers.length === 0) return null;

  return (
    <motion.div
      className="mt-4 rounded-lg border-2 overflow-hidden"
      style={{ borderColor: '#7c3aed', backgroundColor: '#faf5ff' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: '#c4b5fd', backgroundColor: '#ede9fe' }}>
        <span className="font-pixel text-[10px]" style={{ color: '#7c3aed' }}>MINDS CHANGED</span>
        <span className="text-[10px] ml-auto" style={{ color: '#5b21b6' }}>
          {changers.length} agent{changers.length !== 1 ? 's' : ''} changed position
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: '#e9d5ff' }}>
        {changers.map(agent => (
          <div key={agent.id} className="px-5 py-4" style={{ borderColor: '#e9d5ff' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: agent.color }} />
              <span className="font-pixel text-[10px]" style={{ color: '#5b21b6' }}>{agent.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded p-2.5" style={{ backgroundColor: '#fee2e2' }}>
                <div className="text-[9px] font-medium mb-1" style={{ color: '#991b1b' }}>BEFORE</div>
                <p className="text-xs leading-relaxed" style={{ fontFamily: 'Georgia, serif', color: '#7f1d1d' }}>
                  {agent.rounds[0]?.position || 'Unknown'}
                </p>
              </div>
              <div className="rounded p-2.5" style={{ backgroundColor: '#dcfce7' }}>
                <div className="text-[9px] font-medium mb-1" style={{ color: '#166534' }}>AFTER</div>
                <p className="text-xs leading-relaxed" style={{ fontFamily: 'Georgia, serif', color: '#14532d' }}>
                  {agent.finalVote!.position}
                </p>
              </div>
            </div>
            <div className="rounded p-2.5" style={{ backgroundColor: '#f5f3ff' }}>
              <div className="text-[9px] font-medium mb-1" style={{ color: '#6d28d9' }}>WHAT CHANGED THEIR MIND</div>
              <p className="text-xs leading-relaxed italic" style={{ fontFamily: 'Georgia, serif', color: '#4c1d95' }}>
                "{agent.finalVote!.what_changed_it}"
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
