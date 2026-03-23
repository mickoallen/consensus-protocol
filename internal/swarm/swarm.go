package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"consensus-protocol/internal/agent"
	"consensus-protocol/internal/llm"
	"consensus-protocol/internal/persona"
	"consensus-protocol/internal/store"
	"consensus-protocol/internal/synthesizer"

	"math/rand"
	"time"

	"github.com/google/uuid"
)

type Strategy string

const (
	StrategyClassic  Strategy = "classic"
	StrategyBreakout Strategy = "breakout"
	StrategyRolling  Strategy = "rolling"
)

type Config struct {
	Parallel         bool
	ConcurrencyLimit int // only used if Parallel is true
	Strategy         Strategy
	Rounds           int // number of deliberation rounds for breakout/rolling (default 3)
	GroupSize        int // max group size for breakout (default 5)
	FastMode         bool
}

type Swarm struct {
	ID       string
	Question string
	Agents   []*agent.Agent
	Config   Config
	EventCh  chan agent.SSEEvent
	client   *llm.Client
	store    *store.Store
}

func New(question string, personas []persona.Persona, cfg Config, client *llm.Client, st *store.Store) *Swarm {
	agents := make([]*agent.Agent, len(personas))
	for i, p := range personas {
		agents[i] = &agent.Agent{
			ID:       i,
			Persona:  p,
			FastMode: cfg.FastMode,
		}
	}

	if cfg.ConcurrencyLimit <= 0 {
		cfg.ConcurrencyLimit = 3
	}
	if cfg.Strategy == "" {
		cfg.Strategy = StrategyClassic
	}
	if cfg.Rounds <= 0 {
		cfg.Rounds = 3
	}
	if cfg.GroupSize <= 0 {
		cfg.GroupSize = 5
	}

	return &Swarm{
		ID:       uuid.New().String(),
		Question: question,
		Agents:   agents,
		Config:   cfg,
		EventCh:  make(chan agent.SSEEvent, 1000),
		client:   client,
		store:    st,
	}
}

func (s *Swarm) Run(ctx context.Context) (*store.SynthesisResult, error) {
	defer close(s.EventCh)

	// Create run in store
	if err := s.store.CreateRun(s.ID, s.Question, len(s.Agents), string(s.Config.Strategy)); err != nil {
		return nil, fmt.Errorf("create run: %w", err)
	}

	// Emit swarm config
	agentConfigs := make([]map[string]any, len(s.Agents))
	for i, a := range s.Agents {
		agentConfigs[i] = map[string]any{
			"id":      a.ID,
			"persona": a.Persona.Slug,
			"name":    a.Persona.Name,
			"color":   a.Persona.Color,
		}
	}
	s.EventCh <- agent.SSEEvent{Event: "swarm:config", Data: map[string]any{
		"agents":     agentConfigs,
		"strategy":   string(s.Config.Strategy),
		"rounds":     s.Config.Rounds,
		"group_size": s.Config.GroupSize,
	}}

	// Run strategy-specific deliberation
	var strategyErr error
	switch s.Config.Strategy {
	case StrategyBreakout:
		strategyErr = s.runBreakout(ctx)
	case StrategyRolling:
		strategyErr = s.runRolling(ctx)
	default:
		strategyErr = s.runClassic(ctx)
	}
	if strategyErr != nil {
		log.Printf("[swarm %s] Strategy %s failed: %v", s.ID[:8], s.Config.Strategy, strategyErr)
		s.EventCh <- agent.SSEEvent{
			Event: "swarm:error",
			Data:  map[string]any{"error": strategyErr.Error(), "fatal": true},
		}
		s.store.UpdateRunStatus(s.ID, "failed")
		return nil, strategyErr
	}

	// Check minimum viable swarm
	voteCount, err := s.store.GetFinalVoteCount(s.ID)
	if err != nil {
		return nil, fmt.Errorf("count votes: %w", err)
	}
	if voteCount < 3 {
		s.EventCh <- agent.SSEEvent{
			Event: "swarm:error",
			Data:  map[string]any{"error": "fewer than 3 agents produced valid votes", "fatal": true},
		}
		s.store.UpdateRunStatus(s.ID, "failed")
		return nil, fmt.Errorf("only %d valid votes, need at least 3", voteCount)
	}

	// === Synthesis ===
	s.EventCh <- agent.SSEEvent{Event: "swarm:status", Data: map[string]any{"message": "The high scribe weaves the council's wisdom into a final decree..."}}
	log.Printf("[swarm %s] === Starting synthesis ===", s.ID[:8])
	synthStart := time.Now()
	synth := synthesizer.New(s.client, s.store, s.EventCh)
	result, err := synth.Synthesize(ctx, s.ID)
	if err != nil {
		log.Printf("[swarm %s] Synthesis FAILED after %v: %v", s.ID[:8], time.Since(synthStart), err)
		s.store.UpdateRunStatus(s.ID, "failed")
		return nil, fmt.Errorf("synthesis: %w", err)
	}
	log.Printf("[swarm %s] Synthesis completed in %v", s.ID[:8], time.Since(synthStart))

	s.store.UpdateRunStatus(s.ID, "completed")
	return result, nil
}

