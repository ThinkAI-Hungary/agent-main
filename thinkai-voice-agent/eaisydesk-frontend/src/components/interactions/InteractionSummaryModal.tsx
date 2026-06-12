/**
 * InteractionSummaryModal – 1:1 port of legacy log-modal + openInteractionSummaryModal()
 */
import { useState, useEffect } from 'react';
import { fmtDt } from '../../helpers/formatters';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { supabase } from '../../lib/supabase';
import type { InteractionRow } from '../../pages/InteractionsPage';

interface Props {
  row: InteractionRow;
  onClose: () => void;
  clients: ClientRecord[];
  clientsMap: Record<string, ClientRecord>;
}

interface ResultData {
  date: string;
  service: string;
  doctor: string;
  reminder: string;
}

interface ChatBlock {
  sender: 'user' | 'ai' | 'system';
  text: string;
}

export default function InteractionSummaryModal({ row, onClose, clients, clientsMap }: Props) {
  const [showChat, setShowChat] = useState(false);
  const [resultData, setResultData] = useState<ResultData>({ date: '-', service: '-', doctor: '-', reminder: '-' });
  const [chatBlocks, setChatBlocks] = useState<ChatBlock[]>([]);
  const [summary, setSummary] = useState('');

  // Build result data + chat blocks
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Find client custom_data
      let cData: Record<string, unknown> = {};
      if (row.clientId && clientsMap[String(row.clientId)]) {
        cData = parseCustomData(clientsMap[String(row.clientId)].custom_data);
      } else {
        const rn = (row.client || '').toLowerCase().trim();
        const match = clients.find((c) => {
          const cd = parseCustomData(c.custom_data);
          const cn = ((cd?.nev as string) || (cd?.name as string) || c.name || '').toLowerCase().trim();
          return cn && cn === rn;
        });
        if (match) cData = parseCustomData(match.custom_data);
      }

      const fullLog = (cData.beszelgetes_naplo as string) || '';

      // ── Parse the full log into timestamped entries ──
      // Format: [YYYY-MM-DD HH:MM] Ügyfél (Channel): text / AI Válasz: text / [Rendszer] text
      interface LogEntry {
        timestamp: string; // raw timestamp string
        time: number;      // unix ms for sorting
        sender: 'user' | 'ai' | 'system';
        text: string;
      }

      function parseLogEntries(log: string): LogEntry[] {
        if (!log) return [];
        const entries: LogEntry[] = [];
        // Match each [timestamp] ... block
        const entryRegex = /\[(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}(?::\d{2})?)\]\s*(.*?)(?=\[\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}|$)/gs;
        let m;
        while ((m = entryRegex.exec(log)) !== null) {
          const timestamp = m[1].trim();
          let content = m[2].trim();
          const time = new Date(timestamp.replace(' ', 'T')).getTime() || 0;

          let sender: 'user' | 'ai' | 'system' = 'system';
          // Detect sender from content prefix
          if (/^Ügyfél\s*\([^)]*\)\s*:/i.test(content)) {
            sender = 'user';
            content = content.replace(/^Ügyfél\s*\([^)]*\)\s*:\s*/i, '');
          } else if (/^(Felhasználó|User)\s*:/i.test(content)) {
            sender = 'user';
            content = content.replace(/^(Felhasználó|User)\s*:\s*/i, '');
          } else if (/^(AI\s*Válasz|AI|Asszisztens|Bot)\s*:/i.test(content)) {
            sender = 'ai';
            content = content.replace(/^(AI\s*Válasz|AI|Asszisztens|Bot)\s*:\s*/i, '');
          } else if (/^\[Rendszer\]/i.test(content)) {
            sender = 'system';
            content = content.replace(/^\[Rendszer\]\s*/i, '');
          }

          if (content) {
            entries.push({ timestamp, time, sender, text: content.trim() });
          }
        }
        return entries;
      }

      // Also support the simpler Felhasználó: / AI: format (no timestamps)
      function parseSimpleLog(log: string): ChatBlock[] {
        const lines = log.split('\n');
        const blocks: ChatBlock[] = [];
        let currentSender: 'user' | 'ai' | 'system' = 'system';
        let currentBlock: string[] = [];

        for (let line of lines) {
          line = line.trim();
          if (!line && currentSender !== 'ai') continue;

          let sender = currentSender;
          if (line.startsWith('Felhasználó:') || line.startsWith('User:')) {
            sender = 'user';
            line = line.replace(/^(Felhasználó|User):\s*/, '');
          } else if (line.startsWith('AI:') || line.startsWith('Asszisztens:') || line.startsWith('Bot:')) {
            sender = 'ai';
            line = line.replace(/^(AI|Asszisztens|Bot):\s*/, '');
          } else if (line.startsWith('[')) {
            sender = 'system';
          }

          if (sender !== currentSender && currentBlock.length > 0) {
            blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
            currentBlock = [];
          }
          currentSender = sender;
          if (line) currentBlock.push(line);
        }
        if (currentBlock.length > 0) {
          blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
        }
        return blocks;
      }

      // ── Group entries into conversation sessions (30 min gap = new session) ──
      function groupIntoSessions(entries: LogEntry[]): LogEntry[][] {
        if (entries.length === 0) return [];
        const sorted = [...entries].sort((a, b) => a.time - b.time);
        const sessions: LogEntry[][] = [[sorted[0]]];
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].time - sorted[i - 1].time;
          if (gap > 30 * 60 * 1000) { // 30 minute gap
            sessions.push([sorted[i]]);
          } else {
            sessions[sessions.length - 1].push(sorted[i]);
          }
        }
        return sessions;
      }

      // ── Find the session closest to the interaction's date ──
      let logText: string;
      let parsedBlocks: ChatBlock[];

      const allEntries = parseLogEntries(fullLog);
      if (allEntries.length > 0 && row.date) {
        const interactionTime = new Date(row.date).getTime();
        const sessionGroups = groupIntoSessions(allEntries);

        // Find the session group whose time range is closest to the interaction date
        let bestSession = sessionGroups[0];
        let bestDistance = Infinity;
        for (const group of sessionGroups) {
          const groupStart = group[0].time;
          const groupEnd = group[group.length - 1].time;
          // Distance = how close is interactionTime to this group's time range
          const dist = interactionTime >= groupStart && interactionTime <= groupEnd
            ? 0
            : Math.min(Math.abs(interactionTime - groupStart), Math.abs(interactionTime - groupEnd));
          if (dist < bestDistance) {
            bestDistance = dist;
            bestSession = group;
          }
        }

        // Convert the best session's entries to chat blocks with timestamp headers
        const blocks: ChatBlock[] = [];
        let lastTimestamp = '';
        for (const entry of bestSession) {
          // Add timestamp header when timestamp changes
          const ts = entry.timestamp;
          if (ts !== lastTimestamp) {
            blocks.push({ sender: 'system', text: `[${ts}]` });
            lastTimestamp = ts;
          }
          blocks.push({ sender: entry.sender, text: entry.text });
        }
        parsedBlocks = blocks;
        logText = bestSession.map((e) => `[${e.timestamp}] ${e.text}`).join('\n');
      } else if (fullLog) {
        // Fallback: try simple format parsing
        parsedBlocks = parseSimpleLog(fullLog);
        logText = fullLog;
      } else {
        logText = row.summary || 'Nincs elérhető beszélgetés napló.';
        parsedBlocks = [{ sender: 'system' as const, text: logText }];
      }

      setSummary((cData.problem_description as string) || row.summary || '');

      // ── Result data: fetch calendar for matching ──
      let finalDate = '-';
      let finalService = '-';
      let finalDoctor = '-';
      let finalReminder = '-';

      try {
        const { data: events } = await supabase
          .from('calendar_events')
          .select('*')
          .order('start_dt', { ascending: false });
        const clientName = (row.client || '').toLowerCase().trim();
        const clientEmail = ((cData.email as string) || '').toLowerCase().trim();

        const matchedEvent = events
          .filter((ev: { attendee?: string; attendee_email?: string }) => {
            const evAttendee = (ev.attendee || '').toLowerCase().trim();
            const evEmail = (ev.attendee_email || '').toLowerCase().trim();
            return (
              (clientName && evAttendee.includes(clientName)) ||
              (clientName && clientName.includes(evAttendee) && evAttendee.length > 2) ||
              (clientEmail && evEmail === clientEmail)
            );
          })
          .sort((a: { start_dt?: string }, b: { start_dt?: string }) => (b.start_dt || '').localeCompare(a.start_dt || ''))[0];

        if (matchedEvent) {
          if (matchedEvent.title && matchedEvent.title !== '-') finalService = matchedEvent.title;
          if (matchedEvent.start_dt) finalDate = fmtDt(matchedEvent.start_dt);
          if (matchedEvent.doctor) finalDoctor = matchedEvent.doctor;
          finalReminder = matchedEvent.reminder_sent ? 'Kiküldve ✓' : '-';
        }
      } catch {
        /* calendar fetch optional */
      }

      // Fallback from custom_data
      if (finalDate === '-' && cData.booked_datetime) {
        finalDate = fmtDt(cData.booked_datetime as string);
      }

      // Fallback from log text
      if (finalDate === '-') {
        const naploDateMatch = logText.match(/Naptár bejegyzés létrehozva:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/i);
        if (naploDateMatch) finalDate = fmtDt(naploDateMatch[1]);
      }

      if (finalService === '-') {
        const servicePatterns = [
          /szolgáltatás:\s*([^\n,]+)/i,
          /(fogászati vizsgálat|ultrahangos fogkőeltávolítás|fogkőeltávolítás|általános vizit|általános konzultáció|konzultáció|fogászat|fogpótlás|implantátum|tömés|gyökérkezelés|fogfehérítés|szájsebészet|fogszabályozás|paradontológia|fogtisztítás|kontroll vizsgálat|vizit|vizsgálat|kezelés)/i,
        ];
        for (const pat of servicePatterns) {
          const m = logText.match(pat);
          if (m) {
            const s = (m[1] || m[0]).trim();
            finalService = s.charAt(0).toUpperCase() + s.slice(1);
            break;
          }
        }
      }

      if (finalDoctor === '-') {
        const docMatch = logText.match(/(?:orvos|doktor|dr\.):\s*([^\n,]+)/i);
        if (docMatch) finalDoctor = docMatch[1].trim();
      }

      if (!cancelled) {
        setResultData({ date: finalDate, service: finalService, doctor: finalDoctor, reminder: finalReminder });
        setChatBlocks(parsedBlocks);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [row, clients, clientsMap]);

  return (
    <div
      style={{
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="login-card"
        style={{
          width: 700,
          maxWidth: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 8,
          border: 'none',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          background: 'var(--card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(to right, #14b8ad, #1ceee0)', padding: '20px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(8,36,50,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Interakciós összefoglaló
              </div>
              <h3 style={{ margin: '0 0 6px 0', color: '#082432', fontSize: 20, fontWeight: 700 }}>
                {row.client || 'Ismeretlen'}
              </h3>
              <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'rgba(8,36,50,0.8)', fontWeight: 500 }}>
                <span>{row.channel || 'Telefon'}</span>
                <span>•</span>
                <span>{row.date ? fmtDt(row.date) : ''}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(8,36,50,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#082432', marginLeft: 8 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: 'auto', flexGrow: 1 }}>
          {/* Summary + Result side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Summary */}
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px 0' }}>
                Összefoglaló
              </h4>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                {summary || 'Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit.'}
              </div>
            </div>

            {/* Result */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>
                Eredmény
              </h4>
              <ResultLine label="Befoglalt időpont:" value={resultData.date} />
              <ResultLine label="Szolgáltatás:" value={resultData.service} />
              <ResultLine label="Orvos:" value={resultData.doctor} />
              <ResultLine label="Emlékeztető kiküldve:" value={resultData.reminder} last />
            </div>
          </div>

          {/* Chat */}
          {showChat && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>
                Teljes beszélgetés
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {chatBlocks.map((b, i) =>
                  b.sender === 'system' ? (
                    <div key={i} style={{
                      textAlign: 'center',
                      margin: '16px 0',
                      fontSize: 11.5,
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      fontStyle: 'italic',
                      padding: '4px 16px',
                      background: 'rgba(0,0,0,0.03)',
                      borderRadius: 8,
                    }}>
                      {b.text}
                    </div>
                  ) : (
                    <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                      {/* Avatar */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                        ...(b.sender === 'user'
                          ? { background: '#e5e7eb', color: '#374151' }
                          : { background: 'linear-gradient(135deg, var(--accent, #1ceee0), var(--accent2, #0bbdb1))', color: '#082432' }
                        ),
                      }}>
                        {b.sender === 'user' ? 'Ü' : 'AI'}
                      </div>
                      {/* Bubble */}
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: 6,
                        fontSize: 13,
                        lineHeight: 1.5,
                        maxWidth: '85%',
                        whiteSpace: 'pre-wrap',
                        borderTopLeftRadius: 4,
                        ...(b.sender === 'user'
                          ? { background: '#f3f4f6', color: '#1f2937' }
                          : { background: 'rgba(28, 238, 224, 0.1)', color: 'var(--text)', border: '1px solid rgba(28, 238, 224, 0.2)' }
                        ),
                      }}>
                        {b.text}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--bg3)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button
            className="btn-primary"
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', width: 'auto', padding: '10px 16px', margin: 0, fontFamily: 'inherit' }}
          >
            Ugrás ügyfélprofilra
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowChat(!showChat)}
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              color: '#082432',
              border: 'none',
              width: 'auto',
              padding: '10px 16px',
              margin: 0,
              fontFamily: 'inherit',
            }}
          >
            <span style={{ marginRight: 6 }}>{showChat ? '↑' : '↓'}</span>
            {showChat ? 'Beszélgetés elrejtése' : 'Interakció megtekintése'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: last ? 0 : 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
