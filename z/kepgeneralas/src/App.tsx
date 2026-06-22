import { useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { PostCreative, BrandKit, SystemLog, Campaign } from './types';
import {
  INITIAL_BRAND_KITS,
  INITIAL_CREATIVES,
  INITIAL_SCHEDULED_POSTS,
  INITIAL_LOGS
} from './dummyData';
import { BrandKitView } from './components/BrandKitView';
import { GeneratorSimulator } from './components/GeneratorSimulator';
import { CreativeCard } from './components/CreativeCard';
import { ScheduleView } from './components/ScheduleView';
import { AdminMonitor } from './components/AdminMonitor';
import { CampaignCreator } from './components/CampaignCreator';
import { ImageTestLab } from './components/ImageTestLab';
import { OverlayTestLab } from './components/OverlayTestLab';
import {
  Sparkles,
  Palette,
  Terminal,
  Grid,
  Layout,
  Coffee,
  CheckCircle,
  TrendingUp,
  Zap,
  Layers
} from 'lucide-react';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [brandKits, setBrandKits] = useState<BrandKit[]>(INITIAL_BRAND_KITS);
  const [activeKitId, setActiveKitId] = useState<string>('kit-v2');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  
  // Combine initial drafts and scheduled/published posts into state
  const [creatives, setCreatives] = useState<PostCreative[]>([
    ...INITIAL_CREATIVES,
    ...INITIAL_SCHEDULED_POSTS
  ]);
  
  const [logs, setLogs] = useState<SystemLog[]>(INITIAL_LOGS);
  const [shouldSimulateError, setShouldSimulateError] = useState<boolean>(false);
  
  const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];

  // LOGS LOGIC helper
  const addLog = (message: string, level: 'info' | 'warn' | 'error' | 'success', step?: 'queue' | 'orchestrator' | 'renderer' | 'meta-api') => {
    const newLog: SystemLog = {
      id: `log-added-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      step
    };
    setLogs(prev => [newLog, ...prev]);
  };

  // HANDLERS
  const handleGenerateStart = (briefText: string) => {
    addLog(`Új generálási folyamat elindítva brief alapján: "${briefText}"`, 'info', 'queue');
  };

  const handleCampaignComplete = (_newCampaign: Campaign, newLogs: SystemLog[]) => {
    setLogs(prev => [...newLogs, ...prev]);
  };

  const handleGenerateComplete = (newCreatives: PostCreative[], newLogs: SystemLog[]) => {
    setCreatives(prev => [...newCreatives, ...prev]);
    // Prepend logs
    setLogs(prev => [...newLogs, ...prev]);
  };

  const handleApprove = (id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'approved' } : p))
    );
    addLog(`Kreatív jóváhagyva (ID: ${id.substring(0, 8)}). Készen áll az ütemezésre vagy publikálásra.`, 'success', 'queue');
  };

  const handleReject = (id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'rejected' } : p))
    );
    addLog(`Kreatív elutasítva és elvetve (ID: ${id.substring(0, 8)}).`, 'warn', 'queue');
  };

  const handleUpdateText = async (id: string, newText: string) => {
    try {
      const post = creatives.find(c => c.id === id);
      if (!post) return;
      
      const response = await fetch('/api/render-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post,
          brandKit: activeKit,
          text: newText
        })
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      const updatedPost = await response.json();
      setCreatives(prev => prev.map(p => p.id === id ? updatedPost : p));
      
      addLog(`[RENDER] Playwright újrarenderelés sikeresen befejeződött (ID: ${id.substring(0, 8)}). A javított szöveg érvényesítve.`, 'success', 'renderer');
    } catch (err: any) {
      console.error(err);
      addLog(`[Hiba] Újrarenderelés sikertelen: ${err.message || err}`, 'error', 'renderer');
    }
  };

  const handleExtractBrandKit = async (url: string) => {
    setIsExtracting(true);
    addLog(`[SCRAPE] Márka kinyerés elindítva a következő weboldalról: ${url}`, 'info', 'queue');
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      const scrapedKit = await response.json();
      const nextVer = brandKits.length + 1;
      const finalKit: BrandKit = {
        ...scrapedKit,
        id: `kit-v${nextVer}`,
        version: nextVer,
        createdAt: new Date().toISOString()
      };
      
      setBrandKits(prev => [...prev, finalKit]);
      setActiveKitId(finalKit.id);
      
      addLog(`[SUCCESS] Márka arculat sikeresen kinyerve és elmentve a(z) ${url} címről (Verzió ${nextVer})`, 'success', 'orchestrator');
    } catch (err: any) {
      console.error(err);
      addLog(`[Hiba] Márka kinyerés sikertelen: ${err.message || err}`, 'error', 'orchestrator');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSchedule = (id: string, dateStr: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'scheduled', scheduledAt: dateStr } : p))
    );
    addLog(`Kreatív ütemezve (ID: ${id.substring(0, 8)}). Ütemezés dátuma: ${new Date(dateStr).toLocaleString('hu-HU')}`, 'info', 'queue');
  };

  const handlePostNow = (id: string) => {
    // 1. Instantly trigger state change
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'published', publishedAt: new Date().toISOString(), instagramUrl: `https://instagram.com/p/mock_post_${Date.now()}/` } : p))
    );

    // 2. Stream steps into console logs
    addLog(`[META API] Publikációs folyamat kezdeményezve Meta Graph API-n keresztül (ID: ${id.substring(0, 8)})`, 'info', 'meta-api');
    
    setTimeout(() => {
      addLog(`[META API] Instagram média konténer sikeresen létrehozva. (1/2 lépés kész)`, 'info', 'meta-api');
    }, 800);

    setTimeout(() => {
      addLog(`[META API] Média sikeresen publikálva. Bejegyzés URL: https://instagram.com/p/mock_post_${Date.now()}/ (2/2 kész)`, 'success', 'meta-api');
      addLog(`[RESEND API] Sikeres publikálásról szóló értesítő email elküldve Kovács Anna részére (Resend kézbesítve).`, 'success', 'queue');
    }, 1600);
  };

  const handleCancelSchedule = (id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'approved', scheduledAt: undefined } : p))
    );
    addLog(`Ütemezés törölve (ID: ${id.substring(0, 8)}). Bejegyzés visszaminősítve jóváhagyott státuszra.`, 'warn', 'queue');
  };

  const handleSaveBrandKit = (newKit: BrandKit) => {
    setBrandKits(prev => [...prev, newKit]);
    setActiveKitId(newKit.id);
    addLog(`Új Brand Kit verzió elmentve és aktiválva: Verzió ${newKit.version}`, 'success', 'orchestrator');
  };

  // STATISTICS count helpers
  const draftCount = creatives.filter(c => c.status === 'draft').length;
  const approvedCount = creatives.filter(c => c.status === 'approved').length;
  const scheduledCount = creatives.filter(c => c.status === 'scheduled').length;
  const publishedCount = creatives.filter(c => c.status === 'published').length;

  return (
    <div className="app-container">
      {/* Dynamic Sidebar Navigation */}
      <aside className="app-sidebar glass-panel">
        <div className="logo-section">
          <div className="logo-spark-circle animate-spin-slow">
            <Sparkles size={20} className="logo-glow-icon" />
          </div>
          <div>
            <h1>AI Creative</h1>
            <span className="logo-sub">Studio — Tech PoC</span>
          </div>
        </div>

        {/* User context badge */}
        <div className="user-profile-badge">
          <div className="avatar-container">
            <Coffee size={18} />
          </div>
          <div className="user-info">
            <span className="username">Kovács Anna</span>
            <span className="shopname">Anna Kávézója</span>
          </div>
          <span className="online-dot" />
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${currentPath === '/' ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            <Layout size={18} />
            <span>Kreatív Generátor</span>
            {draftCount > 0 && <span className="nav-badge-count">{draftCount}</span>}
          </button>

          <button
            className={`nav-item ${currentPath === '/kampanyok' ? 'active' : ''}`}
            onClick={() => navigate('/kampanyok')}
          >
            <TrendingUp size={18} />
            <span>AI Kampányok</span>
            <span className="nav-badge-count" style={{ backgroundColor: 'var(--accent-pink)' }}>Új</span>
          </button>

          <button
            className={`nav-item ${currentPath === '/imagelab' ? 'active' : ''}`}
            onClick={() => navigate('/imagelab')}
          >
            <Zap size={18} />
            <span>Image Lab</span>
            <span className="nav-badge-count" style={{ backgroundColor: '#f59e0b' }}>A/B</span>
          </button>

          <button
            className={`nav-item ${currentPath === '/overlay-lab' ? 'active' : ''}`}
            onClick={() => navigate('/overlay-lab')}
          >
            <Layers size={18} />
            <span>Overlay Lab</span>
            <span className="nav-badge-count" style={{ backgroundColor: 'var(--primary-neon)' }}>Új</span>
          </button>

          <button
            className={`nav-item ${currentPath === '/brandkit' ? 'active' : ''}`}
            onClick={() => navigate('/brandkit')}
          >
            <Palette size={18} />
            <span>Brand Kit Kezelő</span>
            <span className="nav-badge-ver">v{activeKit.version}</span>
          </button>

          <button
            className={`nav-item ${currentPath === '/naptar' ? 'active' : ''}`}
            onClick={() => navigate('/naptar')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }}>
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
            <span>Instagram Naptár</span>
            {scheduledCount > 0 && <span className="nav-badge-alert">{scheduledCount}</span>}
          </button>

          <button
            className={`nav-item ${currentPath === '/admin' ? 'active' : ''}`}
            onClick={() => navigate('/admin')}
          >
            <Terminal size={18} />
            <span>Háttér Diagnosztika</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="poc-tag">PROTOTYPE V1.0</span>
          <span className="copyright">© 2026 Think AI</span>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={
            <div className="dashboard-layout">
              <div className="dashboard-grid-left">
                {/* Generator input card */}
                <GeneratorSimulator
                  activeBrandKit={activeKit}
                  onGenerateStart={handleGenerateStart}
                  onGenerateComplete={handleGenerateComplete}
                  shouldSimulateError={shouldSimulateError}
                  pastApproved={creatives.filter(c => c.status === 'approved')}
                />

                {/* Draft Creatives grid */}
                <div className="draft-creatives-section">
                  <div className="section-title-row">
                    <h3>Generált Kreatívok</h3>
                    <p className="subtitle">Elkészült tervek (Jóváhagyásra vár)</p>
                  </div>

                  {creatives.filter(c => c.status === 'draft').length === 0 ? (
                    <div className="empty-state-panel glass-panel">
                      <CheckCircle size={32} className="empty-state-icon" />
                      <h4>Nincs jóváhagyásra váró kreatív</h4>
                      <p>Írj be egy témát felül és indítsd el a generátort!</p>
                    </div>
                  ) : (
                    <div className="creatives-display-grid">
                      {creatives
                        .filter(c => c.status === 'draft')
                        .map(post => (
                          <CreativeCard
                            key={post.id}
                            post={post}
                            brandKit={activeKit}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onUpdateText={handleUpdateText}
                            onSchedule={handleSchedule}
                            onPostNow={handlePostNow}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Dashboard Sidebar summary */}
              <div className="dashboard-summary-sidebar">
                {/* Brand Kit Quick Glance */}
                <div className="glass-panel summary-widget">
                  <h4 className="widget-title"><Palette size={16} /> Aktív Brand Kit</h4>
                  <div className="quick-kit-details">
                    <div className="quick-row">
                      <span className="lbl">Aktív Verzió:</span>
                      <span className="val highlight">v{activeKit.version}</span>
                    </div>
                    <div className="quick-row">
                      <span className="lbl">Betűtípus:</span>
                      <span className="val" style={{ fontFamily: activeKit.typography.fontName }}>{activeKit.typography.fontName}</span>
                    </div>
                    <div className="quick-colors-row">
                      <div className="dot-color" style={{ backgroundColor: activeKit.colors.primary }} title="Primary" />
                      <div className="dot-color" style={{ backgroundColor: activeKit.colors.secondary }} title="Secondary" />
                      <div className="dot-color" style={{ backgroundColor: activeKit.colors.accent }} title="Accent" />
                    </div>
                  </div>
                </div>

                {/* Stats overview widget */}
                <div className="glass-panel summary-widget">
                  <h4 className="widget-title"><Grid size={16} /> Kampány Statisztika</h4>
                  <div className="stats-list">
                    <div className="stat-row">
                      <span className="stat-label">Vázlat (Drafts)</span>
                      <span className="stat-val badge-draft">{draftCount} db</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Jóváhagyott (Approved)</span>
                      <span className="stat-val badge-approved">{approvedCount} db</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Ütemezett (Scheduled)</span>
                      <span className="stat-val badge-scheduled">{scheduledCount} db</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Közzétett (Published)</span>
                      <span className="stat-val badge-published">{publishedCount} db</span>
                    </div>
                  </div>
                </div>

                {/* Ready to Schedule / Publish Section */}
                <div className="glass-panel summary-widget approvals-scroller">
                  <h4 className="widget-title"><CheckCircle size={16} /> Jóváhagyott Kreatívok</h4>
                  {creatives.filter(c => c.status === 'approved').length === 0 ? (
                    <p className="no-approvals-text">Nincs jóváhagyott poszt. Kérjük, hagyj jóvá egyet a generáltak közül!</p>
                  ) : (
                    <div className="approvals-column-list">
                      {creatives
                        .filter(c => c.status === 'approved')
                        .map(post => (
                          <CreativeCard
                            key={post.id}
                            post={post}
                            brandKit={activeKit}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onUpdateText={handleUpdateText}
                            onSchedule={handleSchedule}
                            onPostNow={handlePostNow}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          } />

          <Route path="/kampanyok" element={
            <CampaignCreator
              activeBrandKit={activeKit}
              onGenerateStart={handleGenerateStart}
              onCampaignComplete={handleCampaignComplete}
              shouldSimulateError={shouldSimulateError}
              creatives={creatives}
              setCreatives={setCreatives}
            />
          } />

          <Route path="/imagelab" element={<ImageTestLab />} />

          <Route path="/overlay-lab" element={<OverlayTestLab activeBrandKit={activeKit} />} />

          <Route path="/brandkit" element={
            <BrandKitView
              brandKits={brandKits}
              activeKitId={activeKitId}
              onSelectKit={setActiveKitId}
              onSaveKit={handleSaveBrandKit}
              onExtractBrandKit={handleExtractBrandKit}
              isExtracting={isExtracting}
            />
          } />

          <Route path="/naptar" element={
            <ScheduleView
              scheduledPosts={creatives}
              onCancelSchedule={handleCancelSchedule}
            />
          } />

          <Route path="/admin" element={
            <AdminMonitor
              logs={logs}
              onClearLogs={() => setLogs([])}
              shouldSimulateError={shouldSimulateError}
              onToggleSimulateError={() => setShouldSimulateError(!shouldSimulateError)}
            />
          } />
        </Routes>
      </main>

      {/* Styled component styles local to App.tsx */}
      <style>{`
        /* Sidebar Styling */
        .app-sidebar {
          width: 280px;
          flex-shrink: 0;
          border-radius: 0;
          border: none;
          border-right: 1px solid var(--panel-border);
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          height: 100vh;
          position: sticky;
          top: 0;
          background: rgba(10, 8, 20, 0.7);
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        .logo-spark-circle {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(139, 92, 246, 0.3);
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
        }
        .logo-glow-icon {
          color: var(--primary-neon);
        }
        .logo-section h1 {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
        }
        .logo-sub {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .user-profile-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 10px 12px;
          border-radius: 10px;
          margin-bottom: 24px;
          position: relative;
        }
        .avatar-container {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #3E2723;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #E8DCC4;
          border: 1px solid rgba(232, 220, 196, 0.3);
        }
        .user-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .username {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-main);
        }
        .shopname {
          font-size: 10px;
          color: var(--text-muted);
        }
        .online-dot {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 7px;
          height: 7px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 6px #10b981;
        }

        /* Nav Menu */
        .nav-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-grow: 1;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition-smooth);
          width: 100%;
          text-align: left;
        }
        .nav-item:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.04);
        }
        .nav-item.active {
          color: var(--text-main);
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.25);
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.05);
          font-weight: 600;
        }
        .nav-badge-count {
          margin-left: auto;
          background: var(--primary-neon);
          color: white;
          font-size: 10px;
          font-weight: bold;
          padding: 2px 7px;
          border-radius: 10px;
        }
        .nav-badge-ver {
          margin-left: auto;
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .nav-badge-alert {
          margin-left: auto;
          background: var(--accent-amber);
          color: #000;
          font-size: 10px;
          font-weight: bold;
          padding: 2px 7px;
          border-radius: 10px;
        }

        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 16px;
        }
        .poc-tag {
          font-size: 9px;
          font-weight: 800;
          color: var(--primary-neon);
          letter-spacing: 0.05em;
        }
        .copyright {
          font-size: 10px;
          color: var(--text-muted);
        }

        /* Main Content Layout */
        .main-content {
          flex-grow: 1;
          padding: 32px;
          height: 100vh;
          overflow-y: auto;
        }

        /* Dashboard Grid */
        .dashboard-layout {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 1024px) {
          .dashboard-layout {
            grid-template-columns: 1fr;
          }
        }
        .dashboard-grid-left {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .draft-creatives-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .section-title-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .section-title-row h3 {
          font-size: 16px;
          font-weight: 700;
        }
        .section-title-row .subtitle {
          font-size: 12px;
          color: var(--text-muted);
        }

        .creatives-display-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
        }

        .empty-state-panel {
          padding: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--text-muted);
          gap: 10px;
          background: rgba(0, 0, 0, 0.15);
        }
        .empty-state-icon {
          color: var(--primary-neon);
          opacity: 0.6;
        }

        /* Dashboard summary sidebar */
        .dashboard-summary-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: sticky;
          top: 0;
        }
        .summary-widget {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .widget-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 8px;
        }

        .quick-kit-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .quick-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }
        .quick-row .lbl {
          color: var(--text-muted);
        }
        .quick-row .val {
          font-weight: 600;
        }
        .quick-row .val.highlight {
          color: var(--primary-neon);
        }
        .quick-colors-row {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }
        .dot-color {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .stats-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
        .stat-label {
          color: var(--text-muted);
        }
        .stat-val {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .approvals-scroller {
          max-height: 400px;
          overflow-y: auto;
        }
        .no-approvals-text {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.4;
          text-align: center;
          padding: 16px 0;
        }
        .approvals-column-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .approvals-column-list .creative-card {
          padding: 8px;
        }
        .approvals-column-list .aspect-ratio-box {
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
}

export default App;
