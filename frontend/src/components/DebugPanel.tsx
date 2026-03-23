import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DebugEntry } from '../types';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entries: DebugEntry[];
  isRunning?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
}

type TabId = 'timeline' | 'conversations' | 'errors';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions);
}

function StatusBadge({ code }: { code?: number }) {
  if (!code) return null;
  const color = code >= 200 && code < 300 ? '#16a34a' : '#dc2626';
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-bold"
      style={{ backgroundColor: color + '20', color }}
    >
      {code}
    </span>
  );
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    'debug:request': '#2563eb',
    'debug:response': '#7c3aed',
    'agent:done': '#16a34a',
    'agent:error': '#dc2626',
    'agent:voted': '#ca8a04',
    'round:start': '#0891b2',
    'round:end': '#0891b2',
    'swarm:config': '#6b7280',
    'swarm:error': '#dc2626',
    'synthesis:start': '#9333ea',
    'consensus:ready': '#16a34a',
  };
  const color = colors[event] || '#6b7280';
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono"
      style={{ backgroundColor: color + '15', color, border: `1px solid ${color}40` }}
    >
      {event}
    </span>
  );
}

function MessageList({ messages }: { messages: Array<{ role: string; content: string }> }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="space-y-1 mt-2">
      {messages.map((msg, i) => {
        const isExpanded = expanded === i;
        const preview = msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content;
        return (
          <div key={i} className="rounded border text-xs" style={{ borderColor: '#e5d5b0' }}>
            <button
              className="w-full text-left px-2 py-1 flex items-center gap-2"
              style={{ backgroundColor: msg.role === 'system' ? '#f5f0e0' : '#fff' }}
              onClick={() => setExpanded(isExpanded ? null : i)}
            >
              <span className="font-bold font-mono" style={{ color: msg.role === 'system' ? '#6b7280' : msg.role === 'assistant' ? '#7c3aed' : '#2563eb' }}>
                {msg.role}
              </span>
              <span className="text-gray-500 truncate flex-1">{isExpanded ? '' : preview}</span>
              <span className="text-gray-400">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
              <pre className="px-2 py-1 whitespace-pre-wrap break-words text-xs" style={{ color: '#3d2b1f', backgroundColor: '#faf8f0', borderTop: '1px solid #e5d5b0', maxHeight: 300, overflow: 'auto' }}>
                {msg.content}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({ entries }: { entries: DebugEntry[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterEvent, setFilterEvent] = useState<string>('all');

  const agentNames = useMemo(() => {
    const names = new Set<string>();
    entries.forEach(e => { if (e.agentName) names.add(e.agentName); });
    return Array.from(names).sort();
  }, [entries]);

  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    entries.forEach(e => types.add(e.event));
    return Array.from(types).sort();
  }, [entries]);

  const filtered = useMemo(() =>
    entries.filter(e =>
      (filterAgent === 'all' || e.agentName === filterAgent) &&
      (filterEvent === 'all' || e.event === filterEvent)
    ), [entries, filterAgent, filterEvent]);

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <select
          className="text-xs border rounded px-2 py-1"
          style={{ borderColor: '#c4a265', backgroundColor: '#fff' }}
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
        >
          <option value="all">All agents</option>
          {agentNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select
          className="text-xs border rounded px-2 py-1"
          style={{ borderColor: '#c4a265', backgroundColor: '#fff' }}
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
        >
          <option value="all">All events</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs self-center" style={{ color: '#7a6552' }}>{filtered.length} events</span>
      </div>

      <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 180px)' }}>
        {filtered.map(entry => {
          const isExpanded = expandedId === entry.id;
          const data = entry.data as Record<string, unknown>;
          return (
            <div key={entry.id} className="rounded border text-xs" style={{ borderColor: '#e5d5b0', backgroundColor: '#fff' }}>
              <button
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-amber-50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <span className="font-mono text-gray-400 w-20 flex-shrink-0">{formatTime(entry.timestamp)}</span>
                <EventBadge event={entry.event} />
                {entry.agentName && (
                  <span className="font-medium" style={{ color: '#8b4513' }}>{entry.agentName}</span>
                )}
                {entry.round != null && (
                  <span className="text-gray-400">R{entry.round}</span>
                )}
                {data.status_code != null && <StatusBadge code={data.status_code as number} />}
                {data.duration_ms != null && (
                  <span className="text-gray-400">{data.duration_ms as number}ms</span>
                )}
                {data.error && (
                  <span className="text-red-600 truncate flex-1">{String(data.error)}</span>
                )}
                <span className="text-gray-400 ml-auto">{isExpanded ? '−' : '+'}</span>
              </button>
              {isExpanded && (
                <div className="px-3 py-2" style={{ borderTop: '1px solid #e5d5b0', backgroundColor: '#faf8f0' }}>
                  {data.messages && (
                    <div>
                      <span className="font-bold text-xs" style={{ color: '#8b4513' }}>Messages sent to LLM:</span>
                      <MessageList messages={data.messages as Array<{ role: string; content: string }>} />
                    </div>
                  )}
                  {data.raw_response != null && (
                    <div className="mt-2">
                      <span className="font-bold text-xs" style={{ color: '#8b4513' }}>Raw response:</span>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-xs p-2 rounded" style={{ backgroundColor: '#fff', border: '1px solid #e5d5b0', maxHeight: 300, overflow: 'auto' }}>
                        {String(data.raw_response) || '(empty)'}
                      </pre>
                    </div>
                  )}
                  {data.model && (
                    <div className="mt-2 flex gap-4 text-xs text-gray-500">
                      <span>Model: <span className="font-mono">{String(data.model)}</span></span>
                      <span>URL: <span className="font-mono">{String(data.url)}</span></span>
                    </div>
                  )}
                  {!data.messages && !data.raw_response && (
                    <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(data, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm py-8" style={{ color: '#b0956e' }}>No events yet</p>
        )}
      </div>
    </div>
  );
}

function ConversationsView({ entries }: { entries: DebugEntry[] }) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const agentConversations = useMemo(() => {
    const map = new Map<string, DebugEntry[]>();
    entries
      .filter(e => e.event === 'debug:request' || e.event === 'debug:response')
      .forEach(e => {
        const name = e.agentName || 'Unknown';
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(e);
      });
    return map;
  }, [entries]);

  return (
    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 140px)' }}>
      {Array.from(agentConversations.entries()).map(([name, agentEntries]) => {
        const isExpanded = expandedAgent === name;
        const errorCount = agentEntries.filter(e => e.data.error).length;
        const rounds = new Set(agentEntries.map(e => e.round).filter(Boolean));
        return (
          <div key={name} className="rounded border" style={{ borderColor: '#e5d5b0', backgroundColor: '#fff' }}>
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-amber-50 transition-colors"
              onClick={() => setExpandedAgent(isExpanded ? null : name)}
            >
              <span className="font-medium text-sm" style={{ color: '#8b4513' }}>{name}</span>
              <span className="text-xs text-gray-400">Rounds: {Array.from(rounds).sort().join(', ')}</span>
              <span className="text-xs text-gray-400">{agentEntries.length} calls</span>
              {errorCount > 0 && (
                <span className="text-xs font-bold text-red-600">{errorCount} error{errorCount > 1 ? 's' : ''}</span>
              )}
              <span className="text-gray-400 ml-auto">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
              <div className="px-4 py-2 space-y-3" style={{ borderTop: '1px solid #e5d5b0', backgroundColor: '#faf8f0' }}>
                {agentEntries.map(entry => {
                  const data = entry.data as Record<string, unknown>;
                  return (
                    <div key={entry.id} className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-400">{formatTime(entry.timestamp)}</span>
                        <EventBadge event={entry.event} />
                        {entry.round != null && <span className="text-gray-400">Round {entry.round}</span>}
                        {data.retry && <span className="text-orange-500 font-bold">RETRY</span>}
                        {data.status_code != null && <StatusBadge code={data.status_code as number} />}
                        {data.duration_ms != null && <span className="text-gray-400">{data.duration_ms as number}ms</span>}
                        {data.error && <span className="text-red-600">{String(data.error)}</span>}
                      </div>
                      {data.messages && (
                        <MessageList messages={data.messages as Array<{ role: string; content: string }>} />
                      )}
                      {data.raw_response != null && (
                        <details className="mt-1">
                          <summary className="cursor-pointer font-bold" style={{ color: '#8b4513' }}>Raw response ({data.response_chars as number} chars)</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-words p-2 rounded" style={{ backgroundColor: '#fff', border: '1px solid #e5d5b0', maxHeight: 200, overflow: 'auto' }}>
                            {String(data.raw_response) || '(empty)'}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {agentConversations.size === 0 && (
        <p className="text-center text-sm py-8" style={{ color: '#b0956e' }}>No agent conversations yet</p>
      )}
    </div>
  );
}

function ErrorsView({ entries }: { entries: DebugEntry[] }) {
  const errors = useMemo(() =>
    entries.filter(e => e.data.error || e.event === 'agent:error' || e.event === 'swarm:error'),
    [entries]
  );

  return (
    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 140px)' }}>
      {errors.map(entry => {
        const data = entry.data as Record<string, unknown>;
        return (
          <div key={entry.id} className="rounded border p-3 text-xs" style={{ borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-gray-400">{formatTime(entry.timestamp)}</span>
              <EventBadge event={entry.event} />
              {entry.agentName && <span className="font-medium" style={{ color: '#8b4513' }}>{entry.agentName}</span>}
              {entry.round != null && <span className="text-gray-400">Round {entry.round}</span>}
              {data.status_code != null && <StatusBadge code={data.status_code as number} />}
            </div>
            <p className="text-red-700 font-medium">{String(data.error || data.message || JSON.stringify(data))}</p>
            {data.url && <p className="text-gray-500 mt-1">URL: {String(data.url)}</p>}
            {data.model && <p className="text-gray-500">Model: {String(data.model)}</p>}
            {data.duration_ms != null && <p className="text-gray-500">Duration: {data.duration_ms as number}ms</p>}
          </div>
        );
      })}
      {errors.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: '#16a34a' }}>No errors</p>
      )}
    </div>
  );
}

export default function DebugPanel({ isOpen, onClose, entries, isRunning, onCancel, onRetry }: DebugPanelProps) {
  const [tab, setTab] = useState<TabId>('timeline');
  const errorCount = useMemo(() =>
    entries.filter(e => e.data.error || e.event === 'agent:error' || e.event === 'swarm:error').length,
    [entries]
  );

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'errors', label: 'Errors', badge: errorCount },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(61, 43, 31, 0.4)' }} onClick={onClose} />

          <motion.div
            className="relative w-full max-w-4xl rounded-lg border-2 flex flex-col"
            style={{ borderColor: '#c4a265', backgroundColor: '#fffdf5', maxHeight: '85vh' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '2px solid #e5d5b0' }}>
              <h2 className="font-pixel text-sm" style={{ color: '#8b4513' }}>Debug Log</h2>
              <div className="flex items-center gap-3">
                {isRunning && onCancel && (
                  <button
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded border-2 text-xs font-medium transition-colors hover:shadow-sm"
                    style={{ borderColor: '#dc2626', color: '#dc2626', backgroundColor: '#fef2f2' }}
                  >
                    Cancel Run
                  </button>
                )}
                {onRetry && (
                  <button
                    onClick={() => { onRetry(); onClose(); }}
                    className="px-3 py-1.5 rounded border-2 text-xs font-medium transition-colors hover:shadow-sm"
                    style={{ borderColor: '#16a34a', color: '#16a34a', backgroundColor: '#f0fdf4' }}
                  >
                    {isRunning ? 'Cancel & Retry' : 'Retry'}
                  </button>
                )}
                <span className="text-xs" style={{ color: '#7a6552' }}>{entries.length} events</span>
                <button onClick={onClose} className="text-lg leading-none" style={{ color: '#b0956e' }}>&times;</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 px-6" style={{ borderBottom: '1px solid #e5d5b0' }}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  className="px-4 py-2 text-xs font-medium transition-colors relative"
                  style={{
                    color: tab === t.id ? '#8b4513' : '#b0956e',
                    borderBottom: tab === t.id ? '2px solid #8b4513' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.badge != null && t.badge > 0 && (
                    <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#dc2626', fontSize: 9 }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden px-6 py-4">
              {tab === 'timeline' && <TimelineView entries={entries} />}
              {tab === 'conversations' && <ConversationsView entries={entries} />}
              {tab === 'errors' && <ErrorsView entries={entries} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
