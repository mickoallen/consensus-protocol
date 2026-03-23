import { motion } from 'framer-motion';
import type { AgentState } from '../types';
import PixelAvatar from './PixelAvatar';
import ConfidenceBar from './ConfidenceBar';

interface AgentCardProps {
  agent: AgentState;
  currentRound: number;
  onClick: () => void;
}

export default function AgentCard({ agent, currentRound, onClick }: AgentCardProps) {
  const roundIdx = Math.max(0, currentRound - 1);
  const round = agent.rounds[roundIdx];
  const isThinking = round && !round.done && round.thinking.length > 0;
  const isDone = round?.done;
  const hasVoted = agent.finalVote !== null;
  const changedMind = agent.finalVote?.changed_mind;
  const dissents = agent.finalVote?.dissents_from_consensus;

  const displayText = round?.thinking || '';
  const truncatedText = displayText.length > 200
    ? '...' + displayText.slice(-200)
    : displayText;

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        relative rounded-lg border-2 cursor-pointer overflow-hidden
        transition-all duration-200
        hover:shadow-md
        ${changedMind ? 'mind-changed' : ''}
        ${dissents ? 'ring-2 ring-amber-400/50' : ''}
      `}
      style={{
        backgroundColor: isThinking ? '#fff8e7' : '#fff',
        borderColor: isThinking || isDone ? agent.color + '80' : '#dbc89e',
      }}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      {/* Character header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b" style={{ borderColor: '#dbc89e' }}>
        <PixelAvatar
          persona={agent.persona}
          color={agent.color}
          size={32}
          isThinking={isThinking}
          isSpeaking={isThinking}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold block truncate" style={{ color: '#3d2b1f' }}>
            {agent.name}
          </span>
          <span className="text-[10px]" style={{ color: '#7a6552' }}>
            {isThinking ? 'speaking...' : isDone ? 'has spoken' : hasVoted ? 'vote cast' : 'awaiting turn'}
          </span>
        </div>
        {dissents && (
          <span className="text-[9px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 shrink-0 font-medium">
            dissents
          </span>
        )}
      </div>

      {/* Speech content */}
      <div className="px-3 py-2 min-h-[60px] max-h-[100px] overflow-hidden" style={{ backgroundColor: '#faf8f0' }}>
        {truncatedText ? (
          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${isThinking ? 'cursor-blink' : ''}`}
             style={{ color: '#3d2b1f', fontFamily: 'Georgia, serif' }}>
            {truncatedText}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: '#b0a090' }}>
            Waiting to speak...
          </p>
        )}
      </div>

      {/* Confidence bar */}
      {(isDone || hasVoted) && (
        <div className="px-3 py-2 border-t" style={{ borderColor: '#eee4cc' }}>
          <ConfidenceBar
            confidence={hasVoted ? agent.finalVote!.confidence : round.confidence}
            color={agent.color}
          />
        </div>
      )}

      {/* Changed mind ribbon */}
      {changedMind && (
        <motion.div
          className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-bold rounded-bl-lg"
          style={{ backgroundColor: '#fbbf24', color: '#3d2b1f' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          changed mind!
        </motion.div>
      )}
    </motion.div>
  );
}
