    // ── INTERACTIONS FLAT TABLE ───────────────────────────────────────────────────
    let _allInteractionRows = [];

    async function loadInteractions() {
      const tbody = document.getElementById('interactions-flat-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;margin:0 auto 10px;"></div>Adatok betöltése...</td></tr>';
      
      // Load assigned clients for member filtering
      await loadMyAssignedClients();

      // Load clients data for name resolution
      let clientsMap = {};
      try {
        const cres = await authFetch('/admin/api/clients');
        const cdata = await cres.json();
        (cdata.clients || []).forEach(c => {
          clientsMap[c.id] = c;
        });
        window.kanbanData = cdata.clients || [];
      } catch(e) {}
      
      try {
        const res = await authFetch('/admin/api/sessions/summary?limit=100');
        const data = await res.json();
        let sessions = data.sessions || [];
        // Member filter: only show interactions for assigned clients
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
          sessions = sessions.filter(s => isSessionAssignedToMe(s));
        }
        buildFlatInteractionRows(sessions, clientsMap);
      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    function buildFlatInteractionRows(sessions, clientsMap) {
      _allInteractionRows = [];
      clientsMap = clientsMap || {};
      
      sessions.forEach(s => {
        const sessionDate = s.started_at || '';
        const sRoom = (s.room_name || '').toLowerCase();
        const sessionClientName = s.participant || s.client_name || 'Ismeretlen';

        function getRowChannel(rType) {
          const t = (rType || '').toLowerCase();
          if (t.includes('email') || sRoom.includes('email') || (s.session_id && s.session_id.startsWith('reminder_'))) return 'Email';
          if (t.includes('messenger') || sRoom.includes('messenger')) return 'Messenger';
          if (t.includes('instagram') || sRoom.includes('instagram')) return 'Instagram';
          if (t.includes('whatsapp') || sRoom.includes('whatsapp')) return 'WhatsApp';
          return s.channel || 'Telefon';
        }

        function detectUgyTipus(r) {
          const topic = ((r.topic || '') + ' ' + (r.summary || '') + ' ' + (r.type || '')).toLowerCase();
          if (topic.includes('panasz') || topic.includes('reklamáció') || topic.includes('complaint')) return 'PANASZ';
          if (topic.includes('időpont') || topic.includes('foglal') || topic.includes('booking') || topic.includes('lemondás') || topic.includes('módosít') || topic.includes('emlékeztet')) return 'IDŐPONT';
          if (topic.includes('kérés') || topic.includes('keres') || topic.includes('igény') || topic.includes('request')) return 'KÉRÉS';
          if (topic.includes('kérdés') || topic.includes('question') || topic.includes('információ') || topic.includes('érdeklőd')) return 'KÉRDÉS';
          return 'EGYÉB';
        }

        function detectEredmeny(r) {
          const fs = (r.funnel_stage || '').toLowerCase();
          const tp = (r.topic || '').toLowerCase();
          const sm = (r.summary || '').toLowerCase();
          const rs = (r.result || '').toLowerCase();
          const ty = (r.type || '').toLowerCase();
          const as = (r.approval_status || '').toLowerCase();
          const combined = tp + ' ' + sm + ' ' + rs;

          // ── PANASZ (legmagasabb prioritás) ──
          if (combined.includes('panasz') || combined.includes('reklamáció') || combined.includes('complaint')) return 'Panasz rögzítve';

          // ── IDŐPONT kategóriák ──
          // Új időpont: foglalás történt
          if (fs === 'booked' || fs === 'foglalt' || ty === 'foglalás' || tp.includes('időpontfoglal') || tp.includes('foglal')
              || combined.includes('lefoglal') || combined.includes('új időpont') || rs.includes('lefoglalva')) return 'Új időpont';
          // Időpont módosítva
          if (combined.includes('módosít') || combined.includes('áthelyez') || combined.includes('változtat')
              || tp.includes('módosítás')) return 'Időpont módosítva';
          // Időpont törölve/lemondva
          if (combined.includes('lemond') || combined.includes('töröl') || combined.includes('cancel')
              || fs === 'cancelled') return 'Időpont törölve';
          // Időpont előkészítve: ajánlat fázisban, vagy előkészítés
          if (combined.includes('előkészít') || fs === 'negotiating' || fs === 'ajanlat'
              || fs === 'foglalas_alatt') return 'Időpont előkészítve';

          // ── KÉRDÉS kategóriák ──
          // Megválaszolt kérdés: kérdés típus + válasz kész (approved)
          if ((ty === 'kérdés' || tp.includes('kérdés') || tp.includes('tudásbázis') || tp.includes('információ'))
              && (as === 'approved' || as === 'lezárt' || rs.includes('megválaszol') || rs.includes('megoldva'))) return 'Megválaszolt kérdés';
          // Válasz előkészítve: pending jóváhagyásra
          if (as === 'pending' && (ty === 'email' || ty === 'kérdés' || ty === 'messenger' || ty === 'instagram')
              && (rs.includes('jóváhagyás') || rs.includes('várakozik') || rs.includes('pending')
              || combined.includes('piszkozat') || combined.includes('draft'))) return 'Válasz előkészítve';
          // Kérdés rögzítve: kérdés típus de nem jóváhagyott
          if (ty === 'kérdés' || tp.includes('tudásbázis') || tp.includes('kérdés')
              || (combined.includes('érdeklőd') && !combined.includes('időpont'))) return 'Kérdés rögzítve';

          // ── IGÉNY rögzítve ──
          if (combined.includes('igény') || combined.includes('kérés') || ty === 'feladat'
              || tp.includes('feladat')) return 'Igény rögzítve';

          // ── EMAIL: Válasz előkészítve vs Elküldve ──
          if (ty === 'email') {
            if (as === 'pending' || rs.includes('jóváhagyás') || rs.includes('várakozik')) return 'Válasz előkészítve';
            if (as === 'approved' || rs.includes('elküld') || rs.includes('kiküld') || rs.includes('sikeres')) return 'Megválaszolt kérdés';
            if (tp.includes('emlékeztet') || tp.includes('reminder')) return 'Időpont előkészítve';
            return 'Válasz előkészítve';
          }

          // ── Messenger/Instagram/Meta: hasonló logika ──
          if (ty === 'messenger' || ty === 'instagram' || ty === 'meta' || ty === 'whatsapp') {
            if (as === 'pending') return 'Válasz előkészítve';
            if (as === 'approved') return 'Megválaszolt kérdés';
            return 'Kérdés rögzítve';
          }

          // ── Emlékeztető ──
          if (tp.includes('emlékeztet') || tp.includes('reminder')) return 'Időpont előkészítve';

          // ── Riasztás ──
          if (ty === 'voice_alert' || tp.includes('riasztás')) return 'Panasz rögzítve';

          // ── Funnel stage fallback ──
          if (fs === 'reached') return 'Kérdés rögzítve';
          if (fs === 'valaszolt') return 'Megválaszolt kérdés';

          return 'Kérdés rögzítve';
        }

        function detectStatusz(r) {
          const hr = (r.handover_reason || '').toLowerCase();
          const as = (r.approval_status || '').toLowerCase();
          if (hr.includes('sürgős') || hr.includes('urgent') || hr.includes('panasz')) return 'SÜRGŐS';
          if (as === 'approved' || as === 'lezárt' || as === 'rejected') return 'LEZÁRT';
          if (as === 'pending' || hr.includes('nyitott') || hr.includes('várakoz')) return 'NYITOTT';
          // Default: if old and no explicit status, assume lezárt
          return 'LEZÁRT';
        }

        function detectTeendo(r) {
          const hr = (r.handover_reason || '').toLowerCase();
          const as = (r.approval_status || '').toLowerCase();
          if (hr.includes('sürgős') || hr.includes('panasz')) return 'Azonnali beavatkozás szükséges';
          if (as === 'pending') return 'Jóváhagyásra vár';
          if (hr.includes('visszahív')) return 'Visszahívás szükséges';
          if (hr.includes('válasz')) return 'Válasz szükséges';
          if (hr.includes('intézked') || hr.includes('véglegesít')) return 'Intézkedés szükséges';
          if (hr.includes('végleges')) return 'Véglegesítés szükséges';
          return 'Nincs további teendő';
        }

        function resolveClientName(r) {
          // Helper: check if a string looks like a raw numeric ID (not a name)
          function isRawId(val) { return val && /^\d{8,}$/.test(val); }
          // Helper: extract the best name from a client record
          function bestClientName(c) {
            let cd = c.custom_data;
            if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
            const n = cd?.nev || cd?.name || cd?.['név'] || c.name;
            return (n && n !== 'Névtelen' && n !== '-' && !isRawId(n)) ? n : null;
          }

          // 1. Try to find client by client_id first
          if (r.client_id && clientsMap[r.client_id]) {
            const c = clientsMap[r.client_id];
            const n = bestClientName(c);
            return { name: n || sessionClientName, id: c.id, status: c.status, created_at: c.created_at };
          }

          // 2. DIRECT messenger/instagram/whatsapp ID lookup from session_id
          //    This is the most reliable method for social channels
          const sid = s.session_id || '';
          let directId = null;
          if (sid.startsWith('messenger_')) directId = sid.substring(10).trim();
          else if (sid.startsWith('instagram_')) directId = sid.substring(10).trim();
          else if (sid.startsWith('whatsapp_')) directId = sid.substring(9).trim();

          if (directId) {
            const directMatch = window.kanbanData?.find(c => {
              let cd = c.custom_data;
              if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
              const mid = (cd?.messenger_id || cd?.messenger_psid || '').toString().trim();
              return mid && mid === directId;
            });
            if (directMatch) {
              const n = bestClientName(directMatch);
              if (n) return { name: n, id: directMatch.id, status: directMatch.status, created_at: directMatch.created_at };
            }
          }

          // 3. Build a list of search values to try (name, email, phone)
          const searchValues = [];
          if (sessionClientName && sessionClientName !== 'Ismeretlen' && !isRawId(sessionClientName)) {
            searchValues.push(sessionClientName.toLowerCase().trim());
          }
          // Extract email from session_id
          if (sid.startsWith('email_')) {
            const emailFromSid = sid.substring(6).toLowerCase().trim();
            if (emailFromSid && !searchValues.includes(emailFromSid)) searchValues.push(emailFromSid);
          }
          // Also add the directId for fallback matching
          if (directId && !searchValues.includes(directId)) searchValues.push(directId);

          // Try all search values against all clients
          for (const searchVal of searchValues) {
            const match = window.kanbanData?.find(c => {
              let cd = c.custom_data;
              if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
              // Match by name
              const cn = (cd?.nev || cd?.name || cd?.['név'] || c.name || '').toLowerCase().trim();
              if (cn && cn === searchVal) return true;
              // Match by messenger_id
              const mid = (cd?.messenger_id || cd?.messenger_psid || '').toString().trim().toLowerCase();
              if (mid && mid === searchVal) return true;
              // Match by email
              const em = (cd?.email || c.email || '').toLowerCase().trim();
              if (em && em === searchVal) return true;
              // Match by phone
              const ph = (cd?.phone || cd?.telefon || c.phone || '').replace(/\s/g, '');
              if (ph && ph === searchVal.replace(/\s/g, '')) return true;
              return false;
            });
            if (match) {
              const n = bestClientName(match);
              return { name: n || sessionClientName, id: match.id, status: match.status, created_at: match.created_at };
            }
          }
          
          // No DB match found - return best available name from session
          let bestName = sessionClientName;
          // If participant is a raw ID or 'Ismeretlen', try to get a better name from session_id
          if (bestName === 'Ismeretlen' || isRawId(bestName)) {
            if (sid.startsWith('email_')) {
              bestName = sid.substring(6); // show email address
            } else if (sid.startsWith('phone_')) {
              bestName = sid.substring(6); // show phone
            }
          }
          return { name: bestName, id: null, status: null, created_at: null };
        }

        (s.interactions || []).forEach(r => {
          const clientInfo = resolveClientName(r);
          let clientTags = [];
          if (clientInfo.id && clientsMap[clientInfo.id]) {
            let _cd = clientsMap[clientInfo.id].custom_data;
            if (typeof _cd === 'string') try { _cd = JSON.parse(_cd); } catch(e) { _cd = {}; }
            clientTags = _cd?.tags || [];
          }

          _allInteractionRows.push({
            date: r.created_at || sessionDate,
            channel: getRowChannel(r.type),
            client: clientInfo.name,
            clientId: clientInfo.id,
            clientStatus: clientInfo.status,
            clientCreatedAt: clientInfo.created_at,
            direction: (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő',
            ugyTipus: detectUgyTipus(r),
            eredmeny: detectEredmeny(r),
            statusz: detectStatusz(r),
            teendo: detectTeendo(r),
            tags: clientTags,
            // Keep raw data for backward compat
            type: r.type || '-',
            topic: r.topic || '-',
            summary: r.summary || '-',
            result: r.result || '',
            interactionId: r.id || null,
            sessionId: s.session_id || null,
            ai_draft_response: r.ai_draft_response || null,
            approval_status: r.approval_status || null,
          });
        });

        if (!s.interactions || s.interactions.length === 0) {
          const clientInfo = resolveClientName({});
          _allInteractionRows.push({
            date: sessionDate,
            channel: getRowChannel(''),
            client: clientInfo.name,
            clientId: clientInfo.id,
            clientStatus: clientInfo.status,
            clientCreatedAt: clientInfo.created_at,
            direction: 'Bejövő',
            ugyTipus: 'EGYÉB',
            eredmeny: 'Rögzítve',
            statusz: 'LEZÁRT',
            teendo: 'Nincs további teendő',
            type: 'session',
            topic: '-',
            summary: s.summary || '-',
            result: '',
            interactionId: null,
            sessionId: s.session_id || null,
          });
        }
      });

      _allInteractionRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      filterInteractionsTable();
    }

    const RESULT_COLORS = {
      'Lezárt': { bg: '#dcfce7', color: '#15803d' },
      'Foglalás történt': { bg: '#dcfce7', color: '#166534' },
      'Siker': { bg: '#dcfce7', color: '#166534' },
      'Foglalt': { bg: '#dcfce7', color: '#166534' },
      'Átadva': { bg: '#ffedd5', color: '#c2410c' },
      'Visszahívás szükséges': { bg: '#ffedd5', color: '#9a3412' },
      'Sürgős': { bg: '#ffedd5', color: '#9a3412' },
      'Nyitott ügy': { bg: '#fee2e2', color: '#b91c1c' },
      'Kimenő': { bg: '#f3e8ff', color: '#6b21a8' },
      'Bejövő': { bg: '#dbeafe', color: '#1e40af' },
    };

    const EREDMENY_COLORS = {
      'Új időpont': { bg: '#dcfce7', color: '#166534' },
      'Időpont módosítva': { bg: '#dbeafe', color: '#1e40af' },
      'Időpont törölve': { bg: '#f3f4f6', color: '#6b7280' },
      'Időpont előkészítve': { bg: '#fef9c3', color: '#854d0e' },
      'Megválaszolt kérdés': { bg: '#dcfce7', color: '#166534' },
      'Válasz előkészítve': { bg: '#fef9c3', color: '#854d0e' },
      'Kérdés rögzítve': { bg: '#dbeafe', color: '#1e40af' },
      'Igény rögzítve': { bg: '#fef9c3', color: '#854d0e' },
      'Panasz rögzítve': { bg: '#fee2e2', color: '#b91c1c' },
    };

    const STATUSZ_COLORS = {
      'LEZÁRT': { bg: '#dcfce7', color: '#166534' },
      'NYITOTT': { bg: '#fef9c3', color: '#854d0e' },
      'SÜRGŐS': { bg: '#fee2e2', color: '#b91c1c' },
    };

    const UGYTIPUS_COLORS = {
      'IDŐPONT': { bg: '#dbeafe', color: '#1e40af' },
      'IDŐPONT > Foglalás': { bg: '#dbeafe', color: '#1e40af' },
      'IDŐPONT > Módosítás': { bg: '#c7d2fe', color: '#3730a3' },
      'IDŐPONT > Lemondás': { bg: '#e0e7ff', color: '#4338ca' },
      'IDŐPONT > Emlékeztető': { bg: '#ede9fe', color: '#5b21b6' },
      'KÉRDÉS': { bg: '#ccfbf1', color: '#0f766e' },
      'KÉRDÉS > Általános': { bg: '#ccfbf1', color: '#0f766e' },
      'KÉRDÉS > Árkérdés': { bg: '#a7f3d0', color: '#065f46' },
      'KÉRDÉS > Ajánlatkérés': { bg: '#6ee7b7', color: '#064e3b' },
      'KÉRÉS': { bg: '#fef9c3', color: '#854d0e' },
      'KÉRÉS > Adminisztratív': { bg: '#fef9c3', color: '#854d0e' },
      'KÉRÉS > Akciót igénylő': { bg: '#fde68a', color: '#92400e' },
      'PANASZ': { bg: '#fee2e2', color: '#b91c1c' },
      'EGYÉB': { bg: '#f3f4f6', color: '#374151' },
    };

    function eredmenyBadge(val) {
      if (!val) return '—';
      const c = EREDMENY_COLORS[val] || { bg: '#f3f4f6', color: '#374151' };
      return `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color};">${esc(val)}</span>`;
    }

    function statuszBadge(val) {
      if (!val) return '—';
      const c = STATUSZ_COLORS[val] || { bg: '#f3f4f6', color: '#374151' };
      return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:${c.bg};color:${c.color};letter-spacing:0.5px;">${esc(val)}</span>`;
    }

    function ugyTipusBadge(val) {
      if (!val) return '—';
      return `<span style="font-size:12px;color:var(--text);">${esc(val)}</span>`;
    }

    function resultBadge(result) {
      if (!result) return '—';
      const c = RESULT_COLORS[result] || { bg: '#f3f4f6', color: '#374151' };
      return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color};">${esc(result)}</span>`;
    }

    function typeChip(type) {
      const MAP = {
        'foglalás': '#dbeafe:#1d4ed8',
        'email': '#ede9fe:#7c3aed',
        'feladat': '#f3e8ff:#9333ea',
        'kérdés': '#ccfbf1:#0f766e',
        'session': '#f3f4f6:#6b7280',
      };
      const [bg, col] = (MAP[type] || '#f3f4f6:#374151').split(':');
      return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${bg};color:${col};">${esc(type)}</span>`;
    }


    async function openInteractionSummaryModal(idx) {
      const r = window._filteredInteractionRows[idx];
      if (!r) return;

      // Find matching client from kanbanData
      const clients = window.kanbanData || [];
      let client = null;
      if (r.clientId) {
        client = clients.find(c => c.id === r.clientId);
      }
      if (!client) {
        const rn = (r.client || '').toLowerCase().trim();
        client = clients.find(c => {
          let cd = c.custom_data;
          if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
          const cn = (cd?.nev || cd?.name || cd?.['név'] || c.name || '').toLowerCase().trim();
          return cn && cn === rn;
        });
      }

      // Build custom data
      let cData = {};
      if (client && client.custom_data) {
        try { cData = typeof client.custom_data === 'string' ? JSON.parse(client.custom_data) : client.custom_data; } catch(e) {}
      }
      cData.id = client ? client.id : null;
      cData._client_status = client ? client.status : null;
      cData._client_created_at = client ? client.created_at : null;

      const logText = cData.beszelgetes_naplo || r.summary || 'Nincs elérhető beszélgetés napló.';

      // Store client data for "Ugrás ügyfélprofilra" button
      window.currentLogModalClientData = {
        id: cData.id,
        name: r.client || cData.nev || cData.name || '',
        email: cData.email || '',
        phone: cData.telefonszam || cData.phone || ''
      };

      // ── Directly populate the log-modal (NO navigation, NO openLogModal) ──

      // Header
      const nameEl = document.getElementById('log-modal-title-name');
      if (nameEl) nameEl.textContent = r.client || 'Ismeretlen';
      const channelEl = document.getElementById('log-modal-channel');
      if (channelEl) channelEl.textContent = r.channel || 'Telefon';
      const dateEl = document.getElementById('log-modal-date');
      if (dateEl) dateEl.textContent = r.date ? fmtDt(r.date) : '';
      const topicEl = document.getElementById('log-modal-topic');
      if (topicEl) topicEl.textContent = 'Interakciós összefoglaló';

      // Summary
      const summaryBox = document.getElementById('log-modal-summary');
      if (summaryBox) summaryBox.textContent = cData.problem_description || 'Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit és lefoglalt egy időpontot.';

      // ── Result box: Fetch calendar events for this client ──
      let finalDate = '-';
      let finalService = '-';
      let finalDoctor = '-';
      let finalReminder = '-';

      // Try to find calendar event for this client
      try {
        const calRes = await authFetch('/admin/api/calendar');
        const calData = await calRes.json();
        const events = calData.events || [];
        const clientName = (r.client || '').toLowerCase().trim();
        const clientEmail = (cData.email || '').toLowerCase().trim();
        
        // Find matching event (most recent first)
        const matchedEvent = events
          .filter(ev => {
            const evAttendee = (ev.attendee || '').toLowerCase().trim();
            const evEmail = (ev.attendee_email || '').toLowerCase().trim();
            return (clientName && evAttendee.includes(clientName)) ||
                   (clientName && clientName.includes(evAttendee) && evAttendee.length > 2) ||
                   (clientEmail && evEmail === clientEmail);
          })
          .sort((a, b) => (b.start_dt || '').localeCompare(a.start_dt || ''))[0];

        if (matchedEvent) {
          // Service from event title
          if (matchedEvent.title && matchedEvent.title !== '-') {
            finalService = matchedEvent.title;
          }
          // Date from event
          if (matchedEvent.start_dt) {
            const dt = new Date(matchedEvent.start_dt);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            const h = String(dt.getHours()).padStart(2, '0');
            const mi = String(dt.getMinutes()).padStart(2, '0');
            finalDate = `${y}. ${m}. ${d}. ${h}:${mi}`;
          }
          // Doctor from event (if stored)
          if (matchedEvent.doctor) {
            finalDoctor = matchedEvent.doctor;
          }
          // Reminder status
          finalReminder = matchedEvent.reminder_sent ? 'Kiküldve ✓' : '-';
        }
      } catch(e) { console.warn('Calendar fetch for modal failed:', e); }

      // Fallback: parse from custom_data if calendar didn't provide
      if (finalDate === '-' && cData.booked_datetime) {
        const dt = new Date(cData.booked_datetime);
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          const h = String(dt.getHours()).padStart(2, '0');
          const mi = String(dt.getMinutes()).padStart(2, '0');
          finalDate = `${y}. ${m}. ${d}. ${h}:${mi}`;
        } else {
          finalDate = cData.booked_datetime;
        }
      }

      // Fallback: parse from beszelgetes_naplo text
      if (finalDate === '-') {
        const naploDateMatch = logText.match(/Naptár bejegyzés létrehozva:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/i);
        if (naploDateMatch) {
          const dt = new Date(naploDateMatch[1]);
          if (!isNaN(dt.getTime())) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            const h = String(dt.getHours()).padStart(2, '0');
            const mi = String(dt.getMinutes()).padStart(2, '0');
            finalDate = `${y}. ${m}. ${d}. ${h}:${mi}`;
          }
        }
      }

      // Fallback service from log text
      if (finalService === '-') {
        const servicePatterns = [
          /szolgáltatás:\s*([^\n,]+)/i,
          /(fogászati vizsgálat|ultrahangos fogkőeltávolítás|fogkőeltávolítás|általános vizit|általános konzultáció|konzultáció|fogászat|fogpótlás|implantátum|tömés|gyökérkezelés|fogfehérítés|szájsebészet|fogszabályozás|paradontológia|fogtisztítás|kontroll vizsgálat|vizit|vizsgálat|kezelés)/i
        ];
        for (const pat of servicePatterns) {
          const m = logText.match(pat);
          if (m) {
            finalService = (m[1] || m[0]).trim();
            finalService = finalService.charAt(0).toUpperCase() + finalService.slice(1);
            break;
          }
        }
      }

      // Fallback doctor from log text
      if (finalDoctor === '-') {
        const docMatch = logText.match(/(?:orvos|doktor|dr\.):\s*([^\n,]+)/i);
        if (docMatch) finalDoctor = docMatch[1].trim();
      }

      const resDate = document.getElementById('lm-res-date');
      if (resDate) resDate.textContent = finalDate;
      const resService = document.getElementById('lm-res-service');
      if (resService) resService.textContent = finalService;
      const resDoctor = document.getElementById('lm-res-doctor');
      if (resDoctor) resDoctor.textContent = finalDoctor;
      const resReminder = document.getElementById('lm-res-reminder');
      if (resReminder) resReminder.textContent = finalReminder;

      // Chat bubbles
      const chatContainer = document.getElementById('log-modal-chat');
      if (chatContainer) {
        chatContainer.innerHTML = '';
        const lines = logText.split('\n');
        let blocks = [];
        let currentSender = 'system';
        let currentBlock = [];
        for (let line of lines) {
          line = line.trim();
          if (!line && currentSender !== 'ai') continue;
          let sender = currentSender;
          if (line.startsWith('Felhasználó:') || line.startsWith('User:')) { sender = 'user'; line = line.replace(/^(Felhasználó|User):\s*/, ''); }
          else if (line.startsWith('AI:') || line.startsWith('Asszisztens:') || line.startsWith('Bot:')) { sender = 'ai'; line = line.replace(/^(AI|Asszisztens|Bot):\s*/, ''); }
          else if (line.startsWith('[')) { sender = 'system'; }
          if (sender !== currentSender && currentBlock.length > 0) {
            blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
            currentBlock = [];
          }
          currentSender = sender;
          if (line) currentBlock.push(line);
        }
        if (currentBlock.length > 0) blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
        blocks.forEach(b => {
          if (b.sender === 'system') {
            chatContainer.appendChild(createSystemBubble(b.text));
          } else {
            chatContainer.appendChild(createChatBubble(b.sender, b.text));
          }
        });
      }

      // Reset chat container and toggle button
      const chatContainerWrapper = document.getElementById('log-modal-chat-container');
      if (chatContainerWrapper) chatContainerWrapper.style.display = 'none';
      const toggleBtn = document.getElementById('log-modal-toggle-btn');
      if (toggleBtn) toggleBtn.innerHTML = `<span style="margin-right:6px;">↓</span> Interakció megtekintése`;

      // Show the modal — stays on current page, no navigation!
      document.getElementById('log-modal').style.display = 'flex';
    }

    function filterInteractionsTable() {
      const tbody = document.getElementById('interactions-flat-body');
      const countEl = document.getElementById('interactions-count');
      if (!tbody) return;

      const q = (document.getElementById('interaction-search')?.value || '').toLowerCase();
      const typeF = (document.getElementById('interaction-type-filter')?.value || '').toLowerCase();

      // Panel filters
      const checkedUgyTipus = [...document.querySelectorAll('.int-filter-ugytipus:checked')].map(c => c.value);
      const checkedCsatorna = [...document.querySelectorAll('.int-filter-csatorna:checked')].map(c => c.value);
      const checkedIrany = [...document.querySelectorAll('.int-filter-irany:checked')].map(c => c.value);
      const checkedStatusz = [...document.querySelectorAll('.int-filter-statusz:checked')].map(c => c.value);
      const dateFrom = document.getElementById('int-filter-date-from')?.value || '';
      const dateTo = document.getElementById('int-filter-date-to')?.value || '';

      const sortVal = (document.getElementById('interaction-sort')?.value || 'date_desc');
      window._filteredInteractionRows = _allInteractionRows.filter(r => {
        const matchType = !typeF || r.type.toLowerCase().includes(typeF);
        const matchQ = !q || [r.channel, r.client, r.direction, r.ugyTipus, r.eredmeny, r.statusz, r.teendo, r.summary].join(' ').toLowerCase().includes(q);
        const matchUgy = !checkedUgyTipus.length || checkedUgyTipus.includes(r.ugyTipus);
        const matchCh = !checkedCsatorna.length || checkedCsatorna.includes(r.channel);
        const matchDir = !checkedIrany.length || checkedIrany.includes(r.direction);
        const matchSt = !checkedStatusz.length || checkedStatusz.includes(r.statusz);
        let matchDate = true;
        if (dateFrom || dateTo) {
          const rd = (r.date || '').slice(0,10).replace(/\./g,'-');
          if (dateFrom && rd < dateFrom) matchDate = false;
          if (dateTo && rd > dateTo) matchDate = false;
        }
        return matchType && matchQ && matchUgy && matchCh && matchDir && matchSt && matchDate;
      });

      window._filteredInteractionRows.sort((a, b) => {
        if (sortVal === 'date_desc') return (b.date || '').localeCompare(a.date || '');
        if (sortVal === 'date_asc') return (a.date || '').localeCompare(b.date || '');
        if (sortVal === 'client_asc') return (a.client || '').localeCompare(b.client || '');
        if (sortVal === 'topic_asc') return (a.ugyTipus || '').localeCompare(b.ugyTipus || '');
        return 0;
      });

      if (!window._filteredInteractionRows.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#6b7280;padding:40px;">Nincs találat</td></tr>';
        if (countEl) countEl.textContent = '';
        return;
      }

      const isDark = document.body.classList.contains('dark');
      const dirColors = {
        'Bejövő': { bg: '#dbeafe', color: '#1e40af' },
        'Kimenő': { bg: '#f3e8ff', color: '#6b21a8' },
      };

      tbody.innerHTML = window._filteredInteractionRows.map((r, i) => {
        const bg = isDark ? (i % 2 === 0 ? '#0d2538' : '#0f2d40') : (i % 2 === 0 ? '#fff' : '#fafafa');
        const hover = isDark ? 'rgba(28,238,224,0.05)' : '#f0fffe';
        const txt = isDark ? '#c8d6e5' : '#374151';
        const txtH = isDark ? '#e8edf5' : '#0a1f2e';
        const txtM = isDark ? '#6b8b99' : '#6b7280';
        const bdr = isDark ? '#1a3548' : '#f3f4f6';
        const dc = dirColors[r.direction] || dirColors['Bejövő'];

        let clientCell;
        if (r.clientId) {
          clientCell = `<button onclick="event.stopPropagation(); openClientDetails({id: ${r.clientId}, name: '${esc(r.client).replace(/'/g, "\\'")}'}, 'interactions')" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent,#1ceee0);color:var(--accent,#1ceee0);border-radius:6px;cursor:pointer;padding:5px 10px;font-size:12px;font-weight:600;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;" title="Ugrás az ügyfél adatlapjára">${esc(r.client)}</button>`;
        } else {
          clientCell = `<span style="font-weight:500;color:${txtH};">${esc(r.client || 'Ismeretlen')}</span>`;
        }

        return `<tr style="background:${bg};border-bottom:1px solid ${bdr};transition:background 0.15s;cursor:pointer;" onclick="openInteractionSummaryModal(${i})" onmouseover="this.style.background='${hover}'" onmouseout="this.style.background='${bg}'">
      <td class="int-checkbox-col" style="padding:12px 16px;text-align:center;" onclick="event.stopPropagation()">
        <input type="checkbox" class="int-row-checkbox" data-idx="${i}" onchange="updateIntDeleteBtn()" style="cursor:pointer;width:16px;height:16px;accent-color:#1ceee0;"/>
      </td>
      <td style="padding:12px 16px;font-size:13px;white-space:nowrap;">
        <div style="font-weight:500;color:${txtH};">${fmtDt(r.date)}</div>
      </td>
      <td style="padding:12px 16px;font-size:13px;" onclick="event.stopPropagation()">${clientCell}</td>
      <td style="padding:12px 16px;font-size:13px;color:${txt};">${esc(r.channel)}</td>
      <td style="padding:12px 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${dc.bg};color:${dc.color};">${esc(r.direction)}</span></td>
      <td style="padding:12px 16px;">${ugyTipusBadge(r.ugyTipus)}</td>

      <td style="padding:12px 16px;">${eredmenyBadge(r.eredmeny)}</td>
      <td style="padding:12px 16px;">${statuszBadge(r.statusz)}</td>
      <td style="padding:12px 16px;font-size:12px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.teendo)}" onclick="event.stopPropagation()">${r.teendo === 'J\u00f3v\u00e1hagy\u00e1sra v\u00e1r' && r.ai_draft_response ? `<button onclick="openApprovalFromInteraction(${i})" style=\"background:rgba(251,191,36,0.12);color:#d97706;border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;\">\u26a0 J\u00f3v\u00e1hagy\u00e1sra v\u00e1r</button>` : `<span style=\"color:${txtM}\">${esc(r.teendo)}</span>`}</td>
    </tr>`;
      }).join('');

      if (countEl) countEl.textContent = `${window._filteredInteractionRows.length} interakció`;
      restoreIntColumnVisibility();
    }

    // ── Filter Panel Logic ──
    function toggleIntFilterPanel() {
      const panel = document.getElementById('int-filter-panel');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function toggleFilterSection(btn) {
      const section = btn.closest('.int-filter-section');
      if (!section) return;
      const body = section.querySelector('.filter-section-body');
      const chevron = btn.querySelector('.filter-chevron');
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    function applyIntFilters() {
      filterInteractionsTable();
      updateIntFilterBadge();
      toggleIntFilterPanel();
    }

    function resetIntFilters() {
      document.querySelectorAll('.int-filter-ugytipus, .int-filter-csatorna, .int-filter-irany, .int-filter-statusz').forEach(c => c.checked = false);
      const df = document.getElementById('int-filter-date-from');
      const dt = document.getElementById('int-filter-date-to');
      if (df) df.value = '';
      if (dt) dt.value = '';
      filterInteractionsTable();
      updateIntFilterBadge();
    }

    function updateIntFilterBadge() {
      const badge = document.getElementById('int-filter-badge');
      if (!badge) return;
      let count = 0;
      count += document.querySelectorAll('.int-filter-ugytipus:checked').length;
      count += document.querySelectorAll('.int-filter-csatorna:checked').length;
      count += document.querySelectorAll('.int-filter-irany:checked').length;
      count += document.querySelectorAll('.int-filter-statusz:checked').length;
      if (document.getElementById('int-filter-date-from')?.value) count++;
      if (document.getElementById('int-filter-date-to')?.value) count++;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
      badge.textContent = count;
    }

    // Close filter panel on outside click
    document.addEventListener('click', function(e) {
      const container = document.getElementById('int-filter-container');
      const panel = document.getElementById('int-filter-panel');
      if (container && panel && panel.style.display !== 'none' && !container.contains(e.target)) {
        panel.style.display = 'none';
      }
    });

    // kept for backward compat
    function renderSessionCards(sessions) { buildFlatInteractionRows(sessions); }
    function toggleSessionDetail() { }

    let activeFilter = '';
    function filterInteractions(type) { /* compat */ }

    function toggleAllInteractionCheckboxes(checked) {
      document.querySelectorAll('.int-row-checkbox').forEach(cb => cb.checked = checked);
      updateIntDeleteBtn();
    }

    function updateIntDeleteBtn() {
      const checked = document.querySelectorAll('.int-row-checkbox:checked');
      const btn = document.getElementById('int-delete-selected-btn');
      const countEl = document.getElementById('int-delete-count');
      if (btn) {
        btn.style.display = checked.length > 0 ? 'flex' : 'none';
      }
      if (countEl) countEl.textContent = checked.length;
      // Update "select all" checkbox state
      const all = document.querySelectorAll('.int-row-checkbox');
      const selectAll = document.getElementById('int-select-all');
      if (selectAll) {
        selectAll.checked = all.length > 0 && checked.length === all.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
      }
    }

    async function deleteSelectedInteractions() {
      const checked = document.querySelectorAll('.int-row-checkbox:checked');
      if (!checked.length) return;
      const count = checked.length;
      if (!confirm(`Biztosan törölni szeretnéd a kijelölt ${count} interakciót? Ez a művelet nem vonható vissza!`)) return;

      // Collect interaction IDs and session IDs
      const interactionIds = new Set();
      const sessionIds = new Set();
      checked.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        const row = window._filteredInteractionRows[idx];
        if (row) {
          if (row.interactionId) interactionIds.add(row.interactionId);
          if (row.sessionId) sessionIds.add(row.sessionId);
        }
      });

      // For session-only rows (no interactionId), we need to delete the whole session
      // For rows with interactionId, we delete those specific interactions
      // If ALL interactions in a session are selected, also delete the session
      try {
        const res = await authFetch('/admin/api/interactions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interaction_ids: [...interactionIds],
            session_ids: [...sessionIds]
          })
        });
        if (res.ok) {
          const data = await res.json();
          alert(`Sikeresen törölve: ${data.deleted_interactions || 0} interakció, ${data.deleted_sessions || 0} session.`);
          loadInteractions(); // Reload
        } else {
          alert('Hiba történt a törlés során!');
        }
      } catch (e) {
        console.error('Delete error:', e);
        alert('Hiba történt a törlés során!');
      }
    }

    function openApprovalFromInteraction(idx) {
      const r = window._filteredInteractionRows[idx];
      if (!r) return;
      // Build a compatible object for openApprovalModal
      const approvalObj = {
        id: r.interactionId,
        topic: r.topic || '',
        summary: r.summary || '',
        ai_draft_response: r.ai_draft_response || '{}',
        approval_status: r.approval_status || 'pending'
      };
      // Use the existing approval modal
      openApprovalModal(approvalObj);
    }
