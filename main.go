package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	"consensus-protocol/internal/llm"
	"consensus-protocol/internal/persona"
	"consensus-protocol/internal/store"
	"consensus-protocol/internal/swarm"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

const settingsFile = "settings.json"

func main() {
	// Load persona registry
	personaDir := "personas"
	if d := os.Getenv("PERSONA_DIR"); d != "" {
		personaDir = d
	}
	registry, err := persona.LoadRegistry(personaDir)
	if err != nil {
		log.Fatalf("Failed to load personas: %v", err)
	}
	log.Printf("Loaded %d personas", len(registry.All()))

	// Initialize LLM client — env vars first, then override with saved settings
	cfg := llm.ConfigFromEnv()
	cfg = loadSettingsFile(cfg)
	client := llm.NewClient(cfg)
	log.Printf("LLM endpoint: %s (model: %s)", cfg.BaseURL, cfg.Model)

	// Initialize store
	dbPath := "consensus.db"
	if p := os.Getenv("DB_PATH"); p != "" {
		dbPath = p
	}
	st, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer st.Close()

	app := &App{
		registry: registry,
		client:   client,
		store:    st,
		llmCfg:   cfg,
	}

	err = wails.Run(&options.App{
		Title:     "Consensus Protocol",
		Width:     1280,
		Height:    860,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 17, B: 23, A: 255},
		OnStartup:        app.startup,
		OnShutdown: func(ctx context.Context) {
			st.Close()
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatalf("Wails error: %v", err)
	}
}

// App is the Wails binding — exposes methods to the frontend.
type App struct {
	ctx      context.Context
	registry *persona.Registry
	client   *llm.Client
	store    *store.Store
	mu       sync.RWMutex
	llmCfg   llm.Config

	// Running swarm cancel function
	swarmCancel context.CancelFunc
	swarmMu     sync.Mutex
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// GetPersonas returns all available personas.
func (a *App) GetPersonas() []persona.Persona {
	return a.registry.All()
}

// SettingsResponse is the settings data sent to the frontend.
type SettingsResponse struct {
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
	APIKey  string `json:"api_key"`
}

// GetSettings returns the current LLM settings (API key masked).
func (a *App) GetSettings() SettingsResponse {
	a.mu.RLock()
	cfg := a.llmCfg
	a.mu.RUnlock()

	maskedKey := ""
	if cfg.APIKey != "" {
		if len(cfg.APIKey) > 8 {
			maskedKey = cfg.APIKey[:4] + "..." + cfg.APIKey[len(cfg.APIKey)-4:]
		} else {
			maskedKey = "****"
		}
	}

	return SettingsResponse{
		BaseURL: cfg.BaseURL,
		Model:   cfg.Model,
		APIKey:  maskedKey,
	}
}

// SaveSettings updates LLM configuration and persists to disk.
func (a *App) SaveSettings(s SettingsResponse) error {
	a.mu.Lock()
	if s.BaseURL != "" {
		a.llmCfg.BaseURL = s.BaseURL
	}
	if s.Model != "" {
		a.llmCfg.Model = s.Model
	}
	// Only update API key if it doesn't contain the mask marker "..."
	if s.APIKey != "" && !strings.Contains(s.APIKey, "...") && s.APIKey != "****" {
		a.llmCfg.APIKey = s.APIKey
	}
	a.client = llm.NewClient(a.llmCfg)
	cfg := a.llmCfg
	a.mu.Unlock()

	if err := saveSettingsFile(cfg); err != nil {
		log.Printf("Failed to save settings: %v", err)
		return err
	}
	log.Printf("Settings saved: base_url=%s model=%s", cfg.BaseURL, cfg.Model)
	return nil
}

// TestLLMResult is the result of a test LLM call.
type TestLLMResult struct {
	Content    string `json:"content"`
	StatusCode int    `json:"status_code"`
	DurationMs int64  `json:"duration_ms"`
	Model      string `json:"model"`
	URL        string `json:"url"`
	Error      string `json:"error,omitempty"`
}

// TestLLM sends a test prompt to the configured LLM.
func (a *App) TestLLM(prompt string) TestLLMResult {
	if prompt == "" {
		prompt = "Hello, please respond with a short greeting."
	}

	a.mu.RLock()
	client := a.client
	a.mu.RUnlock()

	messages := []llm.Message{
		{Role: "user", Content: prompt},
	}

	result, err := client.ChatCompletionStreamDetailed(context.Background(), messages, nil)

	resp := TestLLMResult{
		Content:    result.Content,
		StatusCode: result.StatusCode,
		DurationMs: result.DurationMs,
		Model:      result.Model,
		URL:        result.URL,
	}
	if err != nil {
		resp.Error = err.Error()
	}
	return resp
}

// SwarmRequest is the input for starting a swarm deliberation.
type SwarmRequest struct {
	Question  string         `json:"question"`
	Personas  map[string]int `json:"personas"`
	Strategy  string         `json:"strategy"`
	Rounds    int            `json:"rounds"`
	GroupSize int            `json:"group_size"`
	FastMode  bool           `json:"fast_mode"`
}

// StartSwarm begins a swarm deliberation, streaming events via Wails EventsEmit.
func (a *App) StartSwarm(req SwarmRequest) error {
	if req.Question == "" {
		return fmt.Errorf("question is required")
	}
	if len(req.Personas) < 2 {
		return fmt.Errorf("at least 2 persona types required")
	}

	// Resolve personas by slug
	var selected []persona.Persona
	for slug, count := range req.Personas {
		p, ok := a.registry.Get(slug)
		if !ok {
			return fmt.Errorf("unknown persona: %s", slug)
		}
		if count > 0 {
			selected = append(selected, p)
		}
	}
	if len(selected) < 2 {
		return fmt.Errorf("total agent count must be at least 2")
	}

	a.mu.RLock()
	client := a.client
	a.mu.RUnlock()

	cfg := swarm.Config{
		Parallel:         false,
		ConcurrencyLimit: 3,
		Strategy:         swarm.Strategy(req.Strategy),
		Rounds:           req.Rounds,
		GroupSize:         req.GroupSize,
		FastMode:         req.FastMode,
	}
	sw := swarm.New(req.Question, selected, cfg, client, a.store)

	swarmCtx, cancel := context.WithCancel(context.Background())
	a.swarmMu.Lock()
	if a.swarmCancel != nil {
		a.swarmCancel() // cancel any previous swarm
	}
	a.swarmCancel = cancel
	a.swarmMu.Unlock()

	// Run swarm in background
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[app] PANIC in swarm run: %v", r)
				runtime.EventsEmit(a.ctx, "swarm:error", map[string]any{
					"error": fmt.Sprintf("internal panic: %v", r),
					"fatal": true,
				})
			}
		}()
		if _, err := sw.Run(swarmCtx); err != nil {
			log.Printf("[app] Swarm run ended with error: %v", err)
		}
	}()

	// Bridge EventCh → Wails events
	go func() {
		for event := range sw.EventCh {
			runtime.EventsEmit(a.ctx, event.Event, event.Data)
		}
		runtime.EventsEmit(a.ctx, "swarm:done", nil)
	}()

	return nil
}