// runClassic implements the original 3-round all-see-all deliberation.
func (s *Swarm) runClassic(ctx context.Context) error {
	// === Round 1 ===
	log.Printf("[swarm %s] === Round 1 starting with %d agents ===", s.ID[:8], len(s.Agents))
	roundStart := time.Now()
	s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": 1}}
	if err := s.runRound(ctx, 1); err != nil {
		log.Printf("[swarm %s] Round 1 FAILED after %v: %v", s.ID[:8], time.Since(roundStart), err)
		return fmt.Errorf("round 1: %w", err)
	}
	s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": 1}}
	log.Printf("[swarm %s] Round 1 completed in %v", s.ID[:8], time.Since(roundStart))

	// Summarize round 1 for context (and for adversarial injection)
	s.EventCh <- agent.SSEEvent{Event: "swarm:status", Data: map[string]any{"message": "The scribes gather the council's opening statements..."}}
	round1Outputs, err := s.store.GetRoundOutputs(s.ID, 1)
	if err != nil {
		log.Printf("[swarm %s] Failed to get round 1 outputs: %v", s.ID[:8], err)
		return fmt.Errorf("get round 1 outputs: %w", err)
	}
	log.Printf("[swarm %s] Retrieved %d round 1 outputs", s.ID[:8], len(round1Outputs))
	round1Context := formatRoundContext(s.Agents, round1Outputs)

	// Detect emerging consensus for adversarial agents
	s.EventCh <- agent.SSEEvent{Event: "swarm:status", Data: map[string]any{"message": "The herald tests the winds of agreement..."}}
	consensusSummary, err := s.detectConsensus(ctx, round1Context)
	if err != nil {
		log.Printf("[swarm %s] Consensus detection failed (non-fatal): %v", s.ID[:8], err)
		consensusSummary = ""
	}

	// === Round 2 ===
	log.Printf("[swarm %s] === Round 2 starting with %d agents ===", s.ID[:8], len(s.Agents))
	roundStart = time.Now()
	s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": 2}}
	if err := s.runRound2(ctx, round1Context, consensusSummary); err != nil {
		log.Printf("[swarm %s] Round 2 FAILED after %v: %v", s.ID[:8], time.Since(roundStart), err)
		return fmt.Errorf("round 2: %w", err)
	}
	s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": 2}}
	log.Printf("[swarm %s] Round 2 completed in %v", s.ID[:8], time.Since(roundStart))

	// Get round 2 context
	s.EventCh <- agent.SSEEvent{Event: "swarm:status", Data: map[string]any{"message": "The scribes compile the council's deliberations..."}}
	round2Outputs, err := s.store.GetRoundOutputs(s.ID, 2)
	if err != nil {
		log.Printf("[swarm %s] Failed to get round 2 outputs: %v", s.ID[:8], err)
		return fmt.Errorf("get round 2 outputs: %w", err)
	}
	log.Printf("[swarm %s] Retrieved %d round 2 outputs", s.ID[:8], len(round2Outputs))
	round2Context := formatRoundContext(s.Agents, round2Outputs)

	// === Round 3 (voting) ===
	s.EventCh <- agent.SSEEvent{Event: "swarm:status", Data: map[string]any{"message": "The council prepares to cast their final judgments..."}}
	log.Printf("[swarm %s] === Round 3 (voting) starting with %d agents ===", s.ID[:8], len(s.Agents))
	roundStart = time.Now()
	s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": 3}}
	if err := s.runRound3(ctx, round2Context); err != nil {
		log.Printf("[swarm %s] Round 3 FAILED after %v: %v", s.ID[:8], time.Since(roundStart), err)
		return fmt.Errorf("round 3: %w", err)
	}
	s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": 3}}
	log.Printf("[swarm %s] Round 3 completed in %v", s.ID[:8], time.Since(roundStart))

	return nil
}

