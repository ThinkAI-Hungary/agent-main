/**
 * GdprPage – GDPR érintetti kérelmek kezelése
 * Per-user localStorage storage, no backend dependency.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/ui/Toast';
import { exportAllDataAsJson, downloadBlob } from '../lib/gdprExport';

const STORAGE_KEY = 'eaisydesk_gdpr_requests';

interface GdprRequest {
  id: string;
  employeeName: string;
  requestType: 'access' | 'rectification' | 'restriction' | 'deletion';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  notes: string;
  requestedAt: string;
  completedAt?: string;
}

const TYPE_LABELS: Record<string, string> = {
  access: 'Hozzáférés',
  rectification: 'Helyesbítés',
  restriction: 'Korlátozás',
  deletion: 'Törlés',
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Függőben', bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
  in_progress: { label: 'Folyamatban', bg: 'rgba(59,130,246,0.1)', color: '#2563eb' },
  completed: { label: 'Teljesítve', bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  rejected: { label: 'Elutasítva', bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
};

function loadRequests(): GdprRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRequests(reqs: GdprRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reqs));
}

export default function GdprPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({ employeeName: '', requestType: 'access' as string, notes: '' });

  useEffect(() => { setRequests(loadRequests()); }, []);

  const handleCreate = () => {
    if (!form.employeeName.trim()) return;
    const newReq: GdprRequest = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      employeeName: form.employeeName,
      requestType: form.requestType as GdprRequest['requestType'],
      status: 'pending',
      notes: form.notes,
      requestedAt: new Date().toISOString(),
    };
    const updated = [newReq, ...requests];
    setRequests(updated);
    saveRequests(updated);
    setShowCreate(false);
    setForm({ employeeName: '', requestType: 'access', notes: '' });
    showToast('Kérelem létrehozva!');
  };

  const updateStatus = (id: string, newStatus: GdprRequest['status']) => {
    const updated = requests.map(r =>
      r.id === id
        ? { ...r, status: newStatus, ...(newStatus === 'completed' ? { completedAt: new Date().toISOString() } : {}) }
        : r
    );
    setRequests(updated);
    saveRequests(updated);
    showToast(`Státusz frissítve: ${STATUS_CONFIG[newStatus].label}`);
  };

  const deleteRequest = (id: string) => {
    const updated = requests.filter(r => r.id !== id);
    setRequests(updated);
    saveRequests(updated);
    showToast('Kérelem törölve');
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportAllDataAsJson();
      downloadBlob(result);
      showToast(`Export kész! ${result.recordCount} rekord exportálva.`);
    } catch {
      showToast('Hiba az export során', 'error');
    }
    setExporting(false);
  }, []);

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  return (
    <div className="page active gdpr-page">
      {/* Header */}
      <div className="flex-between mb-24">
        <div className="flex-row gap-12">
          <button className="btn btn-ghost gdpr-back-btn" onClick={() => navigate('/beallitasok')}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="icon-box-lg gdpr-header-icon">
            <svg fill="none" stroke="#082432" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold gdpr-h1">GDPR modul</h1>
            <p className="text-sm text-muted gdpr-sub">Érintetti kérelmek kezelése</p>
          </div>
        </div>
        <div className="flex-row gap-8">
          <button className="btn btn-outline btn-sm" onClick={handleExport} disabled={exporting}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {exporting ? 'Exportálás...' : 'Adat export'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Új kérelem
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3col gap-12 mb-24">
        {[
          { label: 'Függőben', value: stats.pending, bg: 'rgba(245,158,11,0.08)', color: '#d97706' },
          { label: 'Folyamatban', value: stats.in_progress, bg: 'rgba(59,130,246,0.08)', color: '#2563eb' },
          { label: 'Teljesítve', value: stats.completed, bg: 'rgba(16,185,129,0.08)', color: '#059669' },
        ].map(s => (
          <div key={s.label} className="p-16 gdpr-stat-card" style={{ background: s.bg }}>
            <div className="text-xs text-muted mb-4">{s.label}</div>
            <div className="font-extrabold gdpr-stat-val" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card-container gdpr-table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['Érintett', 'Típus', 'Benyújtás', 'Státusz', 'Művelet'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted gdpr-empty-td">
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24" width="32" height="32" className="gdpr-empty-icon">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Nincs érintetti kérelem
                </td>
              </tr>
            ) : requests.map(req => {
              const sc = STATUS_CONFIG[req.status];
              return (
                <tr key={req.id}>
                  <td className="font-semibold">{req.employeeName}</td>
                  <td className="text-muted">{TYPE_LABELS[req.requestType]}</td>
                  <td className="text-sm text-muted">
                    {new Date(req.requestedAt).toLocaleDateString('hu-HU')}
                  </td>
                  <td>
                    <span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td>
                    <div className="flex-row gap-4">
                      {req.status === 'pending' && (
                        <button className="btn btn-xs btn-outline gdpr-btn-start" onClick={() => updateStatus(req.id, 'in_progress')}>Elkezd</button>
                      )}
                      {req.status === 'in_progress' && (
                        <button className="btn btn-xs gdpr-btn-complete" onClick={() => updateStatus(req.id, 'completed')}>Teljesít</button>
                      )}
                      <button className="btn btn-xs btn-danger" onClick={() => deleteRequest(req.id)} title="Törlés">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="gdpr-modal-header">
              <div className="flex-between">
                <div>
                  <div className="text-xs font-bold gdpr-modal-label">GDPR</div>
                  <h3 className="text-xl font-bold gdpr-modal-title">Új érintetti kérelem</h3>
                </div>
                <button className="modal-close gdpr-modal-close" onClick={() => setShowCreate(false)}>✕</button>
              </div>
            </div>
            {/* Form */}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Érintett neve</label>
                <input className="input" value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))}
                  placeholder="Név" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Kérelem típusa</label>
                <select className="input" value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                  style={{ cursor: 'pointer' }}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Megjegyzés</label>
                <textarea className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Opcionális megjegyzés..." rows={3}
                  className="input gdpr-textarea" />
              </div>
            </div>
            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>Mégsem</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!form.employeeName.trim()}>Létrehozás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
