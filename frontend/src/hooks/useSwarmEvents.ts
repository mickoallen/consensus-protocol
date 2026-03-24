import { useCallback, useRef, useState } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import { StartSwarm, CancelSwarm } from '../../wailsjs/go/main/App';
import type { AgentConfig, AgentState, DebugEntry, FinalVote, GroupAssignment, Strategy, SwarmState, SynthesisResult } from '../types';

let debugEntryId = 0;

const initialState: SwarmState = {
  phase: 'idle',
  round: 0,
  totalRounds: 3,
  strategy: 'classic',
  agents: new Map(),
  groups: null,
  currentSpeaker: null,
  summariesUpdatingSpeaker: null,
  listeningAgents: new Set<number>(),
  consensusText: '',
  synthesisLevel: 0,
  synthesisTotalLevels: 0,
  statusMessage: null,
  result: null,
  error: null,
  debugLog: [],
};

function createAgentState(config: AgentConfig, totalRounds: number): AgentState {
  const rounds = Array.from({ length: totalRounds + 1 }, () => ({
    thinking: '', position: '', confidence: 0, done: false,
  }));
  return {
    id: config.id,
    persona: config.persona,
    name: config.name,
    color: config.color,
    rounds,
    finalVote: null,
    error: null,
  };
}

export interface SwarmOptions {
  question: string;
  personas: Record<string, number>;
  strategy?: Strategy;
  rounds?: number;
  groupSize?: number;
  fastMode?: boolean;
}

// All event types the backend emits
const EVENT_TYPES = [
  'swarm:config', 'swarm:error', 'swarm:done', 'swarm:status',
  'round:start', 'round:end',
  'debug:request', 'debug:response',
  'agent:thinking', 'agent:done', 'agent:error', 'agent:voted',
  'groups:assigned', 'speaker:start', 'summaries:updating', 'summaries:updated',
  'summary:listener:start', 'summary:listener:done',
  'synthesis:start', 'synthesis:thinking',
  'consensus:token', 'consensus:ready',
];

export function useSwarmEvents() {
  const [state, setState] = useState<SwarmState>(initialState);
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  const startSwarm = useCallback(async (opts: SwarmOptions) => {
    // Reset state
    debugEntryId = 0;
    cleanup();
    setState({ ...initialState, phase: 'running', strategy: opts.strategy || 'classic', totalRounds: opts.rounds || 3, debugLog: [] });

    // Subscribe to all event types
    const cleanups: (() => void)[] = [];
    for (const eventType of EVENT_TYPES) {
      const off = EventsOn(eventType, (data: any) => {
        processEvent(eventType, data, setState);
      });
      cleanups.push(off);
    }
    cleanupRef.current = () => {
      for (const off of cleanups) off();
    };

    // Call the Go binding to start the swarm
    try {
      await StartSwarm({
        question: opts.question,
        personas: opts.personas,
        strategy: opts.strategy || 'classic',
        rounds: opts.rounds || 3,
        group_size: opts.groupSize || 5,
        fast_mode: opts.fastMode || false,
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, phase: 'error', error: err.message || String(err) }));
      cleanup();
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    CancelSwarm();
    cleanup();
    setState(prev => ({ ...prev, phase: 'idle' }));
  }, [cleanup]);

  return { state, startSwarm, cancel };
}

