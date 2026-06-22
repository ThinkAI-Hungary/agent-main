import React, { useState } from 'react';
import type { SystemLog } from '../types';
import { Terminal, Cpu, AlertTriangle, Key } from 'lucide-react';

interface AdminMonitorProps {
  logs: SystemLog[];
  onClearLogs: () => void;
  shouldSimulateError: boolean;
  onToggleSimulateError: () => void;
}

export const AdminMonitor: React.FC<AdminMonitorProps> = ({
  logs,
  onClearLogs,
  shouldSimulateError,
  onToggleSimulateError,
}) => {
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const filteredLogs = logs.filter(
    (log) => filterLevel === 'all' || log.level === filterLevel
  );

  return (
    <div className="admin-monitor-container glass-panel animate-slide-up">
      <div className="admin-header">
        <Terminal size={20} className="icon-purple" />
        <h3>Rendszer Diagnosztika & Háttér Motor</h3>
      </div>

      <div className="admin-grid-layout">
        {/* Server metrics */}
        <div className="metrics-column">
          <div className="metric-box glass-panel shadow-sm">
            <div className="metric-header">
              <Cpu size={16} className="metric-icon" />
              <span>Playwright Render Szolgáltatás</span>
            </div>
            <div className="metric-body">
              <div className="metric-value">2 / 10</div>
              <div className="metric-desc">Aktív meleg konténerek száma (Cold-start védelem: BE)</div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: '20%' }} />
              </div>
            </div>
          </div>

          <div className="metric-box glass-panel shadow-sm">
            <div className="metric-header">
              <Key size={16} className="metric-icon" />
              <span>Facebook / Meta API OAuth Token</span>
            </div>
            <div className="metric-body text-align-left">
              <div className="token-expiry-row">
                <span className="token-label">Hátralévő idő:</span>
                <span className="token-days highlight-emerald">45 nap (Auto-frissítés)</span>
              </div>
              <p className="token-desc">A 60 napos Facebook token proaktívan megújításra kerül a 45. napon.</p>
              <div className="token-status-pill success">
                <span className="dot" /> Aktív és Érvényes
              </div>
            </div>
          </div>

          <div className="metric-box glass-panel shadow-sm error-simulation">
            <div className="metric-header">
              <AlertTriangle size={16} className="metric-icon" />
              <span>Hiba-tolerancia és Retry tesztelés</span>
            </div>
            <div className="metric-body flex-row justify-between align-center">
              <div className="toggle-text">
                <span className="toggle-title">Render hiba szimuláció</span>
                <span className="toggle-desc">Tranziens Playwright hiba kiváltása generáláskor</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={shouldSimulateError}
                  onChange={onToggleSimulateError}
                />
                <span className="slider round" />
              </label>
            </div>
          </div>
        </div>

        {/* Live console logging */}
        <div className="logs-column glass-panel">
          <div className="logs-header">
            <span className="title">Háttér esemény-napló (Console Log)</span>
            <div className="logs-actions">
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="filter-select"
              >
                <option value="all">Összes szint</option>
                <option value="info">INFO</option>
                <option value="success">SUCCESS</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
              </select>
              <button className="clear-logs-btn" onClick={onClearLogs} title="Napló ürítése">
                Törlés
              </button>
            </div>
          </div>
          
          <div className="logs-console-window">
            {filteredLogs.length === 0 ? (
              <p className="no-logs">Nincsenek naplóbejegyzések a kiválasztott szűrővel.</p>
            ) : (
              <div className="console-lines-list">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="console-row-line">
                    <span className="timestamp">
                      {new Date(log.timestamp).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`log-level-badge level-${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="log-msg-text">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .admin-monitor-container {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .admin-header {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 12px;
        }
        .admin-header h3 {
          font-size: 16px;
          font-weight: 600;
        }
        .admin-grid-layout {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .admin-grid-layout {
            grid-template-columns: 1fr;
          }
        }

        /* Metrics boxes styling */
        .metrics-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .metric-box {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(0, 0, 0, 0.15);
        }
        .metric-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .metric-icon {
          color: var(--primary-neon);
        }
        .metric-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .metric-body.flex-row {
          flex-direction: row;
        }
        .justify-between { justify-content: space-between; }
        .align-center { align-items: center; }
        
        .metric-value {
          font-size: 24px;
          font-weight: 700;
          font-family: var(--font-heading);
          color: var(--text-main);
        }
        .metric-desc {
          font-size: 11px;
          color: var(--text-muted);
        }
        .progress-bar-container {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          overflow: hidden;
          margin-top: 4px;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary-neon), var(--accent-pink));
          border-radius: 4px;
        }

        .token-expiry-row {
          display: flex;
          gap: 8px;
          font-size: 13px;
        }
        .token-label {
          color: var(--text-muted);
        }
        .token-days {
          font-weight: 700;
        }
        .highlight-emerald {
          color: #34d399;
        }
        .token-desc {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .token-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: bold;
          padding: 4px 10px;
          border-radius: 20px;
          align-self: flex-start;
          margin-top: 4px;
        }
        .token-status-pill.success {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .token-status-pill .dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
        }

        /* Error simulation box */
        .toggle-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .toggle-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }
        .toggle-desc {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Switch toggler */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
        }
        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(255,255,255,0.1);
          border: 1px solid var(--panel-border);
          transition: .4s;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
        }
        input:checked + .slider {
          background-color: var(--primary-neon);
          box-shadow: 0 0 8px var(--primary-glow);
        }
        input:focus + .slider {
          box-shadow: 0 0 1px var(--primary-neon);
        }
        input:checked + .slider:before {
          transform: translateX(20px);
        }
        .slider.round {
          border-radius: 34px;
        }
        .slider.round:before {
          border-radius: 50%;
        }

        /* Console log window */
        .logs-column {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(5, 3, 10, 0.5);
          border-color: rgba(255, 255, 255, 0.05);
        }
        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 8px;
        }
        .logs-header .title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .logs-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .filter-select {
          padding: 4px 8px;
          font-size: 11px;
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          width: auto;
        }
        .clear-logs-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .clear-logs-btn:hover {
          color: #ef4444;
        }

        .logs-console-window {
          flex-grow: 1;
          height: 300px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 11px;
        }
        .no-logs {
          color: var(--text-muted);
          text-align: center;
          padding-top: 40px;
        }
        .console-lines-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .console-row-line {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          line-height: 1.4;
          word-break: break-all;
        }
        .console-row-line .timestamp {
          color: #6366f1;
          flex-shrink: 0;
        }
        .log-level-badge {
          font-weight: bold;
          font-size: 9px;
          padding: 1px 4px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .level-info { background: rgba(255,255,255,0.08); color: #94a3b8; }
        .level-success { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .level-warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .level-error { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        
        .log-msg-text {
          color: var(--text-main);
        }
      `}</style>
    </div>
  );
};
