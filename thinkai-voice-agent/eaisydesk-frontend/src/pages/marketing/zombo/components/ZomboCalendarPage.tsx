import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProdCalendarView } from './ProdCalendarView';
import { deriveBrandKitFromAudit, type AuditResult } from '../../ZomboAuditPage';
import { type BrandKit as ZomboBrandKit, type PostCreative as ZomboPostCreative } from '../types';
import '../zombo.css';

const STORAGE_KEY_RESULT = 'zombo_audit_result';
const STORAGE_KEY_POSTS = 'zombo_calendar_posts';
const STORAGE_KEY_BYPASS = 'zombo_calendar_bypass_onboarding';

export default function ZomboCalendarPage() {
  const navigate = useNavigate();

  // Load audit result
  const [result] = useState<AuditResult | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_RESULT);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Derive Brand Kit
  const [brandKit] = useState<ZomboBrandKit | null>(() => {
    if (result) {
      return deriveBrandKitFromAudit(result, 1);
    }
    return null;
  });

  // Local storage persisted posts
  const [posts, setPosts] = useState<ZomboPostCreative[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POSTS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Local storage persisted onboarding bypass
  const [bypassOnboarding, setBypassOnboarding] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_BYPASS) === 'true';
  });

  // Persist posts
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_POSTS, JSON.stringify(posts));
    } catch {}
  }, [posts]);

  // Persist onboarding bypass
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_BYPASS, String(bypassOnboarding));
    } catch {}
  }, [bypassOnboarding]);

  const ArrowLeft = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Inter','Outfit',sans-serif" }}>
      {/* Header */}
      <div className="zombo-page-header" style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 28px',
        borderBottom: '1px solid var(--border)', background: 'var(--card)',
        position: 'sticky', top: 0, zIndex: 10,
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => navigate('/marketing/zombo')}
          className="back-to-audit-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
        >
          <ArrowLeft size={14} /> Vissza az auditra
        </button>

        <div className="header-divider" style={{ width: 1, height: 24, background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
            📅
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Éles Naptár (Prod)</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>/admin/marketing/zombo/calendar</div>
          </div>
        </div>
      </div>

      <style>{`
        .back-to-audit-btn:hover {
          border-color: var(--primary-neon, #8b5cf6) !important;
          color: var(--text) !important;
          background: rgba(139, 92, 246, 0.05) !important;
          transform: translateX(-2px);
        }
        .back-to-audit-btn:active {
          transform: translateX(0);
        }
        @media (max-width: 580px) {
          .zombo-page-header {
            padding: 10px 16px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .header-divider {
            display: none !important;
          }
          .back-to-audit-btn {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {/* Main Body */}
      <div style={{ padding: '24px 28px' }}>
        {brandKit && result ? (
          <ProdCalendarView
            activeBrandKit={brandKit}
            auditResult={result}
            posts={posts}
            setPosts={setPosts}
            bypassOnboarding={bypassOnboarding}
            setBypassOnboarding={setBypassOnboarding}
          />
        ) : (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '40px 20px', textAlign: 'center', maxWidth: 600, margin: '40px auto'
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>Nincs betöltött audit adat</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              Kérlek, végezz el egy weboldal auditot a főoldalon a naptár használatához!
            </div>
            <button
              onClick={() => navigate('/marketing/zombo')}
              style={{
                marginTop: 20, padding: '9px 20px', borderRadius: 9, border: 'none',
                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              Vissza az auditra
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
