import { useState } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import type { PostCreative, BrandKit, SystemLog, Campaign } from './zombo/types';
import {
  INITIAL_BRAND_KITS,
  INITIAL_CREATIVES,
  INITIAL_SCHEDULED_POSTS,
  INITIAL_LOGS
} from './zombo/dummyData';
import { BrandKitView } from './zombo/components/BrandKitView';
import { GeneratorSimulator } from './zombo/components/GeneratorSimulator';
import { CreativeCard } from './zombo/components/CreativeCard';
import { ScheduleView } from './zombo/components/ScheduleView';
import { AdminMonitor } from './zombo/components/AdminMonitor';
import { CampaignCreator } from './zombo/components/CampaignCreator';
import { ImageTestLab } from './zombo/components/ImageTestLab';
import { OverlayTestLab } from './zombo/components/OverlayTestLab';
import {
  Sparkles,
  Palette,
  Terminal,
  Grid,
  Layout,
  CheckCircle,
  TrendingUp,
  Zap,
  Layers,
  Calendar
} from 'lucide-react';
import './zombo/creative-studio.css';

export default function CreativeStudioPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const basePath = '/marketing/zombo/creative-studio';

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
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'published', publishedAt: new Date().toISOString(), instagramUrl: `https://instagram.com/p/mock_post_${Date.now()}/` } : p))
    );

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

  const getTabClass = (tabPath: string) => {
    const fullTabPath = tabPath === '' ? basePath : `${basePath}/${tabPath}`;
    return `cs-nav-item ${currentPath === fullTabPath || (tabPath === '' && currentPath === `${basePath}/dashboard`) ? 'active' : ''}`;
  };

  return (
    <div className="cs-app-container">
      {/* Horizontal Sub-Navigation Tab bar */}
      <div className="cs-nav-bar glass-panel">
        <div className="cs-logo-section">
          <div className="cs-logo-spark-circle animate-spin-slow">
            <Sparkles size={16} className="cs-logo-glow-icon" />
          </div>
          <div>
            <h2>AI Creative Studio</h2>
          </div>
        </div>

        <nav className="cs-nav-menu">
          <button className={getTabClass('dashboard')} onClick={() => navigate('dashboard')}>
            <Layout size={16} />
            <span>Kreatív Lab</span>
            {draftCount > 0 && <span className="cs-nav-badge">{draftCount}</span>}
          </button>

          <button className={getTabClass('kampanyok')} onClick={() => navigate('kampanyok')}>
            <TrendingUp size={16} />
            <span>AI Kampányok</span>
          </button>

          <button className={getTabClass('imagelab')} onClick={() => navigate('imagelab')}>
            <Zap size={16} />
            <span>Image Lab</span>
          </button>

          <button className={getTabClass('overlay-lab')} onClick={() => navigate('overlay-lab')}>
            <Layers size={16} />
            <span>Overlay Lab</span>
          </button>

          <button className={getTabClass('brandkit')} onClick={() => navigate('brandkit')}>
            <Palette size={16} />
            <span>Brand Kit</span>
            <span className="cs-nav-badge-ver">v{activeKit.version}</span>
          </button>

          <button className={getTabClass('naptar')} onClick={() => navigate('naptar')}>
            <Calendar size={16} />
            <span>Naptár</span>
            {scheduledCount > 0 && <span className="cs-nav-badge-alert">{scheduledCount}</span>}
          </button>

          <button className={getTabClass('admin')} onClick={() => navigate('admin')}>
            <Terminal size={16} />
            <span>Diagnosztika</span>
          </button>
        </nav>
      </div>

      {/* Main Area */}
      <main className="cs-main-content">
        <Routes>
          <Route path="/" element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={
            <div className="dashboard-layout">
              <div className="dashboard-grid-left">
                {/* Generator simulator */}
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

          <Route path="kampanyok" element={
            <CampaignCreator
              activeBrandKit={activeKit}
              onGenerateStart={handleGenerateStart}
              onCampaignComplete={handleCampaignComplete}
              shouldSimulateError={shouldSimulateError}
              creatives={creatives}
              setCreatives={setCreatives}
            />
          } />

          <Route path="imagelab" element={<ImageTestLab />} />

          <Route path="overlay-lab" element={<OverlayTestLab activeBrandKit={activeKit} />} />

          <Route path="brandkit" element={
            <BrandKitView
              brandKits={brandKits}
              activeKitId={activeKitId}
              onSelectKit={setActiveKitId}
              onSaveKit={handleSaveBrandKit}
              onExtractBrandKit={handleExtractBrandKit}
              isExtracting={isExtracting}
            />
          } />

          <Route path="naptar" element={
            <ScheduleView
              scheduledPosts={creatives}
              onCancelSchedule={handleCancelSchedule}
            />
          } />

          <Route path="admin" element={
            <AdminMonitor
              logs={logs}
              onClearLogs={() => setLogs([])}
              shouldSimulateError={shouldSimulateError}
              onToggleSimulateError={() => setShouldSimulateError(!shouldSimulateError)}
            />
          } />
        </Routes>
      </main>
    </div>
  );
}
