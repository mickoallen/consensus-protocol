import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GetSettings, SaveSettings } from '../../wailsjs/go/main/App';

interface Settings {
  base_url: string;
  model: string;
  api_key: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>({ base_url: '', model: '', api_key: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      GetSettings().then(setSettings).catch(() => {});
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await SaveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(61, 43, 31, 0.4)' }} onClick={onClose} />

          <motion.div
            className="relative w-full max-w-md rounded-lg border-2 p-6"
            style={{ borderColor: '#c4a265', backgroundColor: '#fffdf5' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            <h2 className="font-pixel text-xs mb-4" style={{ color: '#8b4513' }}>Oracle Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#7a6552' }}>
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={settings.base_url}
                  onChange={e => setSettings(s => ({ ...s, base_url: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3 py-2.5 rounded-lg border-2 text-sm focus:outline-none"
                  style={{ borderColor: '#dbc89e', backgroundColor: '#faf8f0', color: '#3d2b1f' }}
                />
                <p className="text-[9px] mt-1" style={{ color: '#b0956e' }}>Ollama, LM Studio, OpenAI, etc.</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#7a6552' }}>
                  Model
                </label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                  placeholder="qwen3.5"
                  className="w-full px-3 py-2.5 rounded-lg border-2 text-sm focus:outline-none"
                  style={{ borderColor: '#dbc89e', backgroundColor: '#faf8f0', color: '#3d2b1f' }}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#7a6552' }}>
                  API Key (optional)
                </label>
                <input
                  type="password"
                  value={settings.api_key}
                  onChange={e => setSettings(s => ({ ...s, api_key: e.target.value }))}
                  placeholder="Leave empty for local"
                  className="w-full px-3 py-2.5 rounded-lg border-2 text-sm focus:outline-none"
                  style={{ borderColor: '#dbc89e', backgroundColor: '#faf8f0', color: '#3d2b1f' }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={{ color: '#7a6552' }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border-2 font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: '#8b4513', color: '#8b4513', backgroundColor: saved ? '#d9f99d' : '#faf0d7' }}
              >
                {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
