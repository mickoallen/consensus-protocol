export interface AgentConfig {
  id: number;
  persona: string;
  name: string;
  color: string;
}

export interface RoundState {
  thinking: string;
  position: string;
  confidence: number;
  done: boolean;
}

export interface FinalVote {
  agent_id: number;
  persona: string;
  position: string;
  confidence: number;
  changed_mind: boolean;
  what_changed_it: string;
  dissents_from_consensus: boolean;
}

export interface SynthesisResult {
  consensus: string;
  weighted_score: number;
  votes: FinalVote[];
  minority_report: string;
  dissenters: FinalVote[];
}

export interface AgentState {
  id: number;
  persona: string;
  name: string;
  color: string;
  rounds: RoundState[];
  finalVote: FinalVote | null;
  error: string | null;
}

export type SwarmPhase = 'idle' | 'running' | 'complete' | 'error';

export type Strategy = 'classic' | 'breakout' | 'rolling';

export interface GroupAssignment {
  group: number;
  agent_ids: number[];
}

export interface DebugEntry {
  id: number;
  timestamp: number;
  event: string;
  agentName?: string;
  agentId?: number;
  round?: number;
  data: Record<string, unknown>;
}

export interface SwarmState {
  phase: SwarmPhase;
  round: number;
  totalRounds: number;
  strategy: Strategy;
  agents: Map<number, AgentState>;
  groups: GroupAssignment[] | null;
  currentSpeaker: number | null;
  consensusText: string;
  synthesisLevel: number;
  synthesisTotalLevels: number;
  statusMessage: string | null;
  result: SynthesisResult | null;
  error: string | null;
  debugLog: DebugEntry[];
}

export type SSEEventType =
  | 'swarm:config'
  | 'round:start'
  | 'round:end'
  | 'agent:thinking'
  | 'agent:done'
  | 'agent:error'
  | 'agent:voted'
  | 'groups:assigned'
  | 'speaker:start'
  | 'summaries:updating'
  | 'summaries:updated'
  | 'synthesis:start'
  | 'synthesis:thinking'
  | 'consensus:token'
  | 'consensus:ready'
  | 'swarm:error'
  | 'debug:request'
  | 'debug:response';
