import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PixelSprite from './PixelSprite';

interface PersonaInfo {
  name: string;
  slug: string;
  color: string;
  category: string;
  adversarial: boolean;
  description: string;
  avatar: string;
}

interface CouncilComposerProps {
  personas: PersonaInfo[];
  onCountsChange: (counts: Record<string, number>) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  analytical: 'The Strategists',
  creative: 'The Visionaries',
  adversarial: 'The Challengers',
  empirical: 'The Scholars',
  philosophical: 'The Sages',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  analytical: 'Logic-driven thinkers who break problems into parts and find optimal solutions.',
  creative: 'Imaginative minds who explore unconventional ideas others overlook.',
  adversarial: 'Contrarians who stress-test arguments to make the consensus stronger.',
  empirical: 'Evidence-first investigators who ground the debate in data and observation.',
  philosophical: 'Deep thinkers who examine questions through ethical and theoretical lenses.',
};

const CATEGORY_ORDER = ['analytical', 'creative', 'adversarial', 'empirical', 'philosophical'];

function distributeCount(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map(w => (w / sumW) * total);
  const floored = raw.map(r => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  const fracs = raw.map((r, i) => ({ i, frac: r - floored[i] }));
  fracs.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floored[fracs[k].i]++;
  }
  return floored;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

export default function CouncilComposer({ personas, onCountsChange }: CouncilComposerProps) {
  const [totalAgents, setTotalAgents] = useState(6);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [rerollKey, setRerollKey] = useState(0);

  const grouped = useMemo(() => {
    const map = new Map<string, PersonaInfo[]>();
    for (const p of personas) {
      const list = map.get(p.category) || [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [personas]);

  const categories = useMemo(() =>
    CATEGORY_ORDER.filter(c => grouped.has(c)),
    [grouped]
  );

  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const c of CATEGORY_ORDER) w[c] = 50;
    return w;
  });

  // Locked personas (manually toggled on/off)
  const [locked, setLocked] = useState<Record<string, boolean>>({});

  // Compute selected personas (unique, no duplicates)
  const computedCounts = useMemo(() => {
    const catWeightArr = categories.map(c => categoryWeights[c] || 0);
    const catCounts = distributeCount(totalAgents, catWeightArr);

    const counts: Record<string, number> = {};

    // First, include all locked-on personas
    const lockedOn = new Set<string>();
    const lockedOff = new Set<string>();
    for (const [slug, val] of Object.entries(locked)) {
      if (val) lockedOn.add(slug);
      else lockedOff.add(slug);
    }

    // Count locked personas per category
    const lockedPerCat: Record<string, string[]> = {};
    for (const slug of lockedOn) {
      const p = personas.find(pp => pp.slug === slug);
      if (p) {
        (lockedPerCat[p.category] ||= []).push(slug);
        counts[slug] = 1;
      }
    }

    // Fill remaining slots per category with random picks
    categories.forEach((cat, ci) => {
      const members = grouped.get(cat) || [];
      const lockedInCat = lockedPerCat[cat] || [];
      const slotsNeeded = Math.max(0, catCounts[ci] - lockedInCat.length);
      const available = members.filter(p => !lockedOn.has(p.slug) && !lockedOff.has(p.slug));
      const picked = pickRandom(available, slotsNeeded);
      for (const p of picked) {
        counts[p.slug] = 1;
      }
    });

    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAgents, categoryWeights, categories, grouped, locked, personas, rerollKey]);

  // Push counts to parent
  useEffect(() => {
    onCountsChange(computedCounts);
  }, [computedCounts, onCountsChange]);

  const catCounts = useMemo(() => {
    const catWeightArr = categories.map(c => categoryWeights[c] || 0);
    return distributeCount(totalAgents, catWeightArr);
  }, [totalAgents, categoryWeights, categories]);

  const handleCategoryWeight = useCallback((cat: string, val: number) => {
    setCategoryWeights(prev => ({ ...prev, [cat]: val }));
  }, []);

  const toggleLock = useCallback((slug: string) => {
    setLocked(prev => {
      const current = prev[slug];
      if (current === true) return { ...prev, [slug]: false }; // locked on → locked off
      if (current === false) {
        const next = { ...prev };
        delete next[slug]; // locked off → unlocked (auto)
        return next;
      }
      return { ...prev, [slug]: true }; // unlocked → locked on
    });
  }, []);

  const selectedCount = Object.values(computedCounts).filter(c => c > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-pixel text-xs mb-1" style={{ color: '#8b4513' }}>
          Assemble Your Council
        </h2>
        <p className="text-[10px]" style={{ color: '#7a6552' }}>
          Set the size and balance. Personas are auto-picked — click any to lock or exclude.
        </p>
      </div>

      {/* Total council size + reroll */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold whitespace-nowrap" style={{ color: '#5a3a1a' }}>
          Council Size
        </label>
        <input
          type="range"
          min={2}
          max={20}
          value={totalAgents}
          onChange={e => setTotalAgents(parseInt(e.target.value))}
          className="flex-1 accent-amber-700"
        />
        <span className="text-sm font-bold font-mono w-6 text-center" style={{ color: '#8b4513' }}>
          {totalAgents}
        </span>
        <button
          onClick={() => setRerollKey(k => k + 1)}
          className="text-xs px-2 py-1 rounded border-2 font-bold hover:bg-amber-50 transition-colors"
          style={{ borderColor: '#dbc89e', color: '#8b4513' }}
          title="Reroll random picks"
        >
          Reroll
        </button>
      </div>

      {/* Category sliders */}
      <div className="space-y-2">
        {categories.map((cat, ci) => {
          const members = grouped.get(cat) || [];
          const isExpanded = expandedCategory === cat;
          const catCount = catCounts[ci];

          return (
            <div key={cat} className="rounded-lg border-2 overflow-hidden" style={{ borderColor: '#dbc89e' }}>
              {/* Category header + slider */}
              <div className="px-3 py-2" style={{ backgroundColor: '#fff8e7' }}>
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                    className="text-[10px] uppercase tracking-widest font-bold flex-1 text-left flex items-center gap-1"
                    style={{ color: '#b0956e' }}
                  >
                    <span className="text-[8px]">{isExpanded ? '▼' : '▶'}</span>
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                  <span className="text-xs font-bold font-mono" style={{ color: '#8b4513' }}>
                    {catCount}
                  </span>
                </div>
                <p className="text-[10px] mb-1" style={{ color: '#9a8570', fontFamily: 'Georgia, serif' }}>
                  {CATEGORY_DESCRIPTIONS[cat] || ''}
                </p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={categoryWeights[cat] || 0}
                  onChange={e => handleCategoryWeight(cat, parseInt(e.target.value))}
                  className="w-full accent-amber-700 h-1.5"
                />
                {/* Mini avatars preview — selected ones */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {members
                    .filter(p => computedCounts[p.slug] > 0)
                    .map(p => (
                      <motion.button
                        key={p.slug}
                        onClick={() => toggleLock(p.slug)}
                        className="relative"
                        title={`${p.name}${locked[p.slug] === true ? ' (locked)' : locked[p.slug] === false ? ' (excluded)' : ''}`}
                        whileTap={{ scale: 0.9 }}
                      >
                        <PixelSprite persona={p.avatar} color={p.color} size={22} />
                        {locked[p.slug] === true && (
                          <span className="absolute -top-0.5 -right-0.5 text-[7px]">📌</span>
                        )}
                      </motion.button>
                    ))}
                </div>
              </div>

              {/* Expanded: all personas in category */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-2 border-t grid grid-cols-2 sm:grid-cols-3 gap-2" style={{ borderColor: '#dbc89e', backgroundColor: '#fff' }}>
                      {members.map(p => {
                        const isSelected = (computedCounts[p.slug] || 0) > 0;
                        const isLockedOn = locked[p.slug] === true;
                        const isLockedOff = locked[p.slug] === false;
                        return (
                          <button
                            key={p.slug}
                            onClick={() => toggleLock(p.slug)}
                            className={`flex items-center gap-1.5 p-1.5 rounded border text-left transition-all ${
                              isLockedOff ? 'opacity-30' : isSelected ? 'border-current' : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              borderColor: isSelected ? p.color + '60' : '#dbc89e',
                              backgroundColor: isSelected ? '#fff8e7' : 'transparent',
                            }}
                          >
                            <PixelSprite persona={p.avatar} color={p.color} size={28} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold truncate" style={{ color: '#3d2b1f' }}>
                                {p.name}
                              </div>
                              <div className="text-[9px] leading-snug" style={{ color: '#7a6552', fontFamily: 'Georgia, serif' }}>
                                {p.description}
                              </div>
                            </div>
                            {isLockedOn && <span className="text-[8px] flex-shrink-0">📌</span>}
                            {isLockedOff && <span className="text-[8px] flex-shrink-0">✕</span>}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-center text-[10px]" style={{ color: '#7a6552' }}>
        <span className="font-bold" style={{ color: '#3d2b1f' }}>{selectedCount}</span> unique council members across{' '}
        <span className="font-bold" style={{ color: '#3d2b1f' }}>
          {new Set(Object.keys(computedCounts).map(slug => personas.find(p => p.slug === slug)?.category).filter(Boolean)).size}
        </span> factions
        {selectedCount < 2 && (
          <span className="ml-2 font-medium" style={{ color: '#b45309' }}>Need at least 2 members</span>
        )}
      </div>
    </div>
  );
}
