/**
 * CampaignDetailPanel — Lazy-mounted campaign detail overlay.
 * Extracted from OutboundPage to keep the parent component lean.
 * Only rendered when a campaign is selected (showDetail !== null).
 */
import { useState, useEffect } from 'react';
import { authFetch } from '../../api/client';

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
  'Vázlat':     { bg: 'rgba(107,139,153,0.1)', color: 'var(--text-muted)', label: 'Tervezet' },
  'Aktív':      { bg: 'rgba(34,197,94,0.1)',    color: '#22c55e',           label: 'Aktív' },
  'Befejezett': { bg: 'rgba(28,238,224,0.1)',   color: 'var(--accent)',     label: 'Elküldött' },
  'Megállítva': { bg: 'rgba(245,158,11,0.1)',   color: '#f59e0b',          label: 'Megállítva' },
  'Ütemezett':  { bg: 'rgba(139,92,246,0.1)',   color: '#8b5cf6',          label: 'Ütemezett' },
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

  // Parse email content — strip SCHED: and MODE: prefixes
  let emailContent = c.ai_instructions || c.content || c.body_html || '';
  let changed = true;
  while (changed) {
    changed = false;
    if (emailContent.startsWith('SCHED:')) {
      const pipeIdx = emailContent.indexOf('|');
      if (pipeIdx >= 0) { emailContent = emailContent.substring(pipeIdx + 1); changed = true; }
    }
    if (emailContent.startsWith('MODE:')) {
      const colonIdx = emailContent.indexOf(':', 5);
      if (colonIdx >= 0) { emailContent = emailContent.substring(colonIdx + 1); changed = true; }
    }
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
  const hasSentData = delivered > 0 || isFinished;

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
        </div>

        {/* ── Body ── */}
        <div className="cpv-body">

          {/* Progress — only if campaign has been started */}
          {(isActive || hasSentData) && (
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

          {/* Content preview */}
          {emailContent && (
            <div className="cpv-section">
              <div className="cpv-section-label">Tartalom</div>
              <div className="cpv-content-preview" dangerouslySetInnerHTML={{ __html: displayHtml }} />
            </div>
          )}

          {/* Recipients */}
          <div className="cpv-section">
            <div className="cpv-section-label">Címzettek ({clientCount})</div>
            <CampaignRecipients campaignId={c.id} />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="cpv-footer">
          {(isDraft || c.status === 'Megállítva') && (
            <>
              <button className="cpv-btn cpv-btn-primary" onClick={() => { onStart(c.id); onClose(); }}>
                Kampány indítása
              </button>
              <button className="cpv-btn cpv-btn-ghost cpv-btn-schedule" onClick={() => { onSchedule(c.id); onClose(); }}>
                Ütemezés
              </button>
            </>
          )}
          <button className="cpv-btn cpv-btn-ghost cpv-btn-danger" onClick={() => { onDelete(c.id); onClose(); }}>
            Törlés
          </button>
          <button className="cpv-btn cpv-btn-ghost cpv-btn-close-right" onClick={onClose}>Bezárás</button>
        </div>
      </div>
    </div>
  );
}

// ── Recipients sub-component ──────────────────────────────────────────────────
interface ClientInfo { name: string; email: string; phone?: string; status: string; }
const AVATAR_COLORS = ['#1ceee0','#2563eb','#0891b2','#059669','#d97706','#dc2626','#6366f1','#8b5cf6'];

function CampaignRecipients({ campaignId }: { campaignId: number }) {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/admin/api/campaigns/${campaignId}/clients`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setClients(data.clients || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  if (loading) return <div className="cpv-recipient-msg">Betöltés...</div>;
  if (!clients.length) return <div className="cpv-recipient-msg">Nincsenek címzettek</div>;

  return (
    <div className="flex-col gap-8">
      {clients.map((cl, i) => {
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
