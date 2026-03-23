package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type Config struct {
	BaseURL string
	Model   string
	APIKey  string
}

func ConfigFromEnv() Config {
	baseURL := os.Getenv("LLM_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:11434/v1"
	}
	model := os.Getenv("LLM_MODEL")
	if model == "" {
		model = "qwen3.5"
	}
	return Config{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Model:   model,
		APIKey:  os.Getenv("LLM_API_KEY"),
	}
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Client struct {
	config Config
	http   *http.Client
}

func NewClient(cfg Config) *Client {
	// Normalize base URL: strip trailing slash, ensure /v1 suffix
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if !strings.HasSuffix(cfg.BaseURL, "/v1") {
		cfg.BaseURL += "/v1"
	}
	return &Client{
		config: cfg,
		http: &http.Client{
			Timeout: 0, // no timeout on client level; use context
		},
	}
}

// ChatCompletion makes a non-streaming call and returns the full response.
func (c *Client) ChatCompletion(ctx context.Context, messages []Message) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	body := map[string]any{
		"model":    c.config.Model,
		"messages": messages,
		"stream":   false,
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.config.BaseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	}

	log.Printf("[llm] POST %s model=%s messages=%d total_chars=%d", c.config.BaseURL+"/chat/completions", c.config.Model, len(messages), countMessageChars(messages))
	reqStart := time.Now()

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("LLM request to %s failed: %w", c.config.BaseURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM %s returned HTTP %d: %s", c.config.BaseURL, resp.StatusCode, string(b))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response from %s: %w", c.config.BaseURL, err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response from %s (model=%s)", c.config.BaseURL, c.config.Model)
	}
	raw := result.Choices[0].Message.Content
	content := stripThinkBlocks(raw)
	log.Printf("[llm] Response: %d chars in %v", len(content), time.Since(reqStart))
	if content == "" {
		content = extractFromThinkBlock(raw)
		if content != "" {
			log.Printf("[llm] Recovered %d chars from think block (model produced no output after thinking)", len(content))
		} else {
			return "", fmt.Errorf("LLM returned empty response (model=%s, url=%s)", c.config.Model, c.config.BaseURL)
		}
	}
	return content, nil
}

// StreamCallback is called for each token during streaming.
type StreamCallback func(token string)

// ChatCompletionStream makes a streaming call, invoking cb for each token,
// and returns the full accumulated response.
func (c *Client) ChatCompletionStream(ctx context.Context, messages []Message, cb StreamCallback) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	body := map[string]any{
		"model":    c.config.Model,
		"messages": messages,
		"stream":   true,
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.config.BaseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	}

	log.Printf("[llm] POST (stream) %s model=%s messages=%d total_chars=%d", c.config.BaseURL+"/chat/completions", c.config.Model, len(messages), countMessageChars(messages))
	reqStart := time.Now()

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("LLM stream request to %s failed: %w", c.config.BaseURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM %s returned HTTP %d: %s", c.config.BaseURL, resp.StatusCode, string(b))
	}

	var full strings.Builder
	inThinkBlock := false
	scanner := bufio.NewScanner(resp.Body)
	// Increase scanner buffer for large streaming lines
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			token := chunk.Choices[0].Delta.Content
			full.WriteString(token)

			// Track <think> blocks — don't send thinking tokens to callback
			if strings.Contains(full.String(), "<think>") && !strings.Contains(full.String(), "</think>") {
				inThinkBlock = true
			}
			if strings.Contains(token, "</think>") {
				inThinkBlock = false
				continue // skip the closing tag token
			}
			if !inThinkBlock && cb != nil {
				cb(token)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("[llm] Stream error after %v (%d chars received): %v", time.Since(reqStart), full.Len(), err)
		return stripThinkBlocks(full.String()), fmt.Errorf("reading stream from %s: %w", c.config.BaseURL, err)
	}
	content := stripThinkBlocks(full.String())
	log.Printf("[llm] Stream complete: %d chars in %v", len(content), time.Since(reqStart))
	if content == "" {
		// Model spent all tokens on <think> block — extract usable text from it
		content = extractFromThinkBlock(full.String())
		if content != "" {
			log.Printf("[llm] Recovered %d chars from think block (model produced no output after thinking)", len(content))
		} else {
			return "", fmt.Errorf("LLM returned empty response (model=%s, url=%s)", c.config.Model, c.config.BaseURL)
		}
	}
	return content, nil
}

