/**
 * CampaignCard — memo-wrapped campaign list card.
 * Extracted from OutboundPage to prevent the full list re-rendering
 * on filter changes, selection toggles, or other parent state updates.
 */
import { memo } from 'react';

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
  onDelete: (id: number) => void;
  onSchedule: (id: number) => void;
}

const CampaignCard = memo(function CampaignCard({
  campaign: c,
  statusInfo: st,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onStart,
  onStop,
  onDelete,
  onSchedule,
}: CampaignCardProps) {
  const channels = c.channels || (c.channel ? [c.channel] : ['email']);
  const clientCount = c.client_ids?.length || 0;

  return (
    <div
      className={`out-campaign-card out-campaign-card--clickable${isSelected ? ' out-campaign-card--selected' : ''}`}
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

      {/* Channel + status badges */}
      <div className="flex-row gap-6 flex-wrap mb-10">
        {channels.map((ch) => (
          <span key={ch} className="out-channel-badge">
            {CHANNEL_NAMES[ch] || ch}
          </span>
        ))}
        <span className="out-status-badge" style={{ background: st.bg, color: st.color }}>
          <span className="out-status-dot" style={{ background: st.color }} />
          {st.label}
        </span>
      </div>

      <div className="out-card-name">{c.name}</div>
      <div className="out-card-meta">
        <span>{c.status === 'Aktív' ? `${c.processed_count || 0}/${c.total_count || clientCount} feldolgozva` : `${clientCount} ügyfél célozva`}</span>
        <span>·</span>
        <span>{c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : <span className="no-data">Nincs dátum</span>}</span>
      </div>

      {/* Actions */}
      <div className="flex-row gap-8 flex-wrap">
        {(c.status === 'Vázlat' || c.status === 'Megállítva') && (
          <>
            <ActionBtn label="Indítás" color="#22c55e" onClick={() => onStart(c.id)} />
            <ActionBtn label="Ütemezés" color="#8b5cf6" onClick={() => onSchedule(c.id)} />
          </>
        )}
        {c.status === 'Aktív' && (
          <ActionBtn label="Megállítás" color="#f59e0b" onClick={() => onStop(c.id)} />
        )}
        <ActionBtn label="Törlés" color="#ef4444" onClick={() => onDelete(c.id)} />
      </div>
    </div>
  );
});

export default CampaignCard;

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="out-action-btn"
      style={{
        '--btn-color': color,
        background: `${color}10`,
        border: `1px solid ${color}40`,
        color,
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}
