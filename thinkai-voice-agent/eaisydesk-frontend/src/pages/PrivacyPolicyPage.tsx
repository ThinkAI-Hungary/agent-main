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
    <div className="page active pp-page">
      {/* Header */}
      <div className="flex-row gap-12 mb-24">
        <button
          onClick={() => navigate('/beallitasok')}
          className="pp-back-btn"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="pp-header-icon">
          <svg fill="none" stroke="#082432" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="pp-title">Adatkezelési tájékoztató</h1>
          <p className="pp-sub">GDPR megfelelőségi dokumentum · v{PRIVACY_VERSION}</p>
        </div>
      </div>

      {/* Accepted banner */}
      {accepted && consentData && (
        <div className="pp-accepted-banner">
          <svg fill="none" stroke="#10b981" strokeWidth="2.5" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="pp-accepted-title">Tájékoztató elfogadva</div>
            <div className="pp-accepted-date">
              Legutóbb elfogadva: {new Date(consentData.acceptedAt).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Last updated */}
      <div className="flex-row gap-6 pp-updated">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        Utolsó frissítés: {new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>

      {/* Sections */}
      <div className="flex-col gap-12 mb-24">
        {sections.map((s, i) => (
          <div key={i} className="pp-section-card">
            <h2 className="pp-section-title">{s.title}</h2>
            <div className="pp-section-body">{s.content}</div>
          </div>
        ))}
      </div>

      {/* Accept button */}
      {!accepted && (
        <div className="pp-accept-bar">
          <p className="pp-accept-text">
            Az eaisydesk használatával elfogadja az adatkezelési tájékoztatót.
          </p>
          <button onClick={handleAccept} className="pp-accept-btn">
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
