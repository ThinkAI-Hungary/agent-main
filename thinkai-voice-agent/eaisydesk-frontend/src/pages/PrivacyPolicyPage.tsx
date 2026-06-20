/**
 * PrivacyPolicyPage – GDPR Adatkezelési tájékoztató
 * Per-user consent stored in localStorage with username suffix.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CONSENT_KEY_PREFIX = 'eaisydesk_privacy_consent_';
const PRIVACY_VERSION = '1.0';

export interface PrivacyConsent {
  userId: string;
  acceptedAt: string;
  version: string;
}

function getKey(username: string) { return CONSENT_KEY_PREFIX + username; }

export function hasPrivacyConsent(username: string): boolean {
  try {
    const raw = localStorage.getItem(getKey(username));
    if (!raw) return false;
    return JSON.parse(raw).version === PRIVACY_VERSION;
  } catch { return false; }
}

export function getPrivacyConsent(username: string): PrivacyConsent | null {
  try {
    const raw = localStorage.getItem(getKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== PRIVACY_VERSION) return null;
    return parsed;
  } catch { return null; }
}

const sections = [
  {
    title: '1. Az adatkezelő',
    content: 'Az eaisydesk ügyfélkezelő és kommunikációs platform üzemeltetője kezeli az Ön személyes adatait a GDPR (EU 2016/679 rendelet) és az információs önrendelkezési jogról szóló 2011. évi CXII. törvény (Infotv.) rendelkezéseinek megfelelően.',
  },
  {
    title: '2. Kezelt adatok köre',
    content: 'A rendszer az alábbi személyes adatokat kezeli:\n• Felhasználói azonosítók (név, e-mail cím, jelszó-kivonat)\n• Ügyfél adatok (név, telefonszám, e-mail cím, megjegyzések, címkék)\n• Interakciós adatok (beszélgetések, AI válaszok, csatorna, időpont)\n• Foglalási adatok (időpont, szolgáltatás, orvos/szakember)\n• Hozzáférési naplók (bejelentkezés, műveletek időbélyege)',
  },
  {
    title: '3. Az adatkezelés jogalapja',
    content: 'Az adatkezelés jogalapja:\n• Szerződés teljesítése (GDPR 6. cikk (1) b) — ügyfélkezelési szolgáltatás nyújtása\n• Jogos érdek (GDPR 6. cikk (1) f) — AI-alapú válaszgenerálás és automatizáció\n• Hozzájárulás (GDPR 6. cikk (1) a) — analitikai célú adatgyűjtés, süti használat',
  },
  {
    title: '4. Az adatkezelés időtartama',
    content: 'A személyes adatok megőrzési ideje:\n• Ügyfél adatok: az ügyfélkapcsolat fennállása + 2 év\n• Interakciós naplók: 1 év\n• AI piszkozatok és válaszok: jóváhagyásig vagy 30 nap\n• Felhasználói fiók adatok: a fiók törléséig\n• Hozzáférési naplók: 1 év',
  },
  {
    title: '5. Érintetti jogok',
    content: 'Önnek joga van:\n• Hozzáférés — személyes adatairól másolatot kérni\n• Helyesbítés — pontatlan adatokat javíttatni\n• Törlés — adatainak törlését kérni („elfeledtetéshez való jog")\n• Adathordozhatóság — adatait géppel olvasható formátumban megkapni\n• Tiltakozás — az adatkezelés ellen tiltakozni\n\nKérelmét a Beállítások → Biztonság → GDPR menüpontban nyújthatja be.',
  },
  {
    title: '6. Adatbiztonság',
    content: 'A rendszer az alábbi biztonsági intézkedéseket alkalmazza:\n• JWT token alapú hitelesítés\n• Munkamenet időtúllépés konfigurálható időközönként\n• Hozzáférési napló minden felhasználói műveletről\n• Jelszó-kivonat tárolás (bcrypt)\n• Szerepkör-alapú hozzáférés-vezérlés (admin, manager, member)',
  },
  {
    title: '7. Sütik (Cookie-k)',
    content: 'A rendszer az alábbi sütiket használja:\n• Szükséges sütik — munkamenet és bejelentkezés kezelése (kötelező)\n• Funkcionális sütik — felhasználói beállítások megjegyzése (opcionális)\n• Analitikai sütik — használati statisztikák (opcionális)\n\nA süti beállításokat a belépéskor megjelenő banneren kezelheti.',
  },
  {
    title: '8. Kapcsolat',
    content: 'Adatvédelmi kérdésekkel kapcsolatban forduljon hozzánk:\n• Az alkalmazáson belül: Beállítások → Biztonság → GDPR kérelmek\n• Adat export: Beállítások → Biztonság → GDPR → Adat export',
  },
];

export default function PrivacyPolicyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (user) setAccepted(hasPrivacyConsent(user.username));
  }, [user]);

  const handleAccept = () => {
    if (!user) return;
    const consent: PrivacyConsent = {
      userId: user.username,
      acceptedAt: new Date().toISOString(),
      version: PRIVACY_VERSION,
    };
    localStorage.setItem(getKey(user.username), JSON.stringify(consent));
    setAccepted(true);
  };

  const consentData = user ? getPrivacyConsent(user.username) : null;

  return (
    <div className="page active" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/beallitasok')}
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit',
          }}
        >
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
          </svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Adatkezelési tájékoztató</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>GDPR megfelelőségi dokumentum · v{PRIVACY_VERSION}</p>
        </div>
      </div>

      {/* Accepted banner */}
      {accepted && consentData && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 16,
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 12, marginBottom: 20,
        }}>
          <svg fill="none" stroke="#10b981" strokeWidth="2.5" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>Tájékoztató elfogadva</div>
            <div style={{ fontSize: 11, color: 'rgba(5,150,105,0.7)' }}>
              Legutóbb elfogadva: {new Date(consentData.acceptedAt).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Last updated */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        Utolsó frissítés: {new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {sections.map((s, i) => (
          <div key={i} style={{
            background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
            padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{s.title}</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.content}</div>
          </div>
        ))}
      </div>

      {/* Accept button */}
      {!accepted && (
        <div style={{
          position: 'sticky', bottom: 16,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Az eaisydesk használatával elfogadja az adatkezelési tájékoztatót.
          </p>
          <button onClick={handleAccept} style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, var(--accent, #1ceee0), var(--accent2, #0bbdb1))',
            color: '#082432', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Elfogadom
          </button>
        </div>
      )}
    </div>
  );
}