// runBreakout implements the breakout groups deliberation strategy.
// Agents are split into small groups, deliberate, reshuffle, and repeat.
// Final round is a global vote where all agents see group summaries.
func (s *Swarm) runBreakout(ctx context.Context) error {
	var previousGroups [][]int

	for round := 1; round <= s.Config.Rounds; round++ {
		// Assign groups, minimizing overlap with previous round
		groups := assignGroups(s.Agents, s.Config.GroupSize, previousGroups)
		previousGroups = groups

		// Emit group assignments
		groupData := make([]map[string]any, len(groups))
		for i, g := range groups {
			groupData[i] = map[string]any{"group": i + 1, "agent_ids": g}
		}
		s.EventCh <- agent.SSEEvent{Event: "groups:assigned", Data: map[string]any{
			"round":  round,
			"groups": groupData,
		}}

		s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": round}}

		// Run each group
		for groupIdx, groupIDs := range groups {
			groupAgents := s.agentsByIDs(groupIDs)

			if round == 1 {
				// First round: no prior context, just answer the question
				for _, a := range groupAgents {
					messages := a.BuildRound1Messages(s.Question)
					output, err := a.Run(ctx, s.client, round, messages, s.EventCh)
					if err != nil {
						s.EventCh <- agent.SSEEvent{
							Event: "agent:error",
							Data:  map[string]any{"agent_id": a.ID, "round": round, "error": err.Error(), "recoverable": true},
						}
						continue
					}
					if err := s.store.SaveRoundOutput(s.ID, output); err != nil {
						return fmt.Errorf("save output: %w", err)
					}
					s.EventCh <- agent.SSEEvent{
						Event: "agent:done",
						Data:  map[string]any{"agent_id": a.ID, "round": round, "position": truncate(output.Position, 500), "confidence": output.Confidence, "group": groupIdx + 1},
					}
				}
			} else {
				// Subsequent rounds: see previous round's context from current group members
				prevOutputs, err := s.store.GetRoundOutputs(s.ID, round-1)
				if err != nil {
					return fmt.Errorf("get round %d outputs: %w", round-1, err)
				}
				// Filter to only this group's agents
				groupContext := formatRoundContext(groupAgents, filterOutputsByAgents(prevOutputs, groupIDs))

				for _, a := range groupAgents {
					messages := a.BuildGroupRoundMessages(s.Question, groupContext, round)
					output, err := a.Run(ctx, s.client, round, messages, s.EventCh)
					if err != nil {
						s.EventCh <- agent.SSEEvent{
							Event: "agent:error",
							Data:  map[string]any{"agent_id": a.ID, "round": round, "error": err.Error(), "recoverable": true},
						}
						continue
					}
					if err := s.store.SaveRoundOutput(s.ID, output); err != nil {
						return fmt.Errorf("save output: %w", err)
					}
					s.EventCh <- agent.SSEEvent{
						Event: "agent:done",
						Data:  map[string]any{"agent_id": a.ID, "round": round, "position": truncate(output.Position, 500), "confidence": output.Confidence, "group": groupIdx + 1},
					}
				}
			}
		}

		s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": round}}
	}

	// === Global vote round ===
	voteRound := s.Config.Rounds + 1

	// Build group summaries from the last deliberation round
	lastRoundOutputs, err := s.store.GetRoundOutputs(s.ID, s.Config.Rounds)
	if err != nil {
		return fmt.Errorf("get final round outputs: %w", err)
	}
	groupSummaries := formatRoundContext(s.Agents, lastRoundOutputs)

	s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": voteRound, "vote_round": true}}

	for _, a := range s.Agents {
		messages := a.BuildGlobalVoteMessages(s.Question, groupSummaries)
		s.runVoteRound(ctx, a, voteRound, messages)
	}

	s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": voteRound}}
	return nil
}

