import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSwarmEvents } from './hooks/useSwarmEvents';
import { GetPersonas } from '../wailsjs/go/main/App';
import CouncilChamber from './components/CouncilChamber';
import RoundIndicator from './components/RoundIndicator';
import ConsensusPanel from './components/ConsensusPanel';
import MinorityReport from './components/MinorityReport';
import MindChangeSpotlight from './components/MindChangeSpotlight';
import AgentDetailModal from './components/AgentDetailModal';
import CouncilComposer from './components/CouncilComposer';
import RunSettings from './components/RunSettings';
import SettingsPanel from './components/SettingsPanel';
import DebugPanel from './components/DebugPanel';
import TestAIPanel from './components/TestAIPanel';
import type { AgentState, Strategy } from './types';

interface PersonaInfo {
  name: string;
  slug: string;
  color: string;
  category: string;
  adversarial: boolean;
  description: string;
  avatar: string;
}

type AppView = 'setup' | 'deliberating' | 'complete';

export default function App() {
  const { state, startSwarm, cancel } = useSwarmEvents();
  const [question, setQuestion] = useState('');
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [personaCounts, setPersonaCounts] = useState<Record<string, number>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [testAIOpen, setTestAIOpen] = useState(false);
  const [view, setView] = useState<AppView>('setup');
  const [strategy, setStrategy] = useState<Strategy>('classic');
  const [strategyRounds, setStrategyRounds] = useState(3);
  const [groupSize, setGroupSize] = useState(5);
  const [fastMode, setFastMode] = useState(false);

  useEffect(() => {
    GetPersonas()
      .then((data: PersonaInfo[]) => {
        setPersonas(data);
        const initial: Record<string, number> = {};
        data.slice(0, 5).forEach(p => { initial[p.slug] = 1; });
        setPersonaCounts(initial);
      })
      .catch(() => {});
  }, []);


  const totalAgents = useMemo(() =>
    Object.values(personaCounts).reduce((a, b) => a + b, 0),
    [personaCounts]
  );

  const selectedTypes = useMemo(() =>
    Object.values(personaCounts).filter(c => c > 0).length,
    [personaCounts]
  );

  const handleStart = () => {
    if (!question.trim() || selectedTypes < 2 || totalAgents < 2) return;
    setView('deliberating');
    startSwarm({
      question: question.trim(),
      personas: personaCounts,
      strategy,
      rounds: strategyRounds,
      groupSize,
      fastMode,
    });
  };

  useEffect(() => {
    if (state.phase === 'complete') setView('complete');
  }, [state.phase]);

  const handleReset = () => {
    setView('setup');
    setQuestion('');
  };

  const hasAgents = state.agents.size > 0;

  return (
    <div className="min-h-screen parchment-bg">
      {/* Top bar */}
      <div className="flex items-stretch w-full overflow-hidden" style={{ height: 120 }}>
        <div className="flex-1" style={{ backgroundImage: 'url(/images/spacer1.png)', backgroundRepeat: 'repeat-x', backgroundSize: 'auto 120px', backgroundPosition: 'right center' }} />
        <button onClick={handleReset} className="flex-shrink-0 h-full">
          <img src="/images/title.png" alt="Consensus Protocol" className="h-full" style={{ imageRendering: 'auto', display: 'block' }} />
        </button>
        <div className="flex-1" style={{ backgroundImage: 'url(/images/spacer2.png)', backgroundRepeat: 'repeat-x', backgroundSize: 'auto 120px', backgroundPosition: 'left center' }} />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {view === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Question — full width */}
              <div className="text-center space-y-3">
                <h1 className="font-pixel text-base" style={{ color: '#8b4513' }}>
                  Present Your Question
                </h1>
                <p className="text-sm" style={{ color: '#7a6552' }}>
                  The council will deliberate and reach consensus.
                </p>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="What matter shall the council consider?"
                  rows={3}
                  className="w-full max-w-2xl mx-auto px-4 py-3 rounded-lg border-2 text-sm focus:outline-none resize-none"
                  style={{
                    borderColor: '#c4a265',
                    backgroundColor: '#fff',
                    color: '#3d2b1f',
                    fontFamily: 'Georgia, serif',
                  }}
                />
              </div>

              {/* Two-panel layout */}
              <div className="flex gap-6 items-start">
                {/* Left: Council Composition */}
                <div className="flex-1 min-w-0">
                  <CouncilComposer
                    personas={personas}
                    onCountsChange={setPersonaCounts}
                  />
                </div>
                {/* Right: Run Settings */}
                <div className="w-72 flex-shrink-0">
                  <RunSettings
                    strategy={strategy}
                    onStrategyChange={setStrategy}
                    strategyRounds={strategyRounds}
                    onRoundsChange={setStrategyRounds}
                    groupSize={groupSize}
                    onGroupSizeChange={setGroupSize}
                    fastMode={fastMode}
                    onFastModeChange={setFastMode}
                    onSettingsOpen={() => setSettingsOpen(true)}
                    onTestAIOpen={() => setTestAIOpen(true)}
                  />
                </div>
              </div>

              {/* Start button */}
              <div className="text-center">
                <motion.button
                  onClick={handleStart}
                  disabled={!question.trim() || selectedTypes < 2 || totalAgents < 2}
                  className="px-8 py-3 rounded-lg border-2 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-md"
                  style={{
                    borderColor: '#8b4513',
                    backgroundColor: '#faf0d7',
                    color: '#8b4513',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Convene the Council ({totalAgents} members)
                </motion.button>
              </div>
            </motion.div>
          )}

          {(view === 'deliberating' || view === 'complete') && (
            <motion.div
              key="deliberating"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Question */}
              <div className="text-center mb-6">
                <p className="font-pixel text-[9px] uppercase tracking-widest" style={{ color: '#b0956e' }}>
                  The council deliberates
                </p>
                <p className="text-lg font-medium mt-2" style={{ color: '#3d2b1f', fontFamily: 'Georgia, serif' }}>
                  &ldquo;{question}&rdquo;
                </p>
              </div>

              {state.phase === 'error' && (
                <div className="mb-6 px-4 py-3 rounded-lg border-2 text-sm text-center"
                  style={{ borderColor: '#dc2626', backgroundColor: '#fef2f2', color: '#991b1b' }}>
                  {state.error || 'Something went wrong'}
                  <button onClick={handleReset} className="ml-3 underline hover:no-underline">
                    Try again
                  </button>
                </div>
              )}

              {hasAgents && <RoundIndicator currentRound={state.round} phase={state.phase} />}

              {state.statusMessage && (
                <motion.div
                  className="mt-4 mb-2 text-center py-3 px-6 rounded-lg border-2"
                  style={{ backgroundColor: '#faf0d7', borderColor: '#dbc89e' }}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={state.statusMessage}
                >
                  <p className="text-sm italic" style={{ color: '#8b4513', fontFamily: 'Georgia, serif' }}>
                    {state.statusMessage}
                  </p>
                  <div className="mt-1.5 flex justify-center gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.span
                        key={i}
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: '#c4a265' }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {hasAgents && (
                <CouncilChamber
                  agents={state.agents}
                  currentRound={state.round}
                  currentSpeaker={state.currentSpeaker}
                  summariesUpdatingSpeaker={state.summariesUpdatingSpeaker}
                  listeningAgents={state.listeningAgents}
                  onAgentClick={(id) => {
                    const agent = state.agents.get(id);
                    if (agent) setSelectedAgent(agent);
                  }}
                />
              )}

              {state.phase === 'running' && (
                <div className="text-center mb-4">
                  <button
                    onClick={() => { cancel(); handleReset(); }}
                    className="text-xs hover:underline transition-colors"
                    style={{ color: '#b0956e' }}
                  >
                    Dismiss the council
                  </button>
                </div>
              )}

              {state.consensusText && (
                <ConsensusPanel text={state.consensusText} isStreaming={state.phase === 'running'} />
              )}

              {view === 'complete' && state.result && <MinorityReport result={state.result} />}

              {view === 'complete' && state.agents.size > 0 && (
                <MindChangeSpotlight agents={state.agents} />
              )}

              {view === 'complete' && (
                <div className="mt-6 text-center space-y-3">
                  {state.result && (
                    <p className="text-xs" style={{ color: '#7a6552' }}>
                      Council agreement: {(state.result.weighted_score * 100).toFixed(0)}%
                    </p>
                  )}
                  {!state.result && state.consensusText && (
                    <p className="text-xs italic" style={{ color: '#7a6552' }}>
                      Synthesis completed but full results were not received.
                    </p>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-6 py-2 text-sm rounded-lg border-2 font-medium transition-colors hover:shadow-sm"
                    style={{ borderColor: '#c4a265', color: '#8b4513' }}
                  >
                    New Session
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TestAIPanel isOpen={testAIOpen} onClose={() => setTestAIOpen(false)} />
      <DebugPanel
        isOpen={debugOpen}
        onClose={() => setDebugOpen(false)}
        entries={state.debugLog}
        isRunning={state.phase === 'running'}
        onCancel={cancel}
        onRetry={handleStart}
      />

      {/* Debug toggle — visible during/after deliberation */}
      {(view === 'deliberating' || view === 'complete') && (
        <button
          onClick={() => setDebugOpen(true)}
          className="fixed bottom-4 right-4 z-40 px-3 py-1.5 rounded-lg border-2 text-xs font-mono transition-all hover:shadow-md"
          style={{
            borderColor: state.debugLog.some(e => e.data?.error) ? '#dc2626' : '#c4a265',
            backgroundColor: state.debugLog.some(e => e.data?.error) ? '#fef2f2' : '#fffdf5',
            color: state.debugLog.some(e => e.data?.error) ? '#dc2626' : '#8b4513',
          }}
        >
          {state.debugLog.some(e => e.data?.error) ? '! ' : ''}Debug ({state.debugLog.length})
        </button>
      )}
    </div>
  );
}
