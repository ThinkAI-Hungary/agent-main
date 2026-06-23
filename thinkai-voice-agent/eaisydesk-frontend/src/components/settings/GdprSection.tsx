/**
 * GdprSection — standalone GDPR/security section extracted from BeallitasokPage.
 * Uses useAuth() directly instead of receiving user as prop.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';
import { hasPrivacyConsent } from '../../pages/PrivacyPolicyPage';
import { hasCookieConsent } from '../gdpr/CookieConsentBanner';
import { exportAllDataAsJson, downloadBlob } from '../../lib/gdprExport';

export default function GdprSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  const privacyOk = user ? hasPrivacyConsent(user.username) : false;
  const cookieOk = user ? hasCookieConsent(user.username) : false;
  const allOk = privacyOk && cookieOk;

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportAllDataAsJson();
      downloadBlob(result);
      showToast(`Export kész! ${result.recordCount} rekord exportálva.`);
    } catch {
      showToast('Hiba az export során', 'error');
    }
    setExporting(false);
  };

  return (
    <div className="gdpr-section-divider">
      <div className="security-row">
        <div className="security-icon shield">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="security-svg">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div className="security-info">
          <div className="security-title">GDPR megfelelőség</div>
          <div className="security-desc">
            {allOk ? 'Adatkezelési tájékoztató elfogadva, sütik konfigurálva' : 'Adatkezelési nyilatkozat és hozzájárulás kezelés'}
          </div>
        </div>
        <div className="security-action">
          <span
            className={`security-badge ${allOk ? 'green' : 'yellow'}`}
            style={allOk ? {} : { background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            {allOk ? 'MEGFELELŐ' : 'BEÁLLÍTÁS SZÜKSÉGES'}
          </span>
        </div>
      </div>

      <div className="flex-row flex-wrap gap-8 gdpr-actions">
        <button onClick={() => navigate('/privacy')} className="gdpr-action-btn">
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          Adatkezelési tájékoztató
          {privacyOk && (
            <svg fill="none" stroke="#10b981" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <button onClick={() => navigate('/gdpr')} className="gdpr-action-btn">
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          GDPR kérelmek
        </button>
        <button onClick={handleExport} disabled={exporting} className="gdpr-action-btn" style={{ opacity: exporting ? 0.5 : 1 }}>
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {exporting ? 'Exportálás...' : 'Adat export'}
        </button>
      </div>
    </div>
  );
}
