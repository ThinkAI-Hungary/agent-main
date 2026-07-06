import React, { useState, useEffect, useRef } from 'react';
import type { PostCreative, SystemLog, BrandKit } from '../types';
import { getBackendUrl } from '../types';
import { Sparkles, Play, Cpu, Fingerprint, Brain, Layers, CheckCircle2 } from 'lucide-react';

interface GeneratorSimulatorProps {
  activeBrandKit: BrandKit;
  onGenerateStart: (briefText: string) => void;
  onGenerateComplete: (newCreatives: PostCreative[], newLogs: SystemLog[]) => void;
  shouldSimulateError: boolean; // Managed by Admin Panel
  pastApproved: PostCreative[];
}

export const GeneratorSimulator: React.FC<GeneratorSimulatorProps> = ({
  activeBrandKit,
  onGenerateStart,
  onGenerateComplete,
  shouldSimulateError,
  pastApproved,
}) => {
  const [briefText, setBriefText] = useState('Új tavaszi specialty eszpresszó és házi málnás pite ajánlatunk.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([]);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);

  const logsRef = useRef<string[]>([]);
  useEffect(() => {
    logsRef.current = simulatedLogs;
  }, [simulatedLogs]);

  const presets = [
    'Új tavaszi specialty eszpresszó és házi málnás pite ajánlatunk.',
    'Hétvégi brunch ajánlatunk népszerűsítése: kovászos kenyér avokádóval és krémes kapucsínóval.',
    'Szerda délutáni sütemény akció: minden friss péksütemény mellé féláron adjuk a flat white-ot! 🥐☕'
  ];

  // Refs to capture live API fetch outputs
  const apiResultRef = useRef<{ creatives: PostCreative[]; logs: string[] } | null>(null);
  const apiErrorRef = useRef<string | null>(null);

  // Pipeline steps
  const steps = [
    { title: 'Háttér-feldolgozó sor', desc: 'creative.requested esemény rögzítve a sorban.', icon: Cpu },
    { title: 'Brand Kit betöltés', desc: `Brand Kit v${activeBrandKit.version} szabályok kiolvasása.`, icon: Fingerprint },
    { title: 'AI Orchestrátor', desc: 'Claude 3.5 Sonnet sablon és posztszöveg tervezése.', icon: Brain },
    { title: 'Render szolgáltatás', desc: 'Playwright screenshot render és Flux képgenerálás.', icon: Layers },
    { title: 'Folyamat kész', desc: 'Kreatívok sikeresen elmentve az adatrétegbe.', icon: CheckCircle2 }
  ];

  const handleGenerate = () => {
    if (!briefText.trim()) return;
    
    setIsGenerating(true);
    setCurrentStep(0);
    setRetryAttempt(0);
    
    apiResultRef.current = null;
    apiErrorRef.current = null;

    const taskName = 'task-' + Math.floor(Math.random() * 1000);
    setSimulatedLogs([`[INFO] Háttér-feldolgozó: creative.requested esemény elkapva. Task ID: ${taskName}${shouldSimulateError ? ' (Diagnosztikai Hiba szimuláció aktív)' : ''}`]);
    onGenerateStart(briefText);

    // Call actual backend API in the background
    fetch(`${getBackendUrl()}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brief: briefText,
        brandKit: activeBrandKit,
        pastApproved: pastApproved.map(p => ({
          templateId: p.templateId,
          text: p.text
        }))
      })
    })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    })
    .then((data) => {
      apiResultRef.current = {
        creatives: data,
        logs: [
          `[DATA] 4 új kreatív bejegyzés sikeresen lementve a lokális adatrétegbe.`,
          `[SUCCESS] AI poszt generálás és kép renderelési csővezeték sikeresen lefutott.`
        ]
      };
    })
    .catch((err) => {
      console.error(err);
      apiErrorRef.current = err.message || String(err);
    });
  };

  useEffect(() => {
    if (!isGenerating) return;

    let timer: ReturnType<typeof setTimeout>;
    const timestamp = new Date().toLocaleTimeString('hu-HU');

    if (currentStep === 0) {
      // Step 0 -> Step 1
      timer = setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev, 
          `[${timestamp}] [DATA] Kávézó aktív Brand Kit (v${activeBrandKit.version}) betöltve. Betűtípus: ${activeBrandKit.typography.fontName}. Színek: ${activeBrandKit.colors.primary}, ${activeBrandKit.colors.secondary}, ${activeBrandKit.colors.accent}.`
        ]);
        setCurrentStep(1);
      }, 1200);
    } else if (currentStep === 1) {
      // Step 1 -> Step 2
      timer = setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          `[${timestamp}] [AI] Orchestrátor: Claude API meghívása a brand kit hangnem (${activeBrandKit.tone.join(', ')}) és a brief alapján.`,
          `[${timestamp}] [AI] Claude válasz megérkezett: quote, product, testimonial és list variánsok sikeresen megtervezve JSON formában.`,
          `[${timestamp}] [AI] Flux 1.1 Pro képgenerálási promptok összeállítva.`
        ]);
        setCurrentStep(2);
      }, 1500);
    } else if (currentStep === 2) {
      // Step 2 -> Step 3
      timer = setTimeout(() => {
        setCurrentStep(3);
      }, 2000);
    } else if (currentStep === 3) {
      // Step 3 (Polling): Wait for API result or error
      if (apiErrorRef.current) {
        setSimulatedLogs(prev => [
          ...prev,
          `[${timestamp}] [RENDER] [Hiba] Hiba történt a generálás során: ${apiErrorRef.current}`,
          `[${timestamp}] [PROCESSOR] [Hiba] A folyamat sikertelen.`
        ]);
        timer = setTimeout(() => {
          setIsGenerating(false);
          setCurrentStep(-1);
        }, 3000);
      } else if (apiResultRef.current) {
        const serverLogs = apiResultRef.current.logs.map(log => `[${timestamp}] ${log}`);
        setSimulatedLogs(prev => [...prev, ...serverLogs]);
        timer = setTimeout(() => {
          setCurrentStep(4);
        }, 1500);
      } else {
        // Still loading: Append waiting logs periodically
        setSimulatedLogs(prev => {
          const hasWaitingLog = prev.some(l => l.includes('Várakozás a képekre'));
          if (!hasWaitingLog) {
            return [
              ...prev,
              `[${timestamp}] [RENDER] Playwright renderelők indítása. Flux képek generálása a fal.ai-on... (Várakozás a háttérben futó API-ra...)`
            ];
          }
          return prev;
        });
        timer = setTimeout(() => {
          setRetryAttempt(prev => prev + 1);
        }, 1000);
      }
    } else if (currentStep === 4) {
      // Step 4 -> Complete
      if (apiResultRef.current) {
        const result = apiResultRef.current;
        const finalLogs: SystemLog[] = logsRef.current.map((msg, idx) => ({
          id: `live-log-${idx}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: msg.includes('[Hiba]') ? 'error' : msg.includes('[Figyelem]') ? 'warn' : msg.includes('[SUCCESS]') || msg.includes('sikeresen') ? 'success' : 'info',
          message: msg,
          step: idx < 2 ? 'queue' : idx < 5 ? 'orchestrator' : 'renderer'
        }));

        timer = setTimeout(() => {
          setIsGenerating(false);
          setCurrentStep(-1);
          onGenerateComplete(result.creatives, finalLogs);
        }, 1000);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isGenerating, currentStep, retryAttempt, activeBrandKit, onGenerateComplete]);

  return (
    <div className="generator-container glass-panel animate-slide-up">
      <div className="generator-header">
        <Sparkles size={20} className="glow-purple-icon" />
        <h3>AI Poszt Generátor</h3>
      </div>

      <div className="generator-body">
        <div className="input-group">
          <label>Írd le a posztok témáját (Brief):</label>
          <textarea
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            disabled={isGenerating}
            placeholder="Mit szeretnél posztolni? (pl. Mutassuk meg az új specialty kávénkat...) "
            rows={3}
          />
        </div>

        <div className="presets-row">
          <span className="preset-label">Gyors sablonok:</span>
          <div className="presets-list">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                className="preset-btn"
                onClick={() => setBriefText(preset)}
                disabled={isGenerating}
              >
                Téma {idx + 1}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn-primary start-gen-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !briefText.trim()}
        >
          {isGenerating ? (
            <>
              <div className="loader-circle" />
              Aktív Generálás a Szerveren...
            </>
          ) : (
            <>
              <Play size={16} />
              4 db Kreatív Poszt Generálása (Live API-kkal)
            </>
          )}
        </button>
      </div>

      {isGenerating && (
        <div className="simulation-overlay">
          <div className="simulation-card glass-panel">
            <h4>Háttér-feldolgozó csővezeték (Pipeline)</h4>
            <p className="sim-sub">Kövesd nyomon a háttér motor valós idejű futását</p>
            
            <div className="pipeline-steps">
              {steps.map((step, idx) => {
                const IconComponent = step.icon;
                let stepState = 'pending';
                if (idx < currentStep) stepState = 'completed';
                else if (idx === currentStep) stepState = 'active';

                return (
                  <div key={idx} className={`step-item ${stepState}`}>
                    <div className="step-icon-wrapper">
                      <IconComponent size={18} />
                    </div>
                    <div className="step-text">
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.desc}</span>
                    </div>
                    {stepState === 'completed' && (
                      <div className="check-mark">✓</div>
                    )}
                    {stepState === 'active' && (
                      <div className="pulse-indicator" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="simulation-console">
              <span className="console-title">Háttér-naplózás (Logs):</span>
              <div className="console-lines">
                {simulatedLogs.map((log, idx) => (
                  <div key={idx} className={`console-line ${log.includes('[Hiba]') ? 'err' : log.includes('[Figyelem]') ? 'warn' : log.includes('[SUCCESS]') || log.includes('sikeresen') ? 'success' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .generator-container {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .generator-header {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 12px;
        }
        .generator-header h3 {
          font-size: 16px;
          font-weight: 600;
        }
        .glow-purple-icon {
          color: var(--primary-neon);
          filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.5));
        }
        .generator-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .input-group label {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 500;
        }
        .presets-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .preset-label {
          font-size: 12px;
          color: var(--text-muted);
        }
        .presets-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .preset-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--panel-border);
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .preset-btn:hover {
          background: rgba(139, 92, 246, 0.1);
          border-color: rgba(139, 92, 246, 0.3);
          color: var(--text-main);
        }
        .start-gen-btn {
          margin-top: 8px;
          padding: 14px;
        }
        .loader-circle {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin-slow 1s infinite linear;
        }

        /* Simulation overlay panel */
        .simulation-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg-main);
          opacity: 0.95;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 20px;
        }
        .simulation-card {
          width: 100%;
          max-width: 580px;
          padding: 24px;
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .simulation-card h4 {
          font-size: 18px;
          font-weight: 700;
          text-align: center;
        }
        .sim-sub {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          margin-top: -8px;
        }
        .pipeline-steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: var(--bg3);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          transition: var(--transition-smooth);
        }
        .step-item.pending {
          opacity: 0.35;
        }
        .step-item.active {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          opacity: 1;
        }
        .step-item.completed {
          opacity: 0.8;
          color: var(--text-main);
        }
        .step-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }
        .step-item.active .step-icon-wrapper {
          background: var(--primary-neon);
          color: #fff;
          box-shadow: 0 0 10px var(--primary-glow);
        }
        .step-item.completed .step-icon-wrapper {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .step-text {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }
        .step-title {
          font-size: 13px;
          font-weight: 600;
        }
        .step-desc {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 1px;
        }
        .check-mark {
          color: #34d399;
          font-weight: bold;
          font-size: 15px;
        }
        .pulse-indicator {
          width: 8px;
          height: 8px;
          background: var(--primary-neon);
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7);
          animation: pulse 1.2s infinite linear;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.9);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(139, 92, 246, 0);
          }
          100% {
            transform: scale(0.9);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
          }
        }
        .simulation-console {
          background: var(--bg);
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          padding: 12px;
          font-family: monospace;
          font-size: 11px;
          height: 120px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .console-title {
          color: var(--primary-neon);
          font-weight: bold;
          margin-bottom: 4px;
          display: block;
        }
        .console-lines {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .console-line {
          color: var(--text-muted);
          line-height: 1.3;
        }
        .console-line.err {
          color: #ef4444;
        }
        .console-line.warn {
          color: #fbbf24;
        }
        .console-line.success {
          color: #10b981;
        }
      `}</style>
    </div>
  );
};