// CancelSwarm cancels the currently running swarm.
func (a *App) CancelSwarm() {
	a.swarmMu.Lock()
	if a.swarmCancel != nil {
		a.swarmCancel()
		a.swarmCancel = nil
	}
	a.swarmMu.Unlock()
}

// --- Settings file I/O ---

func loadSettingsFile(cfg llm.Config) llm.Config {
	data, err := os.ReadFile(settingsFile)
	if err != nil {
		return cfg
	}
	var saved map[string]string
	if err := json.Unmarshal(data, &saved); err != nil {
		return cfg
	}
	if v, ok := saved["base_url"]; ok && v != "" {
		cfg.BaseURL = v
	}
	if v, ok := saved["model"]; ok && v != "" {
		cfg.Model = v
	}
	if v, ok := saved["api_key"]; ok && v != "" {
		cfg.APIKey = v
	}
	log.Printf("Loaded settings from %s: base_url=%s model=%s", settingsFile, cfg.BaseURL, cfg.Model)
	return cfg
}

func saveSettingsFile(cfg llm.Config) error {
	data, err := json.MarshalIndent(map[string]string{
		"base_url": cfg.BaseURL,
		"model":    cfg.Model,
		"api_key":  cfg.APIKey,
	}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsFile, data, 0600)
}

