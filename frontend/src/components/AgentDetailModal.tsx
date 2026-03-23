import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { AgentState } from '../types';
import PixelSprite from './PixelSprite';
import ConfidenceBar from './ConfidenceBar';

interface AgentDetailModalProps {
  agent: AgentState;
  onClose: () => void;
}

const ROUND_NAMES = ['Opening Statement', 'Deliberation', 'Final Judgment'];

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-[#3d2b1f] prose-p:text-[#3d2b1f] prose-li:text-[#3d2b1f] prose-strong:text-[#3d2b1f]"
         style={{ fontFamily: 'Georgia, serif' }}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export default function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(61, 43, 31, 0.4)' }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-2xl max-h-[80vh] rounded-lg border-2 overflow-hidden flex flex-col"
          style={{ borderColor: agent.color + '80', backgroundColor: '#fffdf5' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#dbc89e', backgroundColor: '#faf0d7' }}>
            <PixelSprite persona={agent.persona} color={agent.color} size={48} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#3d2b1f' }}>
                {agent.name}
              </h2>
              <p className="text-xs" style={{ color: '#7a6552' }}>Full deliberation record</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-stone-100 transition-colors"
              style={{ color: '#7a6552' }}
            >
              &times;
            </button>
          </div>

          {/* Round tabs */}
          <div className="flex border-b" style={{ borderColor: '#dbc89e' }}>
            {ROUND_NAMES.map((name, idx) => {
              const round = agent.rounds[idx];
              const hasContent = round && (round.thinking || round.done);
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`
                    flex-1 px-4 py-2.5 text-xs font-semibold transition-colors
                    ${activeTab === idx
                      ? 'border-b-2'
                      : hasContent
                        ? 'hover:bg-stone-50'
                        : 'opacity-40'
                    }
                  `}
                  style={{
                    color: activeTab === idx ? agent.color : '#7a6552',
                    borderColor: activeTab === idx ? agent.color : 'transparent',
                  }}
                  disabled={!hasContent}
                >
                  {name}
                  {round?.done && <span className="ml-1 text-green-600">&#10003;</span>}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                {agent.rounds[activeTab]?.thinking ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7a6552' }}>
                        {ROUND_NAMES[activeTab]}
                      </h3>
                      <div className="rounded-lg p-4 border" style={{ backgroundColor: '#faf8f0', borderColor: '#e8dcc8' }}>
                        <Markdown>{agent.rounds[activeTab].thinking}</Markdown>
                      </div>
                    </div>

                    {agent.rounds[activeTab].done && (
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7a6552' }}>
                          Conviction
                        </h3>
                        <ConfidenceBar
                          confidence={agent.rounds[activeTab].confidence}
                          color={agent.color}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm italic" style={{ color: '#b0a090' }}>
                    This member has not yet spoken in this round.
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Final vote footer */}
          {agent.finalVote && (
            <div className="px-5 py-3 border-t" style={{ borderColor: '#dbc89e', backgroundColor: '#faf0d7' }}>
              <div className="space-y-1">
                <div className="text-xs" style={{ color: '#3d2b1f' }}>
                  <strong>Final position:</strong>
                  <Markdown>{agent.finalVote.position}</Markdown>
                </div>
                {agent.finalVote.changed_mind && (
                  <div className="text-xs" style={{ color: '#b45309' }}>
                    <strong>Changed mind:</strong>
                    <Markdown>{agent.finalVote.what_changed_it}</Markdown>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
