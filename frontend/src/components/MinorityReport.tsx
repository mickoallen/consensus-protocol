import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { SynthesisResult } from '../types';

interface MinorityReportProps {
  result: SynthesisResult;
}

export default function MinorityReport({ result }: MinorityReportProps) {
  if (!result.minority_report || result.dissenters?.length === 0) return null;

  return (
    <motion.div
      className="mt-4 rounded-lg border-2 overflow-hidden"
      style={{ borderColor: '#b45309', backgroundColor: '#fffbeb' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: '#e5c07b', backgroundColor: '#fef3c7' }}>
        <span className="font-pixel text-[10px]" style={{ color: '#b45309' }}>DISSENTING VOICES</span>
        {result.dissenters && (
          <span className="text-[10px] ml-auto" style={{ color: '#92400e' }}>
            {result.dissenters.length} dissenter{result.dissenters.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        <div className="prose prose-sm max-w-none prose-headings:text-[#78350f] prose-p:text-[#78350f] prose-li:text-[#78350f] prose-strong:text-[#78350f]"
             style={{ fontFamily: 'Georgia, serif' }}>
          <ReactMarkdown>{result.minority_report}</ReactMarkdown>
        </div>
      </div>

      {result.dissenters && result.dissenters.length > 0 && (
        <div className="px-5 py-2 border-t" style={{ borderColor: '#e5c07b' }}>
          <div className="flex flex-wrap gap-2">
            {result.dissenters.map(d => (
              <span
                key={d.agent_id}
                className="text-[10px] px-2 py-0.5 rounded border font-medium"
                style={{ backgroundColor: '#fef3c7', borderColor: '#fbbf24', color: '#92400e' }}
              >
                {d.persona} ({(d.confidence * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
