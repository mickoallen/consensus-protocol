import { motion } from 'framer-motion';
import type { SwarmPhase } from '../types';

interface RoundIndicatorProps {
  currentRound: number;
  phase: SwarmPhase;
}

const steps = [
  { label: 'Round 1', subtitle: 'Opening Statements' },
  { label: 'Round 2', subtitle: 'Deliberation' },
  { label: 'Round 3', subtitle: 'Final Judgment' },
  { label: 'Council', subtitle: 'Consensus' },
];

export default function RoundIndicator({ currentRound, phase }: RoundIndicatorProps) {
  const isSynthesis = phase === 'running' && currentRound > 3;
  const isComplete = phase === 'complete';

  const getStepState = (idx: number) => {
    if (isComplete) return 'complete';
    if (idx === 3 && isSynthesis) return 'active';
    if (idx === 3) return 'pending';
    if (currentRound > idx + 1) return 'complete';
    if (currentRound === idx + 1) return 'active';
    return 'pending';
  };

  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((step, idx) => {
        const state = getStepState(idx);
        return (
          <div key={idx} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <motion.div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2
                  ${state === 'complete' ? 'bg-green-50 text-green-700 border-green-400' : ''}
                  ${state === 'active' ? 'bg-amber-50 text-amber-700 border-amber-400' : ''}
                  ${state === 'pending' ? 'bg-white text-stone-400 border-stone-300' : ''}
                `}
                animate={state === 'active' ? { scale: [1, 1.05, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {state === 'complete' ? '✓' : idx + 1}
              </motion.div>
              <span className={`text-[9px] mt-1 font-medium ${state === 'active' ? 'text-amber-700' : 'text-stone-400'}`}>
                {step.label}
              </span>
              <span className={`text-[8px] ${state === 'active' ? 'text-amber-600' : 'text-stone-300'}`}>
                {step.subtitle}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-10 h-0.5 mt-[-18px] rounded ${
                getStepState(idx) === 'complete' ? 'bg-green-300' : 'bg-stone-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
