    // ── KANBAN ──────────────────────────────────────────────────────────────────
    let draggedClientId = null;
    let currentKanbanColumns = [];
    let currentClientFields = [];

    async function initClientFields() {
      if (currentClientFields.length === 0) {
        try {
          const res = await authFetch('/admin/api/client_fields');
          const data = await res.json();
          currentClientFields = data.fields || [];
          currentClientFields.sort((a, b) => a.order_index - b.order_index);
        } catch (e) { console.error("Hiba mezők letöltésekor", e); }
      }
    }


    async function loadKanban() {
      const board = document.getElementById('kanban-board');
      if (!board) return;
      board.innerHTML = '<div style="text-align:center;width:100%;padding:40px;color:var(--text-muted);"><div class="spinner"></div></div>';

      try {
        const colRes = await authFetch('/admin/api/kanban_columns');
        const colData = await colRes.json();
        currentKanbanColumns = colData.columns || [];
        currentKanbanColumns.sort((a, b) => a.order_index - b.order_index);

        const clientRes = await authFetch('/admin/api/clients');
        const clientData = await clientRes.json();
        let clients = clientData.clients || [];
        // Member filter: only show assigned clients in kanban
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
          clients = clients.filter(c => isClientAssignedToMe(c));
        }
        window.kanbanData = clients;

        if (typeof globalClinics === 'undefined' || globalClinics.length === 0) {
           try {
             const clinRes = await authFetch('/admin/api/clinics');
             globalClinics = (await clinRes.json()) || [];
           } catch(e) {}
        }

        const counts = {};
        const clientsByStatus = {};
        currentKanbanColumns.forEach(col => {
          counts[col.id] = 0;
          clientsByStatus[col.id] = [];
        });

        clients.forEach(c => {
          const status = c.status || 'uj';
          if (!clientsByStatus[status]) { Object.assign(counts, { [status]: 0 }); clientsByStatus[status] = []; }
          clientsByStatus[status].push(c);
          counts[status]++;
        });

        board.innerHTML = currentKanbanColumns.map(col => `
      <div class="kanban-col" id="col-${col.id}" ondragover="kanbanDragOver(event)" ondragleave="kanbanDragLeave(event)" ondrop="kanbanDrop(event, '${col.id}')">
        <div class="kanban-col-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span id="col-name-label-${col.id}" style="cursor:pointer;" ondblclick="editKanbanColumn('${col.id}', '${esc(col.name)}')" title="Kattints duplán az átnevezéshez">${esc(col.name)}</span>
            <span class="kanban-col-count" id="count-${col.id}">${counts[col.id]}</span>
          </div>
          <div id="col-actions-${col.id}" class="kanban-admin-only" style="display:flex; gap:6px;">
            <button onclick="editKanbanColumn('${col.id}', '${esc(col.name)}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px;display:flex;align-items:center;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Átnevezés">
              <svg fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="13" style="vertical-align: middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button onclick="deleteKanbanColumn('${col.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;padding:2px;display:flex;align-items:center;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Törlés">
              <svg fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="13" style="vertical-align: middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>
        <div class="kanban-cards" id="cards-${col.id}"></div>
      </div>
    `).join('');

        await initClientFields();
        currentKanbanColumns.forEach(col => {
          const container = document.getElementById('cards-' + col.id);
          let colClients = clientsByStatus[col.id] || [];
          
          // Sürgős esetek rendezése legfelülre
          colClients.sort((a, b) => {
            const aData = a.custom_data ? JSON.parse(a.custom_data) : {};
            const bData = b.custom_data ? JSON.parse(b.custom_data) : {};
            const aSurgos = (aData.prioritas === 'Sürgős' || aData.priority === 'Sürgős' || aData.prioritas === 'Kiemelt');
            const bSurgos = (bData.prioritas === 'Sürgős' || bData.priority === 'Sürgős' || bData.prioritas === 'Kiemelt');
            if (aSurgos && !bSurgos) return -1;
            if (!aSurgos && bSurgos) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
          });
          
          colClients.forEach(c => {
            const div = document.createElement('div');
            div.className = 'kanban-card';
            div.draggable = true;
            div.ondragstart = (e) => { draggedClientId = c.id; div.classList.add('dragging'); };
            div.ondragend = () => {
              div.classList.remove('dragging');
              document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
              document.querySelectorAll('.kanban-drag-placeholder').forEach(p => p.remove());
            };
            div.setAttribute('data-client-id', c.id);

            // Allow double click to open client modal directly
            div.ondblclick = () => {
              showPage('interactions');
              openClientDetails(c);
            };

            // Build dynamic UI for card
            const cData = c.custom_data ? JSON.parse(c.custom_data) : {};
            const isSurgos = (cData.prioritas === 'Sürgős' || cData.priority === 'Sürgős' || cData.prioritas === 'Kiemelt');
            if (isSurgos) {
                div.style.border = '2px solid #ef4444';
                div.style.backgroundColor = document.body.classList.contains('dark') ? 'rgba(239, 68, 68, 0.05)' : '#fef2f2';
            }

            const fieldsCount = currentClientFields.length;
            let titleVal = fieldsCount > 0 && c.custom_data ? JSON.parse(c.custom_data)[currentClientFields[0].id] : c.name;
            let otherHtml = currentClientFields.slice(1, 3).map(f => {
              let val = c.custom_data ? JSON.parse(c.custom_data)[f.id] : '';
              return val ? `<div class="client-info"> ${esc(val)}</div>` : '';
            }).join('');

            let clinicDisplay = '';
            if (cData.clinic_id) {
               const foundClinic = typeof globalClinics !== 'undefined' ? globalClinics.find(cl => cl.id == cData.clinic_id) : null;
               const cName = foundClinic ? foundClinic.name_and_address.split(',')[0] : `Telephely ID: ${cData.clinic_id}`;
               clinicDisplay = `<div class="client-info" style="color:#1ceee0; font-weight:600;">📍 ${esc(cName)}</div>`;
            }

            const kanbanTags = cData.tags || [];
            const kanbanTagsHtml = kanbanTags.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 0;">${kanbanTags.map(t => {
              const _tc = (typeof getTagColor === 'function') ? getTagColor(t) : {bg:'#f3f4f6',color:'#374151'};
              return '<span style="background:'+_tc.bg+';color:'+_tc.color+';font-size:9px;padding:2px 6px;border-radius:8px;font-weight:600;white-space:nowrap;">'+esc(t)+'</span>';
            }).join('')}</div>` : '';

            div.innerHTML = `
              ${isSurgos ? '<div style="display:inline-block;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:6px;box-shadow:0 1px 2px rgba(239,68,68,0.4);">🚨 SÜRGŐS</div>' : ''}
              <div class="client-name">${esc(titleVal || "Névtelen")}</div>
              ${kanbanTagsHtml}
              ${clinicDisplay}
              ${otherHtml}
              <div class="kanban-admin-only" style="text-align:right"><button onclick="deleteClient(${c.id})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:11px;">Törlés</button></div>
            `;
            container.appendChild(div);
          });
        });
      } catch (e) {
        console.error('Kanban hiba:', e);
        board.innerHTML = '<div style="text-align:center;width:100%;color:var(--red);padding:40px;">Hiba az adatok betöltésekor</div>';
      }
    }

    async function promptAddKanbanColumn() {
      // Remove existing modal if any
      const existing = document.getElementById('kanban-add-col-modal');
      if (existing) { existing.remove(); return; }

      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = 'kanban-add-col-modal';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:var(--card,#fff);border-radius:16px;padding:28px;width:380px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.2);transform:scale(0.9);opacity:0;transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);';

      modal.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(28,238,224,0.12);display:flex;align-items:center;justify-content:center;">
            <svg fill="none" stroke="var(--accent)" stroke-width="2" viewBox="0 0 24 24" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text);">Új oszlop hozzáadása</div>
            <div style="font-size:12px;color:var(--text-muted);">Adj nevet az új kanban oszlopnak</div>
          </div>
        </div>
        <input id="kanban-new-col-input" type="text" placeholder="Pl. Ajánlatkérés, Tárgyalás..." style="width:100%;padding:12px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--bg,#f9fafb);outline:none;box-sizing:border-box;transition:border 0.2s;font-family:inherit;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" />
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
          <button id="kanban-col-cancel" style="padding:10px 20px;border:1px solid var(--border);background:transparent;color:var(--text-muted);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;">Mégse</button>
          <button id="kanban-col-save" style="padding:10px 20px;border:none;background:linear-gradient(135deg,#1ceee0,#0bbdb1);color:#082432;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(28,238,224,0.3);">Hozzáadás</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Animate in
      requestAnimationFrame(() => {
        modal.style.transform = 'scale(1)';
        modal.style.opacity = '1';
      });

      const input = document.getElementById('kanban-new-col-input');
      const saveBtn = document.getElementById('kanban-col-save');
      const cancelBtn = document.getElementById('kanban-col-cancel');
      input.focus();

      function closeModal() {
        modal.style.transform = 'scale(0.9)';
        modal.style.opacity = '0';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 200);
      }

      async function submit() {
        const name = input.value.trim();
        if (!name) { closeModal(); return; }
        const idStr = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
        if (!idStr) { alert("Érvénytelen név"); closeModal(); return; }

        // Disable button
        saveBtn.textContent = '...';
        saveBtn.disabled = true;

        const order_index = currentKanbanColumns.length > 0 ? Math.max(...currentKanbanColumns.map(c => c.order_index)) + 1 : 1;
        try {
          const res = await authFetch('/admin/api/kanban_columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idStr, name: name, order_index: order_index })
          });
          if (!res.ok) {
            alert("Hiba: Már létezik ilyen oszlop azonosító vagy belső hiba.");
          }
          closeModal();
          loadKanban();
        } catch (e) {
          alert("Hálózati hiba");
          closeModal();
          loadKanban();
        }
      }

      saveBtn.addEventListener('click', submit);
      cancelBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      });
    }

    async function editKanbanColumn(id, oldName) {
      const label = document.getElementById(`col-name-label-${id}`);
      const countBadge = document.getElementById(`count-${id}`);
      const actions = document.getElementById(`col-actions-${id}`);
      if (!label) return;

      // If already editing, don't trigger again
      if (label.querySelector('input')) return;

      if (countBadge) countBadge.style.display = 'none';
      if (actions) actions.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldName;
      input.style.background = '#ffffff';
      input.style.border = '1px solid #10b981';
      input.style.outline = 'none';
      input.style.borderRadius = '6px';
      input.style.padding = '2px 6px';
      input.style.fontSize = '13px';
      input.style.fontWeight = '600';
      input.style.color = '#0a1f2e';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      input.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
      input.style.textTransform = 'uppercase';
      input.style.letterSpacing = '0.5px';

      label.innerHTML = '';
      label.appendChild(input);
      
      input.focus();
      input.select();

      let isSaved = false;

      async function save() {
        if (isSaved) return;
        isSaved = true;
        const newName = input.value.trim();
        if (!newName || newName === oldName) {
          loadKanban();
          return;
        }
        try {
          const res = await authFetch(`/admin/api/kanban_columns/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
          });
          if (!res.ok) {
            alert("Hiba mentés közben.");
          }
          loadKanban();
        } catch (e) {
          alert("Hálózati hiba mentés közben");
          loadKanban();
        }
      }

      function cancel() {
        if (isSaved) return;
        isSaved = true;
        loadKanban();
      }

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
      
      input.addEventListener('mousedown', (e) => e.stopPropagation());
      input.addEventListener('click', (e) => e.stopPropagation());

      input.addEventListener('blur', () => {
        setTimeout(save, 150);
      });
    }

    async function deleteKanbanColumn(id) {
      if (!confirm("Biztosan törlöd ezt az oszlopot? Csak akkor lehetséges, ha üres!")) return;
      try {
        const res = await authFetch(`/admin/api/kanban_columns/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const d = await res.json();
          alert(d.detail || "Hiba a törlésnél. Biztosan üres az oszlop?");
        } else {
          loadKanban();
        }
      } catch (e) { alert("Hálózati hiba"); }
    }

    function kanbanDragOver(e) {
      e.preventDefault();
      const col = e.target.closest('.kanban-col');
      if (col && !col.classList.contains('drag-over')) {
        // Remove from all other cols
        document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
        col.classList.add('drag-over');
        // Add placeholder if not present
        const cards = col.querySelector('.kanban-cards');
        if (cards && !cards.querySelector('.kanban-drag-placeholder')) {
          const ph = document.createElement('div');
          ph.className = 'kanban-drag-placeholder';
          cards.appendChild(ph);
        }
      }
    }

    function kanbanDragLeave(e) {
      const col = e.target.closest('.kanban-col');
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
        const ph = col.querySelector('.kanban-drag-placeholder');
        if (ph) ph.remove();
      }
    }

    async function kanbanDrop(e, status) {
      e.preventDefault();
      // Clean up all drag-over states and placeholders
      document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
      document.querySelectorAll('.kanban-drag-placeholder').forEach(p => p.remove());

      if (!draggedClientId) return;
      const id = draggedClientId;
      draggedClientId = null;

      // ── Optimistic DOM move (no full reload) ──
      const card = document.querySelector(`.kanban-card[data-client-id="${id}"]`);
      const targetCards = document.getElementById('cards-' + status);
      if (!card || !targetCards) return;

      // Find source column to update its count
      const sourceCol = card.closest('.kanban-col');
      const sourceColId = sourceCol ? sourceCol.id.replace('col-', '') : null;

      // Move card in DOM
      card.classList.remove('dragging');
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8) translateY(-10px)';
      targetCards.prepend(card);

      // Animate card appearing in new position
      requestAnimationFrame(() => {
        card.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
        card.style.opacity = '1';
        card.style.transform = 'scale(1) translateY(0)';
        card.classList.add('just-dropped');
        setTimeout(() => {
          card.classList.remove('just-dropped');
          card.style.transition = '';
          card.style.transform = '';
        }, 500);
      });

      // Update count badges
      if (sourceColId && sourceColId !== status) {
        const srcCount = document.getElementById('count-' + sourceColId);
        const dstCount = document.getElementById('count-' + status);
        if (srcCount) srcCount.textContent = Math.max(0, parseInt(srcCount.textContent || '0') - 1);
        if (dstCount) dstCount.textContent = parseInt(dstCount.textContent || '0') + 1;
      }

      // Background API call
      try {
        await authFetch(`/admin/api/clients/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        // Refresh member analytics dashboard (KPI counts, kanban bars, etc.)
        _myAssignedClientNames = null; // invalidate cache since client status changed
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager') loadMemberAnalytics();
      } catch (err) {
        // On error, revert by reloading
        alert('Hiba a mozgatás során!');
        loadKanban();
      }
    }


    async function loadClientsTable() {
      await initClientFields();
      const thead = document.getElementById('clients-thead');
      const tbody = document.getElementById('clients-body');
      if (!tbody || !thead) return;

      const isAdmin = currentUserRole === 'admin' || currentUserRole === 'manager';
      thead.innerHTML = `
    <tr>
      <th style="width:40px;text-align:center;"><input type="checkbox" id="selectAllClients" onchange="toggleAllClients(this)"></th>
      <th>Ügyfél</th>
      <th>Új / Visszatérő</th>
      <th>Címkék</th>
      <th>Telefonszám</th>
      <th>Email</th>
      ${isAdmin ? '<th>Felelős</th>' : ''}
      <th>Utolsó interakció</th>
      <th>Értékesítési státusz</th>
      <th>Műveletek</th>
    </tr>
  `;

      tbody.innerHTML = '<tr class="loading-row"><td colspan="10"><div class="spinner"></div></td></tr>';
      document.getElementById('bulk-delete-btn').style.display = 'none';
      document.getElementById('bulk-delete-count').textContent = '0';

      // Fetch members list from API for Felelős dropdown
      let memberList = [];
      if (isAdmin) {
        try {
          const mRes = await authFetch('/admin/api/members');
          const mData = await mRes.json();
          memberList = (mData.data || []).map(m => ({ name: m.full_name || m.username, username: m.username }));
        } catch(e) {}
      }

      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        let clients = data.clients || [];
        // Member filter: only show clients assigned to me
        if (currentUserRole !== 'admin') {
          clients = clients.filter(c => isClientAssignedToMe(c));
        }
        if (!clients.length) {
          tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-state-text">'+(currentUserRole !== 'admin' ? 'Nincs hozzád rendelt ügyfél' : 'Nincs rögzített ügyfél')+'</div></div></td></tr>';
          return;
        }

        if (currentKanbanColumns.length === 0) {
          const creq = await authFetch('/admin/api/kanban_columns');
          const cdat = await creq.json();
          currentKanbanColumns = cdat.columns || [];
        }
        const statusMap = {};
        currentKanbanColumns.forEach(c => { statusMap[c.id] = c.name; });

        // Fetch calendar events for appointment-based Új/Visszatérő detection
        // Uses EXACT same matching logic as openClientDetails (lines 9074-9118)
        let calendarEvents = [];
        let latestInteractions = {};
        try {
          const calRes = await authFetch('/admin/api/calendar');
          const calData = await calRes.json();
          calendarEvents = calData.events || [];
        } catch(e) {}

        // ── INAKTÍV küszöb (napokban) ──
        const INACTIVITY_DAYS = window._inactivityDays || 60;

        // Build per-client appointment count using same logic as detail view
        function countClientAppointments(clientName, clientEmail, customData) {
          const cleanName = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const cleanEmail = (clientEmail || '').toLowerCase().trim();
          const messengerId = customData?.messenger_id || '';
          let count = 0;
          calendarEvents.forEach(ev => {
            const cleanEvEmail = (ev.attendee_email || '').toLowerCase().trim();
            const cleanEvAttendee = (ev.attendee || '').toLowerCase().trim();
            const cleanEvTitle = (ev.title || '').toLowerCase().trim();
            let match = false;
            if (cleanEmail) {
              if (cleanEvEmail && cleanEmail === cleanEvEmail) match = true;
              if (cleanEvAttendee && cleanEvAttendee.includes(cleanEmail)) match = true;
            }
            if (cleanName) {
              if (cleanEvAttendee && cleanEvAttendee.includes(cleanName)) match = true;
              if (cleanEvTitle && cleanEvTitle.includes(cleanName)) match = true;
            }
            if (match) count++;
          });
          return count;
        }

        // Determine if client is inactive based on last interaction date
        function isClientInactive(clientId, aptCount) {
          const lastInteraction = latestSessionByClient[clientId];
          if (!lastInteraction && aptCount === 0) return true; // never interacted, no appointments
          if (!lastInteraction) return false; // has appointments but no session
          const daysSince = (Date.now() - new Date(lastInteraction).getTime()) / (1000*60*60*24);
          return daysSince > INACTIVITY_DAYS;
        }

        // Fetch sessions for "utolsó interakció" - use same matching as detail view
        // The detail view matches sessions by participant name, session_id email, messenger_id
        let latestSessionByClient = {}; // keyed by client id
        try {
          const sessRes = await authFetch('/admin/api/sessions/summary?limit=500');
          const sessData = await sessRes.json();
          const allSessions = sessData.sessions || [];
          
          // For each client, find matching sessions
          clients.forEach(cl => {
            let co = cl.custom_data ? JSON.parse(cl.custom_data) : {};
            const cName = (co.nev || co.name || cl.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const cEmail = (co.email || cl.email || '').toLowerCase().trim();
            const cMsgId = (co.messenger_id || '').toString().trim();
            
            allSessions.forEach(s => {
              const participant = (s.participant || s.client_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
              const sid = (s.session_id || '').toLowerCase();
              
              let isMatch = false;
              if (cName && participant && cName === participant) isMatch = true;
              if (cEmail && sid.includes(cEmail)) isMatch = true;
              if (cMsgId && sid.includes(cMsgId)) isMatch = true;
              
              if (isMatch) {
                // Use session started_at or last interaction date
                const sessionDate = s.started_at || s.created_at || '';
                let latestDate = sessionDate;
                (s.interactions || []).forEach(inter => {
                  if (inter.created_at && (!latestDate || new Date(inter.created_at) > new Date(latestDate))) {
                    latestDate = inter.created_at;
                  }
                });
                if (latestDate && (!latestSessionByClient[cl.id] || new Date(latestDate) > new Date(latestSessionByClient[cl.id]))) {
                  latestSessionByClient[cl.id] = latestDate;
                }
              }
            });
          });
        } catch(e) {}

        const tagColors = {
          'árkérdés': {bg:'#fce4ec',color:'#c62828'}, 'kampány lead': {bg:'#e8f5e9',color:'#2e7d32'},
          'ajánlatkérés': {bg:'#fff3e0',color:'#e65100'}, 'törölt időpont': {bg:'#fce4ec',color:'#c62828'},
          'no-show': {bg:'#fff8e1',color:'#f57f17'}, 'VIP': {bg:'#ede7f6',color:'#4527a0'},
        };

        // Cache data for card view
        _cachedClientsData = clients;
        _cachedStatusMap = statusMap;
        _cachedCalendarEvents = calendarEvents;
        _cachedLatestSession = latestSessionByClient;
        _cachedMemberList = memberList;

        // If card view is active, render cards too
        if (_clientsViewMode === 'cards') {
          renderClientsCards(clients, statusMap, calendarEvents, latestSessionByClient);
        }

        // Render tag filter bar
        renderTagFilterBar();

        tbody.innerHTML = clients.map(c => {
          let customObj = c.custom_data ? JSON.parse(c.custom_data) : {};
          let dispStatus = statusMap[c.status] || c.status;
          let badgeCls = 'badge-teal';
          let rowStyle = '';
          if (dispStatus.toLowerCase().includes('lemondott') || c.status === 'lemondott') {
              badgeCls = 'badge-red';
              rowStyle = 'opacity:0.65;background-color:rgba(239,68,68,0.03);';
          }

          const clientName = customObj.nev || customObj.name || c.name || 'Ismeretlen';
          const ddId = 'ED-' + c.id;
          const safeName = esc(clientName).replace(/'/g, "\\'");

          // Match client detail view: ÚJ / VISSZATÉRŐ / INAKTÍV
          const clientEmail = customObj.email || c.email || '';
          const cNameLower = clientName.toLowerCase().trim();
          const aptCount = countClientAppointments(clientName, clientEmail, customObj);
          const inactive = isClientInactive(c.id, aptCount);
          let stLabel, stBg, stClr;
          if (inactive) {
            stLabel = '🕒 INAKTÍV'; stBg = '#f3f4f6'; stClr = '#6b7280';
          } else if (aptCount > 1) {
            stLabel = 'VISSZATÉRŐ'; stBg = '#f0fdf4'; stClr = '#15803d';
          } else {
            stLabel = 'ÚJ ÜGYFÉL'; stBg = '#e0f2fe'; stClr = '#0369a1';
          }

          const tags = customObj.tags || [];
          // C2: Auto-tag enrichment (display-only)
          const birthDate = customObj.szuletesi_datum || customObj.birth_date || customObj.szuletesi_ido;
          if (birthDate) {
            try {
              const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              const ageGroup = age < 20 ? '< 20 év' : age < 30 ? '20-30 év' : age < 40 ? '30-40 év' : age < 50 ? '40-50 év' : age < 60 ? '50-60 év' : '60+ év';
              if (!tags.includes(ageGroup)) tags.push(ageGroup);
            } catch(e) {}
          }
          const channel = customObj.forras_csatorna;
          // forras_csatorna nem címkézendő — az a beérkezési csatornát mutatja, nem preferenciát
          const tagsHtml = tags.length > 0
            ? tags.map(t => { const tc = tagColors[t] || {bg:'#f3f4f6',color:'#374151'}; return '<span style="background:'+tc.bg+';color:'+tc.color+';font-size:11px;padding:3px 8px;border-radius:12px;font-weight:600;white-space:nowrap;">'+esc(t)+'</span>'; }).join(' ')
            : '<span style="color:var(--text-muted);font-size:12px;">—</span>';

          const phone = customObj.telefonszam || customObj.phone || customObj.telefon || c.phone || '';
          const email = customObj.email || c.email || '';

          const currentFelelos = customObj.felelos || '';
          let felelosCell = '';
          if (isAdmin) {
            const felelosOpts = memberList.map(m => '<option value="'+esc(m.name)+'" '+(m.name===currentFelelos?'selected':'')+'>'+esc(m.name)+'</option>').join('');
            felelosCell = '<td><select onchange="assignFelelos('+c.id+',this.value)" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);font-family:inherit;cursor:pointer;min-width:130px;"><option value="">Nincs hozzárendelve</option>'+felelosOpts+'</select></td>';
          }

          // Utolsó interakció: from sessions matching
          const lastInt = latestSessionByClient[c.id] || '';
          const lastIntDisp = lastInt ? fmtDt(lastInt) : '<span style="color:var(--text-muted);">—</span>';

          return '<tr style="'+rowStyle+'">' +
            '<td style="text-align:center;"><input type="checkbox" class="client-checkbox" value="'+c.id+'" onchange="updateBulkDeleteBtn()"></td>' +
            '<td style="min-width:160px;"><button onclick="openClientDetails({id:'+c.id+',name:\''+safeName+'\',email:\''+esc(email).replace(/'/g,"\\'")+'\',phone:\''+esc(phone).replace(/'/g,"\\'")+'\'})" style="background:none;border:none;cursor:pointer;text-align:left;padding:0;"><div style="font-weight:600;font-size:13px;color:var(--text);line-height:1.3;">'+esc(clientName)+'</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">'+ddId+'</div></button></td>' +
            '<td><span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:'+stBg+';color:'+stClr+';letter-spacing:0.3px;">'+stLabel+'</span></td>' +
            '<td style="min-width:120px;"><div style="display:flex;flex-wrap:wrap;gap:4px;">'+tagsHtml+'</div></td>' +
            '<td style="font-size:13px;white-space:nowrap;">'+(phone ? esc(phone) : '<span style="color:var(--text-muted);">—</span>')+'</td>' +
            '<td style="font-size:13px;">'+(email ? '<a href="mailto:'+esc(email)+'" style="color:#2563eb;text-decoration:none;font-weight:500;">'+esc(email)+'</a>' : '<span style="color:var(--text-muted);">—</span>')+'</td>' +
            felelosCell +
            '<td style="font-size:13px;white-space:nowrap;">'+lastIntDisp+'</td>' +
            '<td><span class="badge '+badgeCls+'">'+esc(dispStatus)+'</span></td>' +
            '<td>' + (currentUserRole === 'admin' ? '<button onclick="openClientModal('+c.id+',\''+esc(btoa(encodeURIComponent(c.custom_data || '{}')))+'\')" style="background:transparent;border:none;color:var(--blue);cursor:pointer;font-size:12px;margin-right:8px;">Szerkesztés</button><button onclick="deleteClient('+c.id+')" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:12px;">Törlés</button>' : '<button onclick="openClientModal('+c.id+',\''+esc(btoa(encodeURIComponent(c.custom_data || '{}')))+'\')" style="background:transparent;border:none;color:var(--blue);cursor:pointer;font-size:12px;">Szerkesztés</button>') + '</td>' +
            '</tr>';
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
      restoreClientColumnVisibility();
    }

    // ── Card View State ──────────────────────────────────────
    let _clientsViewMode = 'table'; // 'table' or 'cards'
    let _cachedClientsData = null; // cached data from loadClientsTable
    let _cachedStatusMap = {};
    let _cachedCalendarEvents = [];
    let _cachedLatestSession = {};
    let _cachedMemberList = [];

    function _getSelectedClientIds() {
      const ids = new Set();
      document.querySelectorAll('.client-checkbox:checked').forEach(cb => ids.add(cb.value));
      return ids;
    }

    function _applySelectionToView(selectedIds) {
      // Apply to table checkboxes
      document.querySelectorAll('#clients-body .client-checkbox').forEach(cb => {
        cb.checked = selectedIds.has(cb.value);
      });
      // Apply to card checkboxes
      document.querySelectorAll('#clients-cards-wrapper .cc-top-check').forEach(cb => {
        cb.checked = selectedIds.has(cb.value);
        toggleCardSelect(cb);
      });
      updateBulkDeleteBtn();
    }

    function switchClientsView(mode) {
      // Collect current selections before switching
      const selectedIds = _getSelectedClientIds();

      _clientsViewMode = mode;
      document.getElementById('vt-table').classList.toggle('active', mode === 'table');
      document.getElementById('vt-cards').classList.toggle('active', mode === 'cards');
      document.getElementById('clients-table-wrapper').style.display = mode === 'table' ? '' : 'none';
      document.getElementById('clients-cards-wrapper').style.display = mode === 'cards' ? '' : 'none';
      const selAllBtn = document.getElementById('cc-select-all');
      if (selAllBtn) selAllBtn.style.display = mode === 'cards' ? '' : 'none';
      if (mode === 'cards' && _cachedClientsData) {
        renderClientsCards(_cachedClientsData, _cachedStatusMap, _cachedCalendarEvents, _cachedLatestSession);
      }

      // Restore selections in the new view
      if (selectedIds.size > 0) {
        _applySelectionToView(selectedIds);
      }
    }

    function selectAllCards() {
      const wrapper = document.getElementById('clients-cards-wrapper');
      if (!wrapper) return;
      const checkboxes = wrapper.querySelectorAll('.cc-top-check');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        toggleCardSelect(cb);
      });
      const btn = document.getElementById('cc-select-all');
      if (btn) {
        btn.classList.toggle('all-selected', !allChecked);
        btn.querySelector('span').textContent = !allChecked ? 'Kijelölés törlése' : 'Összes kijelölése';
      }
      updateBulkDeleteBtn();
    }

    function filterClientsView() {
      if (_clientsViewMode === 'table') {
        filterClientsTable();
      } else {
        filterClientsCards();
      }
    }

    function filterClientsCards() {
      const input = document.getElementById('client-search-input');
      if (!input) return;
      const filter = input.value.toLowerCase();
      const wrapper = document.getElementById('clients-cards-wrapper');
      if (!wrapper) return;
      const cards = wrapper.querySelectorAll('.client-card');
      cards.forEach(card => {
        if (card.textContent.toLowerCase().includes(filter)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    const _avatarColors = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)',
      'linear-gradient(135deg, #a18cd1, #fbc2eb)',
      'linear-gradient(135deg, #fccb90, #d57eeb)',
      'linear-gradient(135deg, #1ceee0, #3b82f6)',
      'linear-gradient(135deg, #f97316, #ef4444)',
      'linear-gradient(135deg, #06b6d4, #8b5cf6)',
    ];

    function _getInitials(name) {
      if (!name) return '??';
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
      return name.substring(0, 2).toUpperCase();
    }

    function toggleCardSelect(checkbox) {
      const card = checkbox.closest('.client-card');
      if (card) card.classList.toggle('cc-selected', checkbox.checked);
    }

    function renderClientsCards(clients, statusMap, calendarEvents, latestSessionByClient) {
      const wrapper = document.getElementById('clients-cards-wrapper');
      if (!wrapper) return;

      const tagColors = {
        'árkérdés': {bg:'#fce4ec',color:'#c62828'}, 'kampány lead': {bg:'#e8f5e9',color:'#2e7d32'},
        'ajánlatkérés': {bg:'#fff3e0',color:'#e65100'}, 'törölt időpont': {bg:'#fce4ec',color:'#c62828'},
        'no-show': {bg:'#fff8e1',color:'#f57f17'}, 'VIP': {bg:'#ede7f6',color:'#4527a0'},
      };

      if (!clients || !clients.length) {
        wrapper.innerHTML = `<div class="cc-empty-state">
          <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;">Nincs megjeleníthető ügyfél</div>
          <div style="font-size:13px;">Adj hozzá új ügyfelet a jobb felső gombbal</div>
        </div>`;
        return;
      }

      // Same countClientAppointments logic as the table
      function countApt(clientName, clientEmail, customData) {
        const cN = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const cE = (clientEmail || '').toLowerCase().trim();
        let count = 0;
        calendarEvents.forEach(ev => {
          const eE = (ev.attendee_email || '').toLowerCase().trim();
          const eA = (ev.attendee || '').toLowerCase().trim();
          const eT = (ev.title || '').toLowerCase().trim();
          let match = false;
          if (cE) { if (eE && cE === eE) match = true; if (eA && eA.includes(cE)) match = true; }
          if (cN) { if (eA && eA.includes(cN)) match = true; if (eT && eT.includes(cN)) match = true; }
          if (match) count++;
        });
        return count;
      }

      wrapper.innerHTML = clients.map((c, idx) => {
        let co = {};
        try { co = c.custom_data ? JSON.parse(c.custom_data) : {}; } catch(e) {}
        const clientName = co.nev || co.name || c.name || 'Ismeretlen';
        const ddId = 'ED-' + c.id;
        const initials = _getInitials(clientName);
        const avatarBg = _avatarColors[c.id % _avatarColors.length];

        const clientEmail = co.email || c.email || '';
        const aptCount = countApt(clientName, clientEmail, co);
        // INAKTÍV check for card view
        const cardLastInt = latestSessionByClient[c.id];
        const INACTIVITY_DAYS_CARD = window._inactivityDays || 60;
        const cardInactive = (!cardLastInt && aptCount === 0) || (cardLastInt && (Date.now() - new Date(cardLastInt).getTime()) / (1000*60*60*24) > INACTIVITY_DAYS_CARD);
        let stLabel, stBg, stClr;
        if (cardInactive) {
          stLabel = '🕒 INAKTÍV'; stBg = '#f3f4f6'; stClr = '#6b7280';
        } else if (aptCount > 1) {
          stLabel = 'VISSZATÉRŐ'; stBg = '#f0fdf4'; stClr = '#15803d';
        } else {
          stLabel = 'ÚJ ÜGYFÉL'; stBg = '#e0f2fe'; stClr = '#0369a1';
        }

        const phone = co.telefonszam || co.phone || co.telefon || c.phone || '';
        const email = clientEmail;
        const tags = co.tags || [];
        const felelos = co.felelos || '';

        const dispStatus = statusMap[c.status] || c.status || '';
        let kanbanBg = 'rgba(28,238,224,0.1)';
        let kanbanClr = '#0d9488';
        if (dispStatus.toLowerCase().includes('lemondott') || c.status === 'lemondott') {
          kanbanBg = 'rgba(239,68,68,0.1)'; kanbanClr = '#dc2626';
        } else if (c.status === 'foglalt') {
          kanbanBg = 'rgba(59,130,246,0.1)'; kanbanClr = '#2563eb';
        } else if (c.status === 'valaszolt' || dispStatus.toLowerCase().includes('kapcsolat')) {
          kanbanBg = 'rgba(139,92,246,0.1)'; kanbanClr = '#7c3aed';
        }

        const lastInt = latestSessionByClient[c.id] || '';
        const lastIntDisp = lastInt ? fmtDt(lastInt) : '—';

        const tagsHtml = tags.map(t => {
          const tc = tagColors[t] || {bg:'#f3f4f6',color:'#374151'};
          return `<span class="cc-tag" style="background:${tc.bg};color:${tc.color};">${esc(t)}</span>`;
        }).join('');

        const rowOpacity = (c.status === 'lemondott') ? 'opacity:0.65;' : '';
        const safeName = esc(clientName).replace(/'/g, "\\'");
        const safeEmail = esc(email).replace(/'/g, "\\'");
        const safePhone = esc(phone).replace(/'/g, "\\'");

        const isAdmin = currentUserRole === 'admin' || currentUserRole === 'manager';

        return `<div class="client-card" style="${rowOpacity}" onclick="openClientDetails({id:${c.id},name:'${safeName}',email:'${safeEmail}',phone:'${safePhone}'})" data-client-id="${c.id}">
          <div class="cc-top-strip">
            <input type="checkbox" class="cc-top-check client-checkbox" value="${c.id}" onclick="event.stopPropagation(); toggleCardSelect(this);" onchange="updateBulkDeleteBtn()">
            ${isAdmin ? `<button class="cc-delete-btn" onclick="event.stopPropagation(); deleteClient(${c.id})" title="T\u00f6rl\u00e9s">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : ''}
          </div>
          <div class="cc-header">
            <div class="cc-avatar" style="background:${avatarBg};">${initials}</div>
            <div class="cc-name-block">
              <div class="cc-name">${esc(clientName)}</div>
              <div class="cc-id">${ddId}</div>
            </div>
            <span class="cc-type-badge" style="background:${stBg};color:${stClr};">${stLabel}</span>
          </div>
          <div class="cc-contact">
            <div class="cc-contact-row">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.18 2 2 0 012.07 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
              <span>${phone ? esc(phone) : '—'}</span>
            </div>
            <div class="cc-contact-row">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span>${email ? esc(email) : '—'}</span>
            </div>
          </div>
          ${tags.length > 0 ? `<div class="cc-tags">${tagsHtml}</div>` : ''}
          ${felelos ? `<div class="cc-felelos"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>${esc(felelos)}</div>` : ''}
          <div class="cc-footer">
            <div class="cc-footer-item">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${lastIntDisp}
            </div>
            <span class="cc-kanban-badge" style="background:${kanbanBg};color:${kanbanClr};">${esc(dispStatus)}</span>
          </div>
        </div>`;
      }).join('');
    }

    async function assignFelelos(clientId, felelos) {
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const client = (data.clients || []).find(c => c.id === clientId);
        if (!client) return;
        let customObj = client.custom_data ? JSON.parse(client.custom_data) : {};
        customObj.felelos = felelos;
        await authFetch('/admin/api/clients/' + clientId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_data: customObj })
        });
      } catch(e) { console.error('Felelos error:', e); }
    }

    function filterClientsTable() {
      const input = document.getElementById('client-search-input');
      if (!input) return;
      const filter = input.value.toLowerCase();
      const tbody = document.getElementById('clients-body');
      if (!tbody) return;
      const trs = tbody.getElementsByTagName('tr');
      
      for (let i = 0; i < trs.length; i++) {
        if (trs[i].classList.contains('loading-row') || trs[i].querySelector('.empty-state')) continue;
        const textContent = trs[i].textContent.toLowerCase();
        if (textContent.includes(filter)) {
          trs[i].style.display = '';
        } else {
          trs[i].style.display = 'none';
        }
      }
    }

    async function openLogModal(encodedText, name, channel, date, encodedCustomObj) {
      let t = '';
      try { t = decodeURIComponent(atob(encodedText)); } catch (e) { }
      
      let cData = {};
      if (encodedCustomObj) {
          try { cData = JSON.parse(decodeURIComponent(atob(encodedCustomObj))); } catch(e) {}
      }

      window.currentLogModalClientData = {
          id: cData.id || (window.currentClientDataForLog ? window.currentClientDataForLog.id : null),
          name: name || cData.nev || cData.name || cData['név'] || (window.currentClientDataForLog ? window.currentClientDataForLog.name : ''),
          email: cData.email || (window.currentClientDataForLog ? window.currentClientDataForLog.email : ''),
          phone: cData.telefonszam || cData.phone || cData.telefon || (window.currentClientDataForLog ? window.currentClientDataForLog.phone : '')
      };

      // --- DINAMIKUS BADGE LOGIKA ---
      let badge1 = "VISSZATÉRŐ ÜGYFÉL";
      let badge2 = "LEZÁRT";

      if (cData._client_status === 'lemondott') {
          badge2 = "LEMONDOTT";
      } else if (cData.booked_datetime && cData.booked_datetime !== '-') {
          badge2 = "LEZÁRT";
      }

      if (cData._client_created_at) {
          const createdAt = new Date(cData._client_created_at);
          const now = new Date();
          const diffHours = (now - createdAt) / (1000 * 60 * 60);
          if (diffHours > 12) {
              badge1 = "VISSZATÉRŐ ÜGYFÉL";
          }
      }
      
      const modalHeaderFlex = document.querySelector('#log-modal .bg-green-gradient > div:first-child > div:last-child');
      if (modalHeaderFlex) {
          const prevBadges = modalHeaderFlex.querySelectorAll('.dynamic-badge');
          prevBadges.forEach(b => b.remove());

          const b1 = document.createElement('span');
          b1.className = 'dynamic-badge';
          b1.style.cssText = "background:rgba(8,36,50,0.1); color:#082432; padding:4px 10px; border-radius:100px; font-size:10px; font-weight:700;";
          b1.textContent = badge1;

          const b2 = document.createElement('span');
          b2.className = 'dynamic-badge';
          b2.style.cssText = "background:rgba(8,36,50,0.1); color:#082432; padding:4px 10px; border-radius:100px; font-size:10px; font-weight:700;";
          b2.textContent = badge2;

          modalHeaderFlex.insertBefore(b2, modalHeaderFlex.firstChild);
          modalHeaderFlex.insertBefore(b1, modalHeaderFlex.firstChild);
      }
      // --- DINAMIKUS BADGE LOGIKA VÉGE ---
      if (name) document.getElementById('log-modal-title-name').textContent = name;
      if (channel) document.getElementById('log-modal-channel').textContent = channel;
      if (date) document.getElementById('log-modal-date').textContent = date;
      document.getElementById('log-modal-topic').textContent = 'Interakciós összefoglaló';
      
      // Összefoglaló frissítése
      const summaryBox = document.getElementById('log-modal-summary');
      if (summaryBox) {
          summaryBox.textContent = cData.problem_description || 'Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit és lefoglalt egy időpontot.';
      }

      // Valós Eredmény adatok megjelenítése
      const resContainer = document.getElementById('log-modal-result-box');
      if (resContainer) {
          let finalDate = '-';
          let finalService = '-';
          let finalDoctor = '-';
          let finalReminder = '-';

          // Try to find calendar event for this client
          try {
            const calRes = await authFetch('/admin/api/calendar');
            const calData = await calRes.json();
            const events = calData.events || [];
            const clientName = (name || '').toLowerCase().trim();
            const clientEmail = (cData.email || '').toLowerCase().trim();
            
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
              if (matchedEvent.title && matchedEvent.title !== '-') finalService = matchedEvent.title;
              if (matchedEvent.start_dt) {
                const dt = new Date(matchedEvent.start_dt);
                finalDate = `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}. ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
              }
              if (matchedEvent.doctor) finalDoctor = matchedEvent.doctor;
              finalReminder = matchedEvent.reminder_sent ? 'Kiküldve ✓' : '-';
            }
          } catch(e) { console.warn('Calendar fetch for modal failed:', e); }

          // Fallback: parse from custom_data
          if (finalDate === '-' && cData.booked_datetime) {
            const dt = new Date(cData.booked_datetime);
            if (!isNaN(dt.getTime())) {
              finalDate = `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}. ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            }
          }

          // Fallback: parse from log text
          if (finalDate === '-') {
            const naploDateMatch = t.match(/Naptár bejegyzés létrehozva:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/i);
            if (naploDateMatch) {
              const dt = new Date(naploDateMatch[1]);
              if (!isNaN(dt.getTime())) {
                finalDate = `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}. ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
              }
            }
          }

          // Fallback service from log text
          if (finalService === '-') {
            const sPatterns = [
              /szolgáltatás:\s*([^\n,]+)/i,
              /(fogászati vizsgálat|ultrahangos fogkőeltávolítás|fogkőeltávolítás|általános vizit|általános konzultáció|konzultáció|fogászat|fogpótlás|implantátum|tömés|gyökérkezelés|fogfehérítés|szájsebészet|fogszabályozás|paradontológia|fogtisztítás|kontroll vizsgálat|vizit|vizsgálat|kezelés)/i
            ];
            for (const pat of sPatterns) {
              const m = t.match(pat);
              if (m) { finalService = (m[1] || m[0]).trim(); finalService = finalService.charAt(0).toUpperCase() + finalService.slice(1); break; }
            }
          }

          // Fallback doctor
          if (finalDoctor === '-') {
            const docMatch = t.match(/(?:orvos|doktor|dr\.):\s*([^\n,]+)/i);
            if (docMatch) finalDoctor = docMatch[1].trim();
          }

          document.getElementById('lm-res-date').textContent = finalDate;
          document.getElementById('lm-res-service').textContent = finalService;
          document.getElementById('lm-res-doctor').textContent = finalDoctor;
          document.getElementById('lm-res-reminder').textContent = finalReminder;
      }

      // Chat buborékok generálása
      const chatContainer = document.getElementById('log-modal-chat');
      if (chatContainer) {
          chatContainer.innerHTML = ''; // reset
          const lines = t.split('\n');
          
          let blocks = [];
          let currentSender = 'system';
          let currentBlock = [];

          for (let line of lines) {
              line = line.trim();
              if (!line && currentSender !== 'ai') continue;
              
              if (line.match(/^\[\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}\]/) || line.match(/^\[\d{4}-\d{2}-\d{2}\]/)) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
                  currentSender = 'system';
                  currentBlock = [line];
              } else if (line.match(/^- Bejövő e-mail/i) || line.startsWith('Ügyfél')) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
                  currentSender = 'user';
                  currentBlock = [line.replace(/^Ügyfél.*?:\s*/, '').replace(/^- Bejövő e-mail.*?\):\s*/i, '').trim()];
              } else if (line.match(/^Bégé Design Kft.*?ezt írta/i) || line.match(/^EAISY Marketing.*?ezt írta/i) || line.startsWith('AI Válasz')) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
                  currentSender = 'ai';
                  let cleanLine = line.replace(/^AI Válasz.*?:\s*/, '').replace(/^Bégé Design Kft.*?:\s*/i, '').replace(/^EAISY Marketing.*?:\s*/i, '').replace(/ezt írta.*?:\s*$/i, '');
                  if (cleanLine.trim() !== '') currentBlock = [cleanLine.trim()];
                  else currentBlock = [];
              } else {
                  let cleanLine = line;
                  if (currentSender === 'ai' && cleanLine.startsWith('>')) {
                      cleanLine = cleanLine.substring(1);
                      if (cleanLine.startsWith(' ')) cleanLine = cleanLine.substring(1);
                  }
                  currentBlock.push(cleanLine);
              }
          }
          if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });

          blocks = blocks.map(b => ({ sender: b.sender, content: b.content.trim() })).filter(b => b.content !== '');
          
          blocks.forEach(msg => {
              if (msg.sender === 'system') {
                  chatContainer.appendChild(createSystemBubble(msg.content));
              } else {
                  chatContainer.appendChild(createChatBubble(msg.sender, msg.content));
              }
          });
          
          if (chatContainer.children.length === 0) {
              chatContainer.innerHTML = `<div style="color:var(--text-muted);font-style:italic;padding:12px;">A beszélgetés szövege nem értelmezhető formátumú, vagy üres.</div>`;
          }
      }
      
      document.getElementById('log-modal').style.display = 'flex';
      // Alapból rejtve a teljes beszélgetés
      document.getElementById('log-modal-chat-container').style.display = 'none';
      const toggleBtn = document.getElementById('log-modal-toggle-btn');
      if (toggleBtn) {
          toggleBtn.innerHTML = `<span style="margin-right:6px;">↓</span> Interakció megtekintése`;
      }
    }

    function createSystemBubble(content) {
        const div = document.createElement('div');
        div.style.textAlign = 'center';
        div.style.margin = '16px 0';
        div.style.fontSize = '11.5px';
        div.style.color = 'var(--text-muted)';
        div.style.fontWeight = '500';
        div.style.fontStyle = 'italic';
        div.style.padding = '4px 16px';
        div.style.background = 'rgba(0,0,0,0.03)';
        div.style.borderRadius = '8px';
        div.textContent = content;
        return div;
    }

    function createChatBubble(sender, content) {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '12px';
        div.style.marginBottom = '16px';
        div.style.alignItems = 'flex-start';
        
        const avatar = document.createElement('div');
        avatar.style.width = '32px';
        avatar.style.height = '32px';
        avatar.style.borderRadius = '50%';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.fontWeight = '700';
        avatar.style.fontSize = '12px';
        avatar.style.flexShrink = '0';
        
        const bubble = document.createElement('div');
        bubble.style.padding = '12px 16px';
        bubble.style.borderRadius = '12px';
        bubble.style.fontSize = '13px';
        bubble.style.lineHeight = '1.5';
        bubble.style.maxWidth = '85%';
        bubble.style.whiteSpace = 'pre-wrap';
        
        if (sender === 'user') {
            avatar.style.background = '#e5e7eb';
            avatar.style.color = '#374151';
            avatar.textContent = 'Ü';
            
            bubble.style.background = '#f3f4f6';
            bubble.style.color = '#1f2937';
            bubble.style.borderTopLeftRadius = '4px';
            
        } else {
            avatar.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))';
            avatar.style.color = '#082432';
            avatar.textContent = 'AI';
            
            bubble.style.background = 'rgba(28, 238, 224, 0.1)';
            bubble.style.color = 'var(--text)';
            bubble.style.border = '1px solid rgba(28, 238, 224, 0.2)';
            bubble.style.borderTopLeftRadius = '4px';
        }
        
        bubble.textContent = content;
        
        div.appendChild(avatar);
        div.appendChild(bubble);
        return div;
    }

    function toggleChat() {
        const container = document.getElementById('log-modal-chat-container');
        const btn = document.getElementById('log-modal-toggle-btn');
        if (!container || !btn) return;
        
        const isHidden = container.style.display === 'none';
        
        if (isHidden) {
            container.style.display = 'block';
            btn.innerHTML = `<span style="margin-right:6px;">↑</span> Beszélgetés elrejtése`;
        } else {
            container.style.display = 'none';
            btn.innerHTML = `<span style="margin-right:6px;">↓</span> Interakció megtekintése`;
        }
    }


    function toggleAllClients(selectAllCheckbox) {
      const checkboxes = document.querySelectorAll('.client-checkbox');
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateBulkDeleteBtn();
    }

    function updateBulkDeleteBtn() {
      const checkedCount = document.querySelectorAll('.client-checkbox:checked').length;
      const btn = document.getElementById('bulk-delete-btn');
      const countSpan = document.getElementById('bulk-delete-count');
      const campaignBtn = document.getElementById('bulk-campaign-btn');
      const campaignCount = document.getElementById('bulk-campaign-count');
      const selectAll = document.getElementById('selectAllClients');
      
      const totalCheckboxes = document.querySelectorAll('.client-checkbox').length;
      if (selectAll && totalCheckboxes > 0) {
          selectAll.checked = (checkedCount === totalCheckboxes);
      }

      if (checkedCount > 0) {
        btn.style.display = 'inline-flex';
        countSpan.textContent = checkedCount;
        if (campaignBtn) {
          campaignBtn.style.display = 'inline-flex';
          campaignCount.textContent = checkedCount;
        }
      } else {
        btn.style.display = 'none';
        countSpan.textContent = '0';
        if (campaignBtn) {
          campaignBtn.style.display = 'none';
          campaignCount.textContent = '0';
        }
      }
    }

    async function bulkDeleteClients() {
      const checkedBoxes = document.querySelectorAll('.client-checkbox:checked');
      if (checkedBoxes.length === 0) return;
      
      if (!confirm(`Biztosan törölni szeretnél ${checkedBoxes.length} db ügyfelet? Ez a művelet nem vonható vissza!`)) return;
      
      const clientIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
      
      try {
        const res = await authFetch('/admin/api/clients/bulk_delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ client_ids: clientIds })
        });
        if (!res.ok) throw new Error();
        loadClientsTable();
        loadKanban();
      } catch (err) {
        alert('Hiba történt a törlés során!');
      }
    }

    async function openClientModal(id = null, encodedCustomData = 'e30=') {
      await initClientFields();
      let cData = {};
      try {
        cData = JSON.parse(decodeURIComponent(atob(encodedCustomData)));
      } catch (e) { }
      if (typeof cData === 'string') {
        try { cData = JSON.parse(cData); } catch (e) { }
      }

      document.getElementById('nc-id').value = id || '';

      const dynContainer = document.getElementById('client-modal-dynamic-fields');
      dynContainer.innerHTML = currentClientFields.map(f => {
        const val = cData[f.id] || '';

        if (f.id === 'beszelgetes_naplo') {
          return `<div class="form-group" style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
                    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:8px;font-weight:500">${esc(f.name)}</label>
                    <textarea id="nc-dyn-${f.id}" class="settings-textarea" style="display:none; min-height:260px; font-family: 'Inter', Arial, sans-serif; font-size:12px; line-height:1.5;">${esc(val)}</textarea>
                    ${val ?
              `<button type="button" onclick="document.getElementById('nc-dyn-${f.id}').style.display='block'; this.style.display='none';" style="background:rgba(0,212,200,0.1); border:1px solid var(--accent); color:var(--accent); border-radius:8px; padding:10px 14px; font-size:12px; font-weight:600; cursor:pointer; width:100%; transition:all 0.2s;"> Beszélgetések megtekintése</button>`
              : `<div style="font-size:11px; color:var(--text-muted); padding:6px 0;">Még nincs előzmény...</div><textarea id="nc-dyn-${f.id}" style="display:none"></textarea>`
            }
                  </div>`;
        }

        return `<div class="form-group">
                <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:500">${esc(f.name)}</label>
                <input id="nc-dyn-${f.id}" class="form-input" placeholder="${esc(f.name)}" value="${esc(val)}">
              </div>`;
      }).join('');

      document.getElementById('client-modal-title').innerText = id ? 'Ügyfél szerkesztése' : 'Új ügyfél';
      document.getElementById('client-modal').style.display = 'flex';
    }

    function closeClientModal() {
      document.getElementById('client-modal').style.display = 'none';
    }

    async function submitClient() {
      const id = document.getElementById('nc-id').value;

      let custom_data = {};
      currentClientFields.forEach(f => {
        const el = document.getElementById('nc-dyn-' + f.id);
        if (el) custom_data[f.id] = el.value.trim();
      });

      try {
        const payload = { custom_data };
        if (id) {
          await authFetch(`/admin/api/clients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          await authFetch('/admin/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        closeClientModal();
        loadKanban();
        loadClientsTable();
      } catch (e) {
        alert('Hiba: ' + e.message);
      }
    }

    // ── CLIENT FIELDS MANAGEMENT ───────────────────────────────────────────────
    function openClientFieldsModal() {
      renderClientFieldsModal();
      document.getElementById('fields-modal').style.display = 'flex';
    }

    function closeClientFieldsModal() {
      document.getElementById('fields-modal').style.display = 'none';
      currentClientFields = [];
      loadClientsTable();
      loadKanban();
    }

    async function renderClientFieldsModal() {
      await initClientFields();
      const list = document.getElementById('fields-list');
      list.innerHTML = currentClientFields.map(f => `
     <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:var(--bg3); border-radius:10px; margin-bottom:8px;">
        <div style="font-weight:600; font-size:14px; color:var(--text);">${esc(f.name)}</div>
        <div style="display:flex; gap:6px;">
            <button onclick="editClientField('${f.id}', '${esc(f.name).replace(/'/g, "\\'")}')" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);cursor:pointer;padding:6px 8px;display:flex;align-items:center;transition:all 0.15s;" title="Átnevezés" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
            <button onclick="deleteClientField('${f.id}')" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);cursor:pointer;padding:6px 8px;display:flex;align-items:center;transition:all 0.15s;" title="Törlés" onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.06)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)';this.style.background='none'"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
        </div>
     </div>
  `).join('');
    }

    async function promptAddClientField() {
      const name = prompt("Új mező megjelenítési neve (pl. Cégnév):");
      if (!name) return;
      const idStr = name.trim().toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
      if (!idStr) { alert("Érvénytelen azonosító"); return; }
      const order_index = currentClientFields.length > 0 ? Math.max(...currentClientFields.map(c => c.order_index)) + 1 : 1;
      const req = { id: idStr, name: name.trim(), order_index: order_index };
      try {
        const res = await authFetch('/admin/api/client_fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        if (!res.ok) { alert("Hiba: Már létezik ilyen mező azonosító vagy belső hiba."); return; }
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function editClientField(id, oldName) {
      const name = prompt("Mező új neve:", oldName);
      if (!name || name.trim() === oldName) return;
      const req = { name: name.trim() };
      try {
        await authFetch(`/admin/api/client_fields/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    // ── No-Show manuális jelölés a naptárból ──
    async function markNoShow(eventId, email, attendeeName) {
      if (!confirm('Biztosan "nem jelent meg" (no-show) jelöléssel látod el ezt az ügyfelet?')) return;
      
      // Load clients if needed
      if (!window.kanbanData || window.kanbanData.length === 0) {
        try {
          const res = await authFetch('/admin/api/clients');
          const data = await res.json();
          window.kanbanData = data.clients || [];
        } catch(e) { console.error(e); return; }
      }
      
      // Find client by email or name
      let foundClient = null;
      if (email) {
        foundClient = window.kanbanData.find(c => {
          let cd = c.custom_data;
          if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
          return (cd?.email || c.email || '').toLowerCase() === email.toLowerCase();
        });
      }
      if (!foundClient && attendeeName) {
        foundClient = window.kanbanData.find(c => {
          let cd = c.custom_data;
          if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
          const cn = (cd?.nev || cd?.name || cd?.['név'] || c.name || '').toLowerCase().trim();
          return cn && cn === attendeeName.toLowerCase().trim();
        });
      }
      
      if (!foundClient) {
        showToast('error', 'Nem található ügyfél ehhez az időponthoz');
        return;
      }
      
      let cd = foundClient.custom_data;
      if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
      const tags = cd.tags || [];
      if (!tags.includes('no-show')) {
        tags.push('no-show');
        cd.tags = tags;
        try {
          const res = await authFetch(`/admin/api/clients/${foundClient.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ custom_data: cd })
          });
          const resData = await res.json();
          if (resData.ok) {
            showToast('success', `No-show címke hozzáadva: ${cd.nev || cd.name || attendeeName}`);
            loadCalendar(); // refresh
          }
        } catch(e) {
          showToast('error', 'Hiba a mentés során');
        }
      } else {
        showToast('info', 'Ez az ügyfél már no-show jelöléssel rendelkezik');
      }
    }

    async function deleteClientField(id) {
      if (!confirm("Biztosan törlöd ezt a mezőt? Ezzel nem vesznek el az eddig elmentett adatok az adatbázisból, de az űrlapokból és a táblázatból eltűnik a rovat.")) return;
      try {
        await authFetch(`/admin/api/client_fields/${id}`, { method: 'DELETE' });
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function deleteClient(id) {
      if (!confirm('Biztosan törlöd ezt az ügyfelet?')) return;
      try {
        const res = await authFetch(`/admin/api/clients/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Hiba történt a törlés során');
        loadKanban();
        const clientsView = document.getElementById('view-clients');
        if (clientsView && clientsView.style.display !== 'none') {
          loadClientsTable();
        }
      } catch (e) {
        alert('Törlési hiba: ' + e.message);
      }
    }
