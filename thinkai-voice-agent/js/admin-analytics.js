    // ── ANALYTICS ─────────────────────────────────────────────────────────────────

    async function loadMemberAnalytics() {
      // Load assigned clients for this member
      await loadMyAssignedClients();
      
      // Populate integrated greeting header
      const fullName = currentUserFullName || currentUser || 'User';
      const firstName = fullName.split(' ').pop() || fullName;
      const initials = fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarEl = document.getElementById('member-avatar');
      if (avatarEl) avatarEl.textContent = initials;
      const greetNameEl = document.getElementById('member-greeting-name');
      if (greetNameEl) greetNameEl.innerHTML = `Szia, <strong>${firstName}</strong>!`;
      const greetDateEl = document.getElementById('member-greeting-date');
      if (greetDateEl) {
        const _now = new Date();
        const _days = ['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'];
        const _months = ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
        greetDateEl.textContent = `${_now.getFullYear()}. ${_months[_now.getMonth()]} ${_now.getDate()}., ${_days[_now.getDay()]}`;
      }
      // Hide original greeting bar for members (greeting is now in the dashboard header)
      const origGreet = document.getElementById('greeting-bar');
      if (origGreet) origGreet.style.display = 'none';
      
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // ── Fetch all data in parallel ──
        const [cRes, sRes, calRes, apRes, apApprovedRes, colRes] = await Promise.all([
          authFetch('/admin/api/clients'),
          authFetch('/admin/api/sessions/summary?limit=1000'),
          authFetch('/admin/api/calendar'),
          authFetch('/admin/api/approvals'),
          authFetch('/admin/api/approvals?status=approved').catch(() => ({ json: () => ({ approvals: [] }) })),
          authFetch('/admin/api/kanban_columns').catch(() => ({ json: () => ({ columns: [] }) }))
        ]);
        const [cData, sData, calData, apData, apApprovedData, colData] = await Promise.all([
          cRes.json(), sRes.json(), calRes.json(), apRes.json(), apApprovedRes.json(), colRes.json()
        ]);

        const allClients = cData.clients || [];
        const myClients = allClients.filter(c => isClientAssignedToMe(c));
        const allSessions = sData.sessions || [];
        const mySessions = allSessions.filter(s => isSessionAssignedToMe(s));
        const allEvents = calData.events || [];
        const myEvents = allEvents.filter(ev => isCalendarEventAssignedToMe(ev));
        const rawApprovals = [...(apData.approvals || []), ...(apApprovedData.approvals || [])];
        const allApprovals = rawApprovals.filter(a => isApprovalAssignedToMe(a));
        const pendingApprovals = allApprovals.filter(a => a.approval_status === 'pending');

        // ── 1. KPI CARDS ──
        document.getElementById('member-client-count').textContent = myClients.length;



        // Next appointment
        const futureEvents = myEvents
          .filter(ev => new Date(ev.start_dt) > now)
          .sort((a, b) => new Date(a.start_dt) - new Date(b.start_dt));
        const nextEl = document.getElementById('member-next-appointment');
        const nextSubEl = document.getElementById('member-next-appointment-sub');
        if (futureEvents.length > 0) {
          const next = futureEvents[0];
          const nextDt = new Date(next.start_dt);
          nextEl.textContent = nextDt.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          nextSubEl.textContent = next.attendee || next.title || 'naptárban';
        } else {
          nextEl.textContent = 'Nincs közelgő';
          nextSubEl.textContent = 'naptárban';
        }

        // ── 2. TEENDŐK LISTA (naptári események + interakciós teendők) ──
        // Store todos globally for filter/render
        window._memberTodos = [];
        const todos = [];

        // a) Naptári események → teendők
        myEvents.forEach(ev => {
          const evDt = new Date(ev.start_dt);
          const isCompleted = ev.completed === true;
          todos.push({
            id: ev.id,
            type: 'calendar',
            desc: ev.title || 'Időpont',
            sub: ev.attendee || '',
            client: ev.attendee || '',
            clientId: null,
            badge: 'idopont',
            badgeLabel: 'Időpont',
            date: evDt,
            completed: isCompleted
          });
        });

        // b) Jóváhagyásra váró AI válaszok → teendők
        pendingApprovals.forEach(ap => {
          const apDt = ap.created_at ? new Date(ap.created_at) : new Date();
          // Deadline: 2 órán belül kell jóváhagyni
          const deadlineDt = new Date(apDt.getTime() + 2 * 60 * 60 * 1000);
          
          // Parse client name from draft
          let clientName = 'Ismeretlen';
          let channel = '';
          try {
            const draft = JSON.parse(ap.ai_draft_response || '{}');
            clientName = draft.to_name || draft.sender_id || 'Ismeretlen';
            channel = draft.channel || ap.channel || '';
          } catch(e) {}

          // Resolve name from allClients if it's a raw ID
          const isRawId = (val) => val && /^\d{8,}$/.test(val);
          if (isRawId(clientName)) {
            const match = allClients.find(c => {
              let cd = c.custom_data;
              if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
              const mid = (cd?.messenger_id || cd?.messenger_psid || '').toString().trim();
              return mid && mid === clientName;
            });
            if (match) {
              let cd = match.custom_data;
              if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
              clientName = cd?.nev || cd?.name || cd?.['név'] || match.name || clientName;
            }
          }

          todos.push({
            id: 'approval-' + (ap.id || Math.random()),
            type: 'approval',
            desc: 'Válasz jóváhagyása szükséges' + (channel ? ` — ${channel}` : ''),
            sub: clientName !== 'Ismeretlen' ? clientName : '',
            client: clientName,
            clientId: ap.client_id || null,
            badge: 'jovahagyas',
            badgeLabel: 'Jóváhagyás',
            date: deadlineDt,
            completed: false,
            approvalId: ap.id,
            approvalData: ap  // Store full approval object for modal
          });
        });

        // c) Interakciós teendők (sessions with pending handover)
        const recentSessions = mySessions
          .filter(s => s.handover_reason && s.handover_reason.trim() !== '')
          .slice(0, 30);
        recentSessions.forEach(s => {
          const hr = (s.handover_reason || '').toLowerCase();
          const as = (s.approval_status || '').toLowerCase();
          let badge = 'egyeb', badgeLabel = 'Teendő';
          if (hr.includes('sürgős') || hr.includes('panasz')) { badge = 'surgos'; badgeLabel = 'Sürgős'; }
          else if (as === 'pending') return; // Skip: already handled as approval todo in section (b)
          else if (hr.includes('visszahív')) { badge = 'visszahivas'; badgeLabel = 'Visszahívás'; }
          else if (hr.includes('válasz')) { badge = 'valasz'; badgeLabel = 'Válasz'; }
          else if (hr.includes('intézked') || hr.includes('véglegesít')) { badge = 'intezked'; badgeLabel = 'Intézkedés'; }
          if (as === 'approved' || as === 'rejected') return; // skip closed ones

          const sDt = s.started_at ? new Date(s.started_at) : new Date();
          // Smart deadline: based on urgency, not the raw session start time
          let deadlineDt = new Date(sDt);
          if (badge === 'surgos') {
            // Sürgős: azonnal, tehát a session start idő (már lejárt = piros)
            deadlineDt = new Date(sDt);
          } else if (badge === 'jovahagyas') {
            // Jóváhagyás: max 2 órán belül válaszolni kell
            deadlineDt = new Date(sDt.getTime() + 2 * 60 * 60 * 1000);
          } else if (badge === 'visszahivas' || badge === 'valasz') {
            // Visszahívás/Válasz: 4 órán belül
            deadlineDt = new Date(sDt.getTime() + 4 * 60 * 60 * 1000);
          } else {
            // Egyéb: 24 órán belül
            deadlineDt = new Date(sDt.getTime() + 24 * 60 * 60 * 1000);
          }
          const clientName = (() => {
            const sid = s.session_id || '';
            const participant = s.participant || s.client_name || '';
            const isRawId = (val) => val && /^\d{8,}$/.test(val);
            if (s.client_id) {
              const c = allClients.find(cl => cl.id == s.client_id);
              if (c) {
                let cd = c.custom_data;
                if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
                const n = cd?.nev || cd?.name || cd?.['név'] || c.name;
                if (n && n !== 'Névtelen' && n !== '-' && !isRawId(n)) return n;
              }
            }
            let directId = null;
            if (sid.startsWith('messenger_')) directId = sid.substring(10).trim();
            else if (sid.startsWith('instagram_')) directId = sid.substring(10).trim();
            else if (sid.startsWith('whatsapp_')) directId = sid.substring(9).trim();
            if (directId) {
              const match = allClients.find(c => {
                let cd = c.custom_data;
                if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
                const mid = (cd?.messenger_id || cd?.messenger_psid || '').toString().trim();
                return mid && mid === directId;
              });
              if (match) {
                let cd = match.custom_data;
                if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
                const n = cd?.nev || cd?.name || cd?.['név'] || match.name;
                if (n && n !== 'Névtelen' && n !== '-' && !isRawId(n)) return n;
              }
            }
            if (participant && participant !== 'Ismeretlen' && !isRawId(participant)) return participant;
            if (sid.startsWith('email_')) return sid.substring(6);
            if (sid.startsWith('phone_')) return sid.substring(6);
            return participant || 'Ismeretlen';
          })();
          todos.push({
            id: 'session-' + (s.id || s.session_id || Math.random()),
            type: 'interaction',
            desc: s.handover_reason || 'Interakciós teendő',
            sub: s.channel || '',
            client: clientName,
            clientId: s.client_id || null,
            badge: badge,
            badgeLabel: badgeLabel,
            date: deadlineDt,
            completed: false
          });
        });

        // Restore completed state from localStorage (daily key)
        const todayKey = 'completedTodos_' + new Date().toISOString().slice(0, 10);
        let completedIds = [];
        try { completedIds = JSON.parse(localStorage.getItem(todayKey) || '[]'); } catch(e) {}
        todos.forEach(t => {
          if (completedIds.includes(String(t.id))) t.completed = true;
        });

        // Sort: not completed first, then by date desc
        todos.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return b.date - a.date;
        });
        window._memberTodos = todos;
        renderMemberTodos();


      } catch(e) {
        console.error('Member analytics error', e);
      }
    }

    function renderMemberTodos() {
      const todos = window._memberTodos || [];
      const filter = document.getElementById('todo-filter')?.value || 'all';
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000);

      // Calculate summary counts (always from ALL todos, not filtered)
      const todayCount = todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd).length;
      const overdueCount = todos.filter(t => !t.completed && t.date < todayStart).length;
      const completedCount = todos.filter(t => t.completed).length;
      const allCount = todos.filter(t => !t.completed).length;

      // Update summary cards
      const cardToday = document.getElementById('todo-card-today');
      if (cardToday) cardToday.textContent = todayCount;
      const cardOverdue = document.getElementById('todo-card-overdue');
      if (cardOverdue) cardOverdue.textContent = overdueCount;
      const cardCompleted = document.getElementById('todo-card-completed');
      if (cardCompleted) cardCompleted.textContent = completedCount;
      const cardAll = document.getElementById('todo-card-all');
      if (cardAll) cardAll.textContent = allCount;

      let filtered = todos;
      if (filter === 'today') {
        filtered = todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd);
      } else if (filter === 'overdue') {
        filtered = todos.filter(t => t.date < todayStart && !t.completed);
      } else if (filter === 'upcoming') {
        filtered = todos.filter(t => t.date >= todayEnd && !t.completed);
      } else if (filter === 'completed') {
        filtered = todos.filter(t => t.completed);
      }

      const countBadge = document.getElementById('todo-count-badge');
      const notCompletedCount = todos.filter(t => !t.completed).length;
      if (countBadge) countBadge.textContent = notCompletedCount;

      const tbody = document.getElementById('member-todo-tbody');
      if (!tbody) return;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="todo-empty">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          ${filter === 'all' ? 'Nincs teendő — szuper!' : 'Nincs ilyen teendő.'}
        </td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((t, i) => {
        // Deadline formatting
        const d = t.date;
        let deadlineText = '', deadlineClass = 'future';
        const diffMs = d - now;
        const diffDays = Math.floor(diffMs / 86400000);
        if (d < todayStart && !t.completed) {
          const daysAgo = Math.abs(diffDays);
          deadlineText = daysAgo === 0 ? 'Ma' : `${daysAgo} napja lejárt`;
          deadlineClass = 'overdue';
        } else if (d >= todayStart && d < todayEnd) {
          deadlineText = 'Ma, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
          deadlineClass = 'today';
        } else if (diffDays === 1) {
          deadlineText = 'Holnap, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
          deadlineClass = 'future';
        } else {
          deadlineText = d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
          if (d.getHours() > 0 || d.getMinutes() > 0) {
            deadlineText += ' ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
          }
        }

        const completedClass = t.completed ? ' completed' : '';
        const checked = t.completed ? ' checked' : '';
        const clientNameEsc = esc(t.client).replace(/'/g, "\\'");
        const clientBtn = t.client ? `<button class="todo-client-btn" onclick="event.stopPropagation(); showPage('clients'); openClientDetails({id: ${t.clientId || 'null'}, name: '${clientNameEsc}'})" title="${esc(t.client)}">${esc(t.client)}</button>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>';
        const typeIcon = t.type === 'calendar' ? '📅' : t.type === 'approval' ? '✉️' : '💬';

        // Approval rows open the approval modal on click
        const rowClick = t.type === 'approval' ? `onclick="openTodoApproval(${i})" style="cursor:pointer;"` : '';

        return `<tr class="todo-row${completedClass}" data-todo-idx="${i}" ${rowClick}>
          <td style="text-align:center;" onclick="event.stopPropagation()">
            <input type="checkbox" class="todo-checkbox"${checked} onchange="toggleTodoCompleted('${t.id}', '${t.type}', this.checked, ${i})" />
          </td>
          <td>
            <div class="todo-desc" title="${esc(t.desc)}">${typeIcon} ${esc(t.desc)}</div>
            ${t.sub ? `<div class="todo-desc-sub">${esc(t.sub)}</div>` : ''}
          </td>
          <td><span class="todo-badge ${t.badge}">${t.badgeLabel}</span></td>
          <td>${clientBtn}</td>
          <td><span class="todo-deadline ${deadlineClass}">${deadlineText}</span></td>
        </tr>`;
      }).join('');
    }

    // Open approval modal from todo row click
    function openTodoApproval(idx) {
      const todos = window._memberTodos || [];
      const t = todos[idx];
      if (!t || !t.approvalData) return;
      // Use the existing openApprovalModal which is designed for the Jóváhagyások page
      // We ensure the approval tab context is 'pending' so buttons show
      window.currentApprovalTab = 'pending';
      openApprovalModal(t.approvalData);
    }

    async function toggleTodoCompleted(todoId, todoType, completed, idx) {
      // Update UI immediately
      const row = document.querySelector(`tr[data-todo-idx="${idx}"]`);
      if (row) {
        if (completed) row.classList.add('completed');
        else row.classList.remove('completed');
      }

      // Update global data
      if (window._memberTodos && window._memberTodos[idx]) {
        window._memberTodos[idx].completed = completed;
      }

      // Persist completed state to localStorage (daily key — clears next day)
      const todayKey = 'completedTodos_' + new Date().toISOString().slice(0, 10);
      let completedIds = [];
      try { completedIds = JSON.parse(localStorage.getItem(todayKey) || '[]'); } catch(e) {}
      const todoIdStr = String(todoId);
      if (completed && !completedIds.includes(todoIdStr)) {
        completedIds.push(todoIdStr);
      } else if (!completed) {
        completedIds = completedIds.filter(id => id !== todoIdStr);
      }
      localStorage.setItem(todayKey, JSON.stringify(completedIds));
      // Clean up old daily keys
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('completedTodos_') && k !== todayKey) localStorage.removeItem(k);
        }
      } catch(e) {}

      // Update count badge
      const countBadge = document.getElementById('todo-count-badge');
      if (countBadge) {
        const notCompleted = (window._memberTodos || []).filter(t => !t.completed).length;
        countBadge.textContent = notCompleted;
      }

      // Refresh summary cards
      renderMemberTodos();

      // Persist to DB for calendar events
      if (todoType === 'calendar' && !String(todoId).startsWith('session-')) {
        try {
          await authFetch(`/admin/api/calendar/${todoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed })
          });
        } catch(e) {
          console.error('Todo toggle error:', e);
        }
      }
    }

    async function loadStats() {
      // Member: show personalized analytics instead
      if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
        loadMemberAnalytics();
        return;
      }
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const clinic = document.getElementById('filter-telephely') ? document.getElementById('filter-telephely').value : 'mind';
      const kpiGrid = document.getElementById('kpi-grid-figma');
      kpiGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div></div>`;

      // Betöltjük az AI insightokat is párhuzamosan
      loadInsights();

      try {
        const res = await authFetch(`/admin/api/stats?period=${period}&channel=${channel}&clinic_id=${clinic}`);
        const data = await res.json();
        _analyticsData = data;
        renderStats(data);
        loadFunnelStats();
        loadAlerts();
        loadOutboundStats();
      } catch (e) {
        kpiGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ef4444;padding:30px;">Hiba az adatok betöltésekor.</div>';
      }
    }

    async function loadAlerts() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const clinic = document.getElementById('filter-telephely') ? document.getElementById('filter-telephely').value : 'mind';
      try {
        const res = await authFetch(`/admin/api/analytics/alerts?period=${period}&channel=${channel}&clinic_id=${clinic}`);
        const data = await res.json();
        document.getElementById('alert-urgent').textContent = data.urgent_count || 0;
        document.getElementById('alert-complaint').textContent = data.complaint_count || 0;
        document.getElementById('alert-callback').textContent = data.callback_count || 0;
        document.getElementById('alert-recurring').textContent = data.recurring_count || 0;
        document.getElementById('alert-stuck').textContent = data.stuck_count || 0;
      } catch (e) {
        console.error("Alerts fetch error", e);
      }
    }

    async function loadFunnelStats() {
      const container = document.getElementById('funnel-container');
      if (!container) return;
      
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const clinic = document.getElementById('filter-telephely') ? document.getElementById('filter-telephely').value : 'mind';
      try {
        const res = await authFetch(`/admin/api/analytics/funnel?period=${period}&channel=${channel}&clinic_id=${clinic}`);
        const data = await res.json();
        
        const total = data.osszes_relevans || 0;
        const valaszolt = data.valaszolt_ugyek || 0;
        const ajanlat = data.ajanlatig_jutott || 0;
        const foglalt = data.idopont_lett || 0;

        const p1 = total > 0 ? 100 : 0;
        const p2 = total > 0 ? Math.round((valaszolt / total) * 100) : 0;
        const p3 = valaszolt > 0 ? Math.round((ajanlat / valaszolt) * 100) : 0;
        const p4 = ajanlat > 0 ? Math.round((foglalt / ajanlat) * 100) : 0;
        
        const w1 = 100;
        const w2 = total > 0 ? Math.round((valaszolt / total) * 100) : 10;
        const w3 = total > 0 ? Math.round((ajanlat / total) * 100) : 10;
        const w4 = total > 0 ? Math.round((foglalt / total) * 100) : 10;

        container.innerHTML = `
          <div class="funnel-step" style="width:${Math.max(w1, 10)}%;">
            <div class="funnel-step-label">Összes releváns megkeresés</div>
            <div><span class="funnel-step-val">${total}</span><span class="funnel-step-pct">(${p1}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p2}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w2, 10)}%;">
            <div class="funnel-step-label">Válaszolt ügyek</div>
            <div><span class="funnel-step-val">${valaszolt}</span><span class="funnel-step-pct">(${p2}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p3}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w3, 10)}%;">
            <div class="funnel-step-label">Foglalási ajánlatig jutott</div>
            <div><span class="funnel-step-val">${ajanlat}</span><span class="funnel-step-pct">(${p3}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p4}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w4, 10)}%;">
            <div class="funnel-step-label">Időpont lett belőle</div>
            <div><span class="funnel-step-val">${foglalt}</span><span class="funnel-step-pct">(${p4}%)</span></div>
          </div>
        `;
      } catch (e) {
        container.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Hiba a tölcsér betöltésekor</div>';
      }
    }

    async function loadOutboundStats() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const clinic = document.getElementById('filter-telephely') ? document.getElementById('filter-telephely').value : 'mind';
      try {
        const res = await authFetch(`/admin/api/analytics/outbound/summary?period=${period}&channel=${channel}&clinic_id=${clinic}&_t=${Date.now()}`);
        const data = await res.json();
        
        const total = data.total_outbound || 0;
        const reached = data.reached_count || 0;
        const negotiating = data.negotiating_count || 0;
        const booked = data.booked_count || 0;
        
        document.getElementById('outbound-total').textContent = total;
        document.getElementById('outbound-reached').textContent = (data.reached_rate || 0) + '%';
        document.getElementById('outbound-booked').textContent = booked;
        
        const rateEl = document.getElementById('outbound-booked-rate');
        rateEl.innerHTML = `<span>${data.booked_rate || 0}% konverziós arány</span>`;
        if (data.booked_rate > 0) {
            rateEl.classList.add('kpi-trend-up');
        } else {
            rateEl.classList.remove('kpi-trend-up');
        }
        
        document.getElementById('outbound-open').textContent = data.open_followup || 0;
        
        // Render Green Funnel
        const funnelContainer = document.getElementById('outbound-funnel-container');
        
        const p1 = total > 0 ? Math.round((reached / total) * 100) : 0;
        const p2 = reached > 0 ? Math.round((negotiating / reached) * 100) : 0;
        const p3 = negotiating > 0 ? Math.round((booked / negotiating) * 100) : 0;
        
        const w1 = total > 0 ? Math.round((reached / total) * 100) : 10;
        const w2 = total > 0 ? Math.round((negotiating / total) * 100) : 10;
        const w3 = total > 0 ? Math.round((booked / total) * 100) : 10;
        
        if (data && data.activities) {
            renderOutgoingChart(data.activities);
        } else {
            renderOutgoingChart(null);
        }

        if (funnelContainer) {
            if (total === 0) {
              funnelContainer.innerHTML = `
                <div class="green-funnel-step" style="width:100%;">
                  <div class="green-funnel-label">Kimenő kommunikáció indítva</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(100%)</span></div>
                </div>
                <div class="funnel-conv">▼ 72% konverzió</div>
                <div class="green-funnel-step" style="width:72%;">
                  <div class="green-funnel-label">Páciens elérve / Reagált</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
                <div class="funnel-conv">▼ 60% konverzió</div>
                <div class="green-funnel-step" style="width:55%;">
                  <div class="green-funnel-label">Időpont egyeztetve</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
                <div class="funnel-conv">▼ 52% konverzió</div>
                <div class="green-funnel-step" style="width:40%;">
                  <div class="green-funnel-label">Foglalás létrejött</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
              `;
            } else {
              funnelContainer.innerHTML = `
                <div class="green-funnel-step" style="width:100%;">
                  <div class="green-funnel-label">Kimenő kommunikáció indítva</div>
                  <div><span class="green-funnel-val">${total}</span><span class="green-funnel-pct">(100%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p1}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w1, 10)}%;">
                  <div class="green-funnel-label">Páciens elérve / Reagált</div>
                  <div><span class="green-funnel-val">${reached}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((reached/total)*100) : 0}%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p2}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w2, 10)}%;">
                  <div class="green-funnel-label">Időpont egyeztetve</div>
                  <div><span class="green-funnel-val">${negotiating}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((negotiating/total)*100) : 0}%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p3}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w3, 10)}%;">
                  <div class="green-funnel-label">Foglalás létrejött</div>
                  <div><span class="green-funnel-val">${booked}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((booked/total)*100) : 0}%)</span></div>
                </div>
              `;
            }
        }
        
      } catch (e) {
        console.error("Outbound stats fetch error", e);
        const funnelContainer = document.getElementById('outbound-funnel-container');
        if (funnelContainer) funnelContainer.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Hiba a tölcsér betöltésekor</div>';
      }
    }

    async function loadInsights() {
      const container = document.getElementById('insights-container');
      try {
        const res = await authFetch('/admin/api/analytics/insights');
        const data = await res.json();
        if (data.status === 'success' && data.insights && data.insights.length > 0) {
          renderInsights(data.insights);
        } else {
          container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nincs elérhető javaslat.</div>';
        }
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">Hiba a betöltéskor.</div>';
      }
    }

    async function generateInsights() {
      const btn = document.getElementById('btn-refresh-insights');
      const icon = document.getElementById('insights-refresh-icon');
      const container = document.getElementById('insights-container');
      
      btn.disabled = true;
      icon.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;border-color:#e5e7eb;border-top-color:currentColor;display:inline-block;"></div>';
      container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div><div style="margin-top:10px; color:var(--text-muted); font-size:13px;">AI analízis folyamatban...</div></div>';
      
      try {
        const res = await authFetch('/admin/api/analytics/insights/generate', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success' && data.insights) {
          renderInsights(data.insights);
        }
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">Hiba a generáláskor.</div>';
      } finally {
        btn.disabled = false;
        icon.innerHTML = '🔄';
      }
    }

    function renderInsights(insights) {
      const container = document.getElementById('insights-container');
      container.innerHTML = insights.map(text => `
        <div class="suggestion-card">
          <span class="suggestion-icon">💡</span>
          <span class="suggestion-text">${esc(text)}</span>
        </div>
      `).join('');
    }

    function renderStats(data) {
      const kpiGrid = document.getElementById('kpi-grid-figma');
      const period = document.getElementById('stats-days').value;
      const prefix = { week: 'Heti', month: 'Havi', year: 'Évi' }[period] || '';
      const prevLabel = { week: 'előző héthez', month: 'előző hónaphoz', year: 'előző évhez' }[period] || '';
      const prev = data.previous_period || {};

      function trendClass(cur, pre) {
        if (pre == null || pre === 0) return 'kpi-trend-neutral';
        return cur >= pre ? 'kpi-trend-up' : 'kpi-trend-down';
      }
      function trendArrow(cur, pre) {
        if (pre == null || pre === 0) return '';
        const diff = cur - pre;
        const pct = Math.round(Math.abs(diff / pre) * 100);
        const sign = diff >= 0 ? '+' : '−';
        const arrow = diff >= 0 ? '▲' : '▼';
        return `${arrow} ${sign}${pct}%`;
      }

      const cards = [
        { icon: '', label: 'Összes megkeresés', value: data.total_interactions ?? 0, sub: 'interakció', prev: prev.total_interactions, page: 'interactions' },
        { icon: '', label: 'Foglalási arány', value: data.total_bookings ?? 0, sub: 'foglalás', prev: prev.total_bookings, page: 'calendar' },
        { icon: '️', label: 'Átadási arány', value: data.total_sessions ?? 0, sub: 'élő átadás', prev: prev.total_sessions, page: 'sessions' },
        { icon: '', label: 'Avg. session (mp)', value: data.avg_session_duration ?? 0, sub: 'mp', prev: prev.avg_session_duration, page: 'sessions' },
        { icon: '', label: 'Kimenő kommunikációk', value: data.total_emails ?? 0, sub: 'email küldve', prev: prev.total_emails, page: 'emails' },
        { icon: '', label: 'Nyílt feladatok', value: data.open_tasks ?? 0, sub: 'követést igényel', prev: null, page: 'sessions' },
      ];

      kpiGrid.innerHTML = cards.map(c => `
    <button class="kpi-card-figma" onclick="showPage('${c.page}')">
      <div class="kpi-card-icon">${c.icon}</div>
      <div class="kpi-card-label">${c.label}</div>
      <div class="kpi-card-value">${c.value}</div>
      <div class="kpi-card-subtitle">${c.sub}</div>
      <div class="kpi-card-trend ${trendClass(c.value, c.prev)}">
        <span>${trendArrow(c.value, c.prev)}</span>
        <span class="kpi-trend-desc">${prevLabel ? prevLabel + ' képest' : ''}</span>
      </div>
    </button>
  `).join('');

      // Fill top topics from interaction types
      const types = data.interactions_by_topic || [];
      const typesTotal = types.reduce((a, t) => a + (t.count || 0), 0);
      const topicsEl = document.getElementById('top-topics-list');
      if (topicsEl) {
        if (types.length === 0) {
          topicsEl.innerHTML = '<div style="color:#6b7280;font-size:13px;text-align:center;padding:20px;">Nincs adat</div>';
        } else {
          topicsEl.innerHTML = types.slice(0, 5).map((t, i) => {
            const pct = typesTotal > 0 ? Math.round((t.count / typesTotal) * 100) : 0;
            return `
          <div class="topic-row">
            <div class="topic-row-header">
              <div style="display:flex;align-items:center;">
                <div class="topic-rank-badge">${i + 1}</div>
                <span class="topic-name">${t.topic || 'Ismeretlen'}</span>
              </div>
              <span class="topic-value">${t.count}<span class="topic-pct">(${pct}%)</span></span>
            </div>
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct * 3}%;"></div></div>
          </div>`;
          }).join('');
        }
      }

      // Interactions over time chart
      const dowData = data.interactions_by_dow || {total: [0,0,0,0,0,0,0], channels: {}};
      const hourData = data.interactions_by_hour || {total: Array(24).fill(0), channels: {}};
      
      const ctx1 = document.getElementById('sessions-chart');
      if (!ctx1) return;
      if (sessionsChart) { sessionsChart.destroy(); sessionsChart = null; }

      const typeColorMap = {
        'E-Mail': '#1ceee0',
        'Telefon': '#3b82f6',
        'Whatsapp': '#22c55e',
        'Messenger': '#8b5cf6'
      };

      let currentView = window._chartCurrentView || 'napi';
      const breakdownCheckbox = document.getElementById('chk-channel-breakdown');
      const btnNapi = document.getElementById('btn-chart-napi');
      const btnOras = document.getElementById('btn-chart-oras');
      
      if (window._chartIsBreakdown && breakdownCheckbox) {
          breakdownCheckbox.checked = true;
      }

      window._updateChartThemes = function() {
        if (!sessionsChart) return;
        const isDark = document.body.classList.contains('dark');
        const gridColor = isDark ? '#1a3548' : '#f1f5f9';
        const gridDash = isDark ? [] : [5, 5];
        sessionsChart.options.scales.x.grid.color = gridColor;
        sessionsChart.options.scales.y.grid.color = gridColor;
        sessionsChart.options.scales.x.grid.borderDash = gridDash;
        sessionsChart.options.scales.y.grid.borderDash = gridDash;
        sessionsChart.update();
      };

      function updateInteractionsChart() {
        const isDark = document.body.classList.contains('dark');
        const gridColor = isDark ? '#1a3548' : '#f1f5f9';
        const gridDash = isDark ? [] : [5, 5];
        
        const isBreakdown = breakdownCheckbox ? breakdownCheckbox.checked : false;
        if (breakdownCheckbox) window._chartIsBreakdown = isBreakdown;
        
        const targetData = currentView === 'napi' ? dowData : hourData;
        const labels = currentView === 'napi' 
            ? ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
            : Array.from({length: 24}, (_, i) => `${i}:00`);

        let datasets = [];

        if (isBreakdown) {
          for (const [channel, counts] of Object.entries(targetData.channels)) {
             datasets.push({
               label: channel,
               data: counts,
               borderColor: typeColorMap[channel] || '#f59e0b',
               backgroundColor: 'transparent',
               borderWidth: 2,
               tension: 0.4,
               pointRadius: 3,
               pointBackgroundColor: typeColorMap[channel] || '#f59e0b'
             });
          }
        } else {
          datasets.push({
            label: 'Összes megkeresés',
            data: targetData.total,
            borderColor: '#1ceee0',
            backgroundColor: 'rgba(28,238,224,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#1ceee0',
          });
        }

        let maxVal = 5;
        datasets.forEach(ds => {
            const maxData = Math.max(...ds.data);
            if (maxData > maxVal) maxVal = maxData;
        });
        const yMax = Math.ceil(maxVal * 1.25);
        const yStep = Math.max(1, Math.ceil(yMax / 6));

        if (sessionsChart) {
           sessionsChart.data.labels = labels;
           sessionsChart.data.datasets = datasets;
           sessionsChart.options.scales.y.max = yMax;
           sessionsChart.options.scales.y.ticks.stepSize = yStep;
           sessionsChart.options.scales.x.grid.color = gridColor;
           sessionsChart.options.scales.y.grid.color = gridColor;
           sessionsChart.options.scales.x.grid.borderDash = gridDash;
           sessionsChart.options.scales.y.grid.borderDash = gridDash;
           sessionsChart.update();
        } else {
           sessionsChart = new Chart(ctx1, {
             type: 'line',
             data: { labels, datasets },
             options: {
               responsive: true,
               maintainAspectRatio: false,
               plugins: {
                 legend: { 
                   display: true, 
                   position: 'bottom',
                   labels: { color: '#6b8b99', usePointStyle: true, boxWidth: 8, font: { size: 11 } }
                 }
               },
               scales: {
                 x: { 
                   ticks: { color: '#6b8b99', font: { size: 11 } }, 
                   grid: { color: gridColor, borderDash: gridDash },
                   border: { display: false }
                 },
                 y: {
                   min: 0,
                   max: yMax,
                   ticks: { color: '#6b8b99', font: { size: 11 }, stepSize: yStep },
                   grid: { color: gridColor, borderDash: gridDash },
                   border: { display: false }
                 }
               }
             }
           });
        }
      }

      updateInteractionsChart();

      if (btnNapi && btnOras) {
          const newBtnNapi = btnNapi.cloneNode(true);
          const newBtnOras = btnOras.cloneNode(true);
          btnNapi.parentNode.replaceChild(newBtnNapi, btnNapi);
          btnOras.parentNode.replaceChild(newBtnOras, btnOras);
          
          if (currentView === 'napi') {
             newBtnNapi.style.background = 'var(--primary)'; newBtnNapi.style.color = '#0a192f'; newBtnNapi.style.fontWeight = '600';
             newBtnOras.style.background = 'transparent'; newBtnOras.style.color = '#6b8b99'; newBtnOras.style.fontWeight = 'normal';
          } else {
             newBtnOras.style.background = 'var(--primary)'; newBtnOras.style.color = '#0a192f'; newBtnOras.style.fontWeight = '600';
             newBtnNapi.style.background = 'transparent'; newBtnNapi.style.color = '#6b8b99'; newBtnNapi.style.fontWeight = 'normal';
          }

          newBtnNapi.addEventListener('click', () => {
             window._chartCurrentView = 'napi'; currentView = 'napi';
             newBtnNapi.style.background = 'var(--primary)'; newBtnNapi.style.color = '#0a192f'; newBtnNapi.style.fontWeight = '600';
             newBtnOras.style.background = 'transparent'; newBtnOras.style.color = '#6b8b99'; newBtnOras.style.fontWeight = 'normal';
             updateInteractionsChart();
          });
          newBtnOras.addEventListener('click', () => {
             window._chartCurrentView = 'oras'; currentView = 'oras';
             newBtnOras.style.background = 'var(--primary)'; newBtnOras.style.color = '#0a192f'; newBtnOras.style.fontWeight = '600';
             newBtnNapi.style.background = 'transparent'; newBtnNapi.style.color = '#6b8b99'; newBtnNapi.style.fontWeight = 'normal';
             updateInteractionsChart();
          });
      }

      if (breakdownCheckbox) {
          const newCb = breakdownCheckbox.cloneNode(true);
          breakdownCheckbox.parentNode.replaceChild(newCb, breakdownCheckbox);
          newCb.addEventListener('change', () => updateInteractionsChart());
      }

      // Types donut chart
      const chartTypes = data.interactions_by_type || [];
      const ctx2 = document.getElementById('types-chart');
      const legendContainer = document.getElementById('types-chart-legend');
      if (!ctx2) return;
      if (typesChart) { typesChart.destroy(); typesChart = null; }
      
      const typeColors = ['#3b82f6', '#1ceee0', '#22c55e', '#8b5cf6', '#f59e0b', '#f97316'];
      
      typesChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: chartTypes.map(t => t.type),
          datasets: [{
            data: chartTypes.map(t => t.count),
            backgroundColor: typeColors.slice(0, chartTypes.length),
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { display: false }
          }
        }
      });

      if (legendContainer) {
        legendContainer.innerHTML = chartTypes.map((t, i) => `
          <div style="display:flex; flex-direction:column; align-items:flex-start;">
            <div style="display:flex; align-items:center; margin-bottom:4px;">
              <div style="width:8px;height:8px;border-radius:50%;background-color:${typeColors[i % typeColors.length]};margin-right:8px;"></div>
              <span style="font-size:12px;color:#6b8b99;">${t.type === 'Whatsapp' ? 'WhatsApp' : t.type}</span>
            </div>
            <div style="font-size:16px;font-weight:600;color:var(--text);padding-left:16px;">${t.count}</div>
          </div>
        `).join('');
      }

      // Handoff placeholder chart
      // Handoff chart is now dynamic, called inside loadStats
      if (data && data.handovers) {
          renderHandoffChart(data.handovers);
      } else {
          renderHandoffChart([]);
      }

      // Outgoing activity placeholder chart
      if (data && data.activities) {
          renderOutgoingChart(data.activities);
      } else {
          renderOutgoingChart(null);
      }

      setTimeout(() => {
        if (sessionsChart) sessionsChart.resize();
        if (typesChart) typesChart.resize();
      }, 50);
    }

    function renderHandoffChart(handovers = []) {
      const ctx = document.getElementById('handoff-chart');
      if (!ctx) return;
      if (handoffChart) { handoffChart.destroy(); handoffChart = null; }
      
      let labels = [];
      let values = [];
      
      if (handovers.length > 0) {
          labels = handovers.map(h => h.reason);
          values = handovers.map(h => h.count);
      } else {
          labels = ['Összetett kérdés', 'Sürgős / triázs', 'Hiányzó info', 'Foglalási kivétel', 'Emberi döntés'];
          values = [0, 0, 0, 0, 0];
      }
      
      handoffChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Átadások', data: values, backgroundColor: '#ef4444', borderRadius: 6 }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } },
            y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } }
          }
        }
      });
    }

    function renderOutgoingChart(activities = null) {
      const ctx = document.getElementById('outgoing-activity-chart');
      if (!ctx) return;
      if (outgoingChart) { outgoingChart.destroy(); outgoingChart = null; }
      
      const labels = ['Visszahívás', 'Emlékeztető', 'Utánkövetés', 'Kampány', 'Kontroll', 'Passzív'];
      let dataVals = [0, 0, 0, 0, 0, 0];
      if (activities) {
          dataVals = [
              activities['Visszahívás'] || 0,
              activities['Emlékeztető'] || 0,
              activities['Utánkövetés'] || 0,
              activities['Kampány'] || 0,
              activities['Kontroll'] || 0,
              activities['Passzív'] || 0
          ];
      }
      
      outgoingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Aktivitás', data: dataVals, backgroundColor: '#1ceee0', borderRadius: 6 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } }
          }
        }
      });
    }
