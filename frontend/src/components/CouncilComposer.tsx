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

/* ── Add-persona modal ── */
function PersonaAddModal({
  category,
  personas,
  selectedSlugs,
  onSelect,
  onClose,
}: {
  category: string;
  personas: PersonaInfo[];
  selectedSlugs: Set<string>;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  const available = personas.filter(p => p.category === category);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(61, 43, 31, 0.4)' }}
        onClick={onClose}
      />
      <motion.div
        className="relative rounded-xl border-2 shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto"
        style={{ borderColor: '#dbc89e', backgroundColor: '#fff8e7' }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: '#dbc89e' }}>
          <h3 className="font-pixel text-xs" style={{ color: '#8b4513' }}>
            Add from {CATEGORY_LABELS[category] || category}
          </h3>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {available.map(p => {
            const already = selectedSlugs.has(p.slug);
            return (
              <button
                key={p.slug}
                onClick={() => { if (!already) { onSelect(p.slug); onClose(); } }}
                disabled={already}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                  already ? 'opacity-40 cursor-default' : 'hover:bg-white cursor-pointer'
                }`}
                style={{
                  borderColor: already ? p.color + '40' : '#dbc89e',
                  backgroundColor: already ? p.color + '10' : 'transparent',
                }}
              >
                <PixelSprite persona={p.avatar} color={p.color} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold truncate" style={{ color: '#3d2b1f' }}>
                    {p.name}
                  </div>
                  {already && (
                    <div className="text-[8px]" style={{ color: '#7a6552' }}>Already in council</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main component ── */
export default function CouncilComposer({ personas, onCountsChange }: CouncilComposerProps) {
  const [totalAgents, setTotalAgents] = useState(6);
  const [rerollKey, setRerollKey] = useState(0);
  const [activeTab, setActiveTab] = useState(CATEGORY_ORDER[0]);
  const [addModalCategory, setAddModalCategory] = useState<string | null>(null);

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

  const [locked, setLocked] = useState<Record<string, boolean>>({});

  const computedCounts = useMemo(() => {
    const catWeightArr = categories.map(c => categoryWeights[c] || 0);
    const catCounts = distributeCount(totalAgents, catWeightArr);

    const counts: Record<string, number> = {};

    const lockedOn = new Set<string>();
    const lockedOff = new Set<string>();
    for (const [slug, val] of Object.entries(locked)) {
      if (val) lockedOn.add(slug);
      else lockedOff.add(slug);
    }

    const lockedPerCat: Record<string, string[]> = {};
    for (const slug of lockedOn) {
      const p = personas.find(pp => pp.slug === slug);
      if (p) {
        (lockedPerCat[p.category] ||= []).push(slug);
        counts[slug] = 1;
      }
    }

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

  useEffect(() => {
    onCountsChange(computedCounts);
  }, [computedCounts, onCountsChange]);

  const selectedSlugs = useMemo(() =>
    new Set(Object.keys(computedCounts).filter(s => computedCounts[s] > 0)),
    [computedCounts]
  );

  const handleRemove = useCallback((slug: string) => {
    setLocked(prev => ({ ...prev, [slug]: false }));
  }, []);

  const handleAddFromModal = useCallback((slug: string) => {
    setLocked(prev => ({ ...prev, [slug]: true }));
  }, []);

  const toggleFromMain = useCallback((slug: string) => {
    setLocked(prev => {
      const isSelected = prev[slug] === true;
      if (isSelected) return { ...prev, [slug]: false };
      // If currently excluded or auto, lock on
      return { ...prev, [slug]: true };
    });
  }, []);

  const selectedCount = selectedSlugs.size;
  const factionCount = new Set(
    [...selectedSlugs].map(slug => personas.find(p => p.slug === slug)?.category).filter(Boolean)
  ).size;

  // Personas in active tab
  const activeMembers = useMemo(() =>
    grouped.get(activeTab) || [],
    [grouped, activeTab]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="font-pixel text-xs mb-1" style={{ color: '#8b4513' }}>
          Assemble Your Council
        </h2>
        <p className="text-[10px]" style={{ color: '#7a6552' }}>
          Pick your council size, then curate the roster. Lock members with the sidebar or browse by faction.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4" style={{ minHeight: 300 }}>
        {/* ── Left sidebar ── */}
        <div className="w-56 flex-shrink-0 space-y-3">
          {/* Council size slider */}
          <div className="rounded-lg border-2 p-2.5" style={{ borderColor: '#dbc89e', backgroundColor: '#fff8e7' }}>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#b0956e' }}>
                Council Size
              </label>
              <span className="text-sm font-bold font-mono ml-auto" style={{ color: '#8b4513' }}>
                {totalAgents}
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={totalAgents}
              onChange={e => setTotalAgents(parseInt(e.target.value))}
              className="w-full accent-amber-700 h-1.5"
            />
            <button
              onClick={() => setRerollKey(k => k + 1)}
              className="w-full mt-1.5 text-[9px] px-2 py-1 rounded border font-bold hover:bg-amber-50 transition-colors"
              style={{ borderColor: '#dbc89e', color: '#8b4513' }}
            >
              Reroll
            </button>
          </div>

          {/* Per-category roster */}
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 350 }}>
            {categories.map(cat => {
              const membersInCat = [...selectedSlugs]
                .map(s => personas.find(p => p.slug === s))
                .filter((p): p is PersonaInfo => p !== undefined && p.category === cat);

              return (
                <div key={cat} className="rounded-lg border p-2" style={{ borderColor: '#dbc89e' }}>
                  <div className="text-[8px] uppercase tracking-widest font-bold mb-1" style={{ color: '#b0956e' }}>
                    {CATEGORY_LABELS[cat] || cat}
                    <span className="ml-1 font-mono">({membersInCat.length})</span>
                  </div>

                  <AnimatePresence mode="popLayout">
                    {membersInCat.map(p => (
                      <motion.div
                        key={p.slug}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5 py-0.5 group"
                      >
                        <PixelSprite persona={p.avatar} color={p.color} size={18} />
                        <span className="text-[9px] font-medium truncate flex-1" style={{ color: '#3d2b1f' }}>
                          {p.name}
                        </span>
                        {locked[p.slug] === true && (
                          <span className="text-[7px]">📌</span>
                        )}
                        <button
                          onClick={() => handleRemove(p.slug)}
                          className="text-[9px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                          style={{ color: '#b45309' }}
                          title="Remove from council"
                        >
                          ×
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Add placeholder */}
                  <button
                    onClick={() => setAddModalCategory(cat)}
                    className="flex items-center gap-1 mt-0.5 py-0.5 text-[9px] hover:bg-amber-50 rounded px-1 w-full transition-colors"
                    style={{ color: '#b0956e' }}
                  >
                    <span className="text-xs leading-none">+</span>
                    <span>Add…</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          {/* Category tabs */}
          <div className="flex gap-1 mb-3 flex-wrap">
            {categories.map(cat => {
              const isActive = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`text-[9px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider transition-all ${
                    isActive ? 'border-current' : 'hover:bg-amber-50'
                  }`}
                  style={{
                    color: isActive ? '#8b4513' : '#b0956e',
                    borderColor: isActive ? '#8b4513' : '#dbc89e',
                    backgroundColor: isActive ? '#fff8e7' : 'transparent',
                  }}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              );
            })}
          </div>

          {/* Category description */}
          <p className="text-[10px] mb-3" style={{ color: '#9a8570', fontFamily: 'Georgia, serif' }}>
            {CATEGORY_DESCRIPTIONS[activeTab] || ''}
          </p>

          {/* Persona cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <AnimatePresence mode="popLayout">
              {activeMembers.map(p => {
                const isSelected = selectedSlugs.has(p.slug);
                const isLockedOn = locked[p.slug] === true;
                const isExcluded = locked[p.slug] === false;

                return (
                  <motion.button
                    key={p.slug}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: isExcluded ? 0.35 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => toggleFromMain(p.slug)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-colors ${
                      isSelected ? '' : 'hover:bg-amber-50/50'
                    }`}
                    style={{
                      borderColor: isSelected ? p.color + '80' : '#dbc89e',
                      backgroundColor: isSelected ? p.color + '08' : 'transparent',
                    }}
                  >
                    <PixelSprite persona={p.avatar} color={p.color} size={36} />
                    <div className="text-[10px] font-bold" style={{ color: '#3d2b1f' }}>
                      {p.name}
                      {isLockedOn && <span className="ml-1 text-[7px]">📌</span>}
                    </div>
                    <div className="text-[9px] leading-snug" style={{ color: '#7a6552', fontFamily: 'Georgia, serif' }}>
                      {p.description}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="text-center text-[10px]" style={{ color: '#7a6552' }}>
        <span className="font-bold" style={{ color: '#3d2b1f' }}>{selectedCount}</span> unique council members across{' '}
        <span className="font-bold" style={{ color: '#3d2b1f' }}>{factionCount}</span> factions
        {selectedCount < 2 && (
          <span className="ml-2 font-medium" style={{ color: '#b45309' }}>Need at least 2 members</span>
        )}
      </div>

      {/* Add persona modal */}
      <AnimatePresence>
        {addModalCategory && (
          <PersonaAddModal
            category={addModalCategory}
            personas={personas}
            selectedSlugs={selectedSlugs}
            onSelect={handleAddFromModal}
            onClose={() => setAddModalCategory(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
