import React, { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../api/client';

/** Kizárt feladók (user-kezelt lista): ezekről a címekről/doménekről érkező
    leveleket a rendszer soha nem dolgozza fel ügyfélként (pl. munkatársi
    címek, forwardolt páciensi kérések forwardálója). Tenant-szinten tárolva. */

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg, #fff)', color: 'var(--text, #082432)', fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 6, border: 'none', background: '#1ceee0',
  color: '#082432', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const delBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: '#ff5050', cursor: 'pointer',
  fontSize: 16, lineHeight: 1, padding: 4,
};
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
  borderRadius: 14, background: 'var(--bg, #f3f4f6)', fontSize: 12,
  border: '1px solid var(--border)',
};

export default function ExcludedSendersCard() {
  const [emails, setEmails] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/settings/excluded-senders');
      if (res.ok) {
        const d = await res.json();
        setEmails(d.emails || []);
        setDomains(d.domains || []);
      }
    } catch { /* fail-open */ }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (emailsNext: string[], domainsNext: string[]) => {
    setSaving(true);
    setMsg('');
    try {
      const res = await authFetch('/admin/api/settings/excluded-senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emailsNext, domains: domainsNext }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(d.ok ? 'Mentve.' : 'Mentés sikertelen.');
      setEmails(d.emails || emailsNext);
      setDomains(d.domains || domainsNext);
    } catch {
      setMsg('Mentés sikertelen.');
    }
    setSaving(false);
  }, []);

  const addEmail = () => {
    const v = newEmail.trim().toLowerCase();
    if (!v || !v.includes('@')) { setMsg('Érvényes e-mail címet adj meg.'); return; }
    if (emails.includes(v)) { setMsg('Már a listán van.'); return; }
    setNewEmail(''); setMsg('');
    save([...emails, v], domains);
  };
  const addDomain = () => {
    let v = newDomain.trim().toLowerCase().replace(/^@+/, '');
    if (!v || !v.includes('.')) { setMsg('Érvényes domaint adj meg (pl. ceg.hu).'); return; }
    if (domains.includes(v)) { setMsg('Már a listán van.'); return; }
    setNewDomain(''); setMsg('');
    save(emails, [...domains, v]);
  };
  const remove = (kind: 'email' | 'domain', value: string) => {
    const next = kind === 'email' ? emails.filter(x => x !== value) : domains.filter(x => x !== value);
    save(next, kind === 'email' ? domains : next);
  };

  return (
    <div className="mb-24">
      <div className="flex-row gap-8 mb-16">
        <div className="icon-box">
          <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
          </svg>
        </div>
        <span className="section-heading">Kizárt feladók — munkatársi / belső címek</span>
      </div>
      <div className="settings-section p-24">
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Az itt felsorolt e-mail-címről vagy domainről érkező leveleket a rendszer
          <b> nem dolgozza fel ügyfélként</b> — nem készül belőlük ügyfél, nem indul rájuk
          AI-válasz, és a naplóban „Kizárt feladó" jelöléssel jelennek meg.
          Használd munkatársi címekre és olyan külső címekre/domainekre, amelyek nem páciensek.
        </p>

        {!loaded ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Betöltés…</p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kizárt e-mail-címek</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {emails.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— nincs —</span>}
                {emails.map(e => (
                  <span key={e} style={chip}>
                    {e}
                    <button style={delBtn} title="Eltávolítás"
                      onClick={() => remove('email', e)}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputStyle} placeholder="munkatars@gmail.com"
                  value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addEmail(); }} />
                <button style={btnStyle} onClick={addEmail}>Hozzáadás</button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kizárt domainek (egész cég домен)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {domains.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— nincs —</span>}
                {domains.map(d => (
                  <span key={d} style={chip}>
                    @{d}
                    <button style={delBtn} title="Eltávolítás"
                      onClick={() => remove('domain', d)}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputStyle} placeholder="ceg.hu"
                  value={newDomain} onChange={e => setNewDomain(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addDomain(); }} />
                <button style={btnStyle} onClick={addDomain}>Hozzáadás</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={{ ...btnStyle, opacity: saving ? 0.6 : 1 }} disabled={saving}
                onClick={() => save(emails, domains)}>
                {saving ? 'Mentés…' : 'Mentés'}
              </button>
              {msg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
