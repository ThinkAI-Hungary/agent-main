/**
 * CampaignDetailPanel — Lazy-mounted campaign detail overlay.
 * Extracted from OutboundPage to keep the parent component lean.
 * Only rendered when a campaign is selected (showDetail !== null).
 */
import { useMemo, useState } from 'react';
import { useClients } from '../../hooks/useClients';
import { parseCustomData, bestClientName } from '../../helpers/clientResolvers';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';

interface Campaign {
  id: number;
  name: string;
  status: string;
  channels: string[];
  channel?: string;
  client_ids: number[];
  created_at: string;
  processed_count?: number;
  total_count?: number;
  content?: string;
  ai_instructions?: string;
  body_html?: string;
  subject?: string;
  email_subject?: string;
}

interface StatusInfo { bg: string; color: string; label: string; }

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon',
  messenger: 'Messenger', instagram: 'Instagram',
};

const STATUS_COLORS: Record<string, StatusInfo> = {
  'Vázlat':     { bg: '#186D98',                color: '#fff',              label: 'Tervezet' },
  'Aktív':      { bg: 'rgba(34,197,94,0.1)',    color: '#32B100',           label: 'Aktív' },
  'Befejezett': { bg: '#9D9D9D',                color: '#fff',              label: 'Lezárt' },
  'Megállítva': { bg: '#9D9D9D',                color: '#fff',              label: 'Lezárt' },
  'Ütemezett':  { bg: 'rgba(139,92,246,0.1)',   color: '#C43284',           label: 'Ütemezett' },
};

interface Props {
  campaign: Campaign;
  onClose: () => void;
  onStart: (id: number) => void;
  onDelete: (id: number) => void;
  onSchedule: (id: number) => void;
}

