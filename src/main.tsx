import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-amber-400">
            PokaYoke Studio (Kinetic SOP)
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Phase 1 scaffold initialized. Ready for Phase 2–6 assembly.
          </p>
        </div>
      </main>
    </StrictMode>
  );
}
