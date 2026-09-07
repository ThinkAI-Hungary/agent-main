/**
 * VoiceAgentTestSection — élő hangasszisztens teszt a Beállítások alatt.
 * Tenant-választó + beágyazott voice widget (iframe → /widget?tenant=<slug>).
 * Csak admin/manager használhatja (a tab-szűrő + ez a guard is).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: string;
}

export default function VoiceAgentTestSection() {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [agentName, setAgentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Tenant-ok betöltése
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/admin/api/tenants');
        if (res.ok) {
          const data = await res.json();
          const list: TenantInfo[] = data.tenants || [];
          if (!cancelled) {
            setTenants(list);
            if (list.length > 0) setSelectedSlug((prev) => prev || list[0].slug);
          }
        }
      } catch {
        if (!cancelled) showToast('Nem sikerült betölteni a tenantokat', 'error');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Agent-név lekérése a token endpointból (tenant-váltásnál frissül)
  const fetchAgentInfo = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/token${slug ? `?tenant=${encodeURIComponent(slug)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setAgentName(data.agent || 'dobozos-ai');
      }
    } catch { /* csak informális */ }
  }, []);

  useEffect(() => {
    if (selectedSlug) fetchAgentInfo(selectedSlug);
  }, [selectedSlug, reloadKey, fetchAgentInfo]);

  const selected = useMemo(
    () => tenants.find((t) => t.slug === selectedSlug),
    [tenants, selectedSlug],
  );

  if (loading) {
    return (
      <div className="beallitasok-card" style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <style>{vatStyles}</style>

      {/* Fejléc kártya */}
      <div className="beallitasok-card">
        <div className="vat-header">
          <div>
            <div className="beal-subtitle-16">Hangasszisztens élő teszt</div>
            <div className="vat-desc">
              Válaszd ki a céget, majd indítsd el a beszélgetést. A hívás ugyanazon a
              LiveKit agenten megy keresztül, mint az éles forgalom — a te tenantod adataival.
            </div>
          </div>
        </div>

        <div className="vat-info-grid">
          <div className="vat-info-item">
            <div className="vat-info-label">Agent</div>
            <div className="vat-info-value">{agentName || '…'}</div>
          </div>
          <div className="vat-info-item">
            <div className="vat-info-label">Tenant</div>
            <div className="vat-info-value">{selected ? selected.name : '…'}</div>
          </div>
          <div className="vat-info-item">
            <div className="vat-info-label">Státusz</div>
            <div className="vat-info-value">
              {selected ? (selected.active ? '🟢 aktív' : '⚪ inaktív (csak teszt)') : '…'}
            </div>
          </div>
        </div>

        <div className="vat-select-row">
          <label className="vat-select-label">Cég (tenant):</label>
          <select
            className="vat-select"
            value={selectedSlug}
            onChange={(e) => { setSelectedSlug(e.target.value); setReloadKey((k) => k + 1); }}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name} ({t.slug}){t.active ? '' : ' — inaktív'}
              </option>
            ))}
          </select>
          <button
            className="vat-reload-btn"
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Widget újratöltése"
          >
            ↺ Újrakezdés
          </button>
        </div>
      </div>

      {/* Beágyazott widget */}
      <div className="beallitasok-card vat-widget-card">
        <iframe
          key={`${selectedSlug}-${reloadKey}`}
          src={`/widget${selectedSlug ? `?tenant=${encodeURIComponent(selectedSlug)}` : ''}`}
          className="vat-iframe"
          title="Voice agent teszt"
          allow="microphone"
        />
        <div className="vat-hint">
          💡 Az első indításnál a böngésző mikrofon-engedélyt kér — engedélyezni kell.
          A beszélgetés után a napló az <b>Interakciós napló</b>-ban jelenik meg.
        </div>
      </div>
    </>
  );
}

const vatStyles = `
.vat-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.vat-desc { font-size: 13px; color: var(--text-muted, #5F7D95); margin-top: 4px; max-width: 640px; }
.vat-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
.vat-info-item { background: var(--bg3, #F0F4F8); border-radius: 8px; padding: 10px 14px; }
.vat-info-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #5F7D95); text-transform: uppercase; letter-spacing: 0.4px; }
.vat-info-value { font-size: 14px; font-weight: 600; color: var(--text, #082432); margin-top: 2px; word-break: break-all; }
.vat-select-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.vat-select-label { font-size: 13px; font-weight: 600; color: var(--text, #082432); }
.vat-select { height: 38px; padding: 0 12px; font-size: 14px; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; background: var(--bg, #fff); color: var(--text, #082432); outline: none; min-width: 260px; }
.vat-select:focus { border-color: #1ceee0; box-shadow: 0 0 0 3px rgba(28,238,224,0.1); }
.vat-reload-btn { height: 38px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border, #D9D9D9); background: var(--bg, #fff); color: var(--text, #082432); font-size: 13px; font-weight: 600; cursor: pointer; }
.vat-reload-btn:hover { border-color: #1ceee0; }
.vat-widget-card { padding: 0 !important; overflow: hidden; }
.vat-iframe { width: 100%; height: 640px; border: none; display: block; }
.vat-hint { padding: 10px 16px; font-size: 12px; color: var(--text-muted, #5F7D95); background: var(--bg3, #F0F4F8); }
@media (max-width: 768px) {
  .vat-info-grid { grid-template-columns: 1fr; }
  .vat-iframe { height: 560px; }
}
`;
