# CLAUDE.md

## Project Overview

Swarm consensus system — multiple AI agents with cognitive biases deliberate a question in 3 rounds, then a recursive synthesizer produces weighted consensus + minority report. Go backend, React frontend, Wails desktop app.

## Build & Run

```bash
./run.sh                              # Dev mode (installs wails CLI if needed, runs wails dev)
wails build                           # Production build → build/bin/
go build ./...                        # Backend only
cd frontend && npx vite build         # Frontend only
```

## Key Architecture Decisions

- **Sequential agent execution by default** — local LLMs can't handle parallel requests well. Configurable via `SwarmConfig.Parallel`.
- **`<think>` block stripping** — Qwen/DeepSeek models wrap reasoning in `<think>` tags. `internal/llm/client.go` strips these from returned text and suppresses them during streaming.
- **Recursive tree synthesis** — fan-in of 5 votes per LLM call, reduces recursively. Handles any agent count without blowing context windows.
- **Wails native bindings + events** — all frontend↔backend communication uses Wails bindings (request/response) and `runtime.EventsEmit` (streaming). No internal HTTP server.
- **Settings persist to `settings.json`** — LLM config (base_url, model, api_key) saved on disk, loaded on startup.
- **Personas are YAML files** in `personas/` — loaded at startup. The `adversarial: true` flag triggers anti-consensus injection in Round 2.

## Code Layout

- `main.go` — Wails app setup, all binding methods (GetPersonas, GetSettings, SaveSettings, TestLLM, StartSwarm, CancelSwarm), bridges swarm EventCh to Wails events
- `internal/llm/client.go` — OpenAI-compatible client, handles streaming + `<think>` blocks, auto-appends `/v1` to base URL
- `internal/store/store.go` — SQLite via `modernc.org/sqlite` (pure Go, no CGO), WAL mode
- `internal/persona/persona.go` — YAML loader, `Select()` with random/balanced strategies
- `internal/agent/agent.go` — `Run()` streams to LLM, `BuildRound{1,2,3}Messages()`, multi-strategy JSON extraction for Round 3
- `internal/swarm/swarm.go` — 3-round orchestrator, consensus detection between R1→R2, adversarial injection
- `internal/synthesizer/synthesizer.go` — recursive tree reduction, dissent bubbling, streaming output
- `frontend/src/hooks/useSwarmEvents.ts` — Wails event subscriptions + state reducer
- `frontend/src/components/` — React components, pixel art medieval theme (light)

## Wails Bindings

Frontend calls Go methods directly via auto-generated bindings in `frontend/wailsjs/go/main/App.{js,d.ts}`:
- `GetPersonas()` — returns all personas
- `GetSettings()` / `SaveSettings(settings)` — LLM config
- `TestLLM(prompt)` — test connectivity
- `StartSwarm(request)` — begins deliberation, streams events via `runtime.EventsEmit`
- `CancelSwarm()` — cancels running swarm

## Testing Tips

- If the LLM returns empty responses, check `settings.json` for correct base_url/model
- The app auto-appends `/v1` to base URLs that don't have it
- Watch Go stdout for `[agent N/Name]` log lines during runs
- Failed runs are inspectable in `consensus.db` (SQLite)
- Round 3 JSON extraction has 4 fallback strategies — if all fail, it creates a vote from raw text