function processEvent(
  event: string,
  data: any,
  setState: React.Dispatch<React.SetStateAction<SwarmState>>
) {
  // Log all events except agent:thinking (too noisy) to debug log
  if (event !== 'agent:thinking') {
    const entry: DebugEntry = {
      id: ++debugEntryId,
      timestamp: Date.now(),
      event,
      agentName: data?.agent_name || data?.persona,
      agentId: data?.agent_id,
      round: data?.round,
      data,
    };
    setState(prev => ({ ...prev, debugLog: [...prev.debugLog, entry] }));
  }

  switch (event) {
    case 'swarm:config': {
      const strategy = (data.strategy || 'classic') as Strategy;
      const totalRounds = data.rounds || 3;
      const agents = new Map<number, AgentState>();
      for (const cfg of data.agents as AgentConfig[]) {
        agents.set(cfg.id, createAgentState(cfg, totalRounds));
      }
      setState(prev => ({ ...prev, agents, strategy, totalRounds }));
      break;
    }

    case 'groups:assigned':
      setState(prev => ({
        ...prev,
        groups: data.groups as GroupAssignment[],
      }));
      break;

    case 'speaker:start':
      setState(prev => ({ ...prev, currentSpeaker: data.agent_id }));
      break;

    case 'summaries:updating':
      setState(prev => ({ ...prev, summariesUpdatingSpeaker: data.speaker_id }));
      break;

    case 'summaries:updated':
      setState(prev => ({ ...prev, currentSpeaker: null, summariesUpdatingSpeaker: null, listeningAgents: new Set() }));
      break;

    case 'summary:listener:start':
      setState(prev => {
        const next = new Set(prev.listeningAgents);
        next.add(data.agent_id as number);
        return { ...prev, listeningAgents: next };
      });
      break;

    case 'summary:listener:done':
      setState(prev => {
        const next = new Set(prev.listeningAgents);
        next.delete(data.agent_id as number);
        return { ...prev, listeningAgents: next };
      });
      break;

    case 'debug:request':
      setState(prev => ({ ...prev, currentSpeaker: data.agent_id }));
      break;

    case 'swarm:status':
      setState(prev => ({ ...prev, statusMessage: data.message }));
      break;

    case 'round:start':
      setState(prev => ({ ...prev, round: data.round, currentSpeaker: null, statusMessage: null }));
      break;

    case 'agent:thinking':
      setState(prev => {
        const agents = new Map(prev.agents);
        const agent = agents.get(data.agent_id);
        if (agent) {
          const rounds = [...agent.rounds];
          const roundIdx = data.round - 1;
          while (rounds.length <= roundIdx) {
            rounds.push({ thinking: '', position: '', confidence: 0, done: false });
          }
          rounds[roundIdx] = {
            ...rounds[roundIdx],
            thinking: rounds[roundIdx].thinking + data.token,
          };
          agents.set(data.agent_id, { ...agent, rounds });
        }
        return { ...prev, agents };
      });
      break;

    case 'agent:done':
      setState(prev => {
        const agents = new Map(prev.agents);
        const agent = agents.get(data.agent_id);
        if (agent) {
          const rounds = [...agent.rounds];
          const roundIdx = data.round - 1;
          while (rounds.length <= roundIdx) {
            rounds.push({ thinking: '', position: '', confidence: 0, done: false });
          }
          rounds[roundIdx] = {
            ...rounds[roundIdx],
            position: data.position,
            confidence: data.confidence,
            done: true,
          };
          agents.set(data.agent_id, { ...agent, rounds });
        }
        return { ...prev, agents, currentSpeaker: null };
      });
      break;

    case 'agent:error':
      setState(prev => {
        const agents = new Map(prev.agents);
        const agent = agents.get(data.agent_id);
        if (agent) {
          agents.set(data.agent_id, { ...agent, error: data.error });
        }
        return { ...prev, agents };
      });
      break;

    case 'agent:voted': {
      const vote = data as FinalVote;
      setState(prev => {
        const agents = new Map(prev.agents);
        const agent = agents.get(vote.agent_id);
        if (agent) {
          agents.set(vote.agent_id, { ...agent, finalVote: vote });
        }
        return { ...prev, agents };
      });
      break;
    }

    case 'synthesis:start':
      setState(prev => ({
        ...prev,
        synthesisLevel: data.level,
        synthesisTotalLevels: data.total_levels,
      }));
      break;

    case 'consensus:token':
      setState(prev => ({
        ...prev,
        consensusText: prev.consensusText + data.token,
        statusMessage: null,
      }));
      break;

    case 'consensus:ready': {
      const result = data as SynthesisResult;
      setState(prev => ({
        ...prev,
        phase: 'complete',
        result,
      }));
      break;
    }

    case 'swarm:error':
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: data.error,
      }));
      break;

    case 'swarm:done':
      // Stream ended. Don't transition phase here — consensus:ready already
      // sets phase to 'complete'. If we race with consensus:ready we'd
      // overwrite the result. Just clean up if something went wrong.
      setTimeout(() => {
        setState(prev => {
          if (prev.phase === 'running') {
            // consensus:ready never fired — something went wrong
            if (prev.consensusText) {
              return { ...prev, phase: 'complete' };
            }
            return { ...prev, phase: 'error', error: 'Deliberation ended without producing a synthesis result' };
          }
          return prev;
        });
      }, 500); // Delay to let consensus:ready process first
      break;
  }
}
