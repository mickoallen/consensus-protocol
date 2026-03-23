import type { Strategy } from '../types';

interface RunSettingsProps {
  strategy: Strategy;
  onStrategyChange: (s: Strategy) => void;
  strategyRounds: number;
  onRoundsChange: (n: number) => void;
  groupSize: number;
  onGroupSizeChange: (n: number) => void;
  fastMode: boolean;
  onFastModeChange: (v: boolean) => void;
  onSettingsOpen: () => void;
  onTestAIOpen: () => void;
}

const STRATEGIES: { value: Strategy; label: string; desc: string; detail: string }[] = [
  {
    value: 'classic',
    label: 'Classic',
    desc: 'All hear all',
    detail: 'Every agent states their position, then everyone reads all positions and responds. Adversarial personas actively challenge the emerging consensus in round 2. Ends with a final vote. Best for smaller councils where you want full visibility between agents.',
  },
  {
    value: 'breakout',
    label: 'Breakout',
    desc: 'Small groups, reshuffle',
    detail: 'Agents split into small groups that deliberate independently, then get reshuffled into new groups each round to cross-pollinate ideas. In the final round, everyone sees summaries from all groups before voting. Best for large councils where all-to-all discussion would overwhelm the context.',
  },
  {
    value: 'rolling',
    label: 'Rolling',
    desc: 'One speaks, others summarize',
    detail: 'Agents take turns speaking one at a time. After each speaker, every other agent silently updates their own personal summary of the discussion so far, filtered through their persona\'s bias. Final votes are based on each agent\'s unique understanding of what was said. Best for nuanced topics where you want each perspective to build on the last.',
  },
];

export default function RunSettings({
  strategy, onStrategyChange,
  strategyRounds, onRoundsChange,
  groupSize, onGroupSizeChange,
  fastMode, onFastModeChange,
  onSettingsOpen,
  onTestAIOpen,
}: RunSettingsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-pixel text-xs mb-1" style={{ color: '#8b4513' }}>
          Run Settings
        </h2>
        <p className="text-[10px]" style={{ color: '#7a6552' }}>
          Configure how the deliberation unfolds.
        </p>
      </div>

      {/* Discussion Style */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#b0956e' }}>
          Discussion Style
        </label>
        <div className="space-y-1.5">
          {STRATEGIES.map(s => (
            <button
              key={s.value}
              onClick={() => onStrategyChange(s.value)}
              className="w-full px-3 py-2 rounded-lg border-2 text-left text-xs transition-all"
              style={{
                borderColor: strategy === s.value ? '#8b4513' : '#dbc89e',
                backgroundColor: strategy === s.value ? '#f5e6c8' : '#fff',
                color: '#3d2b1f',
              }}
            >
              <div className="font-bold">{s.label}</div>
              <div className="text-[10px] opacity-70">{s.desc}</div>
              {strategy === s.value && (
                <div className="text-[10px] mt-1 leading-relaxed" style={{ color: '#5a3a1a', opacity: 0.8 }}>
                  {s.detail}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Rounds */}
      {strategy !== 'classic' && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#b0956e' }}>
            Rounds
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={strategyRounds}
              onChange={e => onRoundsChange(parseInt(e.target.value))}
              className="flex-1 accent-amber-700"
            />
            <span className="text-xs font-bold font-mono w-6 text-center" style={{ color: '#8b4513' }}>
              {strategyRounds}
            </span>
          </div>
        </div>
      )}

      {/* Group Size */}
      {strategy === 'breakout' && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#b0956e' }}>
            Group Size
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={2}
              max={10}
              value={groupSize}
              onChange={e => onGroupSizeChange(parseInt(e.target.value))}
              className="flex-1 accent-amber-700"
            />
            <span className="text-xs font-bold font-mono w-6 text-center" style={{ color: '#8b4513' }}>
              {groupSize}
            </span>
          </div>
        </div>
      )}

      {/* Fast Mode */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#b0956e' }}>
          Speed
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-xs px-3 py-2 rounded-lg border-2" style={{ borderColor: '#dbc89e', backgroundColor: '#fff', color: '#5a3a1a' }}>
          <input
            type="checkbox"
            checked={fastMode}
            onChange={e => onFastModeChange(e.target.checked)}
            className="accent-amber-700"
          />
          Fast mode
          <span className="text-[10px] opacity-60">(brief responses)</span>
        </label>
      </div>

      {/* Oracle Settings & Test AI links */}
      <div className="pt-2 flex gap-3">
        <button
          onClick={onSettingsOpen}
          className="text-[10px] hover:underline transition-colors"
          style={{ color: '#b0956e' }}
        >
          Oracle Settings
        </button>
        <button
          onClick={onTestAIOpen}
          className="text-[10px] hover:underline transition-colors"
          style={{ color: '#b0956e' }}
        >
          Test AI
        </button>
      </div>
    </div>
  );
}
