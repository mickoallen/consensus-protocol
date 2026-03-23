package persona

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Persona struct {
	Name         string `yaml:"name" json:"name"`
	Slug         string `yaml:"slug" json:"slug"`
	Color        string `yaml:"color" json:"color"`
	Category     string `yaml:"category" json:"category"`
	Adversarial  bool   `yaml:"adversarial" json:"adversarial"`
	Description  string `yaml:"description" json:"description"`
	Avatar       string `yaml:"avatar" json:"avatar"` // pixel art SVG data or emoji
	SystemPrompt string `yaml:"system_prompt" json:"-"`
}

type Registry struct {
	personas   []Persona
	bySlug     map[string]Persona
	byCategory map[string][]Persona
}

func LoadRegistry(dir string) (*Registry, error) {
	r := &Registry{
		bySlug:     make(map[string]Persona),
		byCategory: make(map[string][]Persona),
	}

	files, err := filepath.Glob(filepath.Join(dir, "*.yaml"))
	if err != nil {
		return nil, fmt.Errorf("glob personas: %w", err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no persona files found in %s", dir)
	}

	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", f, err)
		}
		var p Persona
		if err := yaml.Unmarshal(data, &p); err != nil {
			return nil, fmt.Errorf("parse %s: %w", f, err)
		}
		r.personas = append(r.personas, p)
		r.bySlug[p.Slug] = p
		r.byCategory[p.Category] = append(r.byCategory[p.Category], p)
	}

	return r, nil
}

func (r *Registry) Get(slug string) (Persona, bool) {
	p, ok := r.bySlug[slug]
	return p, ok
}

func (r *Registry) All() []Persona {
	return r.personas
}

func (r *Registry) Categories() []string {
	cats := make([]string, 0, len(r.byCategory))
	for c := range r.byCategory {
		cats = append(cats, c)
	}
	return cats
}

// Select picks n personas using the given strategy.
// Strategies: "random", "balanced" (one from each category, then fill randomly).
func (r *Registry) Select(n int, strategy string) []Persona {
	if n >= len(r.personas) {
		result := make([]Persona, len(r.personas))
		copy(result, r.personas)
		return result
	}

	switch strategy {
	case "balanced":
		return r.selectBalanced(n)
	default:
		return r.selectRandom(n)
	}
}

func (r *Registry) selectRandom(n int) []Persona {
	perm := rand.Perm(len(r.personas))
	result := make([]Persona, n)
	for i := 0; i < n; i++ {
		result[i] = r.personas[perm[i]]
	}
	return result
}

func (r *Registry) selectBalanced(n int) []Persona {
	used := make(map[string]bool)
	var result []Persona

	// One from each category first
	cats := r.Categories()
	rand.Shuffle(len(cats), func(i, j int) { cats[i], cats[j] = cats[j], cats[i] })

	for _, cat := range cats {
		if len(result) >= n {
			break
		}
		members := r.byCategory[cat]
		pick := members[rand.Intn(len(members))]
		result = append(result, pick)
		used[pick.Slug] = true
	}

	// Fill remaining randomly from unused
	if len(result) < n {
		var remaining []Persona
		for _, p := range r.personas {
			if !used[p.Slug] {
				remaining = append(remaining, p)
			}
		}
		rand.Shuffle(len(remaining), func(i, j int) { remaining[i], remaining[j] = remaining[j], remaining[i] })
		for i := 0; i < len(remaining) && len(result) < n; i++ {
			result = append(result, remaining[i])
		}
	}

	return result
}