export default function CampaignDetailPanel({ campaign: c, onClose, onStart, onDelete, onSchedule }: Props) {
  const channels = c.channels || (c.channel ? [c.channel] : ['email']);
  const clientCount = c.client_ids?.length || 0;
  const delivered = c.processed_count || 0;
  const total = c.total_count || clientCount || 1;
  const progressPct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const sc = STATUS_COLORS[c.status] || STATUS_COLORS['Vázlat'];

  // Parse email content — strip SCHED:, SUBJECT:, MODE: prefixes; SUBJECT értékét is kinyerjük
  let emailContent = c.ai_instructions || c.content || c.body_html || '';
  let parsedSubject = '';
  let changed = true;
  while (changed) {
    changed = false;
    if (emailContent.startsWith('SCHED:')) {
      const pipeIdx = emailContent.indexOf('|');
      if (pipeIdx >= 0) { emailContent = emailContent.substring(pipeIdx + 1); changed = true; }
    }
    if (emailContent.startsWith('SUBJECT:')) {
      const pipeIdx = emailContent.indexOf('|');
      if (pipeIdx >= 0) {
        parsedSubject = emailContent.substring(8, pipeIdx).trim();
        emailContent = emailContent.substring(pipeIdx + 1); changed = true;
      }
    }
    if (emailContent.startsWith('MODE:')) {
      const colonIdx = emailContent.indexOf(':', 5);
      if (colonIdx >= 0) { emailContent = emailContent.substring(colonIdx + 1); changed = true; }
    }
  }

  // EAISY-241 §1.6.2: szerkesztő mód állapota (csak Tervezet/Ütemezett/Megállítva)
  const canEdit = c.status === 'Vázlat' || c.status === 'Ütemezett' || c.status === 'Tervezet' || c.status === 'Megállítva';
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editContent, setEditContent] = useState(emailContent);
  const [editSubject, setEditSubject] = useState(parsedSubject || c.subject || c.email_subject || '');
  const [savingContent, setSavingContent] = useState(false);

  async function saveContent() {
    setSavingContent(true);
    try {
      const res = await authFetch(`/admin/api/campaigns/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_instructions: editContent, subject: editSubject }),
      });
      if (res.ok) { showToast('Kampányüzenet mentve'); setIsEditingContent(false); onClose(); }
      else { const d = await res.json().catch(() => ({})); showToast(d.detail || 'Hiba a mentéskor', 'error'); }
    } catch { showToast('Hiba', 'error'); }
    finally { setSavingContent(false); }
  }
  emailContent = emailContent.trim();

  let displayHtml = emailContent.includes('<') ? emailContent : emailContent.replace(/\n/g, '<br>');
  // Add target="_blank" so links open in a new tab instead of navigating the SPA
  displayHtml = displayHtml.replace(/<a\b([^>]*)>/gi, (match, p1) => {
    if (!p1.includes('target=')) return `<a target="_blank" rel="noopener noreferrer"${p1}>`;
    return match;
  });

  const createdDate = c.created_at ? new Date(c.created_at) : null;
  const isDraft = c.status === 'Vázlat';
  const isActive = c.status === 'Aktív';
  const isFinished = c.status === 'Befejezett';
  const isLezart = isFinished || c.status === 'Megállítva';
  const isUtemezett = c.status === 'Ütemezett';
  const hasSentData = delivered > 0 || isFinished;

  // Parse scheduled date from ai_instructions (SCHED:<date>|...)
  const scheduledDateRaw = (() => {
    const ai = c.ai_instructions;
    if (!ai || !ai.startsWith('SCHED:')) return null;
    const pipeIdx = ai.indexOf('|');
    if (pipeIdx < 0) return null;
    return ai.substring(6, pipeIdx);
  })();
  const scheduledDate = scheduledDateRaw ? new Date(scheduledDateRaw) : null;

  return (
    <div className="cpv-overlay" onClick={onClose}>
      <div className="cpv-card" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="cpv-header">
          <button className="cpv-close" onClick={onClose} aria-label="Bezárás">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="cpv-name">{c.name}</h2>
          <div className="cpv-header-meta">
            <span className="cpv-pill" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
            {channels.map(ch => (
              <span key={ch} className="cpv-pill cpv-pill-channel">{CHANNEL_LABELS[ch] || ch}</span>
            ))}
            <span className="cpv-header-dot" />
            <span className="cpv-header-info">{createdDate ? createdDate.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
            <span className="cpv-header-dot" />
            <span className="cpv-header-info">{clientCount} címzett</span>
          </div>
          {isLezart && createdDate && (
            <div className="cpv-launch-date">
              <span className="cpv-launch-date-label">Indítás dátuma</span>
              <span className="cpv-launch-date-value">{createdDate.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
          {isUtemezett && scheduledDate && (
            <div className="cpv-launch-date">
              <span className="cpv-launch-date-label">Indítás dátuma</span>
              <span className="cpv-launch-date-value">{scheduledDate.toLocaleString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="cpv-body">

          {/* Progress — only if campaign is actively sending */}
          {isActive && (
            <div className="cpv-progress-section">
              <div className="cpv-progress-row">
                <span className="cpv-progress-label">Küldés folyamat</span>
                <span className="cpv-progress-value">{delivered} / {total} <span className="cpv-progress-pct">({progressPct}%)</span></span>
              </div>
              <div className="cpv-progress-track">
                <div className="cpv-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Stats — only show if there's actual data */}
          {hasSentData && (
            <div className="cpv-stats-row">
              <div className="cpv-stat-inline">
                <span className="cpv-stat-val cpv-stat-val--teal">{delivered}</span>
                <span className="cpv-stat-lbl">Kézbesítve</span>
              </div>
              <div className="cpv-stat-divider" />
              <div className="cpv-stat-inline">
                <span className="cpv-stat-val cpv-stat-val--green">0</span>
                <span className="cpv-stat-lbl">Megnyitás</span>
              </div>
              <div className="cpv-stat-divider" />
              <div className="cpv-stat-inline">
                <span className="cpv-stat-val cpv-stat-val--blue">0</span>
                <span className="cpv-stat-lbl">Kattintás</span>
              </div>
              <div className="cpv-stat-divider" />
              <div className="cpv-stat-inline">
                <span className="cpv-stat-val cpv-stat-val--red">0</span>
                <span className="cpv-stat-lbl">Visszapattant</span>
              </div>
            </div>
          )}

          {/* Draft state — contextual message */}
          {isDraft && !hasSentData && (
            <div className="cpv-draft-notice">
              <div className="cpv-draft-notice-text">
                Ez a kampány még nem lett elindítva. Indítás után a rendszer sorban elküldi az üzeneteket a címzetteknek.
              </div>
            </div>
          )}

          {/* Content preview / editor (EAISY-241 §1.6.2: szerkeszthető Tervezet/Ütemezett/Megállítva) */}
          <div className="cpv-section">
            <div className="cpv-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Kampányüzenet</span>
              {canEdit && !isEditingContent && (
                <button className="cpv-edit-toggle" onClick={() => setIsEditingContent(true)}>✎ Szerkesztés</button>
              )}
            </div>
            {isEditingContent && canEdit ? (
              <div className="cpv-edit-wrap">
                <input
                  className="cpv-edit-subject"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  placeholder="Tárgy"
                />
                <textarea
                  className="cpv-edit-textarea"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={10}
                />
                <div className="cpv-edit-actions">
                  <button className="cpv-btn-schedule" onClick={() => { setIsEditingContent(false); setEditContent(emailContent); }} disabled={savingContent}>
                    Mégse
                  </button>
                  <button className="cpv-btn cpv-btn-primary" onClick={saveContent} disabled={savingContent || !editContent.trim()}>
                    {savingContent ? 'Mentés...' : 'Mentés'}
                  </button>
                </div>
              </div>
            ) : (
              emailContent ? (
                <div className="cpv-content-preview" dangerouslySetInnerHTML={{ __html: displayHtml }} />
              ) : (
                <div className="cpv-empty">Nincs üzenet</div>
              )
            )}
          </div>

          {/* Recipients */}
          <div className="cpv-section">
            <div className="cpv-section-label">Címzettek ({clientCount})</div>
            <CampaignRecipients clientIds={c.client_ids || []} />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="cpv-footer">
          {/* EAISY-241 §1.6.4: törlés piros trash ikonként (minden státusznál) */}
          <button
            className="cpv-trash-btn"
            title="Kampány törlése"
            aria-label="Kampány törlése"
            onClick={() => { onDelete(c.id); onClose(); }}
          >
            <svg fill="none" stroke="#e11d48" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Draft: Ütemezés (schedule CTA) + Kampány indítása (primary) — right-aligned */}
          {isDraft && (
            <>
              <button className="cpv-btn-schedule cpv-btn-close-right" onClick={() => { onSchedule(c.id); onClose(); }}>
                Ütemezés
              </button>
              <button className="cpv-btn cpv-btn-primary" onClick={() => { onStart(c.id); onClose(); }}>
                Kampány indítása
              </button>
            </>
          )}

          {/* Megállítva: Kampány indítása + Ütemezés */}
          {c.status === 'Megállítva' && (
            <>
              <button className="cpv-btn cpv-btn-primary" onClick={() => { onStart(c.id); onClose(); }}>
                Kampány indítása
              </button>
              <button className="cpv-btn-schedule" onClick={() => { onSchedule(c.id); onClose(); }}>
                Ütemezés
              </button>
            </>
          )}

          {/* Ütemezett: Átütemezés right */}
          {isUtemezett && (
            <button className="cpv-btn-schedule cpv-btn-close-right" onClick={() => { onSchedule(c.id); onClose(); }}>
              Átütemezés
            </button>
          )}

          {/* Bezárás — only for Aktív (all others have dedicated right actions or no Bezárás) */}
          {isActive && (
            <button className="cpv-btn cpv-btn-ghost cpv-btn-close-right" onClick={onClose}>Bezárás</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipients sub-component — uses cached client data, no extra API call ─────
const AVATAR_COLORS = ['#1ceee0','#2563eb','#0891b2','#059669','#d97706','#dc2626','#6366f1','#8b5cf6'];

function CampaignRecipients({ clientIds }: { clientIds: number[] }) {
  const { clients: allClients } = useClients();

  const recipients = useMemo(() => {
    if (!clientIds.length || !allClients.length) return [];
    const idSet = new Set(clientIds.map(String));
    return allClients
      .filter(c => idSet.has(String(c.id)))
      .map(c => {
        const cd = parseCustomData(c.custom_data);
        return {
          name: bestClientName(c) || c.name || 'Névtelen',
          email: (cd?.email as string) || c.email || '',
          phone: (cd?.telefonszam as string) || (cd?.phone as string) || c.phone || '',
        };
      });
  }, [clientIds, allClients]);

  if (!recipients.length) return <div className="cpv-recipient-msg">Nincsenek címzettek</div>;

  return (
    <div className="cpv-recipients-list flex-col gap-8">
      {recipients.map((cl, i) => {
        const initials = (cl.name || 'N/A').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const clColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
        return (
          <div key={i} className="cpv-recipient">
            <div className="cpv-avatar" style={{ background: `${clColor}15`, color: clColor }}>{initials}</div>
            <div className="cpv-recipient-info">
              <div className="cpv-recipient-name">{cl.name}</div>
              <div className="cpv-recipient-sub">{cl.email || cl.phone || '—'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
