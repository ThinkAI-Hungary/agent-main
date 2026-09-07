/**
 * VoiceAgentTestSection — élő hangasszisztens teszt a Beállítások alatt.
 * CSAK a bejelentkezett admin SAJÁT tenantját teszteli (nincs tenant-választó —
 * minden admin egy konkrét cég adminja, tenant-átlátás nincs).
 * Beágyazott voice widget (iframe → /widget?tenant=<saját-slug>).
 */
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';

interface OwnTenant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: string;
}

export default function VoiceAgentTestSection() {
  const [tenant, setTenant] = useState<OwnTenant | null>(null);
  const [agentName, setAgentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Saját tenant betöltése (a JWT tenant_id alapján — a backend csak ezt adja vissza)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/admin/api/tenants/me');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTenant(data.tenant || null);
        } else if (!cancelled) {
          showToast('Nem sikerült betölteni a tenant információt', 'error');
        }
      } catch {
        if (!cancelled) showToast('Nem sikerült betölteni a tenant információt', 'error');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Agent-név lekérése a token endpointból (a saját tenantunkhoz)
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
    if (tenant?.slug) fetchAgentInfo(tenant.slug);
  }, [tenant, reloadKey, fetchAgentInfo]);

  if (loading) {
    return (
      <div className="beallitasok-card" style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="beallitasok-card">
        <div className="vat-hint">Tenant információ nem elérhető.</div>
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
              Indítsd el a beszélgetést — ugyanazon a LiveKit agenten megy keresztül,
              mint az éles forgalom, a saját céged adataival (árlista, GYIK, szabályok).
            </div>
          </div>
        </div>

        <div className="vat-info-grid">
          <div className="vat-info-item">
            <div className="vat-info-label">Agent</div>
            <div className="vat-info-value">{agentName || '…'}</div>
          </div>
          <div className="vat-info-item">
            <div className="vat-info-label">Cég</div>
            <div className="vat-info-value">{tenant.name}</div>
          </div>
          <div className="vat-info-item">
            <div className="vat-info-label">Státusz</div>
            <div className="vat-info-value">
              {tenant.active ? '🟢 aktív' : '⚪ inaktív (a teszt így is működik)'}
            </div>
          </div>
        </div>

        <div className="vat-select-row">
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
          key={`${tenant.slug}-${reloadKey}`}
          src={`/widget?tenant=${encodeURIComponent(tenant.slug)}`}
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
.vat-select-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
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
