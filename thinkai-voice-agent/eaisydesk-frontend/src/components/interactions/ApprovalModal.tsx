/**
 * ApprovalModal — "Üzenet jóváhagyása" popup
 *
 * Shows the original message context + the AI-generated draft response
 * in an editable textarea. The user can approve & send, or close.
 *
 * Ported 1:1 from the legacy monolithic admin.html approval modal.
 * Uses .apv-modal- prefix to avoid CSS conflicts with clients.css .approval-card
 */
import { useState, useEffect, useRef } from 'react';
import { useApproval } from '../../context/ApprovalContext';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import './ApprovalModal.css';

export default function ApprovalModal() {
  const { pendingApproval, closeApproval } = useApproval();
  const [draftText, setDraftText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Parse AI draft and populate textarea when modal opens
  useEffect(() => {
    if (!pendingApproval) return;

    let parsedDraft: string;
    try {
      const draftData = JSON.parse(pendingApproval.aiDraftResponse || '{}');

      if (draftData.multi_channel && draftData.drafts && draftData.drafts.length > 1) {
        parsedDraft = draftData.drafts
          .map((d: { channel: string; body?: string }) => {
            const chIcon: Record<string, string> = {
              Email: '📧',
              Messenger: '💬',
              WhatsApp: '📱',
            };
            return `━━━ ${chIcon[d.channel] || '📨'} ${d.channel} ━━━\n${d.body || ''}`;
          })
          .join('\n\n');
      } else {
        parsedDraft = draftData.body || '';
      }
    } catch {
      parsedDraft = pendingApproval.aiDraftResponse || '';
    }

    setDraftText(parsedDraft.replace(/<br\s*\/?>/gi, '\n'));

    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [pendingApproval]);

  // Close on Escape
  useEffect(() => {
    if (!pendingApproval) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeApproval();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingApproval, closeApproval]);

  if (!pendingApproval) return null;

  // Extract original customer message from topic (strip "Channel AI válasz - " prefix)
  const rawTopic = pendingApproval.topic || '';
  // Check if topic contains customer message after the prefix
  const prefixMatch = rawTopic.match(/^.+?AI válasz\s*-\s*(.+)/s);
  let topicText = '';
  if (prefixMatch) {
    const extracted = prefixMatch[1];
    // Filter out technical summaries that aren't actual customer messages
    const isTechnicalSummary = /^Bejövő e-mail\b/i.test(extracted);
    topicText = isTechnicalSummary ? '' : extracted;
  } else if (!rawTopic.match(/AI válasz/i)) {
    // Not an AI response topic — show as-is
    topicText = rawTopic;
  }

  const channelLabel = pendingApproval.channel || '';

  const handleSubmit = async () => {
    if (!pendingApproval.interactionId) return;
    setSubmitting(true);

    try {
      const res = await authFetch(
        `/admin/api/approvals/${pendingApproval.interactionId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modified_draft: draftText }),
        }
      );

      if (!res.ok) {
        const d = await res.json().catch(() => ({ detail: 'Ismeretlen hiba' }));
        throw new Error(d.detail || 'Hiba történt a mentés során');
      }

      const result = await res.json().catch(() => ({ status: 'success' }));
      closeApproval();
      if (result.status === 'warning') {
        showToast(result.message || 'Jóváhagyva, de a küldés sikertelen', 'error');
      } else {
        showToast('Válasz jóváhagyva és elküldve!', 'success');
      }
    } catch (e) {
      showToast((e as Error).message || 'Hiba történt', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="apv-modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) closeApproval();
      }}
    >
      <div className="apv-modal-card">
        {/* Header */}
        <div className="apv-modal-header">
          <h3 className="apv-modal-title">Üzenet jóváhagyása</h3>
          <button
            className="apv-modal-close-btn"
            onClick={closeApproval}
            aria-label="Bezárás"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="22" height="22">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="apv-modal-body">
          {/* Original context */}
          <div className="apv-modal-context-box">
            <div className="apv-modal-context-label">
              Eredeti üzenet / Kontextus:
              {channelLabel && (
                <span className="apv-modal-channel-tag">{channelLabel}</span>
              )}
            </div>
            <div className="apv-modal-context-text">
              {topicText || <em style={{ color: 'var(--text-dim, #94a3b8)' }}>Az ügyfél eredeti üzenete nem elérhető (régebbi interakció)</em>}
            </div>
          </div>

          {/* AI draft textarea */}
          <div className="apv-modal-draft-section">
            <div className="apv-modal-draft-label">
              AI által generált válasz piszkozata:
            </div>
            <textarea
              ref={textareaRef}
              className="apv-modal-draft-textarea"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              disabled={submitting}
              placeholder="Az AI válasz ide kerül..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="apv-modal-footer">
          <button
            className="apv-modal-send-btn"
            onClick={handleSubmit}
            disabled={submitting || !draftText.trim()}
          >
            {submitting ? (
              <>
                <span className="apv-modal-spinner" />
                Kis türelmet...
              </>
            ) : (
              <>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Jóváhagyás és Küldés
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
