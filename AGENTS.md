# AGENTS.md

Swarm consensus system where multiple AI agents with distinct cognitive biases (Skeptic, Optimist, Contrarian, etc.) deliberate a question across three structured rounds, then a recursive synthesizer produces a weighted consensus and minority report.

**Purpose:** Enable structured multi-perspective deliberation on any question by composing a council of biased personas at configurable ratios.

**Stack:** Go backend, React frontend, Wails desktop app. Any OpenAI-compatible LLM endpoint.

**Entry points:**
- `main.go` — app setup, all Wails binding methods
- `internal/swarm/swarm.go` — 3-round orchestration
- `internal/agent/agent.go` — individual agent logic
- `internal/synthesizer/synthesizer.go` — recursive tree reduction
- `personas/` — YAML persona definitions
- `frontend/src/` — React UI

**Key patterns:** Sequential LLM calls by default (local model friendly). `<think>` block stripping for reasoning models. Fan-in-of-5 recursive synthesis to handle any agent count.
