package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"consensus-protocol/internal/llm"
	"consensus-protocol/internal/persona"
	"consensus-protocol/internal/store"
)

type Agent struct {
	ID       int
	Persona  persona.Persona
	FastMode bool
}

// SSEEvent represents an event to be sent to the frontend via SSE.
type SSEEvent struct {
	Event string
	Data  any
}

// Run executes one round for this agent. It streams tokens via eventCh
// and returns the parsed RoundOutput. For round 3, it attempts JSON extraction
// but returns the output with Reasoning populated even on extraction failure.
func (a *Agent) Run(ctx context.Context, client *llm.Client, round int, messages []llm.Message, eventCh chan<- SSEEvent) (store.RoundOutput, error) {
	log.Printf("[agent %d/%s] Round %d starting", a.ID, a.Persona.Name, round)

	// Emit debug:request event
	eventCh <- SSEEvent{
		Event: "debug:request",
		Data: map[string]any{
			"agent_id":   a.ID,
			"agent_name": a.Persona.Name,
			"round":      round,
			"messages":   messages,
			"timestamp":  time.Now().UnixMilli(),
		},
	}

	result, err := client.ChatCompletionStreamDetailed(ctx, messages, func(token string) {
		eventCh <- SSEEvent{
			Event: "agent:thinking",
			Data: map[string]any{
				"agent_id": a.ID,
				"round":    round,
				"token":    token,
			},
		}
	})

	// Emit debug:response event (even on error)
	debugResp := map[string]any{
		"agent_id":       a.ID,
		"agent_name":     a.Persona.Name,
		"round":          round,
		"status_code":    result.StatusCode,
		"duration_ms":    result.DurationMs,
		"model":          result.Model,
		"url":            result.URL,
		"response_chars": len(result.Content),
		"raw_response":   result.RawContent,
		"timestamp":      time.Now().UnixMilli(),
	}
	if err != nil {
		debugResp["error"] = err.Error()
	}
	eventCh <- SSEEvent{
		Event: "debug:response",
		Data:  debugResp,
	}

	if err != nil {
		log.Printf("[agent %d/%s] Round %d LLM error: %v", a.ID, a.Persona.Name, round, err)
		return store.RoundOutput{}, fmt.Errorf("agent %d round %d: %w", a.ID, round, err)
	}

	fullText := result.Content
	log.Printf("[agent %d/%s] Round %d got %d chars of response", a.ID, a.Persona.Name, round, len(fullText))

	output := store.RoundOutput{
		AgentID:   a.ID,
		Round:     round,
		Reasoning: fullText,
	}

	if round == 3 {
		vote, err := extractFinalVote(fullText)
		if err != nil {
			log.Printf("[agent %d/%s] Round 3 JSON extraction failed: %v", a.ID, a.Persona.Name, err)
			log.Printf("[agent %d/%s] Round 3 raw response (first 500 chars): %.500s", a.ID, a.Persona.Name, fullText)
			// Return the output WITH the reasoning so retry can use it
			return output, fmt.Errorf("extract vote: %w", err)
		}
		output.Position = vote.Position
		output.Confidence = vote.Confidence
		log.Printf("[agent %d/%s] Round 3 vote extracted: confidence=%.2f position=%.100s", a.ID, a.Persona.Name, vote.Confidence, vote.Position)
	} else {
		output.Position = fullText
		output.Confidence = 0.5
	}

	return output, nil
}

