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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: 13,
    border: '1.5px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <div className="page active" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/beallitasok')} style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit',
          }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #14b8ad, #1ceee0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(20,184,173,0.3)',
          }}>
            <svg fill="none" stroke="#082432" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>GDPR modul</h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Érintetti kérelmek kezelése</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} disabled={exporting} style={{
            padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
            opacity: exporting ? 0.5 : 1,
          }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {exporting ? 'Exportálás...' : 'Adat export'}
          </button>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, var(--accent, #1ceee0), var(--accent2, #0bbdb1))',
            color: '#082432', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Új kérelem
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Függőben', value: stats.pending, bg: 'rgba(245,158,11,0.08)', color: '#d97706' },
          { label: 'Folyamatban', value: stats.in_progress, bg: 'rgba(59,130,246,0.08)', color: '#2563eb' },
          { label: 'Teljesítve', value: stats.completed, bg: 'rgba(16,185,129,0.08)', color: '#059669' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, borderRadius: 12, padding: 16,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Érintett', 'Típus', 'Benyújtás', 'Státusz', 'Művelet'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 16px', fontSize: 10,
                  fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24" width="32" height="32" style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Nincs érintetti kérelem
                </td>
              </tr>
            ) : requests.map(req => {
              const sc = STATUS_CONFIG[req.status];
              return (
                <tr key={req.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{req.employeeName}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{TYPE_LABELS[req.requestType]}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(req.requestedAt).toLocaleDateString('hu-HU')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: sc.bg, color: sc.color,
                    }}>
                      {sc.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {req.status === 'pending' && (
                        <button onClick={() => updateStatus(req.id, 'in_progress')} style={{
                          padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                          background: 'transparent', color: '#2563eb', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>Elkezd</button>
                      )}
                      {req.status === 'in_progress' && (
                        <button onClick={() => updateStatus(req.id, 'completed')} style={{
                          padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)',
                          background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>Teljesít</button>
                      )}
                      <button onClick={() => deleteRequest(req.id)} title="Törlés" style={{
                        padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)',
                        background: 'rgba(239,68,68,0.06)', color: '#dc2626', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                      }}>
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
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            width: 440, maxWidth: '90vw', background: 'var(--card)', borderRadius: 8,
            boxShadow: '0 24px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(to right, #14b8ad, #1ceee0)', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(8,36,50,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>GDPR</div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#082432' }}>Új érintetti kérelem</h3>
                </div>
                <button onClick={() => setShowCreate(false)} style={{
                  background: 'rgba(8,36,50,0.15)', border: 'none', borderRadius: '50%',
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#082432',
                }}>✕</button>
              </div>
            </div>
            {/* Form */}
            <div style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'block' }}>
                  Érintett neve
                </label>
                <input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))}
                  placeholder="Név" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'block' }}>
                  Kérelem típusa
                </label>
                <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'block' }}>
                  Megjegyzés
                </label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Opcionális megjegyzés..." rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
              </div>
            </div>
            {/* Footer */}
            <div style={{
              padding: '16px 24px', background: 'var(--bg3, rgba(0,0,0,0.02))',
              borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12,
            }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 20px', background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Mégsem</button>
              <button onClick={handleCreate} disabled={!form.employeeName.trim()} style={{
                padding: '10px 20px', borderRadius: 6, border: 'none',
                background: 'linear-gradient(135deg, var(--accent, #1ceee0), var(--accent2, #0bbdb1))',
                color: '#082432', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: !form.employeeName.trim() ? 0.5 : 1,
              }}>Létrehozás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
