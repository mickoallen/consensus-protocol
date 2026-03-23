import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TestLLM } from '../../wailsjs/go/main/App';

interface TestAIPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestResult {
  content: string;
  status_code: number;
  duration_ms: number;
  model: string;
  url: string;
  error: string | null;
}

export default function TestAIPanel({ isOpen, onClose }: TestAIPanelProps) {
  const [prompt, setPrompt] = useState('Hello, please respond with a short greeting.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await TestLLM(prompt);
      setResult(data);
    } catch (err) {
      setResult({
        content: '',
        status_code: 0,
        duration_ms: 0,
        model: '',
        url: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const hasError = result && (result.error || result.status_code >= 400);

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
            className="relative w-full max-w-xl rounded-lg border-2 flex flex-col"
            style={{ borderColor: '#c4a265', backgroundColor: '#fffdf5', maxHeight: '80vh' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '2px solid #e5d5b0' }}>
              <h2 className="font-pixel text-sm" style={{ color: '#8b4513' }}>Test AI Connection</h2>
              <button onClick={onClose} className="text-lg leading-none" style={{ color: '#b0956e' }}>&times;</button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              {/* Prompt input */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#8b4513' }}>Prompt</label>
                <textarea
                  className="w-full rounded border px-3 py-2 text-sm resize-none"
                  style={{ borderColor: '#c4a265', backgroundColor: '#fff', color: '#3d2b1f', minHeight: 80 }}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Enter a prompt..."
                />
              </div>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={loading || !prompt.trim()}
                className="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all"
                style={{
                  borderColor: '#c4a265',
                  backgroundColor: loading ? '#e5d5b0' : '#fff',
                  color: '#8b4513',
                  opacity: loading || !prompt.trim() ? 0.5 : 1,
                }}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>

              {/* Result */}
              {result && (
                <div className="rounded border p-4 space-y-3" style={{
                  borderColor: hasError ? '#fca5a5' : '#c4a265',
                  backgroundColor: hasError ? '#fef2f2' : '#faf8f0',
                }}>
                  {/* Metadata row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {result.status_code > 0 && (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded font-mono font-bold"
                        style={{
                          backgroundColor: (result.status_code >= 200 && result.status_code < 300 ? '#16a34a' : '#dc2626') + '20',
                          color: result.status_code >= 200 && result.status_code < 300 ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {result.status_code}
                      </span>
                    )}
                    {result.duration_ms > 0 && (
                      <span className="text-gray-500">{result.duration_ms}ms</span>
                    )}
                    {result.model && (
                      <span className="text-gray-500">Model: <span className="font-mono">{result.model}</span></span>
                    )}
                    {result.url && (
                      <span className="text-gray-500 truncate">URL: <span className="font-mono">{result.url}</span></span>
                    )}
                  </div>

                  {/* Error */}
                  {result.error && (
                    <p className="text-sm text-red-700 font-medium">{result.error}</p>
                  )}

                  {/* Response content */}
                  {result.content && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#8b4513' }}>Response</label>
                      <pre className="whitespace-pre-wrap break-words text-sm p-3 rounded" style={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5d5b0',
                        color: '#3d2b1f',
                        maxHeight: 250,
                        overflow: 'auto',
                      }}>
                        {result.content}
                      </pre>
                    </div>
                  )}

                  {/* Success indicator */}
                  {!hasError && result.content && (
                    <p className="text-xs font-medium" style={{ color: '#16a34a' }}>Connection successful</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