// runRolling implements the rolling summary deliberation strategy.
// Agents speak one at a time; each maintains a persona-biased summary
// that gets updated after each new speaker.
func (s *Swarm) runRolling(ctx context.Context) error {
	// Initialize per-agent summaries
	summaries := make(map[int]string)
	for _, a := range s.Agents {
		summaries[a.ID] = ""
	}

	for lap := 1; lap <= s.Config.Rounds; lap++ {
		s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": lap}}

		for i, speaker := range s.Agents {
			s.EventCh <- agent.SSEEvent{Event: "speaker:start", Data: map[string]any{
				"agent_id": speaker.ID,
				"lap":      lap,
				"position": i + 1,
				"total":    len(s.Agents),
			}}

			// Speaker responds based on their personal summary
			messages := speaker.BuildRollingSpeakMessages(s.Question, summaries[speaker.ID])
			output, err := speaker.Run(ctx, s.client, lap, messages, s.EventCh)
			if err != nil {
				s.EventCh <- agent.SSEEvent{
					Event: "agent:error",
					Data:  map[string]any{"agent_id": speaker.ID, "round": lap, "error": err.Error(), "recoverable": true},
				}
				continue
			}

			if err := s.store.SaveRoundOutput(s.ID, output); err != nil {
				return fmt.Errorf("save output: %w", err)
			}

			s.EventCh <- agent.SSEEvent{
				Event: "agent:done",
				Data:  map[string]any{"agent_id": speaker.ID, "round": lap, "position": truncate(output.Position, 500), "confidence": output.Confidence},
			}

			// All other agents update their personal summary (non-streaming)
			s.EventCh <- agent.SSEEvent{Event: "summaries:updating", Data: map[string]any{"speaker_id": speaker.ID}}

			for _, listener := range s.Agents {
				if listener.ID == speaker.ID {
					continue
				}
				messages := listener.BuildSummaryUpdateMessages(s.Question, summaries[listener.ID], speaker.Persona.Name, output.Position)
				newSummary, err := s.client.ChatCompletion(ctx, messages)
				if err != nil {
					log.Printf("[swarm] Summary update failed for agent %d: %v", listener.ID, err)
					continue
				}
				summaries[listener.ID] = newSummary
			}

			// Speaker also updates their own summary with their own position
			summaries[speaker.ID] = output.Position

			s.EventCh <- agent.SSEEvent{Event: "summaries:updated", Data: map[string]any{"speaker_id": speaker.ID}}
		}

		s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": lap}}
	}

	// === Global vote round ===
	voteRound := s.Config.Rounds + 1
	s.EventCh <- agent.SSEEvent{Event: "round:start", Data: map[string]any{"round": voteRound, "vote_round": true}}

	for _, a := range s.Agents {
		messages := a.BuildRollingVoteMessages(s.Question, summaries[a.ID])
		s.runVoteRound(ctx, a, voteRound, messages)
	}

	s.EventCh <- agent.SSEEvent{Event: "round:end", Data: map[string]any{"round": voteRound}}
	return nil
}

// runVoteRound runs a single agent through the voting process (shared by breakout and rolling).
func (s *Swarm) runVoteRound(ctx context.Context, a *agent.Agent, round int, messages []llm.Message) {
	output, err := a.Run(ctx, s.client, round, messages, s.EventCh)
	if err != nil {
		log.Printf("[swarm] Agent %d/%s vote failed: %v — attempting retry", a.ID, a.Persona.Name, err)
		if output.Reasoning != "" {
			s.store.SaveRoundOutput(s.ID, output)
		}
		retryCtx, retryCancel := context.WithTimeout(context.Background(), 30*time.Minute)
		vote, retryErr := a.RunRetryJSON(retryCtx, s.client, output.Reasoning, s.EventCh)
		retryCancel()
		if retryErr != nil {
			log.Printf("[swarm] Agent %d/%s vote retry failed: %v", a.ID, a.Persona.Name, retryErr)
			s.EventCh <- agent.SSEEvent{
				Event: "agent:error",
				Data:  map[string]any{"agent_id": a.ID, "round": round, "error": fmt.Sprintf("failed: %v", retryErr), "recoverable": true},
			}
			return
		}
		vote.AgentID = a.ID
		vote.Persona = a.Persona.Name
		s.saveFinalVote(a, vote)
		return
	}

	vote := store.FinalVote{
		AgentID:    a.ID,
		Persona:    a.Persona.Name,
		Position:   output.Position,
		Confidence: output.Confidence,
	}
	if fullVote, err := extractVoteFromReasoning(output.Reasoning); err == nil {
		fullVote.AgentID = a.ID
		fullVote.Persona = a.Persona.Name
		vote = fullVote
	}
	s.saveFinalVote(a, vote)
}

