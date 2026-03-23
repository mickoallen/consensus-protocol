import { useState } from 'react';
import { motion } from 'framer-motion';
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

interface PersonaPickerProps {
  personas: PersonaInfo[];
  counts: Record<string, number>;
  onChange: (slug: string, count: number) => void;
  totalAgents: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  analytical: 'The Strategists',
  creative: 'The Visionaries',
  adversarial: 'The Challengers',
  empirical: 'The Scholars',
  philosophical: 'The Sages',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  analytical: 'Logic-driven thinkers who break problems into parts, weigh trade-offs, and find optimal solutions.',
  creative: 'Imaginative minds who explore unconventional ideas, challenge assumptions, and propose what others overlook.',
  adversarial: 'Contrarians and provocateurs who stress-test arguments — they push back to make the consensus stronger.',
  empirical: 'Evidence-first investigators who ground the debate in data, research, and real-world observations.',
  philosophical: 'Deep thinkers who examine the question through ethical, existential, and theoretical lenses.',
};

export default function PersonaPicker({ personas, counts, onChange, totalAgents }: PersonaPickerProps) {
  const [search, setSearch] = useState('');
  const [hoveredPersona, setHoveredPersona] = useState<string | null>(null);

  const grouped = new Map<string, PersonaInfo[]>();
  for (const p of personas) {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) continue;
    const list = grouped.get(p.category) || [];
    list.push(p);
    grouped.set(p.category, list);
  }

  const selectedCount = Object.values(counts).filter(c => c > 0).length;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-pixel text-sm" style={{ color: '#8b4513' }}>
          Assemble Your Council
        </h2>
        <p className="text-sm mt-1" style={{ color: '#7a6552' }}>
          Click to toggle members. Each persona is unique.
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search personas..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg border-2 text-sm"
        style={{ borderColor: '#dbc89e', backgroundColor: '#fff8e7', color: '#3d2b1f' }}
      />

      {Array.from(grouped.entries()).map(([category, members]) => (
        <div key={category}>
          <div className="mb-2 px-1">
            <h3 className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#b0956e' }}>
              {CATEGORY_LABELS[category] || category}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: '#9a8570', fontFamily: 'Georgia, serif' }}>
              {CATEGORY_DESCRIPTIONS[category] || ''}
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {members.map(p => {
              const isSelected = (counts[p.slug] || 0) > 0;
              const isHovered = hoveredPersona === p.slug;
              return (
                <motion.button
                  key={p.slug}
                  onClick={() => onChange(p.slug, isSelected ? 0 : 1)}
                  onMouseEnter={() => setHoveredPersona(p.slug)}
                  onMouseLeave={() => setHoveredPersona(null)}
                  className={`
                    relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-center transition-all
                    ${isSelected ? 'shadow-sm' : 'opacity-50 hover:opacity-80'}
                  `}
                  style={{
                    backgroundColor: isSelected ? '#fff8e7' : '#fff',
                    borderColor: isSelected ? p.color + '80' : '#dbc89e',
                  }}
                  whileTap={{ scale: 0.95 }}
                  title={p.description}
                >
                  <PixelSprite persona={p.avatar} color={p.color} size={36} />
                  <span className="text-[9px] font-bold leading-tight" style={{ color: isSelected ? '#3d2b1f' : '#7a6552' }}>
                    {p.name}
                  </span>

                  {/* Description tooltip on hover */}
                  {isHovered && (
                    <motion.div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full w-48 px-2.5 py-2 rounded-lg border-2 shadow-lg text-left z-50"
                      style={{ backgroundColor: '#fffdf5', borderColor: p.color + '60' }}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <p className="text-[10px] font-bold mb-0.5" style={{ color: p.color }}>{p.name}</p>
                      <p className="text-[10px] leading-snug" style={{ color: '#3d2b1f', fontFamily: 'Georgia, serif' }}>
                        {p.description}
                      </p>
                      {p.adversarial && (
                        <p className="text-[8px] mt-1 font-bold" style={{ color: '#991b1b' }}>
                          ⚔ Will actively challenge consensus
                        </p>
                      )}
                    </motion.div>
                  )}

                  {isSelected && (
                    <motion.div
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border-2"
                      style={{ backgroundColor: p.color, color: '#fff', borderColor: '#fff' }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      ✓
                    </motion.div>
                  )}

                  {p.adversarial && (
                    <span className="absolute top-0.5 left-0.5 text-[6px] px-0.5 py-0 rounded border font-bold"
                      style={{ backgroundColor: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
                      ⚔
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="text-center text-sm" style={{ color: '#7a6552' }}>
        <span className="font-bold" style={{ color: '#3d2b1f' }}>{selectedCount}</span> unique council members
        {selectedCount < 2 && <span className="ml-2 font-medium" style={{ color: '#b45309' }}>Need at least 2</span>}
      </div>
    </div>
  );
}
