    // ── CALENDAR ──────────────────────────────────────────────────────────────────
    let fcInstance = null;
    let currentCalendarView = 'grid';

    function switchCalendarView(view) {
      currentCalendarView = view;
      const listBtn = document.getElementById('cal-view-list-btn');
      const gridBtn = document.getElementById('cal-view-grid-btn');
      const listCont = document.getElementById('calendar-list-view');
      const gridCont = document.getElementById('calendar-grid-view');

      if (view === 'list') {
        listBtn.style.background = 'rgba(28,238,224,0.12)';
        listBtn.style.color = 'var(--accent, #1ceee0)';
        gridBtn.style.background = 'transparent';
        gridBtn.style.color = 'var(--text-muted)';
        listCont.style.display = 'block';
        gridCont.style.display = 'none';
      } else {
        gridBtn.style.background = 'rgba(28,238,224,0.12)';
        gridBtn.style.color = 'var(--accent, #1ceee0)';
        listBtn.style.background = 'transparent';
        listBtn.style.color = 'var(--text-muted)';
        listCont.style.display = 'none';
        gridCont.style.display = 'block';
        if (fcInstance) {
          setTimeout(() => fcInstance.render(), 10);
        }
      }
    }

    // ── Manual Event Creation ──────────────────────────────────────────────────
    function openNewEventModal() {
      document.getElementById('event-attendee').value = '';
      document.getElementById('event-email').value = '';
      document.getElementById('event-phone').value = '';
      document.getElementById('event-title').value = '';
      document.getElementById('event-duration').value = '30';
      document.getElementById('event-time').value = '09:00';
      // Default date = today
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('event-date').value = today;
      document.getElementById('new-event-modal').style.display = 'flex';
    }
    function closeNewEventModal() {
      document.getElementById('new-event-modal').style.display = 'none';
    }
    async function submitNewEvent() {
      const attendee = document.getElementById('event-attendee').value.trim();
      const email = document.getElementById('event-email').value.trim();
      const phone = document.getElementById('event-phone').value.trim();
      const title = document.getElementById('event-title').value.trim();
      const date = document.getElementById('event-date').value;
      const time = document.getElementById('event-time').value;
      const duration = parseInt(document.getElementById('event-duration').value) || 30;

      if (!attendee || !title || !date || !time) {
        alert('Ügyfél neve, esemény címe, dátum és időpont kötelező!');
        return;
      }

      const start_dt = `${date}T${time}:00`;
      
      try {
        const res = await authFetch('/admin/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, attendee, attendee_email: email, attendee_phone: phone, start_dt, duration_minutes: duration })
        });
        const d = await res.json();
        if (!res.ok) { alert(d.detail || 'Hiba'); return; }
        closeNewEventModal();
        // Reset assigned clients cache so new client shows up
        _myAssignedClientNames = null;
        _myAssignedClientEmails = null;
        loadCalendar();
        loadClientsTable();
        // Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--bg2);color:var(--text);padding:14px 20px;border-radius:10px;border:1px solid var(--accent);box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;font-size:13px;font-weight:600;animation:fadeIn 0.3s;';
        toast.innerHTML = '<span style="color:var(--accent);">✓</span> Időpont sikeresen létrehozva!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } catch(e) {
        alert('Hiba az időpont létrehozásakor');
      }
    }


    // ── Calendar client scope ──
    let calendarClientScope = 'own'; // 'own' or 'all'
    
    function setCalendarScope(scope) {
      calendarClientScope = scope;
      const ownBtn = document.getElementById('cal-scope-own');
      const allBtn = document.getElementById('cal-scope-all');
      if (scope === 'own') {
        ownBtn.style.background = 'var(--accent)';
        ownBtn.style.color = '#082432';
        ownBtn.style.fontWeight = '700';
        allBtn.style.background = 'transparent';
        allBtn.style.color = 'var(--text-muted)';
        allBtn.style.fontWeight = '600';
      } else {
        allBtn.style.background = 'var(--accent)';
        allBtn.style.color = '#082432';
        allBtn.style.fontWeight = '700';
        ownBtn.style.background = 'transparent';
        ownBtn.style.color = 'var(--text-muted)';
        ownBtn.style.fontWeight = '600';
      }
      loadCalendar();
    }

    async function loadCalendar() {
      const tbody = document.getElementById('calendar-body');
      if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="spinner"></div></td></tr>';
      // Load assigned clients for member filtering
      await loadMyAssignedClients();
      
      // Hide "Összes" tab for non-admin users
      const scopeTabs = document.getElementById('cal-scope-tabs');
      const allTab = document.getElementById('cal-scope-all');
      if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
        if (allTab) allTab.style.display = 'none';
        calendarClientScope = 'own'; // force own
      } else {
        if (allTab) allTab.style.display = '';
      }

      try {
        const res = await authFetch('/admin/api/calendar');
        const data = await res.json();
        let allEvents = data.events || [];
        
        // Count for tabs
        const ownEvents = allEvents.filter(ev => isCalendarEventAssignedToMe(ev));
        const ownBtn = document.getElementById('cal-scope-own');
        const allBtn = document.getElementById('cal-scope-all');
        const personIcon = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15" height="15" style="flex-shrink:0;min-width:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
        const buildingIcon = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="15" height="15" style="flex-shrink:0;min-width:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>';
        if (ownBtn) ownBtn.innerHTML = personIcon + '<span style="margin-left:4px;">Saját ügyfeleim (' + ownEvents.length + ')</span>';
        if (allBtn) allBtn.innerHTML = buildingIcon + '<span style="margin-left:4px;">Összes ügyfél (' + allEvents.length + ')</span>';
        
        // Apply scope filter
        let events;
        if ((currentUserRole !== 'admin' && currentUserRole !== 'manager') || calendarClientScope === 'own') {
          events = ownEvents;
        } else {
          events = allEvents;
        }

        // --- Render List View ---
        if (!events.length) {
          if (tbody) tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">Nincs naptári esemény</div></div></td></tr>`;
        } else {
          if (tbody) {
            tbody.innerHTML = events.map(ev => {
              const evDate = new Date(ev.start_dt);
              const isPast = evDate < new Date();
              const pastStyle = isPast ? 'opacity:0.7;' : '';
              return `
          <tr style="${pastStyle}">
            <td><div class="td-time">${fmtDt(ev.start_dt)}</div></td>
            <td style="font-weight:500">${esc(ev.title)}</td>
            <td>${esc(ev.attendee || '—')}</td>
            <td><span class="badge badge-teal">${ev.duration_minutes} perc</span></td>
            <td class="td-summary">${esc(ev.attendee_email || '—')}</td>
            <td style="text-align:center;">
              ${isPast ? `<button onclick="markNoShow(${ev.id}, '${esc(ev.attendee_email || '').replace(/'/g, "\\\\'")}', '${esc(ev.attendee || '').replace(/'/g, "\\\\'")}')" style="background:rgba(245,127,23,0.1);color:#f57f17;border:1px solid rgba(245,127,23,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;" title="No-show címke hozzáadása">⚠ Nem jelent meg</button>` : '<span style="color:#22c55e;font-size:11px;font-weight:600;">Várakozik</span>'}
            </td>
          </tr>
        `; }).join('');
          }
        }

        // --- Render Grid View (FullCalendar) ---
        const fcEl = document.getElementById('fullcalendar-el');
        if (fcEl) {
          if (!fcInstance) {
            fcInstance = new FullCalendar.Calendar(fcEl, {
              initialView: 'timeGridWeek',
              locale: 'hu',
              firstDay: 1,
              height: '100%',
              aspectRatio: 2.1,
              allDaySlot: false,
              nowIndicator: true,
              slotMinTime: '07:00:00',
              slotMaxTime: '20:00:00',
              slotDuration: '00:30:00',
              expandRows: true,
              eventClick: async function(info) {
                // Kézi dupla kattintás érzékelés, mert a FullCalendar elnyelheti a natív dblclick-et
                if (!info.el.dataset.clickCount) info.el.dataset.clickCount = 0;
                info.el.dataset.clickCount++;
                
                if (info.el.dataset.clickCount == 1) {
                  setTimeout(() => {
                    info.el.dataset.clickCount = 0;
                  }, 300);
                } else if (info.el.dataset.clickCount == 2) {
                  info.el.dataset.clickCount = 0;
                  
                  const ev = info.event;
                  const attendee_email = ev.extendedProps.attendee_email;
                  const attendee_name = ev.extendedProps.attendee;
                  if (!window.kanbanData || window.kanbanData.length === 0) {
                    await loadKanban();
                  }
                  if (window.kanbanData && window.kanbanData.length) {
                    let foundClient = null;
                    if (attendee_email) {
                      foundClient = window.kanbanData.find(c => {
                        if (!c.custom_data) return false;
                        let cd = {};
                        try { cd = typeof c.custom_data === 'string' ? JSON.parse(c.custom_data) : c.custom_data; } catch (e) { return false; }
                        return cd && (cd.email === attendee_email || c.email === attendee_email);
                      });
                    }
                    if (!foundClient && attendee_name) {
                      foundClient = window.kanbanData.find(c => {
                        if (c.name && c.name.toLowerCase() === attendee_name.toLowerCase()) return true;
                        if (c.custom_data) {
                          let cd = {};
                          try { cd = typeof c.custom_data === 'string' ? JSON.parse(c.custom_data) : c.custom_data; } catch(e) {}
                          let cn = cd.nev || cd.name || cd['név'] || cd['Név'] || '';
                          if (cn && cn.toLowerCase().trim() === attendee_name.toLowerCase().trim()) return true;
                        }
                        return false;
                      });
                    }
                    if (foundClient) {
                      showPage('interactions'); // Átváltunk a megfelelő oldalra!
                      openClientDetails(foundClient);
                    } else {
                      showToast('Nem található profil ehhez a foglaláshoz', 'error');
                    }
                  }
                }
              },
              headerToolbar: {
                left: 'prev,today,next',
                center: 'title',
                right: 'timeGridDay,timeGridWeek,dayGridMonth'
              },

              buttonText: {
                today: 'Ma',
                month: 'Hónap',
                week: 'Hét',
                day: 'Nap'
              },
              eventColor: 'var(--accent)',
              events: [],
              eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
              }
            });
            fcInstance.render();
          }

          fcInstance.removeAllEvents();
          events.forEach(ev => {
            let endDt = null;
            if (ev.duration_minutes) {
              endDt = new Date(new Date(ev.start_dt).getTime() + ev.duration_minutes * 60000).toISOString();
            }
            fcInstance.addEvent({
              title: ev.title + (ev.attendee ? ' - ' + ev.attendee : ''),
              start: ev.start_dt,
              end: endDt || undefined,
              attendee: ev.attendee,
              attendee_email: ev.attendee_email
            });
          });
          if (currentCalendarView === 'grid') {
            setTimeout(() => fcInstance.render(), 20);
          }
        }

      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }


    // ── EMAILS ────────────────────────────────────────────────────────────────────
    async function loadEmails() {
      const tbody = document.getElementById('emails-body');
      tbody.innerHTML = '<tr class="loading-row"><td colspan="4"><div class="spinner"></div></td></tr>';
      try {
        const res = await authFetch('/admin/api/emails');
        const data = await res.json();
        const emails = data.emails || [];
        if (!emails.length) {
          tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">️</div><div class="empty-state-text">Nincs elküldött email</div></div></td></tr>`;
          return;
        }
        tbody.innerHTML = emails.map(em => `
      <tr>
        <td class="td-time">${fmtDt(em.sent_at)}</td>
        <td>
          <div style="font-weight:500">${esc(em.to_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${esc(em.to_email)}</div>
        </td>
        <td class="td-summary">${esc(em.subject || '—')}</td>
        <td><span class="badge ${em.status === 'sent' ? 'badge-green' : em.status === 'sent (simulated)' ? 'badge-yellow' : 'badge-red'}">${em.status === 'sent' ? ' Elküldve' : em.status === 'sent (simulated)' ? ' Szimulált' : ' Hiba'}</span></td>
      </tr>
    `).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    // ── SESSIONS ──────────────────────────────────────────────────────────────────
    async function loadSessions() {
      const tbody = document.getElementById('sessions-body');
      tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="spinner"></div></td></tr>';
      try {
        const res = await authFetch('/admin/api/sessions');
        const data = await res.json();
        const sessions = data.sessions || [];
        if (!sessions.length) {
          tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">️</div><div class="empty-state-text">Nincs rögzített session</div></div></td></tr>`;
          return;
        }
        tbody.innerHTML = sessions.map(s => {
          const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : '—';
          const status = s.ended_at
            ? `<span class="badge badge-gray">Befejezett</span>`
            : `<span class="badge badge-green">Aktív</span>`;
          return `
        <tr>
          <td class="td-time">${fmtDt(s.started_at)}</td>
          <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${esc(s.session_id)}</td>
          <td>${esc(s.room_name || '—')}</td>
          <td>${dur}</td>
          <td>${status}</td>
        </tr>
      `;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────
    function fmtDt(iso) {
      if (!iso) return '—';
      try {
        // DB stores UTC without 'Z' suffix — append it so JS converts to local time
        const utcIso = iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z';
        const d = new Date(utcIso);
        return d.toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    }

    function esc(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
