package synthesizer

import (
	"context"
	"fmt"
	"math"
	"strings"

	"consensus-protocol/internal/agent"
	"consensus-protocol/internal/llm"
	"consensus-protocol/internal/store"
)

const fanIn = 5

type Synthesizer struct {
	client  *llm.Client
	store   *store.Store
	eventCh chan<- agent.SSEEvent
}

func New(client *llm.Client, st *store.Store, eventCh chan<- agent.SSEEvent) *Synthesizer {
	return &Synthesizer{
		client:  client,
		store:   st,
		eventCh: eventCh,
	}
}

type nodeSummary struct {
	ConsensusText string
	Confidence    float64
	Dissents      []store.FinalVote
}

func (s *Synthesizer) Synthesize(ctx context.Context, runID string) (*store.SynthesisResult, error) {
	votes, err := s.store.GetFinalVotes(runID)
	if err != nil {
		return nil, fmt.Errorf("get votes: %w", err)
	}

	// Identify dissenters
	var dissenters []store.FinalVote
	for _, v := range votes {
		if v.DissentsFromConsensus {
			dissenters = append(dissenters, v)
		}
	}

	// Calculate number of levels needed
	totalLevels := 1
	if len(votes) > fanIn {
		totalLevels = int(math.Ceil(math.Log(float64(len(votes))) / math.Log(float64(fanIn))))
		if totalLevels < 2 {
			totalLevels = 2
		}
	}

	// Build initial summaries from votes
	summaries := make([]nodeSummary, len(votes))
	for i, v := range votes {
		summaries[i] = nodeSummary{
			ConsensusText: fmt.Sprintf("[%s, confidence=%.2f] %s", v.Persona, v.Confidence, v.Position),
			Confidence:    v.Confidence,
		}
		if v.DissentsFromConsensus {
			summaries[i].Dissents = []store.FinalVote{v}
		}
	}

	// Recursive tree reduction
	level := 0
	for len(summaries) > 1 {
		s.eventCh <- agent.SSEEvent{
			Event: "synthesis:start",
			Data: map[string]any{
				"level":        level,
				"total_levels": totalLevels,
				"groups":       (len(summaries) + fanIn - 1) / fanIn,
			},
		}

		var nextLevel []nodeSummary
		for i := 0; i < len(summaries); i += fanIn {
			end := i + fanIn
			if end > len(summaries) {
				end = len(summaries)
			}
			chunk := summaries[i:end]

			groupIdx := i / fanIn
			summary, err := s.synthesizeGroup(ctx, chunk, level, groupIdx)
			if err != nil {
				return nil, fmt.Errorf("synthesize level %d group %d: %w", level, groupIdx, err)
			}
			nextLevel = append(nextLevel, summary)
		}

		summaries = nextLevel
		level++
	}

	// Final synthesis: generate consensus prose and minority report
	finalSummary := summaries[0]

	// Stream the final consensus
	consensus, err := s.generateFinalConsensus(ctx, finalSummary, dissenters)
	if err != nil {
		return nil, fmt.Errorf("final consensus: %w", err)
	}

	// Calculate weighted score
	weightedScore := calculateWeightedScore(votes)

	result := &store.SynthesisResult{
		Consensus:      consensus.consensus,
		WeightedScore:  weightedScore,
		Votes:          votes,
		MinorityReport: consensus.minorityReport,
		Dissenters:     dissenters,
	}

	// Save to store
	if err := s.store.SaveSynthesis(runID, *result); err != nil {
		return nil, fmt.Errorf("save synthesis: %w", err)
	}

	s.eventCh <- agent.SSEEvent{
		Event: "consensus:ready",
		Data:  result,
	}

	return result, nil
}

