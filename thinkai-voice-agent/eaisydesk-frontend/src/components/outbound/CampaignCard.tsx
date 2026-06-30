/**
 * CampaignCard — memo-wrapped campaign list card.
 * Extracted from OutboundPage to prevent the full list re-rendering
 * on filter changes, selection toggles, or other parent state updates.
 */
import { memo, useState, useEffect, useRef } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const channels = c.channels || (c.channel ? [c.channel] : ['email']);
  const clientCount = c.client_ids?.length || 0;

  const scheduledDate = getScheduledDate(c.ai_instructions);
  const displayDate = scheduledDate || c.created_at;
  const formattedDate = displayDate
    ? new Date(displayDate).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  // Determine status classification:
  let statusKey: 'tervezet' | 'aktiv' | 'utemezett' | 'lezart' = 'tervezet';
  let stripeClass = 'out-card--stripe-tervezet';
  let badgeLabel = 'TERVEZET';
  let badgeColor = '#186D98';

  if (c.status === 'Aktív') {
    statusKey = 'aktiv';
    stripeClass = 'out-card--stripe-aktiv';
    badgeLabel = 'AKTÍV';
    badgeColor = '#32B100';
  } else if (c.status === 'Ütemezett') {
    statusKey = 'utemezett';
    stripeClass = 'out-card--stripe-utemezett';
    badgeLabel = 'ÜTEMEZETT';
    badgeColor = '#C43284';
  } else if (c.status === 'Befejezett' || c.status === 'Megállítva') {
    statusKey = 'lezart';
    stripeClass = 'out-card--stripe-lezart';
    badgeLabel = 'LEZÁRT';
    badgeColor = '#9D9D9D';
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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Build menu items based on status
  const menuItems: { label: string; icon: string; handler: () => void; danger?: boolean }[] = [];

  if (statusKey === 'tervezet') {
    menuItems.push(
      { label: 'Indítás', icon: 'play', handler: () => onStart(c.id) },
      { label: 'Ütemezés', icon: 'calendar', handler: () => onSchedule(c.id) },
    );
  } else if (statusKey === 'utemezett') {
    menuItems.push(
      { label: 'Indítás most', icon: 'play', handler: () => onStart(c.id) },
      { label: 'Átütemezés', icon: 'calendar', handler: () => onSchedule(c.id) },
    );
  } else if (statusKey === 'aktiv') {
    menuItems.push(
      { label: 'Szüneteltetés', icon: 'pause', handler: () => onStop(c.id) },
      { label: 'Leállítás', icon: 'stop', handler: () => onClose(c.id) },
    );
  }
  // Törlés always last
  menuItems.push({ label: 'Törlés', icon: 'trash', handler: () => onDelete(c.id), danger: true });

  const renderIcon = (icon: string) => {
    switch (icon) {
      case 'play':
        return (
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        );
      case 'calendar':
        return (
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case 'pause':
        return (
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
          </svg>
        );
      case 'stop':
        return (
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        );
      case 'trash':
        return (
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      default: return null;
    }
  };

  return (
    <div
      className={`out-campaign-card ${stripeClass}${isSelected ? ' out-campaign-card--selected' : ''}`}
      onClick={() => onOpenDetail(c)}
    >
      {/* Top row: checkbox + badges + dots */}
      <div className="out-card-top">
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

        {/* Badges */}
        <div className="out-card-badges">
          <span className="out-card-status-badge" style={{ background: badgeColor, color: '#fff' }}>
            {badgeLabel}
          </span>
          {channels.map((ch) => (
            <span key={ch} className="out-card-channel-badge">
              {(CHANNEL_NAMES[ch] || ch).toUpperCase()}
            </span>
          ))}
        </div>

        {/* Three-dot menu */}
        <div className="out-card-dots-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            className="out-card-dots"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            title="Műveletek"
          >
            <svg fill="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="out-card-menu">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  className={`out-card-menu-item${item.danger ? ' out-card-menu-item--danger' : ''}`}
                  onClick={(e) => { e.stopPropagation(); item.handler(); setMenuOpen(false); }}
                >
                  {renderIcon(item.icon)}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="out-card-title">{c.name}</div>

      {/* Info boxes */}
      <div className="out-card-info-row">
        <div className="out-card-info-box">
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{clientCount} ügyfél</span>
        </div>
        <div className="out-card-info-box">
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{statusKey === 'tervezet' ? 'Nem ütemezett' : formattedDate}</span>
        </div>
      </div>

      {/* Footer meta */}
      <div className="out-card-footer">
        <div className={`out-card-avatar ${avatarUrl ? 'out-card-avatar--transparent' : 'out-card-avatar--gradient'}`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="member-avatar-img" />
          ) : (
            getInitials(creatorName)
          )}
        </div>
        <span className="out-card-footer-date">
          {c.created_at ? new Date(c.created_at).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      </div>
    </div>
  );
});

export default CampaignCard;