// RunRetryJSON retries the agent once with a JSON-fixing prompt.
func (a *Agent) RunRetryJSON(ctx context.Context, client *llm.Client, previousOutput string, eventCh chan<- SSEEvent) (store.FinalVote, error) {
	log.Printf("[agent %d/%s] Retrying JSON extraction", a.ID, a.Persona.Name)

	messages := []llm.Message{
		{Role: "system", Content: "You must respond with ONLY valid JSON. No other text, no markdown, no explanation."},
		{Role: "user", Content: fmt.Sprintf(`Your previous response was not valid JSON. Based on your previous reasoning, return ONLY this JSON:

Previous response:
%s

Required JSON (fill in the values):
{"position": "your final position in 1-2 sentences", "confidence": 0.85, "changed_mind": false, "what_changed_it": "N/A", "dissents_from_consensus": false}`, previousOutput)},
	}

	eventCh <- SSEEvent{
		Event: "debug:request",
		Data: map[string]any{
			"agent_id":   a.ID,
			"agent_name": a.Persona.Name,
			"round":      3,
			"retry":      true,
			"messages":   messages,
			"timestamp":  time.Now().UnixMilli(),
		},
	}

	result, err := client.ChatCompletionStreamDetailed(ctx, messages, func(token string) {
		eventCh <- SSEEvent{
			Event: "agent:thinking",
			Data: map[string]any{
				"agent_id": a.ID,
				"round":    3,
				"token":    token,
			},
		}
	})

	debugResp := map[string]any{
		"agent_id":       a.ID,
		"agent_name":     a.Persona.Name,
		"round":          3,
		"retry":          true,
		"status_code":    result.StatusCode,
		"duration_ms":    result.DurationMs,
		"model":          result.Model,
		"url":            result.URL,
		"response_chars": len(result.Content),
		"raw_response":   result.RawContent,
		"timestamp":      time.Now().UnixMilli(),
	}
	if err != nil {
		debugResp["error"] = err.Error()
	}
	eventCh <- SSEEvent{
		Event: "debug:response",
		Data:  debugResp,
	}

	if err != nil {
		log.Printf("[agent %d/%s] JSON retry LLM error: %v", a.ID, a.Persona.Name, err)
		return store.FinalVote{}, err
	}

	fullText := result.Content
	log.Printf("[agent %d/%s] JSON retry response: %.500s", a.ID, a.Persona.Name, fullText)

	vote, err := extractFinalVote(fullText)
	if err != nil {
		log.Printf("[agent %d/%s] JSON retry extraction also failed: %v", a.ID, a.Persona.Name, err)
		// Last resort: create a vote from the original reasoning
		return store.FinalVote{
			Position:              truncateStr(previousOutput, 200),
			Confidence:            0.5,
			ChangedMind:           false,
			WhatChangedIt:         "N/A",
			DissentsFromConsensus: false,
		}, nil
	}
	return vote, nil
}

// BuildRound1Messages creates the messages for round 1.
func (a *Agent) BuildRound1Messages(question string) []llm.Message {
	prompt := fmt.Sprintf("Question for deliberation: %s\n\nProvide your analysis and position on this question. Be thorough but concise.", question)
	if a.FastMode {
		prompt += "\n\nIMPORTANT: Keep your response to 2-3 sentences maximum. Be direct and skip elaboration."
	}
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
		{Role: "user", Content: prompt},
	}
}

// BuildRound2Messages creates messages for round 2 with context from round 1.
func (a *Agent) BuildRound2Messages(question string, round1Context string, adversarialInjection string) []llm.Message {
	userContent := fmt.Sprintf(`Question for deliberation: %s

Here are the positions from all agents in Round 1:
%s

Now, considering all these perspectives, update or refine your position. You may change your mind if the arguments are compelling.`, question, round1Context)

	if adversarialInjection != "" {
		userContent += fmt.Sprintf("\n\n%s", adversarialInjection)
	}
	if a.FastMode {
		userContent += "\n\nIMPORTANT: Keep your response to 2-3 sentences maximum. Be direct and skip elaboration."
	}

	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
		{Role: "user", Content: userContent},
	}
}

// BuildRound3Messages creates messages for round 3 requiring structured JSON output.
func (a *Agent) BuildRound3Messages(question string, round2Context string) []llm.Message {
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt + "\n\nIMPORTANT: In this final round you MUST end your response with a JSON block. This is required."},
		{Role: "user", Content: fmt.Sprintf(`Question for deliberation: %s

Here are the updated positions from all agents in Round 2:
%s

This is the FINAL round. Commit to your final position.

First, briefly explain your final reasoning (2-3 sentences). Then output your final vote as JSON in a code block like this:

%sjson
{
  "position": "your final position in 1-2 sentences",
  "confidence": 0.85,
  "changed_mind": false,
  "what_changed_it": "N/A or what changed your mind",
  "dissents_from_consensus": false
}
%s`, question, round2Context, "```", "```")},
	}
}

// BuildGroupRoundMessages creates messages for a breakout group round.
func (a *Agent) BuildGroupRoundMessages(question string, groupContext string, roundNum int) []llm.Message {
	userContent := fmt.Sprintf(`Question for deliberation: %s

Here are the positions from your discussion group in Round %d:
%s

Considering these perspectives, share your updated position. You may change your mind if the arguments are compelling.`, question, roundNum, groupContext)
	if a.FastMode {
		userContent += "\n\nIMPORTANT: Keep your response to 2-3 sentences maximum. Be direct and skip elaboration."
	}
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
		{Role: "user", Content: userContent},
	}
}

// BuildGlobalVoteMessages creates messages for the final global vote round (breakout strategy).
func (a *Agent) BuildGlobalVoteMessages(question string, groupSummaries string) []llm.Message {
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt + "\n\nIMPORTANT: In this final round you MUST end your response with a JSON block. This is required."},
		{Role: "user", Content: fmt.Sprintf(`Question for deliberation: %s

Here are summaries from all discussion groups:
%s

This is the FINAL round. You have heard diverse perspectives across multiple group discussions. Commit to your final position.

First, briefly explain your final reasoning (2-3 sentences). Then output your final vote as JSON in a code block like this:

%sjson
{
  "position": "your final position in 1-2 sentences",
  "confidence": 0.85,
  "changed_mind": false,
  "what_changed_it": "N/A or what changed your mind",
  "dissents_from_consensus": false
}
%s`, question, groupSummaries, "```", "```")},
	}
}

