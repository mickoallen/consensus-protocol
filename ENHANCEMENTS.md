# Consensus Protocol — Enhancement Roadmap

## Overview
Ordered list of enhancements to make the app more informative, interesting, and useful. Work through these one at a time.

---

## Enhancement Queue

### 1. Mind-Change Spotlight
**Status:** Pending
**Effort:** Small | **Impact:** High
Cards highlighting agents who changed their mind — before/after positions with their `what_changed_it` quote. Data already exists in `final_votes`, just needs a UI component.
- New: `MindChangeSpotlight.tsx`
- Modify: `App.tsx` (wire in below results)

### 2. Confidence Distribution Chart
**Status:** Pending
**Effort:** Small | **Impact:** Medium
Horizontal bar chart of all agents' final confidence scores, sorted and colored by category. Shows council conviction at a glance. Pure CSS bars, no charting library.
- New: `ConfidenceChart.tsx`
- Modify: `App.tsx`

### 3. Consensus Evolution Timeline
**Status:** Pending
**Effort:** Medium | **Impact:** High
Visual showing how agent positions shifted across rounds. Columns per round, agent dots that move between position clusters. The signature analytics feature.
- New: `ConsensusTimeline.tsx`
- Modify: `useSwarmEvents.ts` (accumulate `agent:done` per round)
- Modify: `App.tsx`

### 4. Faction Summary
**Status:** Pending
**Effort:** Medium | **Impact:** Medium
Group agents by similar final positions into factions. Show each faction's members, shared position, and how they differ from other factions. Reveals alliances beyond predefined categories.
- New: `FactionSummary.tsx`
- Modify: `App.tsx`

### 5. Run History Browser
**Status:** Pending
**Effort:** Medium | **Impact:** High
Browse past deliberations from SQLite. List view with question, date, agent count, weighted score. Click to view full results. All data already persisted in DB.
- New: `HistoryPanel.tsx`
- New bindings: `GetSwarmRuns()`, `GetSwarmRun(id)` in `main.go`
- New queries in `internal/store/store.go`

### 6. Live Round Summaries (Herald's Report)
**Status:** Pending
**Effort:** Small | **Impact:** High
Surface the `consensusSummary` the backend already generates between rounds as a UI interstitial — "The Herald reports emerging themes..." before the next round begins.
- Modify: `useSwarmEvents.ts`, `App.tsx` or `CouncilChamber.tsx`

### 7. Audience Vote
**Status:** Pending
**Effort:** Small | **Impact:** High
Let the user record their own position before deliberation starts. After consensus, compare: "You said X. The council concluded Y." Personal and engaging.
- Modify: `App.tsx` (input before start, comparison after)

### 8. Export Results
**Status:** Pending
**Effort:** Medium | **Impact:** High
Export deliberation results as Markdown report, JSON data, or self-contained HTML page.
- New: `ExportButton.tsx`
- New binding: `ExportRun(id, format)` in `main.go`

### 9. Re-Run Same Question
**Status:** Pending
**Effort:** Small | **Impact:** Medium
"Ask again" button on completed runs — same question, same council, fresh deliberation. Test consensus stability.
- Modify: `App.tsx` (button + pre-fill logic)

### 10. Agent Avatars Gallery
**Status:** Pending
**Effort:** Small | **Impact:** Medium
Browsable gallery of all 100 personas with full bios and system prompts. Educational — understand each persona before assembling a council.
- New: `PersonaGallery.tsx`

### 11. Preset Councils
**Status:** Pending
**Effort:** Small | **Impact:** Medium
Save and load council compositions. Quick-select from saved presets like "Ethics board" or "Technical review."
- New: `CouncilPresets.tsx`
- Persist presets to `presets.json`

### 12. Follow-Up Questions
**Status:** Pending
**Effort:** Medium | **Impact:** High
After consensus, ask a follow-up that goes back to the council for another deliberation round, building on existing consensus. Conversation continuity.
- Backend: New round type or continuation mode in `swarm.go`
- Frontend: Follow-up input UI

### 13. Agent Influence Scores
**Status:** Pending
**Effort:** Medium | **Impact:** Medium
Post-hoc analysis of which agents' arguments were echoed by others. Influence ranking via LLM scoring of round transcripts.
- New: `InfluenceRanking.tsx`
- New binding for LLM-based scoring

### 14. Side-by-Side Comparison
**Status:** Pending
**Effort:** Large | **Impact:** Medium
Compare two runs on the same question. Split-screen showing both consensus texts, score differences, and council composition differences.
- New: `ComparisonView.tsx`
- Requires history browser (Enhancement 5) first

### 15. Custom Persona Creator
**Status:** Pending
**Effort:** Medium | **Impact:** Medium
UI to create new personas — name, category, description, system prompt, avatar. Save as YAML to `personas/`.
- New: `PersonaEditor.tsx`
- New binding: `SavePersona()` in `main.go`

### 16. Deliberation Replay
**Status:** Pending
**Effort:** Large | **Impact:** Fun
Replay completed deliberation at 1x/2x/4x speed. Watch agents speak in order, positions form, consensus emerge. Like a recorded debate.
- New: `ReplayView.tsx`
- Uses stored event timeline from debug log

### 17. Faction Map (2D Visualization)
**Status:** Pending
**Effort:** Large | **Impact:** Fun
Animated 2D spatial visualization where agents cluster by position similarity. Starts scattered, clusters form as rounds progress.
- New: `FactionMap.tsx` (canvas or SVG-based)

### 18. Question Templates
**Status:** Pending
**Effort:** Small | **Impact:** Low
Pre-built question templates for common use cases (ethical dilemmas, product decisions, technical tradeoffs) with suggested council compositions.
- New: `QuestionTemplates.tsx`
- Template data in JSON

### 19. Sound & Atmosphere
**Status:** Pending
**Effort:** Medium | **Impact:** Fun
Optional ambient medieval sounds — quill scratching when agents think, gavel when rounds end, trumpet for consensus. Mutable toggle.
- New: `SoundManager.ts`
- Audio assets in `frontend/public/sounds/`
