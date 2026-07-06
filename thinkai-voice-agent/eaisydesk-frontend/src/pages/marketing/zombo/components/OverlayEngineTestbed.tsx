import React, { useState, useEffect, useRef } from 'react';
import { getBackendUrl, fixImageUrl } from '../types';
import { Layers, Box, Cpu, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OverlayEngineTestbedProps {
  baseImageUrl: string;
  initialText: string;
  brandColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  fontFamily: string;
}

type EngineType = 'satori' | 'canvas' | 'sharp';

export const OverlayEngineTestbed: React.FC<OverlayEngineTestbedProps> = ({
  baseImageUrl,
  initialText,
  brandColors,
  fontFamily
}) => {
  const [activeEngine, setActiveEngine] = useState<EngineType>('satori');
  const [text, setText] = useState(initialText);
  const [fontSize, setFontSize] = useState(60);
  const [position, setPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [isRendering, setIsRendering] = useState(false);
  const [isSatoriRendering, setIsSatoriRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [satoriResult, setSatoriResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Satori Simulation (Pure CSS/Flexbox)
  const renderSatori = () => {
    if (satoriResult && activeEngine === 'satori') {
      return (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: '#111', borderRadius: 12, overflow: 'hidden' }}>
          <img src={satoriResult} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Satori Render" />
          {isSatoriRendering && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={32} className="qp-spin" style={{ color: '#8b5cf6' }} />
            </div>
          )}
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(139,92,246,0.8)', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: '#fff', fontWeight: 800 }}>SATORI ENGINE v2</div>
        </div>
      );
    }

    return (
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        aspectRatio: '4/5', 
        background: '#111', 
        borderRadius: 12, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end',
        alignItems: 'center',
        padding: '10% 5%'
      }}>
        {/* BG Image */}
        <img 
          src={fixImageUrl(baseImageUrl)} 
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
          alt="" 
        />
        
        {/* Satori Simulation Layer */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            background: brandColors.primary,
            opacity: 0.95,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            padding: '16px 24px',
            borderRadius: 12,
            borderLeft: `8px solid ${brandColors.accent}`,
            maxWidth: '100%',
            display: 'inline-flex',
            textAlign: 'center'
          }}>
            <span style={{
              color: '#fff',
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily,
              fontWeight: 800,
              lineHeight: 1.1,
              wordBreak: 'break-word',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)'
            }}>
              {text}
            </span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: '#a78bfa', fontWeight: 800 }}>SZIMULÁCIÓ (Betöltés...)</div>
      </div>
    );
  };

  // Canvas Engine (Native Canvas API)
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = fixImageUrl(baseImageUrl);
    img.onload = () => {
      // Set resolution to 1080x1350
      canvas.width = 1080;
      canvas.height = 1350;
      
      // Draw Base
      ctx.drawImage(img, 0, 0, 1080, 1350);
      
      // Draw Overlay Box
      ctx.font = `bold ${fontSize * 1.5}px ${fontFamily}, sans-serif`;
      const metrics = ctx.measureText(text);
      const padding = 40;
      const boxW = Math.min(1000, metrics.width + padding * 2);
      const boxH = fontSize * 2.5;
      
      let yPos = 1350 - boxH - 100;
      if (position === 'top') yPos = 100;
      if (position === 'center') yPos = (1350 - boxH) / 2;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      
      // Draw rounded rect manually if roundRect not supported, but most modern browsers have it
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect((1080 - boxW) / 2, yPos, boxW, boxH, 20);
        ctx.fill();
        ctx.strokeStyle = brandColors.accent;
        ctx.lineWidth = 8;
        ctx.stroke();
      } else {
        ctx.fillRect((1080 - boxW) / 2, yPos, boxW, boxH);
      }

      // Draw Text
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 1080 / 2, yPos + boxH / 2);
    };
  };

  useEffect(() => {
    if (activeEngine === 'canvas') drawCanvas();
  }, [activeEngine, text, fontSize, position, baseImageUrl]);

  const runSatori = async () => {
    if (activeEngine !== 'satori') return;
    setIsSatoriRendering(true);
    try {
      const resp = await fetch(`${getBackendUrl()}/api/image/satori-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageUrl: fixImageUrl(baseImageUrl),
          text: text,
          brandColors,
          fontFamily,
        })
      });
      const data = await resp.json();
      if (data.imageUrl) {
        setSatoriResult(fixImageUrl(data.imageUrl));
      } else {
        throw new Error(data.error || 'Unknown satori error');
      }
    } catch (err: any) {
      console.error('Satori error:', err);
      setError(`Satori hiba: ${err.message}`);
    } finally {
      setIsSatoriRendering(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeEngine === 'satori') runSatori();
    }, 600);
    return () => clearTimeout(timer);
  }, [text, activeEngine, baseImageUrl]);

  const handleSharpRender = async () => {
    setIsRendering(true);
    try {
      const resp = await fetch(`${getBackendUrl()}/api/image/sharp-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageUrl: fixImageUrl(baseImageUrl),
          text,
          position,
          fontSize,
          color: '#FFFFFF'
        })
      });
      const data = await resp.json();
      setRenderResult(fixImageUrl(data.imageUrl));
    } catch (e) {
      console.error(e);
      setError('Sharp render hiba');
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 20, border: '1.5px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <RefreshCw size={20} className={isRendering ? 'qp-spin' : ''} style={{ color: '#8b5cf6' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Overlay Motor Tesztkörnyezet</h3>
      </div>

      {/* Engine Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
        {(['satori', 'canvas', 'sharp'] as EngineType[]).map(e => (
          <button
            key={e}
            onClick={() => { setActiveEngine(e); setRenderResult(null); }}
            style={{
              padding: '10px', borderRadius: 10, border: `1.5px solid ${activeEngine === e ? '#8b5cf6' : 'var(--border)'}`,
              background: activeEngine === e ? 'rgba(139,92,246,0.15)' : 'var(--bg)',
              color: activeEngine === e ? '#c4b5fd' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s'
            }}
          >
            {e === 'satori' && <Layers size={16} />}
            {e === 'canvas' && <Box size={16} />}
            {e === 'sharp' && <Cpu size={16} />}
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
              {e === 'satori' ? 'Satori (SVG)' : e === 'canvas' ? 'Canvas API' : 'Sharp (Node)'}
            </span>
          </button>
        ))}
      </div>

      {/* Preview Area */}
      <div style={{ marginBottom: 20 }}>
        {activeEngine === 'satori' && renderSatori()}
        
        {activeEngine === 'canvas' && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: '#111', borderRadius: 12, overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: '#10b981', fontWeight: 800 }}>DETERMINISZTIKUS VECTOR</div>
          </div>
        )}

        {activeEngine === 'sharp' && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: '#111', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderResult ? (
              <img src={renderResult} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Sharp Render" />
            ) : (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Cpu size={40} style={{ color: 'var(--text-muted)', marginBottom: 12, opacity: 0.3 }} />
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kattints a "Renderelés" gombra a szerver-oldali Sharp motor indításához.</p>
                <button 
                  onClick={handleSharpRender}
                  disabled={isRendering}
                  style={{ padding: '10px 20px', borderRadius: 8, background: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isRendering ? '⏳ Renderelés folyamatban...' : '🚀 Sharp Render Indítása'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>TESZT SZÖVEG</label>
          <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1.5px solid var(--border)', color: 'var(--text)', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>BETŰMÉRET: {fontSize}px</label>
            <input type="range" min="20" max="120" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>POZÍCIÓ</label>
            <select value={position} onChange={e => setPosition(e.target.value as any)} style={{ width: '100%', padding: '6px', borderRadius: 8, background: 'var(--bg)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
              <option value="top">Fent</option>
              <option value="center">Középen</option>
              <option value="bottom">Lent</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 10, padding: '10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
          <p style={{ fontSize: 10, color: '#10b981', margin: 0, lineHeight: 1.4 }}>
            <b>Engine Info:</b> {activeEngine === 'satori' ? 'Flexbox alapú méretezés. A szöveg sosem lóg ki, a konténer automatikusan igazodik.' : activeEngine === 'canvas' ? 'Közvetlen pixel-renderelés. Playwright nélküli, azonnali generálás.' : 'Node.js Sharp motor. A legstabilabb, szerver-oldali produkciós megoldás.'}
          </p>
        </div>
      </div>
    </div>
  );
};
