/**
 * CampaignCard — memo-wrapped campaign list card.
 * Extracted from OutboundPage to prevent the full list re-rendering
 * on filter changes, selection toggles, or other parent state updates.
 */
import { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
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
  ai_instructions?: string;
  created_by?: string;
}

interface StatusInfo { bg: string; color: string; label: string; }

const CHANNEL_NAMES: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon',
  messenger: 'Messenger', instagram: 'Instagram',
};

interface CampaignCardProps {
  campaign: Campaign;
  statusInfo: StatusInfo;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onOpenDetail: (campaign: Campaign) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onClose: (id: number) => void;
  onDelete: (id: number) => void;
  onSchedule: (id: number) => void;
}

function getScheduledDate(aiInstructions: string | undefined): string | null {
  if (!aiInstructions || !aiInstructions.startsWith('SCHED:')) return null;
  const pipeIdx = aiInstructions.indexOf('|');
  if (pipeIdx < 0) return null;
  return aiInstructions.substring(6, pipeIdx);
}

function getInitials(name: string): string {
  if (!name) return 'A';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

const CampaignCard = memo(function CampaignCard({
  campaign: c,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onStart,
  onStop,
  onClose,
  onDelete,
  onSchedule,
}: CampaignCardProps) {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const channels = c.channels || (c.channel ? [c.channel] : ['email']);
  const clientCount = c.client_ids?.length || 0;

  const scheduledDate = getScheduledDate(c.ai_instructions);
  const displayDate = scheduledDate || c.created_at;
  const formattedDate = displayDate
    ? new Date(displayDate).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  // Determine status classification:
  let statusKey: 'tervezet' | 'aktiv' | 'utemezett' | 'lezart' = 'tervezet';
  let borderClass = 'out-campaign-card--tervezet';
  let badgeLabel = 'Tervezet';
  let badgeColor = '#3b82f6';

  if (c.status === 'Aktív') {
    statusKey = 'aktiv';
    borderClass = 'out-campaign-card--aktiv';
    badgeLabel = 'Aktív';
    badgeColor = '#22c55e';
  } else if (c.status === 'Ütemezett') {
    statusKey = 'utemezett';
    borderClass = 'out-campaign-card--utemezett';
    badgeLabel = 'Ütemezett';
    badgeColor = '#1ceee0'; // Consistent cyan theme color
  } else if (c.status === 'Befejezett' || c.status === 'Megállítva') {
    statusKey = 'lezart';
    borderClass = 'out-campaign-card--lezart';
    badgeLabel = 'Lezárt';
    badgeColor = '#6b7280';
  }

  const creatorName = c.created_by || user?.fullName || 'Admin';
  const creatorUsername = c.created_by || user?.username || 'admin';

  useEffect(() => {
    let cancelled = false;
    authFetch(`/admin/api/users/${creatorUsername}/avatar`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then(data => {
        if (!cancelled && data.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [creatorUsername]);

  return (
    <div
      className={`out-campaign-card out-campaign-card--clickable ${borderClass}${isSelected ? ' out-campaign-card--selected' : ''}`}
      onClick={() => onOpenDetail(c)}
    >
      {/* Checkbox */}
      <div className="out-card-checkbox-wrap" onClick={e => { e.stopPropagation(); onToggleSelect(c.id); }}>
        <div className={`out-card-checkbox${isSelected ? ' out-card-checkbox--selected' : ''}`}>
          {isSelected && (
            <svg fill="none" stroke="#082432" strokeWidth="3" viewBox="0 0 24 24" className="out-card-checkmark">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      {/* Header Row: Left-aligned creator avatar & name, right-aligned badges */}
      <div className="flex-between align-center mb-12" style={{ paddingRight: '28px' }}>
        <div className="flex-row align-center gap-6">
          <div className={`out-card-avatar ${avatarUrl ? 'out-card-avatar--transparent' : 'out-card-avatar--gradient'}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="member-avatar-img" />
            ) : (
              getInitials(creatorName)
            )}
          </div>
          <div className="out-card-user-date">
            <span className="out-card-user">{creatorName}</span>
            <span className="out-card-date-separator">•</span>
            <span className="out-card-created-at">
              {c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '—'}
            </span>
          </div>
        </div>

        <div className="flex-row align-center gap-6">
          {channels.map((ch) => (
            <span key={ch} className="out-channel-badge">
              {CHANNEL_NAMES[ch] || ch}
            </span>
          ))}
          <span className="out-status-badge" style={{ background: `${badgeColor}15`, color: badgeColor, border: `1px solid ${badgeColor}35` }}>
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* Central Bolded Title */}
      <div className="out-card-name-centered">
        {c.name}
      </div>

      {/* Split Layout Cards */}
      <div className="out-card-split-cards">
        {/* Left card: Multiple people icon + customer count */}
        <div className="out-card-split-box">
          <div className="out-card-split-icon">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="out-card-split-text-main">{clientCount} ügyfél</div>
          <div className="out-card-split-text-sub">kiválasztva</div>
        </div>

        {/* Right card: Calendar icon + scheduled text or date */}
        <div className="out-card-split-box">
          <div className="out-card-split-icon">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="out-card-split-text-main">
            {statusKey === 'tervezet' ? 'Nem ütemezett' : formattedDate}
          </div>
          <div className="out-card-split-text-sub">
            {statusKey === 'tervezet' ? 'ütemezés' : 'ütemezve'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-between align-center mt-16">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
          className="out-delete-btn"
          title="Törlés"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        <div className="flex-row gap-8">
          {statusKey === 'tervezet' && (
            <>
              <button
                className="btn btn-outline btn-outline-sm"
                onClick={(e) => { e.stopPropagation(); onSchedule(c.id); }}
              >
                Ütemezés
              </button>
              <button
                className="btn btn-primary btn-primary-sm"
                onClick={(e) => { e.stopPropagation(); onStart(c.id); }}
              >
                Indítás
              </button>
            </>
          )}

          {statusKey === 'aktiv' && (
            <>
              <button
                className="btn btn-outline btn-outline-sm"
                style={{ borderColor: 'rgba(107, 139, 153, 0.4)', color: 'var(--text-muted)' }}
                onClick={(e) => { e.stopPropagation(); onStop(c.id); }}
              >
                Szüneteltetés
              </button>
              <button
                className="btn btn-primary btn-primary-sm"
                onClick={(e) => { e.stopPropagation(); onClose(c.id); }}
              >
                Leállítás
              </button>
            </>
          )}

          {statusKey === 'lezart' && (
            <button
              className="btn btn-primary btn-primary-sm"
              onClick={(e) => { e.stopPropagation(); onOpenDetail(c); }}
            >
              Megtekintés
            </button>
          )}

          {statusKey === 'utemezett' && (
            <button
              className="btn btn-primary btn-primary-sm"
              style={{ background: '#1ceee0', color: '#082432', boxShadow: 'none' }}
              onClick={(e) => { e.stopPropagation(); onStart(c.id); }}
            >
              Indítás
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default CampaignCard;
