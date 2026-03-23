import { motion } from 'framer-motion';

interface ConfidenceBarProps {
  confidence: number;
  color: string;
  showLabel?: boolean;
}

export default function ConfidenceBar({ confidence, color, showLabel = true }: ConfidenceBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#e8dcc8' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${confidence * 100}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{ backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <motion.span
          className="text-[10px] font-bold w-10 text-right"
          style={{ color: '#7a6552' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {(confidence * 100).toFixed(0)}%
        </motion.span>
      )}
    </div>
  );
}