// assignGroups splits agents into groups of maxSize, reshuffling to minimize overlap.
func assignGroups(agents []*agent.Agent, maxSize int, previousGroups [][]int) [][]int {
	ids := make([]int, len(agents))
	for i, a := range agents {
		ids[i] = a.ID
	}

	// Shuffle to randomize group assignment
	rand.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })

	// Chunk into groups
	var groups [][]int
	for i := 0; i < len(ids); i += maxSize {
		end := i + maxSize
		if end > len(ids) {
			end = len(ids)
		}
		group := make([]int, end-i)
		copy(group, ids[i:end])
		groups = append(groups, group)
	}
	return groups
}

// agentsByIDs returns a subset of agents matching the given IDs.
func (s *Swarm) agentsByIDs(ids []int) []*agent.Agent {
	idSet := make(map[int]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}
	var result []*agent.Agent
	for _, a := range s.Agents {
		if idSet[a.ID] {
			result = append(result, a)
		}
	}
	return result
}

// filterOutputsByAgents filters round outputs to only those from agents in the given ID set.
func filterOutputsByAgents(outputs []store.RoundOutput, agentIDs []int) []store.RoundOutput {
	idSet := make(map[int]bool, len(agentIDs))
	for _, id := range agentIDs {
		idSet[id] = true
	}
	var filtered []store.RoundOutput
	for _, o := range outputs {
		if idSet[o.AgentID] {
			filtered = append(filtered, o)
		}
	}
	return filtered
}

func (s *Swarm) runRound(ctx context.Context, round int) error {
	if s.Config.Parallel {
		return s.runRoundParallel(ctx, round, func(a *agent.Agent) (store.RoundOutput, error) {
			messages := a.BuildRound1Messages(s.Question)
			return a.Run(ctx, s.client, round, messages, s.EventCh)
		})
	}
	return s.runRoundSequential(ctx, round, func(a *agent.Agent) (store.RoundOutput, error) {
		messages := a.BuildRound1Messages(s.Question)
		return a.Run(ctx, s.client, round, messages, s.EventCh)
	})
}

func (s *Swarm) runRound2(ctx context.Context, round1Context, consensusSummary string) error {
	runAgent := func(a *agent.Agent) (store.RoundOutput, error) {
		var adversarialInjection string
		if a.Persona.Adversarial && consensusSummary != "" {
			adversarialInjection = fmt.Sprintf(
				"IMPORTANT — The emerging consensus direction is: \"%s\". Your specific role is to find the strongest argument AGAINST this consensus. Do not agree with the majority. Challenge it rigorously.",
				consensusSummary,
			)
		}
		messages := a.BuildRound2Messages(s.Question, round1Context, adversarialInjection)
		return a.Run(ctx, s.client, 2, messages, s.EventCh)
	}

	if s.Config.Parallel {
		return s.runRoundParallel(ctx, 2, runAgent)
	}
	return s.runRoundSequential(ctx, 2, runAgent)
}

