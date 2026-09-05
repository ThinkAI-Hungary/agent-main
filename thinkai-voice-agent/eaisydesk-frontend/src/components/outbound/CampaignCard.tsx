/**
 * CampaignCard – kampány kártya (UI Kit / mockup stílus)
 * Struktúra: cím + kebab · státusz badge · célzott ügyfelek · indítás/ütemezés ·
 * elválasztó · létrehozó avatar + név + létrehozva dátum.
 */
import { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authFetch } from '../../api/client';
import CampaignMenu, { campaignStatusDisplay, campaignStatusKey, getScheduledDate, fmtCreatedDate } from './CampaignMenu';

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

interface CampaignCardProps {
  campaign: Campaign;
  onOpenDetail: (campaign: Campaign) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onClose: (id: number) => void;
  onDelete: (id: number) => void;
  onSchedule: (id: number) => void;
}

function getInitials(name: string): string {
  if (!name) return 'A';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

const CampaignCard = memo(function CampaignCard({
  campaign: c,
  onOpenDetail,
  onStart,
  onStop,
  onClose,
  onDelete,
  onSchedule,
}: CampaignCardProps) {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
        if (!cancelled && data.avatar_url) setAvatarUrl(data.avatar_url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [creatorUsername]);

  const { label: statusLabel, cls: statusCls } = campaignStatusDisplay(c.status);
  const statusKey = campaignStatusKey(c.status);
  const clientCount = c.client_ids?.length || 0;
  const scheduledDate = getScheduledDate(c.ai_instructions);

  // Sor: indítás / ütemezés / küldés a státusz szerint
  let actionRow: React.ReactNode;
  if (statusKey === 'aktiv') {
    actionRow = <><span className="camp-ic"><svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></span><span>Indítás: <b>{fmtCreatedDate(scheduledDate || c.created_at)}</b></span></>;
  } else if (statusKey === 'utemezett') {
    actionRow = <><span className="camp-ic"><svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></span><span>Ütemezés: <b>{fmtCreatedDate(scheduledDate || c.created_at)}</b></span></>;
  } else if (statusKey === 'lezart') {
    actionRow = <><span className="camp-ic"><svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></span><span>Küldés: <b>{fmtCreatedDate(scheduledDate || c.created_at)}</b></span></>;
  } else {
    actionRow = <><span className="camp-ic"><svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></span><span>{scheduledDate ? <>Ütemezés: <b>{fmtCreatedDate(scheduledDate)}</b></> : <span className="camp-muted">nem ütemezett</span>}</span></>;
  }

  return (
    <div
      className="camp-card"
      onClick={() => onOpenDetail(c)}
    >
      {/* Cím + kebab */}
      <div className="camp-card-top">
        <div className="camp-card-title">{c.name}</div>
        <CampaignMenu
          statusKey={statusKey}
          onStart={() => onStart(c.id)}
          onStop={() => onStop(c.id)}
          onClose={() => onClose(c.id)}
          onDelete={() => onDelete(c.id)}
          onSchedule={() => onSchedule(c.id)}
        />
      </div>

      {/* Státusz badge */}
      <div>
        <span className={`cp-badge ${statusCls}`}><i className="cp-dot" />{statusLabel}</span>
      </div>

      {/* Célzott ügyfelek */}
      <div className="camp-row">
        <span className="camp-ic">
          <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </span>
        <span>
          {clientCount > 0
            ? <><b className="camp-num">{clientCount}</b> célzott ügyfél</>
            : <span className="camp-muted">még nincs célzott ügyfél</span>}
        </span>
      </div>

      {/* Indítás / ütemezés */}
      <div className="camp-row">{actionRow}</div>

      {/* Elválasztó + létrehozó lábléc */}
      <div className="camp-card-divider" />
      <div className="camp-card-creator">
        {avatarUrl ? (
          <img src={avatarUrl} alt={creatorName} className="camp-creator-ava" onError={() => setAvatarUrl(null)} />
        ) : (
          <span className="camp-creator-ava">{getInitials(creatorName)}</span>
        )}
        <div className="camp-creator-text">
          <b>{creatorName}</b>
          <span>Létrehozva: {fmtCreatedDate(c.created_at)}</span>
        </div>
      </div>
    </div>
  );
});

export default CampaignCard;
