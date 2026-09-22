/**
 * Változási napló modal (ügyfélprofil): ki/mikor/mire módosította az ügyfél
 * profilját vagy a kapcsolódó interakciókat/időpontokat.
 * A napló mindig annak az ügyfélnek a változásait mutatja, akinek a profiljáról
 * megnyitották. Keresés: eseménynév, módosító, új érték, kapcsolódó
 * interakció/időpont — kis/nagybetű- és ékezet-érzéketlen, debounce-szal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { authFetch } from '../../api/client';
import { fmtDt } from '../../helpers/formatters';

interface ChangeEntry {
  id: number;
  actor: string;
  action: string;
  label: string;
  new_value?: string | null;
  related_ref?: string | null;
  created_at: string;
}

/** Kis/nagybetű + ékezet-érzéketlen összevetés (magyar kereséshez). */
function fold(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function HistoryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width={size} height={size}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export default function ChangeLogModal({ clientId, clientName, onClose }: {
  clientId: number | string;
  clientName: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/admin/api/clients/${clientId}/changes`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) setEntries(Array.isArray(data?.changes) ? data.changes : []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Debounce: 300 ms csend után frissül a lista
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(rawQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawQuery]);

  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q) return entries;
    return entries.filter((e) =>
      fold(e.label).includes(q) ||
      fold(e.actor).includes(q) ||
      fold(e.new_value || '').includes(q) ||
      fold(e.related_ref || '').includes(q)
    );
  }, [entries, query]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="chlog-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Változási napló — ${clientName}`}>
        <div className="chlog-head">
          <h3 className="chlog-title">Változási napló</h3>
          <button className="chlog-x" onClick={onClose} aria-label="Bezárás">
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chlog-search">
          <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="chlog-search-input"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Keresés a változások között"
            autoFocus
          />
        </div>

        <div className="chlog-list">
          {loading && <div className="chlog-empty">Betöltés…</div>}
          {error && !loading && <div className="chlog-empty">Nem sikerült betölteni a változási naplót.</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="chlog-empty">{entries.length === 0 ? 'Még nincs rögzített változás ennél az ügyfélnél.' : 'Nincs a keresésnek megfelelő változás.'}</div>
          )}
          {!loading && !error && filtered.map((e) => (
            <div key={e.id} className="chlog-row">
              <span className="chlog-tile"><HistoryIcon size={15} /></span>
              <span className="chlog-main">
                <span className="chlog-label">{e.label}</span>
                <span className="chlog-meta">
                  {e.actor}
                  {e.new_value ? <> · <span className="chlog-value">{e.new_value}</span></> : null}
                  {e.related_ref && e.related_ref !== e.new_value ? <> · <span className="chlog-ref">{e.related_ref}</span></> : null}
                </span>
              </span>
              <span className="chlog-date">{e.created_at ? fmtDt(e.created_at) : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
