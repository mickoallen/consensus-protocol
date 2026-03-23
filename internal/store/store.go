package store

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

type RoundOutput struct {
	AgentID    int     `json:"agent_id"`
	Round      int     `json:"round"`
	Reasoning  string  `json:"reasoning"`
	Position   string  `json:"position"`
	Confidence float64 `json:"confidence"`
}

type FinalVote struct {
	AgentID               int     `json:"agent_id"`
	Persona               string  `json:"persona"`
	Position              string  `json:"position"`
	Confidence            float64 `json:"confidence"`
	ChangedMind           bool    `json:"changed_mind"`
	WhatChangedIt         string  `json:"what_changed_it"`
	DissentsFromConsensus bool    `json:"dissents_from_consensus"`
}

type SynthesisResult struct {
	Consensus      string      `json:"consensus"`
	WeightedScore  float64     `json:"weighted_score"`
	Votes          []FinalVote `json:"votes"`
	MinorityReport string      `json:"minority_report"`
	Dissenters     []FinalVote `json:"dissenters"`
}

type Store struct {
	db *sql.DB
}

func New(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	// Enable WAL mode for better concurrent read performance
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	// Mark any stale "running" runs as "abandoned" — they were interrupted by a restart
	if _, err := db.Exec(`UPDATE swarm_runs SET status = 'abandoned' WHERE status = 'running'`); err != nil {
		log.Printf("[store] warning: failed to clean up stale runs: %v", err)
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS swarm_runs (
		id TEXT PRIMARY KEY,
		question TEXT NOT NULL,
		agent_count INTEGER,
		status TEXT DEFAULT 'running',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS round_outputs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT REFERENCES swarm_runs(id),
		agent_id INTEGER,
		round INTEGER,
		reasoning TEXT,
		position TEXT,
		confidence REAL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_round_outputs_run_round ON round_outputs(run_id, round);

	CREATE TABLE IF NOT EXISTS final_votes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT REFERENCES swarm_runs(id),
		agent_id INTEGER,
		persona TEXT,
		position TEXT,
		confidence REAL,
		changed_mind BOOLEAN,
		what_changed_it TEXT,
		dissents_from_consensus BOOLEAN
	);

	CREATE INDEX IF NOT EXISTS idx_final_votes_run ON final_votes(run_id);

	CREATE TABLE IF NOT EXISTS synthesis_results (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT REFERENCES swarm_runs(id),
		consensus TEXT,
		weighted_score REAL,
		minority_report TEXT
	);
	`
	_, err := s.db.Exec(schema)
	if err != nil {
		return err
	}

	// Add strategy column if it doesn't exist (migration for existing databases)
	s.db.Exec("ALTER TABLE swarm_runs ADD COLUMN strategy TEXT DEFAULT 'classic'")

	return nil
}

func (s *Store) CreateRun(id, question string, agentCount int, strategy string) error {
	if strategy == "" {
		strategy = "classic"
	}
	_, err := s.db.Exec(
		"INSERT INTO swarm_runs (id, question, agent_count, strategy) VALUES (?, ?, ?, ?)",
		id, question, agentCount, strategy,
	)
	return err
}

func (s *Store) UpdateRunStatus(runID, status string) error {
	_, err := s.db.Exec("UPDATE swarm_runs SET status = ? WHERE id = ?", status, runID)
	return err
}

func (s *Store) SaveRoundOutput(runID string, output RoundOutput) error {
	_, err := s.db.Exec(
		"INSERT INTO round_outputs (run_id, agent_id, round, reasoning, position, confidence) VALUES (?, ?, ?, ?, ?, ?)",
		runID, output.AgentID, output.Round, output.Reasoning, output.Position, output.Confidence,
	)
	return err
}

func (s *Store) GetRoundOutputs(runID string, round int) ([]RoundOutput, error) {
	rows, err := s.db.Query(
		"SELECT agent_id, round, reasoning, position, confidence FROM round_outputs WHERE run_id = ? AND round = ? ORDER BY agent_id",
		runID, round,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var outputs []RoundOutput
	for rows.Next() {
		var o RoundOutput
		if err := rows.Scan(&o.AgentID, &o.Round, &o.Reasoning, &o.Position, &o.Confidence); err != nil {
			return nil, err
		}
		outputs = append(outputs, o)
	}
	return outputs, rows.Err()
}

func (s *Store) SaveFinalVote(runID string, vote FinalVote) error {
	_, err := s.db.Exec(
		"INSERT INTO final_votes (run_id, agent_id, persona, position, confidence, changed_mind, what_changed_it, dissents_from_consensus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		runID, vote.AgentID, vote.Persona, vote.Position, vote.Confidence, vote.ChangedMind, vote.WhatChangedIt, vote.DissentsFromConsensus,
	)
	return err
}

func (s *Store) GetFinalVotes(runID string) ([]FinalVote, error) {
	return s.GetFinalVotesBatch(runID, 0, -1)
}

func (s *Store) GetFinalVotesBatch(runID string, offset, limit int) ([]FinalVote, error) {
	query := "SELECT agent_id, persona, position, confidence, changed_mind, what_changed_it, dissents_from_consensus FROM final_votes WHERE run_id = ? ORDER BY agent_id"
	var args []any
	args = append(args, runID)
	if limit > 0 {
		query += " LIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var votes []FinalVote
	for rows.Next() {
		var v FinalVote
		if err := rows.Scan(&v.AgentID, &v.Persona, &v.Position, &v.Confidence, &v.ChangedMind, &v.WhatChangedIt, &v.DissentsFromConsensus); err != nil {
			return nil, err
		}
		votes = append(votes, v)
	}
	return votes, rows.Err()
}

func (s *Store) GetFinalVoteCount(runID string) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM final_votes WHERE run_id = ?", runID).Scan(&count)
	return count, err
}

func (s *Store) SaveSynthesis(runID string, result SynthesisResult) error {
	_, err := s.db.Exec(
		"INSERT INTO synthesis_results (run_id, consensus, weighted_score, minority_report) VALUES (?, ?, ?, ?)",
		runID, result.Consensus, result.WeightedScore, result.MinorityReport,
	)
	return err
}