func (s *Swarm) runRound3(ctx context.Context, round2Context string) error {
	runAgent := func(a *agent.Agent) error {
		messages := a.BuildRound3Messages(s.Question, round2Context)
		output, err := a.Run(ctx, s.client, 3, messages, s.EventCh)

		if err != nil {
			log.Printf("[swarm] Agent %d/%s Round 3 failed: %v — attempting retry", a.ID, a.Persona.Name, err)

			// Save the round output even though JSON failed (so we have the reasoning)
			if output.Reasoning != "" {
				s.store.SaveRoundOutput(s.ID, output)
			}

			// Try JSON retry with fresh context — parent ctx may be canceled from LLM stream failure
			retryCtx, retryCancel := context.WithTimeout(context.Background(), 30*time.Minute)
			vote, retryErr := a.RunRetryJSON(retryCtx, s.client, output.Reasoning, s.EventCh)
			retryCancel()
			if retryErr != nil {
				log.Printf("[swarm] Agent %d/%s retry also failed: %v", a.ID, a.Persona.Name, retryErr)
				s.EventCh <- agent.SSEEvent{
					Event: "agent:error",
					Data: map[string]any{
						"agent_id":    a.ID,
						"round":       3,
						"error":       fmt.Sprintf("failed: %v", retryErr),
						"recoverable": true,
					},
				}
				return nil
			}
			vote.AgentID = a.ID
			vote.Persona = a.Persona.Name
			s.saveFinalVote(a, vote)
			return nil
		}

		// Successful Run — JSON was extracted in agent.Run
		vote := store.FinalVote{
			AgentID:    a.ID,
			Persona:    a.Persona.Name,
			Position:   output.Position,
			Confidence: output.Confidence,
		}

		// Try to get the full structured vote (with changed_mind etc)
		if fullVote, err := extractVoteFromReasoning(output.Reasoning); err == nil {
			fullVote.AgentID = a.ID
			fullVote.Persona = a.Persona.Name
			vote = fullVote
		}

		s.saveFinalVote(a, vote)
		return nil
	}

	if s.Config.Parallel {
		return s.runRound3Parallel(ctx, runAgent)
	}
	for _, a := range s.Agents {
		if err := runAgent(a); err != nil {
			return err
		}
	}
	return nil
}

func (s *Swarm) saveFinalVote(a *agent.Agent, vote store.FinalVote) {
	if err := s.store.SaveFinalVote(s.ID, vote); err != nil {
		s.EventCh <- agent.SSEEvent{
			Event: "agent:error",
			Data:  map[string]any{"agent_id": a.ID, "round": 3, "error": err.Error(), "recoverable": true},
		}
		return
	}

	s.EventCh <- agent.SSEEvent{
		Event: "agent:voted",
		Data:  vote,
	}
}

type agentRunner func(a *agent.Agent) (store.RoundOutput, error)

func (s *Swarm) runRoundSequential(ctx context.Context, round int, run agentRunner) error {
	for i, a := range s.Agents {
		log.Printf("[swarm %s] Round %d: running agent %d/%d (id=%d, persona=%s)", s.ID[:8], round, i+1, len(s.Agents), a.ID, a.Persona.Name)
		agentStart := time.Now()
		output, err := run(a)
		if err != nil {
			log.Printf("[swarm %s] Round %d: agent %d/%s FAILED after %v: %v", s.ID[:8], round, a.ID, a.Persona.Name, time.Since(agentStart), err)
			s.EventCh <- agent.SSEEvent{
				Event: "agent:error",
				Data: map[string]any{
					"agent_id":    a.ID,
					"round":       round,
					"error":       err.Error(),
					"recoverable": true,
				},
			}
			continue
		}
		log.Printf("[swarm %s] Round %d: agent %d/%s completed in %v (position=%q, confidence=%.1f)", s.ID[:8], round, a.ID, a.Persona.Name, time.Since(agentStart), truncate(output.Position, 80), output.Confidence)

		if err := s.store.SaveRoundOutput(s.ID, output); err != nil {
			return fmt.Errorf("save output: %w", err)
		}

		s.EventCh <- agent.SSEEvent{
			Event: "agent:done",
			Data: map[string]any{
				"agent_id":   a.ID,
				"round":      round,
				"position":   truncate(output.Position, 500),
				"confidence": output.Confidence,
			},
		}
	}
	return nil
}