// StreamResult contains metadata from a streaming LLM call.
type StreamResult struct {
	Content    string // After think-block stripping
	RawContent string // Before think-block stripping
	StatusCode int
	DurationMs int64
	Model      string
	URL        string
}

// ChatCompletionStreamDetailed is like ChatCompletionStream but returns full metadata.
func (c *Client) ChatCompletionStreamDetailed(ctx context.Context, messages []Message, cb StreamCallback) (StreamResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	url := c.config.BaseURL + "/chat/completions"
	result := StreamResult{
		Model: c.config.Model,
		URL:   url,
	}

	body := map[string]any{
		"model":    c.config.Model,
		"messages": messages,
		"stream":   true,
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return result, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return result, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	}

	log.Printf("[llm] POST (stream) %s model=%s messages=%d total_chars=%d", url, c.config.Model, len(messages), countMessageChars(messages))
	reqStart := time.Now()

	resp, err := c.http.Do(req)
	if err != nil {
		result.DurationMs = time.Since(reqStart).Milliseconds()
		return result, fmt.Errorf("LLM stream request to %s failed: %w", c.config.BaseURL, err)
	}
	defer resp.Body.Close()
	result.StatusCode = resp.StatusCode

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		result.DurationMs = time.Since(reqStart).Milliseconds()
		return result, fmt.Errorf("LLM %s returned HTTP %d: %s", c.config.BaseURL, resp.StatusCode, string(b))
	}

	var full strings.Builder
	inThinkBlock := false
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			token := chunk.Choices[0].Delta.Content
			full.WriteString(token)
			if strings.Contains(full.String(), "<think>") && !strings.Contains(full.String(), "</think>") {
				inThinkBlock = true
			}
			if strings.Contains(token, "</think>") {
				inThinkBlock = false
				continue
			}
			if !inThinkBlock && cb != nil {
				cb(token)
			}
		}
	}
	result.DurationMs = time.Since(reqStart).Milliseconds()
	result.RawContent = full.String()

	if err := scanner.Err(); err != nil {
		log.Printf("[llm] Stream error after %v (%d chars received): %v", time.Since(reqStart), full.Len(), err)
		result.Content = stripThinkBlocks(full.String())
		return result, fmt.Errorf("reading stream from %s: %w", c.config.BaseURL, err)
	}
	content := stripThinkBlocks(full.String())
	log.Printf("[llm] Stream complete: %d chars in %v", len(content), time.Since(reqStart))
	if content == "" {
		// Model spent all tokens on <think> block — extract usable text from it
		content = extractFromThinkBlock(full.String())
		if content != "" {
			log.Printf("[llm] Recovered %d chars from think block (model produced no output after thinking)", len(content))
		} else {
			result.Content = content
			return result, fmt.Errorf("LLM returned empty response (model=%s, url=%s)", c.config.Model, c.config.BaseURL)
		}
	}
	result.Content = content
	return result, nil
}

// countMessageChars returns the total character count across all messages.
func countMessageChars(messages []Message) int {
	n := 0
	for _, m := range messages {
		n += len(m.Content)
	}
	return n
}

// extractFromThinkBlock pulls usable content from a think block when
// the model spent all its tokens thinking and produced no output after </think>.
// It takes the last substantial paragraph from the think block as the response.
func extractFromThinkBlock(s string) string {
	start := strings.Index(s, "<think>")
	if start == -1 {
		return ""
	}
	inner := s[start+len("<think>"):]
	if end := strings.Index(inner, "</think>"); end != -1 {
		inner = inner[:end]
	}
	inner = strings.TrimSpace(inner)
	if inner == "" {
		return ""
	}
	// Split into paragraphs and take the last non-empty one as the "conclusion"
	paragraphs := strings.Split(inner, "\n\n")
	for i := len(paragraphs) - 1; i >= 0; i-- {
		p := strings.TrimSpace(paragraphs[i])
		if len(p) > 20 { // skip trivially short fragments
			return p
		}
	}
	return inner
}

// stripThinkBlocks removes <think>...</think> blocks from model output.
// Some models (Qwen, DeepSeek) wrap internal reasoning in these tags.
func stripThinkBlocks(s string) string {
	for {
		start := strings.Index(s, "<think>")
		if start == -1 {
			break
		}
		end := strings.Index(s, "</think>")
		if end == -1 {
			// Unclosed think block — remove from <think> to end
			s = s[:start]
			break
		}
		s = s[:start] + s[end+len("</think>"):]
	}
	return strings.TrimSpace(s)
}
