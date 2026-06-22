import React, { useState } from 'react';
import type { PostCreative } from '../types';
import { Grid, Calendar, Compass, Trash2, Globe } from 'lucide-react';

interface ScheduleViewProps {
  scheduledPosts: PostCreative[];
  onCancelSchedule: (id: string) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  scheduledPosts,
  onCancelSchedule,
}) => {
  const [activeTab, setActiveTab] = useState<'grid' | 'timeline'>('grid');

  // Filter scheduled & published posts
  const feedPosts = scheduledPosts.filter(
    (p) => p.status === 'published' || p.status === 'scheduled'
  );

  return (
    <div className="schedule-view-container glass-panel animate-slide-up">
      {/* Simulated Instagram Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-wrapper shadow-lg">
          <div className="profile-avatar">
            <span>A</span>
          </div>
        </div>
        
        <div className="profile-details">
          <div className="profile-username-row">
            <h3 className="profile-username">anna_kavezoja</h3>
            <div className="instagram-verified-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
              <span>Kapcsolódva</span>
            </div>
          </div>
          
          <div className="profile-stats">
            <span><strong>{feedPosts.filter(p => p.status === 'published').length + 42}</strong> bejegyzés</span>
            <span><strong>2,854</strong> követő</span>
            <span><strong>318</strong> követett</span>
          </div>

          <div className="profile-bio">
            <span className="profile-title">Anna Kávézója 🌸</span>
            <span className="profile-desc">Kézműves specialty kávé, házi brunch és tavaszi sütik Budapest belvárosában. Gyere be és érezd magad otthon! ☕️🧁</span>
            <a href="https://annacafe.hu" target="_blank" rel="noreferrer" className="profile-link">
              <Globe size={12} />
              <span>annacafe.hu</span>
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        <button
          className={`profile-tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
          onClick={() => setActiveTab('grid')}
        >
          <Grid size={16} />
          <span>RÁCSOS NÉZET (FEED)</span>
        </button>
        <button
          className={`profile-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Calendar size={16} />
          <span>NAPTÁR / ÜTEMEZÉS</span>
        </button>
      </div>

      {/* View Content */}
      <div className="tab-content">
        {activeTab === 'grid' ? (
          <div className="instagram-grid">
            {feedPosts.length === 0 ? (
              <div className="empty-feed">
                <Compass size={40} className="empty-icon animate-pulse" />
                <p>Nincs még kiposztolt vagy beütemezett tartalom.</p>
                <p className="subtext">Hagyj jóvá egy elkészült kreatívot az ütemezéshez!</p>
              </div>
            ) : (
              feedPosts.map((post) => {
                const isScheduled = post.status === 'scheduled';
                return (
                  <div key={post.id} className={`grid-item-card ${isScheduled ? 'scheduled-item' : ''}`}>
                    <img src={post.imageUrl} alt="Instagram Grid Post" className="grid-image" />
                    
                    {/* Hover Overlay info */}
                    <div className="grid-overlay">
                      {isScheduled ? (
                        <div className="scheduled-badge-overlay">
                          <Calendar size={18} />
                          <span className="badge-text">Beütemezve</span>
                          <span className="badge-date">
                            {post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString('hu-HU') : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="stats-badge-overlay">
                          <span className="overlay-likes">❤️ {Math.floor(Math.random() * 80) + 40}</span>
                          <span className="overlay-comments">💬 {Math.floor(Math.random() * 15) + 3}</span>
                        </div>
                      )}
                    </div>

                    {isScheduled && (
                      <div className="scheduled-corner-badge">
                        <span>Óra</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Timeline view listing details */
          <div className="timeline-list">
            <h4 className="timeline-section-title">Beütemezett & Közzétett feladatok</h4>
            {feedPosts.length === 0 ? (
              <p className="no-timeline-text">Nincsenek bejegyzések.</p>
            ) : (
              <div className="timeline-items">
                {feedPosts.map((post) => {
                  const isScheduled = post.status === 'scheduled';
                  const date = post.scheduledAt || post.publishedAt || post.createdAt;

                  return (
                    <div key={post.id} className={`timeline-item ${isScheduled ? 'scheduled' : 'published'}`}>
                      <div className="timeline-img-wrapper">
                        <img src={post.imageUrl} alt="Post preview" />
                      </div>
                      <div className="timeline-details">
                        <div className="timeline-meta">
                          <span className={`status-dot ${isScheduled ? 'scheduled' : 'published'}`} />
                          <span className="timeline-date">{new Date(date).toLocaleString('hu-HU')}</span>
                          <span className="timeline-status-text">
                            {isScheduled ? 'Ütemezve (Háttér-feldolgozó várakozik)' : 'Közzétéve Meta API-n keresztül'}
                          </span>
                        </div>
                        <p className="timeline-text-body">{post.text}</p>
                        {post.instagramUrl && (
                          <a href={post.instagramUrl} target="_blank" rel="noreferrer" className="mock-insta-link">
                            Bejegyzés megtekintése Instagramon →
                          </a>
                        )}
                      </div>
                      {isScheduled && (
                        <button
                          className="btn-cancel-timeline"
                          onClick={() => onCancelSchedule(post.id)}
                          title="Ütemezés visszavonása"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .schedule-view-container {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Instagram Profile layout */
        .profile-header {
          display: flex;
          gap: 32px;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          flex-wrap: wrap;
        }
        .profile-avatar-wrapper {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          padding: 3px;
          background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); 
        }
        .profile-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: #3E2723;
          border: 3px solid var(--bg-main);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 28px;
          color: var(--text-main);
        }
        .profile-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-grow: 1;
        }
        .profile-username-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .profile-username {
          font-size: 18px;
          font-weight: 600;
        }
        .instagram-verified-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #60a5fa;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
        }
        .profile-stats {
          display: flex;
          gap: 20px;
          font-size: 13px;
        }
        .profile-stats span {
          color: var(--text-muted);
        }
        .profile-stats strong {
          color: var(--text-main);
        }
        .profile-bio {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          line-height: 1.4;
        }
        .profile-title {
          font-weight: 700;
          font-size: 13px;
        }
        .profile-desc {
          color: var(--text-muted);
          max-width: 480px;
        }
        .profile-link {
          color: #60a5fa;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 2px;
        }
        .profile-link:hover {
          text-decoration: underline;
        }

        /* Tabs bar */
        .profile-tabs {
          display: flex;
          justify-content: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          gap: 32px;
        }
        .profile-tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 12px 6px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          position: relative;
          letter-spacing: 0.05em;
          transition: var(--transition-smooth);
        }
        .profile-tab-btn:hover {
          color: var(--text-main);
        }
        .profile-tab-btn.active {
          color: var(--primary-neon);
        }
        .profile-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--primary-neon);
          box-shadow: 0 0 6px var(--primary-glow);
        }

        /* Instagram Grid */
        .instagram-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 8px;
        }
        .empty-feed {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
          gap: 8px;
        }
        .empty-icon {
          color: var(--primary-neon);
          opacity: 0.6;
        }
        .subtext {
          font-size: 12px;
        }
        .grid-item-card {
          position: relative;
          aspect-ratio: 1 / 1;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
          cursor: pointer;
        }
        .grid-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }
        .grid-item-card:hover .grid-image {
          transform: scale(1.05);
        }
        .grid-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: var(--transition-smooth);
          z-index: 5;
        }
        .grid-item-card:hover .grid-overlay {
          opacity: 1;
        }
        .stats-badge-overlay {
          display: flex;
          gap: 16px;
          color: #fff;
          font-weight: 700;
          font-size: 14px;
        }
        .scheduled-badge-overlay {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #fbbf24;
          font-size: 12px;
          font-weight: 700;
          gap: 4px;
        }
        .badge-date {
          font-size: 11px;
          color: #fff;
        }

        .scheduled-item {
          border: 2px dashed rgba(245, 158, 11, 0.4);
        }
        .scheduled-corner-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #fbbf24;
          color: #000;
          font-size: 9px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 4;
        }

        /* Timeline list view */
        .timeline-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 8px;
        }
        .timeline-section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-main);
        }
        .no-timeline-text {
          font-size: 12px;
          color: var(--text-muted);
        }
        .timeline-items {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .timeline-item {
          display: flex;
          gap: 14px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          align-items: center;
        }
        .timeline-item.scheduled {
          border-left: 4px solid var(--accent-amber);
        }
        .timeline-item.published {
          border-left: 4px solid var(--accent-emerald);
        }
        .timeline-img-wrapper {
          width: 50px;
          height: 50px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .timeline-img-wrapper img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .timeline-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-grow: 1;
        }
        .timeline-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .status-dot.scheduled { background: var(--accent-amber); }
        .status-dot.published { background: var(--accent-emerald); }
        
        .timeline-date {
          font-weight: 700;
          color: var(--text-main);
        }
        .timeline-status-text {
          color: var(--text-muted);
        }
        .timeline-text-body {
          font-size: 12px;
          color: var(--text-main);
          line-height: 1.4;
        }
        .mock-insta-link {
          font-size: 11px;
          color: #60a5fa;
          text-decoration: none;
        }
        .mock-insta-link:hover {
          text-decoration: underline;
        }
        .btn-cancel-timeline {
          background: transparent;
          border: none;
          color: #fca5a5;
          cursor: pointer;
          opacity: 0.7;
          transition: var(--transition-smooth);
        }
        .btn-cancel-timeline:hover {
          color: #ef4444;
          opacity: 1;
        }
      `}</style>
    </div>
  );
};
