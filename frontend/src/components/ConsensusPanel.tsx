import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

interface ConsensusPanelProps {
  text: string;
  isStreaming: boolean;
}

export default function ConsensusPanel({ text, isStreaming }: ConsensusPanelProps) {
  if (!text) return null;

  const parts = text.split('---MINORITY REPORT---');
  const consensusText = parts[0].replace(/^CONSENSUS:\s*/i, '').trim();

  return (
    <motion.div
      className="mt-6 rounded-lg border-2 overflow-hidden scroll-enter"
      style={{ borderColor: '#8b6914', backgroundColor: '#fffdf5' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: '#dbc89e', backgroundColor: '#faf0d7' }}>
        <span className="font-pixel text-[10px]" style={{ color: '#8b6914' }}>THE COUNCIL HAS SPOKEN</span>
      </div>
      <div className={`px-5 py-4 ${isStreaming ? 'cursor-blink' : ''}`}>
        <div className="prose prose-sm max-w-none prose-headings:text-[#3d2b1f] prose-p:text-[#3d2b1f] prose-li:text-[#3d2b1f] prose-strong:text-[#3d2b1f]"
             style={{ fontFamily: 'Georgia, serif' }}>
          <ReactMarkdown>{consensusText}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
