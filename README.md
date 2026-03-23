# Consensus Protocol

A swarm consensus system where multiple AI agents with distinct cognitive biases deliberate a question across three rounds, then a recursive synthesizer produces a weighted consensus and minority report.

Built with Go (backend) + React (frontend) + Wails (desktop app).

## How It Works

1. **You ask a question** — pose a dilemma, a decision, or anything worth deliberating.
2. **Assemble your council** — pick from 10 personas (Skeptic, Optimist, Historian, Contrarian, Pragmatist, Futurist, Ethicist, Systems Thinker, Empiricist, Devil's Advocate). Set how many of each — run 6 agents or 600.
3. **Three rounds of deliberation:**
   - **Round 1 — Opening Statements:** Each agent answers independently based on their persona.
   - **Round 2 — Deliberation:** Each agent reads all Round 1 positions and updates their view. Adversarial personas (Contrarian, Devil's Advocate) specifically argue against the emerging consensus to prevent groupthink.
   - **Round 3 — Final Judgment:** Each agent commits a final position with a confidence score (0.0–1.0), noting if they changed their mind and why.
4. **Recursive synthesis** — A tree-reduction synthesizer processes all votes in small batches (fan-in of 5), producing a weighted consensus statement and a minority report preserving dissenting views.

## Features

- **Any LLM backend** — Works with LM Studio, Ollama, OpenAI, Claude (via proxy), Gemini, or any OpenAI-compatible API. Configure from within the app.
- **Scalable** — Designed to handle thousands of agents. SQLite persistence keeps memory bounded. Recursive synthesis handles any vote count without blowing context windows.
- **Persona system** — Data-driven YAML files. Add new personas by dropping a `.yaml` file in `personas/`.
- **Configurable ratios** — Run 3 Skeptics, 1 Contrarian, and 2 Optimists. Or 50 of each. You set the composition.
- **Live streaming** — Watch agents think in real-time via SSE. See their text appear token-by-token.
- **Desktop app** — Native window via Wails. No browser needed.
- **`<think>` block handling** — Automatically strips reasoning blocks from models like Qwen and DeepSeek that use `<think>` tags.

## Quick Start

### Prerequisites

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation): `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- An LLM endpoint (LM Studio, Ollama, etc.)

### Run

```bash
./run.sh
```

This installs the Wails CLI if needed, then launches the app in dev mode with hot reload.

### Build

```bash
wails build
```

Produces a standalone app in `build/bin/`.

### Configuration

LLM settings are configurable from within the app (Oracle Settings button). They persist to `settings.json`.

You can also use environment variables:

```bash
export LLM_BASE_URL="http://localhost:1234"   # /v1 is auto-appended
export LLM_MODEL="qwen3.5"
export LLM_API_KEY=""                          # optional
```

## Project Structure

```
├── main.go                      # Wails app entry point
├── personas/                    # YAML persona definitions
│   ├── skeptic.yaml
│   ├── optimist.yaml
│   ├── contrarian.yaml
│   └── ...
├── internal/
│   ├── llm/client.go            # OpenAI-compatible LLM client (streaming + non-streaming)
│   ├── persona/persona.go       # YAML persona loader + selection strategies
│   ├── store/store.go           # SQLite persistence layer
│   ├── agent/agent.go           # Agent struct, round message builders, JSON extraction
│   ├── swarm/swarm.go           # 3-round orchestrator, adversarial injection
│   ├── synthesizer/synthesizer.go  # Recursive tree synthesis
│   └── server/server.go         # HTTP API (SSE streaming, settings, personas)
├── frontend/
│   └── src/
│       ├── App.tsx              # Main app with setup + deliberation views
│       ├── api.ts               # API base URL resolver (Wails + dev mode)
│       ├── hooks/useSwarmSSE.ts # SSE streaming hook + state reducer
│       └── components/
│           ├── PersonaPicker.tsx    # Council assembly with per-persona counts
│           ├── SwarmGrid.tsx        # Agent grid with connection lines
│           ├── AgentCard.tsx        # Individual agent with pixel avatar + speech
│           ├── PixelAvatar.tsx      # 8x8 pixel art medieval characters
│           ├── AgentDetailModal.tsx # Full 3-round reasoning with tab navigation
│           ├── ConsensusPanel.tsx   # Streaming consensus display
│           ├── MinorityReport.tsx   # Dissenting voices panel
│           ├── ConfidenceBar.tsx    # Animated confidence indicator
│           ├── RoundIndicator.tsx   # Round progress stepper
│           ├── ConnectionLines.tsx  # SVG lines between agents in Round 2+
│           └── SettingsPanel.tsx    # LLM endpoint configuration
├── run.sh                       # One-command launcher
├── wails.json                   # Wails build config
└── settings.json                # Persisted LLM settings (auto-created)
```

## Adding Personas

Create a YAML file in `personas/`:

```yaml
name: "The Realist"
slug: "realist"
color: "#6b7280"
category: "analytical"
adversarial: false
description: "Sees things as they are, not as we wish them to be."
avatar: "realist"
system_prompt: |
  You are The Realist. You assess situations based on how things
  actually work, not how they should work in theory...
```

The app loads all `.yaml` files from the `personas/` directory on startup.

Set `adversarial: true` to give a persona the anti-consensus behavior in Round 2.

## SSE Event Stream

The `POST /api/swarm` endpoint returns an SSE stream with these events:

| Event | Description |
|---|---|
| `swarm:config` | Agent list with personas, colors |
| `round:start` / `round:end` | Round boundaries |
| `agent:thinking` | Token-by-token streaming from an agent |
| `agent:done` | Agent finished a round |
| `agent:voted` | Agent's final structured vote (Round 3) |
| `agent:error` | Agent failure (recoverable) |
| `synthesis:start` / `synthesis:thinking` | Recursive synthesis progress |
| `consensus:token` | Final consensus streaming |
| `consensus:ready` | Complete result with votes + minority report |
| `swarm:error` | Fatal error |