// BuildRollingSpeakMessages creates messages for a rolling summary round.
func (a *Agent) BuildRollingSpeakMessages(question string, mySummary string) []llm.Message {
	userContent := fmt.Sprintf("Question for deliberation: %s\n\n", question)
	if mySummary != "" {
		userContent += fmt.Sprintf("Here is your summary of the discussion so far:\n%s\n\nConsidering this context, share your current position. You may change your mind if persuaded.", mySummary)
	} else {
		userContent += "Provide your analysis and position on this question. Be thorough but concise."
	}
	if a.FastMode {
		userContent += "\n\nIMPORTANT: Keep your response to 2-3 sentences maximum. Be direct and skip elaboration."
	}
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
		{Role: "user", Content: userContent},
	}
}

// BuildSummaryUpdateMessages creates messages to update this agent's personal summary
// after hearing a new speaker, filtered through their own persona.
func (a *Agent) BuildSummaryUpdateMessages(question string, currentSummary string, speakerName string, speakerResponse string) []llm.Message {
	userContent := fmt.Sprintf(`You are maintaining a personal summary of a group discussion about: %s

`, question)
	if currentSummary != "" {
		userContent += fmt.Sprintf("Your current summary:\n%s\n\n", currentSummary)
	}
	summaryLength := "3-5 sentences max"
	if a.FastMode {
		summaryLength = "1-2 sentences max"
	}
	userContent += fmt.Sprintf(`%s just shared their position:
%s

Update your personal summary to incorporate this new perspective. Keep it concise (%s). Filter through your own viewpoint — note what you find compelling, what you disagree with, and how it affects your thinking.`, speakerName, speakerResponse, summaryLength)

	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
		{Role: "user", Content: userContent},
	}
}

// BuildRollingVoteMessages creates messages for the final vote round (rolling strategy).
func (a *Agent) BuildRollingVoteMessages(question string, finalSummary string) []llm.Message {
	return []llm.Message{
		{Role: "system", Content: a.Persona.SystemPrompt + "\n\nIMPORTANT: In this final round you MUST end your response with a JSON block. This is required."},
		{Role: "user", Content: fmt.Sprintf(`Question for deliberation: %s

Here is your personal summary of the full discussion:
%s

This is the FINAL round. Commit to your final position.

First, briefly explain your final reasoning (2-3 sentences). Then output your final vote as JSON in a code block like this:

%sjson
{
  "position": "your final position in 1-2 sentences",
  "confidence": 0.85,
  "changed_mind": false,
  "what_changed_it": "N/A or what changed your mind",
  "dissents_from_consensus": false
}
%s`, question, finalSummary, "```", "```")},
	}
}

// extractFinalVote tries multiple strategies to extract a FinalVote from LLM output.
func extractFinalVote(text string) (store.FinalVote, error) {
	// Strategy 1: Extract from ```json ... ``` block
	re := regexp.MustCompile("(?s)```json\\s*\\n?(.*?)\\n?```")
	if matches := re.FindStringSubmatch(text); len(matches) > 1 {
		var vote store.FinalVote
		if err := json.Unmarshal([]byte(strings.TrimSpace(matches[1])), &vote); err == nil {
			return vote, nil
		}
	}

	// Strategy 2: Extract from ``` ... ``` block (no json tag)
	re2 := regexp.MustCompile("(?s)```\\s*\\n?(.*?)\\n?```")
	if matches := re2.FindStringSubmatch(text); len(matches) > 1 {
		var vote store.FinalVote
		if err := json.Unmarshal([]byte(strings.TrimSpace(matches[1])), &vote); err == nil {
			return vote, nil
		}
	}

	// Strategy 3: Find any { ... } containing "position"
	re3 := regexp.MustCompile(`(?s)\{[^{}]*"position"[^{}]*\}`)
	if matches := re3.FindString(text); matches != "" {
		var vote store.FinalVote
		if err := json.Unmarshal([]byte(matches), &vote); err == nil {
			return vote, nil
		}
	}

	// Strategy 4: Try the whole text as JSON
	var vote store.FinalVote
	if err := json.Unmarshal([]byte(strings.TrimSpace(text)), &vote); err == nil {
		return vote, nil
	}

	return store.FinalVote{}, fmt.Errorf("could not extract JSON from %d char response", len(text))
}

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
