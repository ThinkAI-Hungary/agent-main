import { useState, useEffect, useRef, useLayoutEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/* ── Showcase slide data ── */
interface ShowcaseSlide {
  title: string;
  description: string;
  visual: ReactNode;
}

const showcaseSlides: ShowcaseSlide[] = [
  {
    title: 'AI ügyfélszolgálat, valós időben',
    description: 'Automatikus válaszok Messenger, email és telefonon — az AI ágens éjjel-nappal dolgozik, időpontot foglal, kérdésekre válaszol.',
    visual: (
      <div className="showcase-visual">
        <div className="showcase-chat">
          <div className="chat-bubble incoming">
            <div className="chat-sender">Ügyfél · Messenger</div>
            <div className="chat-text">Sziasztok! Szeretnék időpontot foglalni holnapra, van szabad hely?</div>
            <div className="chat-time">14:32</div>
          </div>
          <div className="chat-bubble outgoing">
            <div className="chat-sender">
              <span className="ai-badge">AI</span> eaisyDesk
            </div>
            <div className="chat-text">Szia! 😊 Holnap 10:00 és 14:30 van szabad. Melyik időpont lenne jó?</div>
            <div className="chat-time">14:32</div>
          </div>
          <div className="chat-bubble incoming">
            <div className="chat-sender">Ügyfél · Messenger</div>
            <div className="chat-text">A 10 órás tökéletes lenne!</div>
            <div className="chat-time">14:33</div>
          </div>
          <div className="chat-bubble outgoing">
            <div className="chat-sender">
              <span className="ai-badge">AI</span> eaisyDesk
            </div>
            <div className="chat-text">Lefoglaltam holnap 10:00-ra! 📅 Emlékeztetőt küldök 1 órával előtte.</div>
            <div className="chat-time">14:33</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Átfogó analitika és KPI-ok',
    description: 'Egyetlen dashboard, ahol minden fontos metrikát látsz: foglalások, ügyfélszolgálat, konverziók — valós idejű adatokkal.',
    visual: (
      <div className="showcase-visual">
        <div className="showcase-kpi-grid">
          <div className="showcase-kpi">
            <div className="kpi-header">
              <span className="kpi-label">Interakciók</span>
              <span className="kpi-trend up">+24%</span>
            </div>
            <div className="kpi-value">1,847</div>
            <div className="kpi-subtitle">ez a hónap</div>
          </div>
          <div className="showcase-kpi">
            <div className="kpi-header">
              <span className="kpi-label">Foglalások</span>
              <span className="kpi-trend up">+18%</span>
            </div>
            <div className="kpi-value">342</div>
            <div className="kpi-subtitle">ez a hónap</div>
          </div>
          <div className="showcase-kpi">
            <div className="kpi-header">
              <span className="kpi-label">Válaszidő</span>
              <span className="kpi-trend down">-45%</span>
            </div>
            <div className="kpi-value">&lt;30s</div>
            <div className="kpi-subtitle">átlagos</div>
          </div>
          <div className="showcase-kpi">
            <div className="kpi-header">
              <span className="kpi-label">Elégedettség</span>
              <span className="kpi-trend up">+8%</span>
            </div>
            <div className="kpi-value">96%</div>
            <div className="kpi-subtitle">ügyfél feedback</div>
          </div>
        </div>
        <div className="showcase-chart-bar">
          <div className="chart-header">
            <span>Heti interakciók</span>
            <span className="chart-legend">
              <span className="dot messenger" /> Messenger
              <span className="dot email" /> Email
            </span>
          </div>
          <div className="chart-bars">
            {[65, 45, 80, 55, 90, 70, 85].map((h, i) => (
              <div key={i} className="bar-col">
                <div className="bar" style={{ height: `${h}%` }} />
                <span className="bar-label">{['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Intelligens ügyfélkezelés',
    description: 'Kanban board, ügyfélkártyák és teljes interakciós előzmények egy helyen — azonnal látod ki mit írt és mikor.',
    visual: (
      <div className="showcase-visual">
        <div className="showcase-clients">
          {[
            { name: 'Kovács Anna', status: 'VIP', lastMsg: 'Időpont visszaigazolva', channel: 'Messenger', time: '2 perce' },
            { name: 'Nagy Péter', status: 'Aktív', lastMsg: 'Szolgáltatás érdeklődés', channel: 'Email', time: '15 perce' },
            { name: 'Szabó Éva', status: 'Új', lastMsg: 'Első kapcsolatfelvétel', channel: 'Telefon', time: '1 órája' },
            { name: 'Tóth Balázs', status: 'Visszatérő', lastMsg: 'Kontroll időpont kérés', channel: 'WhatsApp', time: '3 órája' },
          ].map((c) => (
            <div key={c.name} className="client-row">
              <div className="client-avatar">{c.name.split(' ').map(w => w[0]).join('')}</div>
              <div className="client-info">
                <div className="client-name-row">
                  <span className="client-name">{c.name}</span>
                  <span className={`client-status ${c.status.toLowerCase()}`}>{c.status}</span>
                </div>
                <div className="client-meta">
                  <span className="client-msg">{c.lastMsg}</span>
                  <span className="client-channel">{c.channel} · {c.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Automatizált kommunikáció',
    description: 'Emlékeztetők, follow-up üzenetek és kampányok — beállítod egyszer, az AI gondoskodik az ügyfeleidről automatikusan.',
    visual: (
      <div className="showcase-visual">
        <div className="showcase-automations">
          {[
            { trigger: 'Időpont foglalás', action: 'Visszaigazolás + emlékeztető', delay: 'Azonnal', active: true, color: '#22c55e' },
            { trigger: 'Lemondás', action: 'Újrafoglalás ajánlat', delay: '30 perc', active: true, color: '#f97316' },
            { trigger: 'Nem jelent meg', action: 'Utánkövetés + új időpont', delay: '2 óra', active: true, color: '#ef4444' },
            { trigger: 'Vizit után 7 nap', action: 'Elégedettségi kérdőív', delay: '7 nap', active: false, color: '#8b5cf6' },
          ].map((a) => (
            <div key={a.trigger} className="automation-row">
              <div className="auto-indicator" style={{ background: a.active ? a.color : 'var(--text-dim)' }} />
              <div className="auto-content">
                <div className="auto-trigger">{a.trigger}</div>
                <div className="auto-action">{a.action}</div>
              </div>
              <div className="auto-meta">
                <span className="auto-delay">{a.delay}</span>
                <span className={`auto-badge ${a.active ? 'active' : 'inactive'}`}>
                  {a.active ? 'Aktív' : 'Inaktív'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function LoginPage() {
  const { login, logoutMessage } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /* ══════ Showcase tape animation state ══════ */
  const tapeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number>(undefined);
  const isHoverRef = useRef(false);
  const scrollVelRef = useRef(0);

  // Click-to-inspect state
  const [selectedAbsIdx, setSelectedAbsIdx] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedDims, setSelectedDims] = useState<{ w: number; h: number } | null>(null);
  const pausedRef = useRef(false);

  // SVG refs
  const svgRef = useRef<SVGSVGElement>(null);
  const svgPath1Ref = useRef<SVGPathElement>(null);
  const svgPath2Ref = useRef<SVGPathElement>(null);
  const svgConnRef = useRef<SVGSVGElement>(null);
  const svgConnPathRef = useRef<SVGPathElement>(null);
  const svgConnTopRef = useRef<SVGPathElement>(null);
  const svgConnLeftRef = useRef<SVGPathElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const borderAnimRef = useRef<number>(undefined);
  const targetPosRef = useRef<number | null>(null);
  const onScrollDone = useRef<(() => void) | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const dismissingRef = useRef(false);
  const dismissTimerRef = useRef<number>(undefined);
  const fadingDimsRef = useRef<{ w: number; h: number } | null>(null);
  const selectedDimsRef = useRef<{ w: number; h: number } | null>(null);
  const selectedOffsetTopRef = useRef(0);

  selectedDimsRef.current = selectedDims;

  // ── Continuous downward scroll animation ──
  useEffect(() => {
    const SPEED = 0.35;
    const tick = () => {
      const strip = tapeRef.current;
      if (strip) {
        const base = pausedRef.current ? 0 : (isHoverRef.current ? SPEED * 0.15 : SPEED);
        const vel = scrollVelRef.current;
        scrollVelRef.current = Math.abs(vel) < 0.01 ? 0 : vel * 0.90;
        const half = strip.scrollHeight / 2;
        let step: number;
        if (targetPosRef.current !== null) {
          let diff = targetPosRef.current - posRef.current;
          if (diff > half / 2) diff -= half;
          if (diff < -half / 2) diff += half;
          step = diff * 0.12;
          if (Math.abs(diff) < 0.6) {
            posRef.current = targetPosRef.current;
            targetPosRef.current = null;
            step = 0;
            if (onScrollDone.current) { onScrollDone.current(); onScrollDone.current = null; }
          }
        } else {
          step = base + vel;
        }
        posRef.current = ((posRef.current + step) % half + half) % half;
        strip.style.transform = `translate3d(0, ${posRef.current - half}px, 0)`;
        // Keep SVG border stuck to selected slide
        if (svgRef.current && svgRef.current.style.display !== 'none') {
          svgRef.current.style.top = `${selectedOffsetTopRef.current + (posRef.current - half)}px`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current!);
  }, []);

  // ── Non-passive wheel listener ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (pausedRef.current && !dismissingRef.current) {
        handleFadeDismiss();
      }
      scrollVelRef.current += -e.deltaY * 0.06;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Border sweep + L connector animation ──
  useLayoutEffect(() => {
    if (selectedAbsIdx === null || !selectedDims) return;
    const p1 = svgPath1Ref.current;
    const p2 = svgPath2Ref.current;
    const svg = svgRef.current;
    if (!p1 || !p2 || !svg) return;

    const rx = 12;
    const { w, h } = selectedDims;
    const halfPerim = (h / 2 - rx) + (w - 2 * rx) + (h / 2 - rx) + Math.PI * rx;

    // Phase 1: border sweep (0.6s)
    const SWEEP_MS = 600;
    const sweepStart = performance.now();
    [p1, p2].forEach(path => {
      path.style.transition = 'none';
      path.style.strokeDasharray = String(halfPerim);
      path.style.strokeDashoffset = String(halfPerim);
    });
    svg.style.filter = 'drop-shadow(0 0 4px rgba(28,238,224,.95)) drop-shadow(0 0 12px rgba(28,238,224,.6))';
    const cs = svgConnRef.current;
    if (cs) cs.style.opacity = '0';

    const sweepTick = (now: number) => {
      if (dismissingRef.current) return;
      const progress = Math.min((now - sweepStart) / SWEEP_MS, 1);
      const offset = halfPerim * (1 - progress);
      p1.style.strokeDashoffset = String(offset);
      p2.style.strokeDashoffset = String(offset);
      if (progress < 1) {
        borderAnimRef.current = requestAnimationFrame(sweepTick);
      }
    };
    cancelAnimationFrame(borderAnimRef.current!);
    borderAnimRef.current = requestAnimationFrame(sweepTick);

    // Phase 2: L connector + popup border traces
    const t1 = window.setTimeout(() => {
      if (dismissingRef.current) return;
      const cp = svgConnPathRef.current;
      const cs2 = svgConnRef.current;
      const cwP = svgConnTopRef.current;
      const ccwP = svgConnLeftRef.current;
      const popup = popupRef.current;
      if (!cp || !cs2 || !containerRef.current || !wrapperRef.current || !popup) { setShowPopup(true); return; }

      const wRect = wrapperRef.current.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();
      const pRect = popup.getBoundingClientRect();
      const cardMidY = cRect.top - wRect.top + 330;
      const pl = pRect.left - wRect.left;
      const pt = pRect.top - wRect.top;
      const pw = pRect.width;
      const ph = pRect.height;
      const rp = 12;
      const lr = 16;
      const lHoriz = pl - lr - w;
      const lVert = cardMidY - lr - (pt + rp);
      const lArc = Math.PI * lr / 2;
      const connLen = lHoriz + lArc + lVert;

      cp.setAttribute('d', `M ${w},${cardMidY} H ${pl - lr} A ${lr},${lr} 0 0,0 ${pl},${cardMidY - lr} V ${pt + rp}`);
      cp.style.transition = 'none';
      cp.style.strokeDasharray = String(connLen);
      cp.style.strokeDashoffset = String(connLen);

      const cwLen = (Math.PI * rp / 2) * 3 + (pw - 2 * rp) + (ph - 2 * rp);
      if (cwP) {
        cwP.setAttribute('d',
          `M ${pl},${pt + rp} A ${rp},${rp} 0 0,1 ${pl + rp},${pt}` +
          ` H ${pl + pw - rp} A ${rp},${rp} 0 0,1 ${pl + pw},${pt + rp}` +
          ` V ${pt + ph - rp} A ${rp},${rp} 0 0,1 ${pl + pw - rp},${pt + ph}`);
        cwP.style.transition = 'none';
        cwP.style.strokeDasharray = String(cwLen);
        cwP.style.strokeDashoffset = String(cwLen);
      }
      const ccwLen = (Math.PI * rp / 2) + (ph - 2 * rp) + (pw - 2 * rp);
      if (ccwP) {
        ccwP.setAttribute('d',
          `M ${pl},${pt + rp} V ${pt + ph - rp} A ${rp},${rp} 0 0,0 ${pl + rp},${pt + ph}` +
          ` H ${pl + pw - rp}`);
        ccwP.style.transition = 'none';
        ccwP.style.strokeDasharray = String(ccwLen);
        ccwP.style.strokeDashoffset = String(ccwLen);
      }

      cs2.style.opacity = '1';
      void cp.getBoundingClientRect();
      cp.style.transition = 'stroke-dashoffset 0.4s linear';
      cp.style.strokeDashoffset = '0';

      const traceDur = 0.45;
      const ccwDur = traceDur * (ccwLen / cwLen);
      window.setTimeout(() => {
        if (dismissingRef.current) return;
        if (cwP) { cwP.style.transition = `stroke-dashoffset ${traceDur}s linear`; cwP.style.strokeDashoffset = '0'; }
        if (ccwP) { ccwP.style.transition = `stroke-dashoffset ${ccwDur.toFixed(3)}s linear`; ccwP.style.strokeDashoffset = '0'; }
      }, 420);
    }, 620);

    // Phase 3: reveal popup
    const t2 = window.setTimeout(() => {
      if (dismissingRef.current) return;
      setShowPopup(true);
    }, 620 + 420 + 470);

    return () => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(borderAnimRef.current!); };
  }, [selectedAbsIdx, selectedDims]);

  // ── Handle slide click ──
  const handleSlideClick = useCallback((absIdx: number, el: HTMLElement) => {
    if (pausedRef.current || dismissingRef.current) return;
    cancelAnimationFrame(borderAnimRef.current!);
    setShowPopup(false);
    setSelectedDims(null);
    setSelectedAbsIdx(absIdx);
    pausedRef.current = true;

    const strip = tapeRef.current;
    if (!strip) return;
    const CONTAINER_H = 640;
    const slideH = el.offsetHeight - 24; // subtract padding-bottom
    const dims = { w: el.offsetWidth, h: slideH };
    const half = strip.scrollHeight / 2;
    selectedOffsetTopRef.current = el.offsetTop;
    const rawTarget = (CONTAINER_H - slideH) / 2 - el.offsetTop + half;
    targetPosRef.current = ((rawTarget % half) + half) % half;
    onScrollDone.current = () => {
      selectedOffsetTopRef.current = (CONTAINER_H - dims.h) / 2 + half - posRef.current;
      setSelectedDims(dims);
    };
  }, []);

  // ── Fade dismiss ──
  const handleFadeDismiss = useCallback(() => {
    if (!pausedRef.current && !dismissingRef.current) return;
    clearTimeout(dismissTimerRef.current);
    fadingDimsRef.current = selectedDimsRef.current;
    dismissingRef.current = true;
    pausedRef.current = false;
    targetPosRef.current = null;
    onScrollDone.current = null;
    setDismissing(true);
    const conn = svgConnRef.current;
    if (conn) { conn.style.transition = 'opacity 0.5s ease'; conn.style.opacity = '0'; }
    dismissTimerRef.current = window.setTimeout(() => {
      dismissingRef.current = false;
      fadingDimsRef.current = null;
      if (conn) { conn.style.transition = 'none'; conn.style.opacity = '0'; }
      setDismissing(false);
      setSelectedAbsIdx(null);
      setSelectedDims(null);
      setShowPopup(false);
    }, 500);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Kérlek, töltsd ki mindkét mezőt.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nem sikerült csatlakozni a szerverhez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* Full-screen wave background */}
      <img
        src={isDark ? '/admin/wave_dark.webp' : '/admin/wave_bright.webp'}
        alt=""
        aria-hidden="true"
        className="login-wave-bg"
      />

      {/* ── Left: Form area ── */}
      <div className="login-left">
        <button className="login-theme-toggle" onClick={toggleTheme} aria-label="Téma váltás">
          {isDark ? (
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="login-form-card">
          <div className="login-logo">
            <div className="login-logo-icon">e</div>
            <span className="login-logo-text">
              <span className="logo-e">e</span>
              <span className="logo-ai">ai</span>
              <span className="logo-sy">sy</span>
              <span className="logo-desk">desk</span>
            </span>
          </div>

          <div className="login-welcome">
            <h1 className="login-title">Üdv újra!</h1>
            <p className="login-subtitle">Jelentkezz be a fiókodba a folytatáshoz.</p>
          </div>

          {(error || logoutMessage) && (
            <div className="login-error" style={{ display: 'flex' }}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              <span>{error || logoutMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="login-email">Email cím</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <input
                  id="login-email"
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@thinkai.com"
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="login-password">Jelszó</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="login-password"
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e); }}
                />
              </div>
            </div>
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? (
                <span className="login-btn-loading">
                  <svg className="spin" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="18" height="18">
                    <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M4 12a8 8 0 018-8" opacity="0.75" />
                  </svg>
                  Belépés...
                </span>
              ) : 'Belépés'}
            </button>
          </form>

          <div className="login-footer">
            <span>Powered by</span>
            <strong>ThinkAI</strong>
          </div>
        </div>
      </div>

      {/* ── Right: Showcase area (hidden on mobile) ── */}
      <div className="login-right">
        <div ref={wrapperRef} className="login-showcase-wrapper">
          <h2 className="login-showcase-title">
            Ügyfélszolgálat,
            <br />
            <span className="accent">újragondolva.</span>
          </h2>

          {/* Scrolling tape */}
          <div
            ref={containerRef}
            className="login-tape-container"
            onClick={handleFadeDismiss}
            onMouseEnter={() => { isHoverRef.current = true; }}
            onMouseLeave={() => { isHoverRef.current = false; }}
          >
            {/* Neon border SVG overlay */}
            <svg
              ref={svgRef}
              className="login-svg-border"
              style={{
                display: 'block',
                left: 0,
                width: (selectedDims ?? fadingDimsRef.current)?.w ?? 0,
                height: (selectedDims ?? fadingDimsRef.current)?.h ?? 0,
                overflow: 'visible',
                opacity: (!selectedDims && !dismissing) ? 0 : (dismissing ? 0 : 1),
                transition: dismissing ? 'opacity 0.5s ease' : 'none',
              }}
            >
              <path
                ref={svgPath1Ref}
                fill="none" stroke="rgba(28,238,224,0.96)" strokeWidth="2.5" strokeLinecap="round"
                d={selectedDims
                  ? `M 1,${selectedDims.h / 2} V 13 A 12,12 0 0,1 13,1 H ${selectedDims.w - 13} A 12,12 0 0,1 ${selectedDims.w - 1},13 V ${selectedDims.h / 2}`
                  : ''}
              />
              <path
                ref={svgPath2Ref}
                fill="none" stroke="rgba(28,238,224,0.96)" strokeWidth="2.5" strokeLinecap="round"
                d={selectedDims
                  ? `M 1,${selectedDims.h / 2} V ${selectedDims.h - 13} A 12,12 0 0,0 13,${selectedDims.h - 1} H ${selectedDims.w - 13} A 12,12 0 0,0 ${selectedDims.w - 1},${selectedDims.h - 13} V ${selectedDims.h / 2}`
                  : ''}
              />
            </svg>

            <div ref={tapeRef} className="login-tape-strip">
              {[...showcaseSlides, ...showcaseSlides].map((slide, i) => (
                <div
                  key={i}
                  className="tape-slide"
                  onClick={(e) => { e.stopPropagation(); handleSlideClick(i, e.currentTarget); }}
                >
                  <div className="tape-slide-inner">
                    <div className="tape-slide-header">
                      <h3>{slide.title}</h3>
                      <p>{slide.description}</p>
                    </div>
                    {slide.visual}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Popup */}
          {selectedDims && selectedAbsIdx !== null && (
            <div
              ref={popupRef}
              className="login-popup"
              style={{
                opacity: showPopup ? (dismissing ? 0 : 1) : 0,
                transition: dismissing ? 'opacity 0.5s ease' : (showPopup ? 'opacity 0.3s ease' : 'none'),
              }}
            >
              <div className="login-popup-inner">
                <p>{showcaseSlides[selectedAbsIdx % showcaseSlides.length].description}</p>
              </div>
            </div>
          )}

          {/* Connector SVG */}
          <svg
            ref={svgConnRef}
            className="login-svg-connector"
            style={{ overflow: 'visible' }}
          >
            <path ref={svgConnPathRef} fill="none" stroke="rgba(28,238,224,0.96)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path ref={svgConnTopRef} fill="none" stroke="rgba(28,238,224,0.96)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path ref={svgConnLeftRef} fill="none" stroke="rgba(28,238,224,0.96)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
