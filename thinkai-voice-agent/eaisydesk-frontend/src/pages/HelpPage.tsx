import { useState, useCallback } from 'react';

// ── FAQ data (same as admin-core.js initHelp) ────────────────────────────────
const faqs = [
  { q: 'Hogyan tekintem át az interakciókat?', a: 'Az <b>Irányítópult</b> oldalon KPI kártyákon látod az összesített statisztikákat: összes megkeresés, foglalási arány, átadási arány. A <b>Működési áttekintés</b> blokkban heti trendeket, csatornamegoszlást és napi bontást találsz.' },
  { q: 'Hogyan kezelem az ügyfeleket a Kanban táblán?', a: 'Az <b>Ügyfélközpont → Érdeklődőkezelés</b> menüben drag-and-drop módszerrel húzhatod az ügyfeleket az oszlopok között. Új oszlopot a <b>+ Oszlop hozzáadása</b> gombbal tudsz létrehozni.' },
  { q: 'Mi az a Jóváhagyó rendszer?', a: 'A rendszer automatikusan feldolgozza a bejövő emaileket, és AI-alapú válasz javaslatot készít. Te csak <b>jóváhagyod</b> vagy <b>elutasítod</b> a javasolt választ, ezzel időt spórolva.' },
  { q: 'Hogyan indítok email kampányt?', a: 'A <b>Kimenő kommunikáció</b> menüben kattints az <b>Új kampány</b> gombra. Add meg a kampány nevét, válaszd ki a célcsoportot, írd meg a sablont, és ütemezd a küldést.' },
  { q: 'Hogyan adok hozzá új csapattagot?', a: 'A <b>Beállítások → Csapat</b> fülön kattints a <b>+ Új tag hozzáadása</b> gombra. Add meg a nevet, email címet, jelszót és válaszd ki a szerepkört (admin/member).' },
  { q: 'Hogyan működik a naptár?', a: 'A <b>Naptár</b> menüben látod az összes foglalást vizuálisan. Használd a heti/napi nézetet, és kattints egy időpontra a részletek megtekintéséhez.' },
  { q: 'Hogyan váltok világos és sötét mód között?', a: 'A sidebar alján található <b>Sötét mód / Világos mód</b> gombbal tudsz váltani. A beállítás megmarad a következő bejelentkezésig.' },
  { q: 'Hogyan csukhatom össze a sidebárt?', a: 'Nyomd meg a <b>Ctrl+B</b> billentyűkombinációt, vagy vidd a kurzort a sidebar jobb széléhez és kattints a megjelenő nyíl gombra.' },
];

// ── Module list ──────────────────────────────────────────────────────────────
const modules = [
  { name: 'Irányítópult', desc: 'Interakció statisztikák, foglalási arány, csatornamegoszlás, heti trendek', icon: <path d="M18 20V10M12 20V4M6 20v-6" /> },
  { name: 'Ügyfélközpont', desc: 'Interakciós lista, ügyféllista kezelés, Kanban tábla az érdeklődők nyomon követéséhez', icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></> },
  { name: 'Naptár', desc: 'Foglalások és időpontok vizuális kezelése, napi/heti/havi nézet', icon: <><rect height="18" rx="2" width="18" x="3" y="4" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { name: 'Jóváhagyó rendszer', desc: 'Bejövő emailek automatikus feldolgozása, AI válasz javaslat, jóváhagyás/elutasítás', icon: <><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></> },
  { name: 'Kimenő kommunikáció', desc: 'Email kampányok létrehozása, automatizációk beállítása, esemény alapú küldések', icon: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /> },
  { name: 'Tudástár', desc: 'Tudásbázis, AI asszisztens testreszabás, csapatkezelés, foglalási szabályok', icon: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /><path d="M8 7h8M8 11h6" /></>, last: true },
];

// ── Quick guide steps ────────────────────────────────────────────────────────
const quickSteps = [
  { n: 1, title: 'Interakciók áttekintése', sub: 'Irányítópult → KPI kártyák → Trendek' },
  { n: 2, title: 'Ügyfelek kezelése', sub: 'Ügyfélközpont → Ügyféllista / Kanban' },
  { n: 3, title: 'Kampány indítása', sub: 'Kimenő kommunikáció → Új kampány' },
];

// ── Shortcuts ────────────────────────────────────────────────────────────────
const shortcuts = [
  { label: 'Sidebar be/kikapcsolás', keys: ['Ctrl', 'B'] },
  { label: 'Keresés megnyitása', keys: ['Ctrl', 'K'] },
  { label: 'Modal / panel bezárása', keys: ['Esc'] },
  { label: 'Új oszlop hozzáadása (Kanban)', text: '+ Oszlop gomb' },
];

// ── Kbd component ────────────────────────────────────────────────────────────
function Kbd({ children }: { children: string }) {
  return (
    <kbd style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text)',
      fontFamily: "'Inter', monospace", boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    }}>{children}</kbd>
  );
}

// ── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '24px 28px', marginBottom: 20,
    }}>{children}</div>
  );
}

// ── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px',
      display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Inter', Arial, sans-serif",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'linear-gradient(135deg, rgba(28,238,224,0.15), rgba(28,238,224,0.05))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      {children}
    </h3>
  );
}

// ── FAQ accordion item ───────────────────────────────────────────────────────
function FaqItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div
      className="help-faq-item"
      style={{
        borderBottom: '1px solid var(--border)', borderRadius: 10, marginBottom: 2,
        transition: 'background 0.2s',
        background: isOpen ? 'rgba(28,238,224,0.04)' : 'transparent',
      }}
      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(28,238,224,0.04)'; }}
      onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <button onClick={onClick} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '14px 16px', border: 'none', background: 'none',
        cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500,
        color: 'var(--text)', fontFamily: 'inherit', borderRadius: 10,
      }}>
        <span>{q}</span>
        <svg className="faq-chevron" fill="none" stroke="var(--text-muted)" strokeWidth="2"
          viewBox="0 0 24 24" width="16" height="16"
          style={{ flexShrink: 0, transition: 'transform 0.25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="faq-answer" style={{
        maxHeight: isOpen ? 200 : 0, overflow: 'hidden',
        transition: 'max-height 0.3s ease',
      }}>
        <div style={{ padding: '0 16px 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: a }} />
      </div>
    </div>
  );
}

// ── Main HelpPage ────────────────────────────────────────────────────────────
export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = useCallback((i: number) => {
    setOpenFaq(prev => (prev === i ? null : i));
  }, []);

  return (
    <div className="page active" id="page-help">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 6,
          background: 'linear-gradient(135deg, rgba(28,238,224,0.15), rgba(28,238,224,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r="0.5" fill="#1ceee0" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: "'Inter', Arial, sans-serif" }}>
            Segítség &amp; Dokumentáció
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, fontFamily: "'Inter', Arial, sans-serif" }}>
            Minden, amit a DigiDesk moduljairól tudnod kell
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 24px' }} />

      {/* Quick Guide */}
      <SectionCard>
        <SectionTitle icon={
          <svg fill="none" stroke="#1ceee0" strokeWidth="2.5" viewBox="0 0 24 24" width="15" height="15"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        }>Gyors útmutató</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {quickSteps.map(s => (
            <div key={s.n} className="help-quick-step" style={{
              background: 'rgba(28,238,224,0.04)', border: '1px solid rgba(28,238,224,0.12)',
              borderRadius: 6, padding: 20, textAlign: 'center', transition: 'all 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(28,238,224,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(28,238,224,0.12)'; e.currentTarget.style.transform = 'none'; }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1ceee0, #0dbcb4)',
                color: '#082432', fontWeight: 700, fontSize: 15,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10, boxShadow: '0 4px 12px rgba(28,238,224,0.25)',
              }}>{s.n}</div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Accent divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(28,238,224,0.25), transparent)', margin: '8px 0 20px' }} />

      {/* Module Overview */}
      <SectionCard>
        <SectionTitle icon={
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        }>Modulok áttekintése</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {modules.map(m => (
            <div key={m.name} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
              borderBottom: m.last ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(28,238,224,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="18" height="18">
                  {m.icon}
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{m.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* FAQ */}
      <SectionCard>
        <SectionTitle icon={
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        }>Gyakran ismételt kérdések</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {faqs.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} isOpen={openFaq === i} onClick={() => toggleFaq(i)} />
          ))}
        </div>
      </SectionCard>

      {/* Keyboard Shortcuts */}
      <SectionCard>
        <SectionTitle icon={
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h0M10 10h0M14 10h0M18 10h0M8 14h8" /></svg>
        }>Billentyűparancsok</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {shortcuts.map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < shortcuts.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.label}</span>
              {s.keys ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {s.keys.map((k, j) => (
                    <span key={j}>
                      {j > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 4 }}>+</span>}
                      <Kbd>{k}</Kbd>
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.text}</span>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Contact + Version */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Contact */}
        <SectionCard>
          <SectionTitle icon={
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          }>Kapcsolat</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(28,238,224,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="17" height="17"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>support@thinkai.hu</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email támogatás</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(28,238,224,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="17" height="17"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.18 2 2 0 012.07 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" /></svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>+36 1 234 5678</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>H-P 9:00-17:00</div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Version & Privacy */}
        <SectionCard>
          <SectionTitle icon={
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          }>Verzió &amp; Adatvédelem</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', background: 'var(--bg)', borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Verzió</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>2.0.0-beta</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', background: 'var(--bg)', borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Utolsó frissítés</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>2026. 05. 31.</span>
            </div>
            <a href="#" onClick={e => e.preventDefault()} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              color: 'var(--accent)', textDecoration: 'none', marginTop: 8, transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
              Adatvédelmi tájékoztató
            </a>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
