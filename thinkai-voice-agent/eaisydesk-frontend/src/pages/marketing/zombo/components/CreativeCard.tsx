import React, { useState } from 'react';
import type { PostCreative, BrandKit } from '../types';
import { fixImageUrl } from '../types';
import { Check, X, Calendar, Send, Edit3, Loader, Award } from 'lucide-react';

interface CreativeCardProps {
  post: PostCreative;
  brandKit: BrandKit;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdateText: (id: string, newText: string) => Promise<void>;
  onSchedule: (id: string, dateStr: string) => void;
  onPostNow: (id: string) => void;
}

export const CreativeCard: React.FC<CreativeCardProps> = ({
  post,
  brandKit,
  onApprove,
  onReject,
  onUpdateText,
  onSchedule,
  onPostNow,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [isRendering, setIsRendering] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Logo rendering based on variant and configuration
  const renderLogo = () => {
    const fill = post.logoVariant === 'light' ? brandKit.colors.secondary : brandKit.colors.primary;
    const brandNameLower = (brandKit.name || '').toLowerCase();
    const isCup = brandKit.logoUrl === 'coffee-cup-minimal' || 
                  brandNameLower.includes('kávé') || 
                  brandNameLower.includes('coffee') || 
                  brandNameLower.includes('cafe') || 
                  brandNameLower.includes('latte');

    return (
      <div className={`post-logo position-${brandKit.logoPosition}`}>
        {isCup ? (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
            <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
            <line x1="6" y1="2" x2="6" y2="4" />
            <line x1="10" y1="2" x2="10" y2="4" />
            <line x1="14" y1="2" x2="14" y2="4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
        <span className="logo-text" style={{ color: fill, fontFamily: brandKit.typography.fontName }}>
          {brandKit.name || 'Márka'}
        </span>
      </div>
    );
  };

  // Safe color application based on variation
  const getTemplateColors = () => {
    switch (post.colorVariation) {
      case 'inverted':
        return {
          bg: brandKit.colors.secondary,
          text: brandKit.colors.primary,
          accent: brandKit.colors.accent,
          border: brandKit.colors.primary
        };
      case 'accent':
        return {
          bg: brandKit.colors.accent,
          text: '#ffffff',
          accent: brandKit.colors.primary,
          border: brandKit.colors.secondary
        };
      default:
        return {
          bg: brandKit.colors.primary,
          text: brandKit.colors.secondary,
          accent: brandKit.colors.accent,
          border: brandKit.colors.secondary
        };
    }
  };

  const colors = getTemplateColors();

  const handleTextSave = async () => {
    if (!editedText.trim() || editedText === post.text) {
      setIsEditing(false);
      return;
    }
    setIsRendering(true);
    await onUpdateText(post.id, editedText);
    setIsRendering(false);
    setIsEditing(false);
  };

  const handleScheduleSubmit = () => {
    if (scheduleDate) {
      onSchedule(post.id, scheduleDate);
      setShowDatePicker(false);
    }
  };

  // Renders post content inside 1080x1350 mock layout
  const renderTemplateContent = () => {
    const fontStyle = {
      fontFamily: brandKit.typography.fontName,
    };

    switch (post.templateId) {
      case 'quote':
        return (
          <div className="template-quote-wrapper" style={{ backgroundColor: colors.bg, color: colors.text }}>
            {renderLogo()}
            <div className="quote-container">
              <span className="quote-mark" style={{ color: colors.accent }}>“</span>
              <p className="quote-text" style={{ ...fontStyle, fontSize: '18px', maxHeight: '200px' }}>
                {post.text}
              </p>
              <div className="quote-divider" style={{ backgroundColor: colors.accent }} />
            </div>
          </div>
        );

      case 'product':
        return (
          <div className="template-product-wrapper" style={{ backgroundImage: `url(${fixImageUrl(post.imageUrl)})` }}>
            <div className="overlay-dim" />
            {renderLogo()}
            <div className="product-info-panel" style={{ backgroundColor: colors.bg, color: colors.text, borderTop: `2px solid ${colors.accent}` }}>
              <p className="product-text" style={fontStyle}>
                {post.text}
              </p>
              {post.cta && (
                <button className="product-cta shadow-sm" style={{ backgroundColor: brandKit.colors.accent, color: '#fff' }}>
                  {post.cta}
                </button>
              )}
            </div>
          </div>
        );

      case 'testimonial':
        return (
          <div className="template-testimonial-wrapper" style={{ backgroundImage: `url(${fixImageUrl(post.imageUrl)})` }}>
            <div className="overlay-dim strong" />
            {renderLogo()}
            <div className="testimonial-card shadow-lg" style={{ backgroundColor: brandKit.colors.secondary, color: brandKit.colors.primary }}>
              <div className="stars-row">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="star">★</span>
                ))}
              </div>
              <p className="testimonial-text italic">
                {post.text}
              </p>
              {post.cta && (
                <p className="testimonial-author font-heading" style={{ color: brandKit.colors.accent }}>
                  {post.cta}
                </p>
              )}
            </div>
          </div>
        );

      case 'list':
        // Parse bullet lines
        const lines = post.text.split('\n');
        const listTitle = lines[0];
        const listItems = lines.slice(1).map(l => l.replace(/^\d+\.\s*/, ''));

        return (
          <div className="template-list-wrapper" style={{ backgroundImage: `url(${fixImageUrl(post.imageUrl)})` }}>
            <div className="overlay-dim strong" />
            {renderLogo()}
            <div className="list-content-panel" style={{ backgroundColor: colors.bg, color: colors.text }}>
              <h4 className="list-main-title" style={fontStyle}>{listTitle}</h4>
              <div className="list-items-container">
                {listItems.map((item, idx) => (
                  <div key={idx} className="list-item-row">
                    <div className="list-num-badge" style={{ backgroundColor: brandKit.colors.accent }}>{idx + 1}</div>
                    <p className="list-item-text">{item}</p>
                  </div>
                ))}
              </div>
              {post.cta && (
                <button className="list-cta" style={{ backgroundColor: brandKit.colors.accent }}>
                  {post.cta}
                </button>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="template-default" style={{ backgroundColor: colors.bg, color: colors.text }}>
            {renderLogo()}
            <p className="body-text" style={fontStyle}>{post.text}</p>
          </div>
        );
    }
  };

  return (
    <div className="creative-card glass-panel animate-slide-up">
      {/* Aspect Ratio Box (4:5 Ratio 1080x1350) */}
      <div className="aspect-ratio-box shadow">
        {renderTemplateContent()}
        
        {/* Render overlay spinner */}
        {isRendering && (
          <div className="rendering-overlay">
            <Loader size={36} className="spinner-icon" />
            <span>Playwright Rendering...</span>
          </div>
        )}
      </div>

      {/* Post Details & Inline Edit */}
      <div className="card-controls">
        <div className="status-row">
          <span className={`status-badge badge-${post.status}`}>
            {post.status.toUpperCase()}
          </span>
          {post.generationModel && (
            <span className="generation-info-badge" title={`Generálva: ${post.generationModel} (${post.generationTime ? `${post.generationTime.toFixed(1)}s` : ''})`}>
              ⚡ {post.generationModel} • {post.generationTime ? `${post.generationTime.toFixed(1)}s` : ''}
            </span>
          )}
          <span className="template-type">
            Sablon: {post.templateId}
          </span>
        </div>

        {isEditing ? (
          <div className="inline-editor">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={3}
            />
            <div className="editor-buttons">
              <button className="btn-secondary btn-sm" onClick={() => setIsEditing(false)}>
                Mégse
              </button>
              <button className="btn-primary btn-sm" onClick={handleTextSave}>
                Renderelés (1.5s)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-display-row" onClick={() => setIsEditing(true)}>
            <p className="post-text-desc">{post.text}</p>
            <button className="edit-btn-icon" title="Inline Szerkesztés">
              <Edit3 size={14} />
            </button>
          </div>
        )}

        {/* Action Triggers */}
        {post.status === 'draft' && (
          <div className="action-buttons-row">
            <button className="btn-success-action" onClick={() => onApprove(post.id)}>
              <Check size={14} /> Jóváhagyás
            </button>
            <button className="btn-danger-action" onClick={() => onReject(post.id)}>
              <X size={14} /> Elvetés
            </button>
          </div>
        )}

        {post.status === 'approved' && (
          <div className="post-actions-row">
            <button className="btn-schedule" onClick={() => setShowDatePicker(!showDatePicker)}>
              <Calendar size={14} /> Ütemezés
            </button>
            <button className="btn-post-now btn-primary" onClick={() => onPostNow(post.id)}>
              <Send size={14} /> Posztolás Most
            </button>
          </div>
        )}

        {/* Datepicker Modal Popover */}
        {showDatePicker && (
          <div className="datepicker-popover glass-panel">
            <label>Válassz dátumot és időpontot:</label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <div className="popover-actions">
              <button className="btn-secondary btn-sm" onClick={() => setShowDatePicker(false)}>
                Bezár
              </button>
              <button className="btn-primary btn-sm" onClick={handleScheduleSubmit} disabled={!scheduleDate}>
                Beütemezés
              </button>
            </div>
          </div>
        )}

        {post.status === 'scheduled' && post.scheduledAt && (
          <div className="scheduled-info">
            <Calendar size={14} className="icon-purple" />
            <span>Ütemezve: {new Date(post.scheduledAt).toLocaleString('hu-HU')}</span>
          </div>
        )}

        {post.status === 'published' && post.publishedAt && (
          <div className="published-info">
            <Award size={14} className="icon-emerald" />
            <span>Kiposztolva: {new Date(post.publishedAt).toLocaleString('hu-HU')}</span>
          </div>
        )}
      </div>

      <style>{`
        .creative-card {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-radius: 12px;
          background: rgba(25, 20, 48, 0.4);
        }
        .aspect-ratio-box {
          position: relative;
          width: 100%;
          aspect-ratio: 4 / 5; /* 1080x1350 pixel layout representation */
          border-radius: 8px;
          overflow: hidden;
          background: #000;
        }

        /* Rendering state spinner */
        .rendering-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(10, 8, 19, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          z-index: 10;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        .spinner-icon {
          animation: spin-slow 1.2s infinite linear;
          color: var(--primary-neon);
        }

        /* Post Templates layouts */
        .template-quote-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 24px;
          position: relative;
        }
        .post-logo {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 800;
          font-size: 11px;
          letter-spacing: 0.05em;
        }
        .logo-text {
          font-weight: 800;
        }
        .position-top-left { top: 16px; left: 16px; }
        .position-top-right { top: 16px; right: 16px; }
        .position-bottom-left { bottom: 16px; left: 16px; }
        .position-bottom-right { bottom: 16px; right: 16px; }

        .quote-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          width: 100%;
          padding: 0 12px;
        }
        .quote-mark {
          font-size: 64px;
          line-height: 0.2;
          font-family: serif;
          margin-bottom: -10px;
        }
        .quote-text {
          font-style: italic;
          line-height: 1.5;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .quote-divider {
          width: 40px;
          height: 3px;
          border-radius: 2px;
        }

        .template-product-wrapper {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }
        .overlay-dim {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
          z-index: 1;
        }
        .overlay-dim.strong {
          background: rgba(0,0,0,0.5);
        }
        .post-logo, .product-info-panel, .testimonial-card, .list-content-panel {
          z-index: 2;
        }
        .product-info-panel {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .product-text {
          font-size: 13px;
          line-height: 1.4;
          font-weight: 500;
        }
        .product-cta {
          border: none;
          padding: 10px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }

        .template-testimonial-wrapper {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .testimonial-card {
          width: 100%;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
        }
        .stars-row {
          display: flex;
          gap: 4px;
          color: #fbbf24;
          font-size: 16px;
        }
        .testimonial-text {
          font-size: 13px;
          line-height: 1.45;
        }
        .testimonial-author {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .template-list-wrapper {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }
        .list-content-panel {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .list-main-title {
          font-size: 16px;
          font-weight: 700;
        }
        .list-items-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .list-item-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .list-num-badge {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .list-item-text {
          font-size: 12px;
          line-height: 1.4;
        }
        .list-cta {
          border: none;
          padding: 10px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 12px;
          color: white;
        }

        /* Controls styling */
        .card-controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
        }
        .status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .status-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .badge-draft { background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.3); }
        .badge-approved { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-rejected { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .badge-scheduled { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-published { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .badge-failed { background: rgba(220, 38, 38, 0.2); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.3); }

        .template-type {
          font-size: 10px;
          color: var(--text-muted);
        }
        .generation-info-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          letter-spacing: 0.2px;
        }
        .text-display-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          cursor: pointer;
          background: rgba(0,0,0,0.15);
          padding: 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          transition: var(--transition-smooth);
        }
        .text-display-row:hover {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(0,0,0,0.25);
        }
        .post-text-desc {
          font-size: 12px;
          line-height: 1.4;
          color: var(--text-main);
          white-space: pre-line;
        }
        .edit-btn-icon {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0.6;
        }
        .edit-btn-icon:hover {
          color: var(--primary-neon);
          opacity: 1;
        }

        .inline-editor {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .inline-editor textarea {
          width: 100%;
          font-size: 12px;
          padding: 8px;
          background: rgba(0,0,0,0.3);
        }
        .editor-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }
        .btn-sm {
          padding: 6px 12px;
          font-size: 11px;
          border-radius: 6px;
        }

        /* Action buttons row */
        .action-buttons-row, .post-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 4px;
        }
        .btn-success-action {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #34d399;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: var(--transition-smooth);
        }
        .btn-success-action:hover {
          background: rgba(16, 185, 129, 0.22);
          border-color: rgba(16, 185, 129, 0.5);
        }
        .btn-danger-action {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: var(--transition-smooth);
        }
        .btn-danger-action:hover {
          background: rgba(239, 68, 68, 0.22);
          border-color: rgba(239, 68, 68, 0.5);
        }

        .btn-schedule {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.25);
          color: #fbbf24;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: var(--transition-smooth);
        }
        .btn-schedule:hover {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(245, 158, 11, 0.5);
        }
        .btn-post-now {
          padding: 8px;
          font-size: 12px;
          border-radius: 8px;
        }

        /* Datepicker popover */
        .datepicker-popover {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          margin-bottom: 8px;
          background: rgba(15, 12, 30, 0.95);
          border-color: rgba(139, 92, 246, 0.3);
          padding: 12px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 100;
        }
        .datepicker-popover label {
          font-size: 11px;
          color: var(--text-muted);
        }
        .popover-actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }

        /* State display footers */
        .scheduled-info, .published-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11px;
          background: rgba(0,0,0,0.15);
          padding: 8px;
          border-radius: 6px;
          color: var(--text-muted);
        }
        .icon-emerald {
          color: #10b981;
        }
      `}</style>
    </div>
  );
};
