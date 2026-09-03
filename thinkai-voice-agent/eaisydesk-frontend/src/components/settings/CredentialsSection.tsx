/**
 * CredentialsSection — per-tenant API credential management UI.
 * Rendered as a tab inside BeallitasokPage. Admin-only.
 *
 * Talks to: GET/PUT /admin/api/credentials, DELETE /admin/api/credentials/{key}
 *           GET /auth/facebook/start        — OAuth URL
 *           POST /auth/facebook/connect     — page selection (ha több oldal)
 *           DELETE /auth/facebook/disconnect — leválasztás
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import Spinner from '../ui/Spinner';

// ── Channel config (mirrors backend _CREDENTIAL_KEYS) ─────────────────────────
interface CredKeyDef {
  key: string;
  label: string;
  secret: boolean;
}

interface ChannelDef {
  id: string;
  label: string;
  icon: string; // SVG path d
  keys: CredKeyDef[];
  /** Ha true, akkor OAuth gomb jelenik meg manuális bevitel helyett */
  useOAuth?: boolean;
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'ai',
    label: 'AI / LLM (Gemini)',
    icon: 'M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3L12 3z',
    keys: [{ key: 'gemini_api_key', label: 'Gemini API kulcs', secret: true }],
  },
  {
    id: 'email',
    label: 'Email (IMAP + Brevo)',
    icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
    keys: [
      { key: 'imap_server', label: 'IMAP szerver', secret: false },
      { key: 'imap_port', label: 'IMAP port', secret: false },
      { key: 'imap_user', label: 'IMAP felhasználónév', secret: false },
      { key: 'imap_pass', label: 'IMAP jelszó', secret: true },
      { key: 'brevo_api_key', label: 'Brevo API kulcs', secret: true },
    ],
  },
  {
    id: 'messenger',
    label: 'Facebook Messenger',
    icon: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
    useOAuth: true,
    keys: [
      { key: 'meta_page_token', label: 'Facebook Page Token', secret: true },
      { key: 'meta_page_id', label: 'Facebook Page ID', secret: false },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z',
    useOAuth: true,
    keys: [
      { key: 'instagram_token', label: 'Instagram Token', secret: true },
      { key: 'instagram_user_id', label: 'Instagram User ID', secret: false },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z',
    keys: [
      { key: 'whatsapp_token', label: 'WhatsApp Token', secret: true },
      { key: 'whatsapp_phone_id', label: 'WhatsApp Phone ID', secret: false },
    ],
  },
];

// OAuth-ot használó channel ID-k (Messenger + Instagram egyszerre kezelve)
const OAUTH_CHANNEL_IDS = new Set(['messenger', 'instagram']);

interface CredStatus {
  set: boolean;
  masked: string | null;
  has_fallback: boolean;
  secret: boolean;
}

interface FbPage {
  id: string;
  name: string;
}

export default function CredentialsSection() {
  const { confirm, ConfirmDialog } = useConfirm();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credStatus, setCredStatus] = useState<Record<string, CredStatus>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // OAuth state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Page selection modal (ha a usernek több FB oldala van)
  const [pageSelectModal, setPageSelectModal] = useState<{ token: string; pages: FbPage[] } | null>(null);
  const [pageSelectSaving, setPageSelectSaving] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/api/credentials');
      if (res.ok) {
        const data = await res.json();
        const status: Record<string, CredStatus> = {};
        const values: Record<string, string> = {};
        for (const ch of Object.values<Record<string, unknown>>(data.channels || {})) {
          const creds = ch.credentials as Record<string, CredStatus> | undefined;
          if (!creds) continue;
          for (const [key, meta] of Object.entries(creds)) {
            status[key] = meta;
            if (!meta.secret && meta.set && meta.masked) {
              values[key] = meta.masked;
            }
          }
        }
        setCredStatus(status);
        setFormValues(values);
        setDirtyKeys(new Set());
      }
    } catch {
      showToast('Hiba a hitelesítő adatok betöltésekor', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── URL param kezelés (OAuth callback visszatérés után) ───────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const meta = params.get('meta');
    const selectToken = params.get('select_token');

    if (meta === 'success') {
      showToast('Facebook és Instagram sikeresen csatlakoztatva! 🎉', 'success');
      load();
      // Tisztítjuk az URL-t
      window.history.replaceState({}, '', location.pathname + '?tab=integrations');
    } else if (meta === 'error') {
      const reason = params.get('reason') || 'ismeretlen hiba';
      showToast(`Csatlakoztatás sikertelen: ${reason}`, 'error');
      window.history.replaceState({}, '', location.pathname + '?tab=integrations');
    } else if (meta === 'select_page' && selectToken) {
      // Több FB oldal — be kell tölteni a listát
      loadPages(selectToken);
      window.history.replaceState({}, '', location.pathname + '?tab=integrations');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPages = async (selectToken: string) => {
    try {
      const res = await authFetch(`/auth/facebook/pages?select_token=${selectToken}`);
      if (res.ok) {
        const data = await res.json();
        setPageSelectModal({ token: selectToken, pages: data.pages || [] });
      } else {
        showToast('Nem sikerült betölteni a Facebook oldalakat', 'error');
      }
    } catch {
      showToast('Hiba a Facebook oldalak betöltésekor', 'error');
    }
  };

  // ── OAuth indítás ─────────────────────────────────────────────────────────
  const handleConnectFacebook = async () => {
    setOauthLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const res = await authFetch(`/auth/facebook/start?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        // Átirányítás a Meta OAuth oldalra
        window.location.href = data.url;
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || 'Nem sikerült elindítani a csatlakoztatást', 'error');
      }
    } catch {
      showToast('Hiba a csatlakoztatás indításakor', 'error');
    }
    setOauthLoading(false);
  };

  // ── Leválasztás ───────────────────────────────────────────────────────────
  const handleDisconnectFacebook = async () => {
    const ok = await confirm(
      'Biztosan leválasztod a Facebook és Instagram fiókot? Az automatizációk leállnak.',
      { title: 'Facebook / Instagram leválasztása', danger: true },
    );
    if (!ok) return;
    setDisconnecting(true);
    try {
      const res = await authFetch('/auth/facebook/disconnect', { method: 'DELETE' });
      if (res.ok) {
        showToast('Facebook és Instagram leválasztva.', 'success');
        await load();
      } else {
        showToast('Hiba a leválasztásnál', 'error');
      }
    } catch {
      showToast('Hiba a leválasztásnál', 'error');
    }
    setDisconnecting(false);
  };

  // ── Page selection mentés ─────────────────────────────────────────────────
  const handlePageSelect = async (pageId: string) => {
    if (!pageSelectModal) return;
    setPageSelectSaving(true);
    try {
      const res = await authFetch('/auth/facebook/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ select_token: pageSelectModal.token, page_id: pageId }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Sikeresen csatlakoztatva! 🎉', 'success');
        setPageSelectModal(null);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || 'Hiba a csatlakoztatásnál', 'error');
      }
    } catch {
      showToast('Hiba a csatlakoztatásnál', 'error');
    }
    setPageSelectSaving(false);
  };

  // ── Manuális mezők ────────────────────────────────────────────────────────
  const handleFieldChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setDirtyKeys(prev => new Set(prev).add(key));
  };

  const handleClear = async (key: string) => {
    const ok = await confirm(
      'Biztosan törlöd ezt a hitelesítő adatot? A globális beállítás lép érvénybe (ha van).',
      { title: 'Hitelesítő adat törlése', danger: true },
    );
    if (!ok) return;
    setFormValues(prev => ({ ...prev, [key]: '' }));
    setDirtyKeys(prev => new Set(prev).add(key));
    showToast('A változás mentés után lép életbe.', 'info');
  };

  const handleSave = async () => {
    if (dirtyKeys.size === 0) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    dirtyKeys.forEach(k => { payload[k] = formValues[k] || ''; });
    try {
      const res = await authFetch('/admin/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: payload }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.errors?.length) {
          showToast(`${data.errors.length} hiba történt a mentés során`, 'error');
        } else {
          showToast('Hitelesítő adatok elmentve!', 'success');
        }
        await load();
      } else {
        showToast(data.detail || 'Hiba a mentésnél', 'error');
      }
    } catch {
      showToast('Hiba a mentésnél', 'error');
    }
    setSaving(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** Igaz, ha a Facebook / Instagram össze van kötve (van page token) */
  const isMetaConnected = !!(credStatus['meta_page_token']?.set || credStatus['meta_page_token']?.has_fallback);
  const metaPageId      = credStatus['meta_page_id']?.masked || null;
  const igUserId        = credStatus['instagram_user_id']?.masked || null;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="beallitasok-card" style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const dirtyCount = dirtyKeys.size;

  return (
    <>
      <ConfirmDialog />
      <style>{credStyles}</style>

      {/* Page selection modal */}
      {pageSelectModal && (
        <div className="cred-modal-overlay">
          <div className="cred-modal">
            <div className="cred-modal-title">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
              Melyik Facebook oldalt csatlakoztatod?
            </div>
            <p className="cred-modal-desc">
              A fiókodhoz több Facebook oldal is tartozik. Válaszd ki, melyiket szeretnéd csatlakoztatni az eaisyDesk-hez.
            </p>
            <div className="cred-modal-pages">
              {pageSelectModal.pages.map(page => (
                <button
                  key={page.id}
                  className="cred-page-btn"
                  onClick={() => handlePageSelect(page.id)}
                  disabled={pageSelectSaving}
                >
                  <span className="cred-page-icon">📄</span>
                  <span className="cred-page-name">{page.name}</span>
                  <span className="cred-page-id">#{page.id}</span>
                  {pageSelectSaving && <Spinner />}
                </button>
              ))}
            </div>
            <button
              className="cred-modal-cancel"
              onClick={() => setPageSelectModal(null)}
              disabled={pageSelectSaving}
            >
              Mégse
            </button>
          </div>
        </div>
      )}

      {/* Header card with save button */}
      <div className="beallitasok-card">
        <div className="cred-header">
          <div>
            <div className="beal-subtitle-16">Hitelesítő adatok</div>
            <div className="cred-desc">
              API kulcsok és integrációk kezelése. A titkos adatok titkosítva vannak tárolva.
            </div>
          </div>
          <button
            className="beallitasok-save-btn"
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
          >
            {saving ? 'Mentés...' : dirtyCount > 0 ? `Mentés (${dirtyCount})` : 'Mentés'}
          </button>
        </div>
      </div>

      {/* Channel cards */}
      {CHANNELS.map(ch => {
        const isOAuthChannel = OAUTH_CHANNEL_IDS.has(ch.id);

        // Messenger és Instagram card-ot egyetlen OAuth card-ként jelenítjük meg
        // (az Instagram után ne legyen külön Instagram card)
        if (ch.id === 'instagram') return null;

        return (
          <div key={ch.id} className="beallitasok-card cred-channel-card">
            <div className="cred-channel-header">
              <div className="cred-channel-icon">
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16">
                  <path d={ch.icon} />
                </svg>
              </div>
              <div className="cred-channel-title">
                {ch.id === 'messenger' ? 'Facebook & Instagram' : ch.label}
              </div>
            </div>

            {/* OAuth csatlakoztatás (Messenger = FB+IG együtt) */}
            {isOAuthChannel ? (
              <div className="cred-oauth-section">
                {isMetaConnected ? (
                  /* ── Csatlakoztatva állapot ─────────────────────────── */
                  <div className="cred-connected-box">
                    <div className="cred-connected-status">
                      <span className="cred-connected-dot" />
                      <span className="cred-connected-label">Csatlakoztatva</span>
                    </div>
                    <div className="cred-connected-details">
                      {metaPageId && (
                        <div className="cred-connected-item">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                          </svg>
                          Facebook Page ID: <strong>{metaPageId}</strong>
                        </div>
                      )}
                      {igUserId && (
                        <div className="cred-connected-item">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                            <circle cx="12" cy="12" r="4"/>
                            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                          </svg>
                          Instagram ID: <strong>{igUserId}</strong>
                        </div>
                      )}
                    </div>
                    <div className="cred-oauth-actions">
                      <button
                        className="cred-reconnect-btn"
                        onClick={handleConnectFacebook}
                        disabled={oauthLoading}
                      >
                        {oauthLoading ? <Spinner /> : '🔄 Újracsatlakoztatás'}
                      </button>
                      <button
                        className="cred-disconnect-btn"
                        onClick={handleDisconnectFacebook}
                        disabled={disconnecting}
                      >
                        {disconnecting ? <Spinner /> : 'Leválasztás'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Nincs csatlakoztatva állapot ───────────────────── */
                  <div className="cred-not-connected-box">
                    <div className="cred-not-connected-text">
                      <div className="cred-not-connected-title">Nincs csatlakoztatva</div>
                      <div className="cred-not-connected-desc">
                        Csatlakoztasd a Facebook oldalad és az ahhoz kapcsolt Instagram Business fiókodat.
                        Az engedély permanent — nem kell 60 naponta megismételni.
                      </div>
                    </div>
                    <button
                      className="cred-connect-btn"
                      onClick={handleConnectFacebook}
                      disabled={oauthLoading}
                    >
                      {oauthLoading ? (
                        <><Spinner /> Átirányítás...</>
                      ) : (
                        <>
                          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                          </svg>
                          Csatlakoztatás Facebook & Instagram-mal
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Manuális mezők (nem-OAuth csatornákhoz) ──────────── */
              <div className="cred-fields">
                {ch.keys.map(kd => {
                  const status = credStatus[kd.key] || { set: false, masked: null, has_fallback: false, secret: kd.secret };
                  const isDirty = dirtyKeys.has(kd.key);
                  const value = formValues[kd.key] || '';
                  const showSecret = showSecrets[kd.key];

                  return (
                    <div key={kd.key} className="cred-field">
                      <label className="cred-label">{kd.label}</label>
                      <div className="cred-input-row">
                        <input
                          className="cred-input"
                          type={kd.secret && !showSecret ? 'password' : 'text'}
                          value={value}
                          onChange={e => handleFieldChange(kd.key, e.target.value)}
                          placeholder={kd.secret && status.set ? 'Új érték megadása...' : ''}
                          autoComplete="new-password"
                        />
                        {kd.secret && (
                          <button
                            className="cred-icon-btn"
                            type="button"
                            onClick={() => setShowSecrets(prev => ({ ...prev, [kd.key]: !prev[kd.key] }))}
                            title={showSecret ? 'Elrejtés' : 'Megjelenítés'}
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16">
                              {showSecret ? (
                                <>
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </>
                              ) : (
                                <>
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </>
                              )}
                            </svg>
                          </button>
                        )}
                        {status.set && (
                          <button
                            className="cred-icon-btn cred-icon-btn--danger"
                            type="button"
                            onClick={() => handleClear(kd.key)}
                            title="Törlés"
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <div className="cred-status">
                        {status.set ? (
                          <span className="cred-badge cred-badge-set">
                            ✓ Beállítva{status.masked ? ` (${status.masked})` : ''}
                          </span>
                        ) : status.has_fallback ? (
                          <span className="cred-badge cred-badge-fallback">Globális beállítás aktív</span>
                        ) : (
                          <span className="cred-badge cred-badge-empty">Nincs beállítva</span>
                        )}
                        {isDirty && <span className="cred-badge cred-badge-dirty">● Módosítva</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Scoped styles (cred- prefix to avoid collisions) ─────────────────────────
const credStyles = `
.cred-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.cred-desc { font-size: 13px; color: var(--text-muted, #5F7D95); margin-top: 4px; }
.cred-channel-card { margin-top: 16px; }
.cred-channel-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.cred-channel-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--bg3, #F0F4F8); display: flex; align-items: center; justify-content: center; color: var(--text-muted, #5F7D95); flex-shrink: 0; }
.cred-channel-title { font-size: 16px; font-weight: 700; color: var(--text, #082432); }
.cred-fields { display: flex; flex-direction: column; gap: 16px; }
.cred-field { display: flex; flex-direction: column; gap: 6px; }
.cred-label { font-size: 12px; font-weight: 600; color: var(--text-muted, #5F7D95); }
.cred-input-row { display: flex; align-items: center; gap: 8px; }
.cred-input { flex: 1; height: 40px; padding: 0 14px; font-size: 14px; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; background: var(--bg, #fff); color: var(--text, #082432); outline: none; transition: border-color .2s, box-shadow .2s; font-family: inherit; box-sizing: border-box; }
.cred-input:focus { border-color: #1ceee0; box-shadow: 0 0 0 3px rgba(28,238,224,0.1); }
.cred-icon-btn { flex-shrink: 0; width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border, #D9D9D9); background: var(--bg, #fff); color: var(--text-muted, #5F7D95); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
.cred-icon-btn:hover { color: var(--text, #082432); border-color: #1ceee0; }
.cred-icon-btn--danger:hover { color: #ef4444; border-color: #ef4444; }
.cred-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cred-badge { font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 4px; }
.cred-badge-set { background: rgba(28,238,224,0.12); color: #0a8b82; }
.cred-badge-fallback { background: rgba(59,130,246,0.1); color: #2563eb; }
.cred-badge-empty { color: var(--text-muted, #9ca3af); }
.cred-badge-dirty { background: rgba(245,158,11,0.12); color: #d97706; }

/* ── OAuth section ── */
.cred-oauth-section { width: 100%; }
.cred-not-connected-box { display: flex; flex-direction: column; gap: 16px; padding: 20px; background: var(--bg3, #F7FAFC); border-radius: 12px; border: 1px dashed var(--border, #D9D9D9); }
.cred-not-connected-title { font-size: 15px; font-weight: 600; color: var(--text, #082432); margin-bottom: 4px; }
.cred-not-connected-desc { font-size: 13px; color: var(--text-muted, #5F7D95); line-height: 1.5; }
.cred-connect-btn { display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: #1877F2; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all .2s; width: fit-content; }
.cred-connect-btn:hover:not(:disabled) { background: #1464d8; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(24,119,242,0.35); }
.cred-connect-btn:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

/* ── Connected state ── */
.cred-connected-box { display: flex; flex-direction: column; gap: 14px; padding: 20px; background: rgba(28,238,224,0.06); border-radius: 12px; border: 1px solid rgba(28,238,224,0.3); }
.cred-connected-status { display: flex; align-items: center; gap: 8px; }
.cred-connected-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.2); flex-shrink: 0; }
.cred-connected-label { font-size: 14px; font-weight: 600; color: #15803d; }
.cred-connected-details { display: flex; flex-direction: column; gap: 6px; }
.cred-connected-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted, #5F7D95); }
.cred-connected-item strong { color: var(--text, #082432); }
.cred-oauth-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cred-reconnect-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: transparent; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; font-size: 13px; color: var(--text-muted, #5F7D95); cursor: pointer; transition: all .2s; }
.cred-reconnect-btn:hover:not(:disabled) { border-color: #1877F2; color: #1877F2; }
.cred-disconnect-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: transparent; border: 1px solid #fca5a5; border-radius: 8px; font-size: 13px; color: #ef4444; cursor: pointer; transition: all .2s; }
.cred-disconnect-btn:hover:not(:disabled) { background: #fef2f2; }

/* ── Page selection modal ── */
.cred-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px); }
.cred-modal { background: var(--bg, #fff); border-radius: 16px; padding: 28px; max-width: 440px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.cred-modal-title { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; color: var(--text, #082432); margin-bottom: 10px; }
.cred-modal-desc { font-size: 13px; color: var(--text-muted, #5F7D95); margin-bottom: 20px; line-height: 1.5; }
.cred-modal-pages { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.cred-page-btn { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: var(--bg3, #F7FAFC); border: 1px solid var(--border, #D9D9D9); border-radius: 10px; cursor: pointer; transition: all .2s; text-align: left; }
.cred-page-btn:hover:not(:disabled) { border-color: #1877F2; background: rgba(24,119,242,0.05); }
.cred-page-icon { font-size: 20px; flex-shrink: 0; }
.cred-page-name { flex: 1; font-size: 14px; font-weight: 600; color: var(--text, #082432); }
.cred-page-id { font-size: 12px; color: var(--text-muted, #9ca3af); }
.cred-modal-cancel { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; font-size: 14px; color: var(--text-muted, #5F7D95); cursor: pointer; transition: all .2s; }
.cred-modal-cancel:hover { background: var(--bg3, #F0F4F8); }
`;
