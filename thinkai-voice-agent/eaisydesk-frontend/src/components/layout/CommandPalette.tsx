import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './CommandPalette.css';

/* ── Types ──────────────────────────────────────────────────── */
interface CmdItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  type: 'nav' | 'action' | 'client' | 'search';
  action: () => void;
  keywords?: string;
}

/* ── Static commands ────────────────────────────────────────── */
function useStaticCommands(navigate: ReturnType<typeof useNavigate>): CmdItem[] {
  return useMemo(() => [
    // Navigation — paths are relative to BrowserRouter basename="/admin"
    { id: 'nav-analytics', title: 'Irányítópult', desc: 'Analitika és KPI-k', icon: '📊', type: 'nav' as const, action: () => navigate('/analytics'), keywords: 'analytics dashboard analitika kpi' },
    { id: 'nav-interactions', title: 'Interakciós lista', desc: 'Összes beérkező és kimenő interakció', icon: '💬', type: 'nav' as const, action: () => navigate('/interactions'), keywords: 'interactions interakció üzenet message' },
    { id: 'nav-clients', title: 'Ügyféllista', desc: 'Ügyfelek keresése és kezelése', icon: '👥', type: 'nav' as const, action: () => navigate('/clients'), keywords: 'clients ügyfelek customer' },
    { id: 'nav-kanban', title: 'Érdeklődőkezelés', desc: 'Kanban board — lead pipeline', icon: '📋', type: 'nav' as const, action: () => navigate('/kanban'), keywords: 'kanban board lead pipeline érdeklődő' },
    { id: 'nav-calendar', title: 'Naptár', desc: 'Időpontok és foglalások', icon: '📅', type: 'nav' as const, action: () => navigate('/calendar'), keywords: 'calendar naptár foglalás időpont' },
    { id: 'nav-outbound', title: 'Kampányok', desc: 'Kimenő kommunikáció és kampányok', icon: '📤', type: 'nav' as const, action: () => navigate('/outbound'), keywords: 'outbound kampány campaign kimenő email' },
    { id: 'nav-automations', title: 'Automatizációk', desc: 'Automatikus munkafolyamatok', icon: '⚡', type: 'nav' as const, action: () => navigate('/automatizaciok'), keywords: 'automations automatizáció workflow' },
    { id: 'nav-settings-agent', title: 'eaisyDesk beállítások', desc: 'AI asszisztens konfigurálás', icon: '🤖', type: 'nav' as const, action: () => navigate('/settings/agent'), keywords: 'settings beállítások agent ai' },
    { id: 'nav-settings-praxis', title: 'Céginformációk', desc: 'Céges adatok kezelése', icon: '🏢', type: 'nav' as const, action: () => navigate('/settings/praxis'), keywords: 'praxis cég company info' },
    { id: 'nav-settings-rules', title: 'Szabályok', desc: 'Üzleti szabályok és logika', icon: '📝', type: 'nav' as const, action: () => navigate('/settings/szabalyok'), keywords: 'rules szabályok business logic' },
    { id: 'nav-help', title: 'Segítség', desc: 'Dokumentáció és útmutatók', icon: '❓', type: 'nav' as const, action: () => navigate('/help'), keywords: 'help segítség docs' },
    { id: 'nav-marketing', title: 'EAISY Marketing', desc: 'Marketing automatizáció modul', icon: '🎯', type: 'nav' as const, action: () => { window.location.href = '/admin/marketing'; }, keywords: 'marketing automation modul' },

    // Actions
    { id: 'action-theme', title: 'Téma váltás', desc: 'Világos / sötét mód', icon: '🌓', type: 'action' as const, action: () => document.querySelector<HTMLButtonElement>('.sidebar-theme-toggle')?.click(), keywords: 'theme dark light sötét világos' },
    { id: 'action-refresh', title: 'Adatok frissítése', desc: 'Oldal újratöltés', icon: '🔄', type: 'action' as const, action: () => window.location.reload(), keywords: 'refresh reload frissítés' },
    { id: 'action-collapse', title: 'Sidebar összecsukás', desc: 'Ctrl+B', icon: '📐', type: 'action' as const, action: () => document.querySelector<HTMLButtonElement>('.sidebar-collapse-btn')?.click(), keywords: 'sidebar collapse összecsukás' },
  ], [navigate]);
}