func (s *Swarm) runRoundParallel(ctx context.Context, round int, run agentRunner) error {
	sem := make(chan struct{}, s.Config.ConcurrencyLimit)
	var wg sync.WaitGroup
	var firstErr error
	var errOnce sync.Once

	for _, a := range s.Agents {
		sem <- struct{}{}
		wg.Add(1)
		go func(a *agent.Agent) {
			defer wg.Done()
			defer func() { <-sem }()

			output, err := run(a)
			if err != nil {
				s.EventCh <- agent.SSEEvent{
					Event: "agent:error",
					Data: map[string]any{
						"agent_id":    a.ID,
						"round":       round,
						"error":       err.Error(),
						"recoverable": true,
					},
				}
				return
			}

			if err := s.store.SaveRoundOutput(s.ID, output); err != nil {
				errOnce.Do(func() { firstErr = err })
				return
			}

			s.EventCh <- agent.SSEEvent{
				Event: "agent:done",
				Data: map[string]any{
					"agent_id":   a.ID,
					"round":      round,
					"position":   truncate(output.Position, 500),
					"confidence": output.Confidence,
				},
			}
		}(a)
	}

	wg.Wait()
	return firstErr
}

func (s *Swarm) runRound3Parallel(ctx context.Context, run func(a *agent.Agent) error) error {
	sem := make(chan struct{}, s.Config.ConcurrencyLimit)
	var wg sync.WaitGroup

	for _, a := range s.Agents {
		sem <- struct{}{}
		wg.Add(1)
		go func(a *agent.Agent) {
			defer wg.Done()
			defer func() { <-sem }()
			run(a)
		}(a)
	}

	wg.Wait()
	return nil
}

func (s *Swarm) detectConsensus(ctx context.Context, roundContext string) (string, error) {
	messages := []llm.Message{
		{Role: "system", Content: "You are a neutral observer. Summarize the emerging majority position in ONE sentence. Be precise and concise."},
		{Role: "user", Content: fmt.Sprintf("Here are the positions from multiple agents:\n\n%s\n\nWhat is the emerging majority position?", roundContext)},
	}
	return s.client.ChatCompletion(ctx, messages)
}

func formatRoundContext(agents []*agent.Agent, outputs []store.RoundOutput) string {
	var b strings.Builder
	agentMap := make(map[int]*agent.Agent)
	for _, a := range agents {
		agentMap[a.ID] = a
	}
	for _, o := range outputs {
		a := agentMap[o.AgentID]
		name := fmt.Sprintf("Agent %d", o.AgentID)
		if a != nil {
			name = a.Persona.Name
		}
		b.WriteString(fmt.Sprintf("--- %s ---\n%s\n\n", name, o.Position))
	}
	return b.String()
}

func extractVoteFromReasoning(text string) (store.FinalVote, error) {
	return extractFinalVoteHelper(text)
}

func extractFinalVoteHelper(text string) (store.FinalVote, error) {
	// Try ```json block
	if idx := strings.Index(text, "```json"); idx >= 0 {
		start := idx + 7
		if end := strings.Index(text[start:], "```"); end >= 0 {
			var vote store.FinalVote
			if err := json.Unmarshal([]byte(strings.TrimSpace(text[start:start+end])), &vote); err == nil {
				return vote, nil
			}
		}
	}

	// Try ``` block
	if idx := strings.Index(text, "```"); idx >= 0 {
		start := idx + 3
		if nl := strings.Index(text[start:], "\n"); nl >= 0 {
			start += nl + 1
		}
		if end := strings.Index(text[start:], "```"); end >= 0 {
			var vote store.FinalVote
			if err := json.Unmarshal([]byte(strings.TrimSpace(text[start:start+end])), &vote); err == nil {
				return vote, nil
			}
		}
	}

	// Try finding { ... } with "position"
	if posIdx := strings.Index(text, `"position"`); posIdx >= 0 {
		if braceStart := strings.LastIndex(text[:posIdx], "{"); braceStart >= 0 {
			depth := 0
			for i := braceStart; i < len(text); i++ {
				if text[i] == '{' {
					depth++
				} else if text[i] == '}' {
					depth--
					if depth == 0 {
						var vote store.FinalVote
						if err := json.Unmarshal([]byte(text[braceStart:i+1]), &vote); err == nil {
							return vote, nil
						}
						break
					}
				}
			}
		}
	}

	return store.FinalVote{}, fmt.Errorf("could not extract JSON")
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