func (s *Synthesizer) synthesizeGroup(ctx context.Context, chunk []nodeSummary, level, groupIdx int) (nodeSummary, error) {
	// Build input text
	var input strings.Builder
	var allDissents []store.FinalVote
	totalConfidence := 0.0

	for i, summary := range chunk {
		input.WriteString(fmt.Sprintf("Position %d: %s\n\n", i+1, summary.ConsensusText))
		allDissents = append(allDissents, summary.Dissents...)
		totalConfidence += summary.Confidence
	}

	messages := []llm.Message{
		{Role: "system", Content: `You are a synthesis agent. Your job is to find the common ground among the positions presented and produce a concise summary of the majority view. Preserve the strongest arguments. Be precise and balanced. Do NOT discard minority views — note them separately.`},
		{Role: "user", Content: fmt.Sprintf("Synthesize these positions into a unified summary:\n\n%s\nProvide:\n1. A consensus summary (the majority view)\n2. Any notable dissenting points that should be preserved", input.String())},
	}

	fullText, err := s.client.ChatCompletionStream(ctx, messages, func(token string) {
		s.eventCh <- agent.SSEEvent{
			Event: "synthesis:thinking",
			Data: map[string]any{
				"level": level,
				"group": groupIdx,
				"token": token,
			},
		}
	})
	if err != nil {
		return nodeSummary{}, err
	}

	return nodeSummary{
		ConsensusText: fullText,
		Confidence:    totalConfidence / float64(len(chunk)),
		Dissents:      allDissents,
	}, nil
}

type finalConsensus struct {
	consensus      string
	minorityReport string
}

func (s *Synthesizer) generateFinalConsensus(ctx context.Context, summary nodeSummary, dissenters []store.FinalVote) (finalConsensus, error) {
	var dissenterContext strings.Builder
	if len(dissenters) > 0 {
		dissenterContext.WriteString("\n\nDissenting positions that MUST be represented in the minority report:\n")
		for _, d := range dissenters {
			dissenterContext.WriteString(fmt.Sprintf("- %s (confidence: %.2f): %s\n", d.Persona, d.Confidence, d.Position))
		}
	}

	messages := []llm.Message{
		{Role: "system", Content: "You are the final Consensus Synthesizer. Produce a clear, authoritative consensus statement followed by a minority report."},
		{Role: "user", Content: fmt.Sprintf(`Based on the following synthesized positions:

%s
%s

Write the output in two sections:

CONSENSUS:
[Write a clear, well-reasoned consensus statement representing the weighted majority view]

---MINORITY REPORT---
[Write a minority report preserving dissenting views and their strongest arguments. If no one dissented, write "No dissenting views — unanimous consensus."]`, summary.ConsensusText, dissenterContext.String())},
	}

	var fullText strings.Builder
	_, err := s.client.ChatCompletionStream(ctx, messages, func(token string) {
		fullText.WriteString(token)

		// Determine which section we're in for proper event routing
		currentText := fullText.String()
		if strings.Contains(currentText, "---MINORITY REPORT---") {
			// We've crossed into minority report territory,
			// but still stream as consensus:token for simplicity
		}

		s.eventCh <- agent.SSEEvent{
			Event: "consensus:token",
			Data:  map[string]any{"token": token},
		}
	})
	if err != nil {
		return finalConsensus{}, err
	}

	text := fullText.String()
	parts := strings.SplitN(text, "---MINORITY REPORT---", 2)

	result := finalConsensus{
		consensus: strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(parts[0]), "CONSENSUS:")),
	}
	if len(parts) > 1 {
		result.minorityReport = strings.TrimSpace(parts[1])
	} else {
		result.minorityReport = "No minority report generated."
	}

	return result, nil
}

func calculateWeightedScore(votes []store.FinalVote) float64 {
	if len(votes) == 0 {
		return 0
	}
	totalWeight := 0.0
	weightedAgreement := 0.0
	for _, v := range votes {
		totalWeight += v.Confidence
		if !v.DissentsFromConsensus {
			weightedAgreement += v.Confidence
		}
	}
	if totalWeight == 0 {
		return 0
	}
	return weightedAgreement / totalWeight
}