/* ── Component ──────────────────────────────────────────────── */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [clientResults, setClientResults] = useState<CmdItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const staticCommands = useStaticCommands(navigate);

  // ── Ctrl+K toggle ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => {
          if (!prev) {
            setQuery('');
            setActiveIdx(0);
            setClientResults([]);
          }
          return !prev;
        });
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Focus input when opened ──
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Search clients from Supabase ──
  useEffect(() => {
    if (!query || query.length < 2) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('clients')
          .select('id, name, email, phone')
          .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(5);
        if (data) {
          setClientResults(data.map(c => ({
            id: `client-${c.id}`,
            title: c.name || 'Ismeretlen',
            desc: [c.email, c.phone].filter(Boolean).join(' · ') || 'Nincs kontakt',
            icon: '👤',
            type: 'client' as const,
            action: () => navigate(`/clients`),
          })));
        }
      } catch { /* silent */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, navigate]);

  // ── Filter static commands ──
  const filtered = useMemo(() => {
    if (!query) return staticCommands;
    const q = query.toLowerCase();
    return staticCommands.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      (item.keywords || '').toLowerCase().includes(q)
    );
  }, [query, staticCommands]);

  // ── Combine all results ──
  const allResults = useMemo(() => [...filtered, ...clientResults], [filtered, clientResults]);

  // ── Reset active index on query change ──
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(prev => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && allResults[activeIdx]) {
      e.preventDefault();
      allResults[activeIdx].action();
      setOpen(false);
    }
  }, [allResults, activeIdx]);

  // ── Scroll active item into view ──
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('.cmd-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ── Highlight match in text ──
  function highlight(text: string): React.ReactNode {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="cmd-highlight">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  }

  if (!open) return null;

  // Group results
  const navItems = allResults.filter(i => i.type === 'nav');
  const actionItems = allResults.filter(i => i.type === 'action');
  const clientItems = allResults.filter(i => i.type === 'client');

  return (
    <div className="cmd-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="cmd-input-wrap">
          <svg className="cmd-search-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Keresés oldalak, ügyfelek, műveletek között..."
            spellCheck={false}
            autoComplete="off"
          />
          <span className="cmd-kbd">ESC</span>
        </div>

        {/* Results */}
        <div className="cmd-results" ref={listRef}>
          {allResults.length === 0 ? (
            <div className="cmd-empty">
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <div>Nincs találat erre: „{query}"</div>
            </div>
          ) : (
            <>
              {navItems.length > 0 && (
                <>
                  <div className="cmd-group-label">Oldalak</div>
                  {navItems.map((item) => {
                    const globalIdx = allResults.indexOf(item);
                    return (
                      <div
                        key={item.id}
                        className={`cmd-item${globalIdx === activeIdx ? ' active' : ''}`}
                        onClick={() => { item.action(); setOpen(false); }}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                      >
                        <div className={`cmd-item-icon ${item.type}`}>{item.icon}</div>
                        <div className="cmd-item-body">
                          <div className="cmd-item-title">{highlight(item.title)}</div>
                          <div className="cmd-item-desc">{highlight(item.desc)}</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {actionItems.length > 0 && (
                <>
                  <div className="cmd-group-label">Műveletek</div>
                  {actionItems.map((item) => {
                    const globalIdx = allResults.indexOf(item);
                    return (
                      <div
                        key={item.id}
                        className={`cmd-item${globalIdx === activeIdx ? ' active' : ''}`}
                        onClick={() => { item.action(); setOpen(false); }}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                      >
                        <div className={`cmd-item-icon ${item.type}`}>{item.icon}</div>
                        <div className="cmd-item-body">
                          <div className="cmd-item-title">{highlight(item.title)}</div>
                          <div className="cmd-item-desc">{item.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {clientItems.length > 0 && (
                <>
                  <div className="cmd-group-label">Ügyfelek</div>
                  {clientItems.map((item) => {
                    const globalIdx = allResults.indexOf(item);
                    return (
                      <div
                        key={item.id}
                        className={`cmd-item${globalIdx === activeIdx ? ' active' : ''}`}
                        onClick={() => { item.action(); setOpen(false); }}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                      >
                        <div className={`cmd-item-icon ${item.type}`}>{item.icon}</div>
                        <div className="cmd-item-body">
                          <div className="cmd-item-title">{highlight(item.title)}</div>
                          <div className="cmd-item-desc">{highlight(item.desc)}</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="cmd-footer">
          <div className="cmd-footer-hint">
            <span className="cmd-kbd">↑↓</span> navigáció
          </div>
          <div className="cmd-footer-hint">
            <span className="cmd-kbd">↵</span> megnyitás
          </div>
          <div className="cmd-footer-hint">
            <span className="cmd-kbd">ESC</span> bezárás
          </div>
        </div>
      </div>
    </div>
  );
}
