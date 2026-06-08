    // Customer Center JS

    function openSecurityPasswordModal() {
      document.getElementById('security-pw-modal').classList.add('open');
      document.getElementById('sec-pw-current').value = '';
      document.getElementById('sec-pw-new').value = '';
      document.getElementById('sec-pw-confirm').value = '';
      setTimeout(() => document.getElementById('sec-pw-current').focus(), 200);
    }

    function closeSecurityPasswordModal() {
      document.getElementById('security-pw-modal').classList.remove('open');
    }

    async function submitSecurityPasswordChange() {
      const current = document.getElementById('sec-pw-current').value;
      const newPw = document.getElementById('sec-pw-new').value;
      const confirm = document.getElementById('sec-pw-confirm').value;
      if (!current || !newPw) {
        alert('Mindkét mezőt ki kell tölteni!');
        return;
      }
      if (newPw.length < 4) {
        alert('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!');
        return;
      }
      if (newPw !== confirm) {
        alert('Az új jelszavak nem egyeznek!');
        return;
      }
      try {
        const res = await authFetch('/admin/api/users/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: current, new_password: newPw })
        });
        const d = await res.json();
        if (!res.ok) {
          alert(d.detail || 'Hiba történt a jelszó módosítása során.');
          return;
        }
        closeSecurityPasswordModal();
        // Update the "last modified" text
        const now = new Date();
        const dateStr = now.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('security-pw-last').textContent = 'Utolsó módosítás: ' + dateStr;
        // Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:24px;right:24px;background:linear-gradient(135deg,#1ceee0,#0dbcb4);color:#082432;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;font-family:Inter,sans-serif;z-index:9999;box-shadow:0 8px 24px rgba(28,238,224,0.3);animation:securityModalIn 0.3s ease;display:flex;align-items:center;gap:10px;';
        toast.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:18px;height:18px;"><polyline points="20 6 9 17 4 12"/></svg> Jelszó sikeresen módosítva!';
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
      } catch (e) {
        alert('Hálózati hiba: ' + e.message);
      }
    }

    // Close security modal on overlay click
    document.addEventListener('click', function(e) {
      if (e.target.id === 'security-pw-modal') closeSecurityPasswordModal();
      if (e.target.id === 'create-user-modal') closeCreateUserModal();
    });
    // Close security modal on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('security-pw-modal').classList.contains('open')) {
        closeSecurityPasswordModal();
      }
    });

    function openCreateUserModal() {
      document.getElementById('new-user-fullname').value = '';
      document.getElementById('new-user-username').value = '';
      document.getElementById('new-user-email').value = '';
      document.getElementById('new-user-password').value = '';
      document.getElementById('new-user-role').value = 'member';
      document.getElementById('create-user-modal').classList.add('open');
    }
    function closeCreateUserModal() {
      document.getElementById('create-user-modal').classList.remove('open');
    }

    async function submitCreateUser() {
      const full_name = document.getElementById('new-user-fullname').value.trim();
      const username = document.getElementById('new-user-username').value.trim();
      const email = document.getElementById('new-user-email').value.trim();
      const password = document.getElementById('new-user-password').value;
      const role = document.getElementById('new-user-role').value;
      if (!full_name || !username || !password) { alert('Teljes név, felhasználónév és jelszó kötelező!'); return; }
      if (password.length < 4) { alert('A jelszónak legalább 4 karakter hosszúnak kell lennie!'); return; }
      try {
        const res = await authFetch('/admin/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, role, full_name })
        });
        if (!res.ok) { const d = await res.json(); alert(d.detail || 'Hiba'); return; }
        closeCreateUserModal();
        loadUsersTable();
      } catch(e) { alert('Hiba a felhasználó létrehozásakor'); }
    }

    async function changeOwnPassword() {
      const current = document.getElementById('pw-current').value;
      const newPw = document.getElementById('pw-new').value;
      if (!current || !newPw) { alert('Mindkét mezőt ki kell tölteni!'); return; }
      if (newPw.length < 4) { alert('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!'); return; }
      try {
        const res = await authFetch('/admin/api/users/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: current, new_password: newPw })
        });
        const d = await res.json();
        if (!res.ok) { alert(d.detail || 'Hiba'); return; }
        alert('Jelszó sikeresen módosítva!');
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
      } catch(e) { alert('Hiba a jelszó módosításakor'); }
    }

    // Sidebar password change (for members)
    function openSidebarPasswordModal() {
      document.getElementById('sidebar-pw-current').value = '';
      document.getElementById('sidebar-pw-new').value = '';
      document.getElementById('sidebar-pw-modal').style.display = 'flex';
    }
    function closeSidebarPasswordModal() {
      document.getElementById('sidebar-pw-modal').style.display = 'none';
    }
    async function submitSidebarPasswordChange() {
      const current = document.getElementById('sidebar-pw-current').value;
      const newPw = document.getElementById('sidebar-pw-new').value;
      if (!current || !newPw) { alert('Mindkét mezőt ki kell tölteni!'); return; }
      if (newPw.length < 4) { alert('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!'); return; }
      try {
        const res = await authFetch('/admin/api/users/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: current, new_password: newPw })
        });
        const d = await res.json();
        if (!res.ok) { alert(d.detail || 'Hiba'); return; }
        alert('Jelszó sikeresen módosítva!');
        closeSidebarPasswordModal();
      } catch(e) { alert('Hiba a jelszó módosításakor'); }
    }

    // ── CSAPAT (Team) management ─────────────────────────────────────
    async function loadUsersTable() {
      try {
        const res = await authFetch('/admin/api/users');
        const json = await res.json();
        const users = json.data || [];
        const container = document.getElementById('team-members-list');
        // Legacy element compatibility
        const tbody = document.getElementById('users-table-body');
        if (!users.length) {
          if (container) container.innerHTML = '<div style="padding:32px; text-align:center; color:#6b7280; font-size:13px;">Nincsenek felhasználók.</div>';
          if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#6b7280;">Nincsenek felhasználók.</td></tr>';
          return;
        }
        // Render Accounty-style member cards
        if (container) {
          container.innerHTML = users.map(u => {
            const nameParts = (u.full_name || u.username || '?').trim().split(/\s+/);
            const initials = nameParts.length >= 2 ? (nameParts[0][0] + nameParts[nameParts.length-1][0]).toUpperCase() : (u.full_name || u.username || '?').substring(0,2).toUpperCase();
            const isSelf = u.username === currentUser;
            const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString('hu-HU') : null;
            const meta = u.email ? u.email : (lastLogin ? 'Utolsó belépés: ' + lastLogin : u.username);
            const roleBadgeClass = u.role === 'admin' ? 'admin' : (u.role === 'manager' ? 'manager' : 'member');
            const roleBadgeText = u.role === 'admin' ? 'ADMIN' : (u.role === 'manager' ? 'MANAGER' : 'MEMBER');
            const actions = !isSelf ? `
              <div class="team-actions">
                <select onchange="changeUserRole(${u.id}, this.value)">
                  <option value="member" ${u.role==='member'?'selected':''}>Member</option>
                  <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
                  <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                </select>
                <button class="team-delete-btn" onclick="deleteUser(${u.id}, '${u.username}')" title="Törlés">
                  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:15px;height:15px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>` : '';
            return `<div class="team-member-row">
              <div class="team-avatar">${initials}</div>
              <div class="team-info">
                <div class="team-name">${u.full_name || u.username}${isSelf ? '<span class="team-self">(te)</span>' : ''}</div>
                <div class="team-meta">${meta}</div>
              </div>
              <span class="team-role-badge ${roleBadgeClass}">${roleBadgeText}</span>
              ${actions}
              <svg class="team-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`;
          }).join('');
          // Also sync to beallitasok page team list
          var beallitasokList = document.getElementById('beallitasok-team-members-list');
          if (beallitasokList) beallitasokList.innerHTML = container.innerHTML;
        }

      } catch(e) {
        if (e.message !== 'Unauthorized') {
          console.error('Users load error:', e);
        }
      }
    }

    async function changeUserRole(userId, newRole) {
      try {
        const res = await authFetch(`/admin/api/users/${userId}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) { const d = await res.json(); alert(d.detail || 'Hiba'); loadUsersTable(); return; }
        loadUsersTable();
      } catch(e) { alert('Hiba a szerepkör módosításakor'); }
    }

    async function deleteUser(userId, username) {
      if (!confirm(`Biztosan törlöd a(z) "${username}" felhasználót?`)) return;
      try {
        const res = await authFetch(`/admin/api/users/${userId}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json(); alert(d.detail || 'Hiba'); return; }
        loadUsersTable();
      } catch(e) { alert('Hiba a törléskor'); }
    }


        function switchCustomerView(viewId, btn) {
      document.querySelectorAll('.customer-view').forEach(el => el.style.display = 'none');
      document.querySelectorAll('#page-interactions .view-btn').forEach(el => {
        el.classList.remove('active');
      });

      const viewEl = document.getElementById('view-' + viewId);
      if (viewEl) viewEl.style.display = 'block';

      if (btn) {
        btn.classList.add('active');
      }

      // Update sidebar sub-item highlighting
      document.querySelectorAll('.nav-sub-item').forEach(n => n.classList.remove('active'));
      const subNav = document.getElementById('nav-sub-' + viewId);
      if (subNav) subNav.classList.add('active');

      // Load data dynamically
      if (viewId === 'kanban') loadKanban();
      if (viewId === 'clients') loadClientsTable();
      if (viewId === 'interactions') loadInteractions();
      if (viewId === 'emails') loadEmails();
      if (viewId === 'sessions') loadSessions();
    }

        let lastActiveCustomerView = 'clients';

    
    async function viewFullLogForClient() {
      const cData = window.currentClientDataForLog;
      if (!cData) return alert('Nincs kiválasztva ügyfél.');
      
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const client = data.clients.find(c => 
          (cData.id && c.id == cData.id) || 
          (cData.email && c.custom_data && c.custom_data.includes(cData.email)) ||
          (cData.name && c.name && c.name.toLowerCase() === cData.name.toLowerCase())
        );
        if (client && client.custom_data) {
          let customObj = typeof client.custom_data === 'string' ? JSON.parse(client.custom_data) : client.custom_data;
          let log = customObj.beszelgetes_naplo || 'Nincs rögzített beszélgetés napló ehhez az ügyfélhez.';
          openLogModal(btoa(encodeURIComponent(log)), cData.name, 'Rendszer', '');
        } else {
          alert('Nem található részletes napló.');
        }
      } catch (e) {
        console.error(e);
        alert('Hiba a napló lekérésekor.');
      }
    }

    let _clientDetailSource = 'clients'; // 'clients' or 'interactions'

    async function openClientDetails(clientData, source) {
      _clientDetailSource = source || 'clients';
      const backText = document.getElementById('cd-back-text');
      if (backText) {
        backText.textContent = _clientDetailSource === 'interactions' ? 'Vissza az interakciós listához' : 'Vissza az ügyféllistához';
      }
      const cleanStr = (str) => {
        if (!str) return '';
        return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      };

      function parseBeszelgetesNaplo(naploText) {
        if (!naploText) return [];
        const rows = [];
        const parts = naploText.split(/\[(\d{4}[-./]\d{2}[-./]\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\]/);
        for (let i = 1; i < parts.length; i += 2) {
          const timestampStr = parts[i];
          const content = parts[i + 1] ? parts[i + 1].trim() : '';
          if (!content) continue;
          
          const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length === 0) continue;
          
          const firstLine = lines[0];
          let messageText = content;
          
          let direction = 'Bejövő';
          let channel = 'WhatsApp';
          let topic = 'Chat üzenet';
          
          if (firstLine.startsWith('Ügyfél')) {
            direction = 'Bejövő';
            const match = firstLine.match(/\(([^)]+)\)/);
            if (match) channel = match[1];
            messageText = content.replace(/^Ügyfél\s*\([^)]+\):\s*/, '');
          } else if (firstLine.startsWith('AI Válasz') || firstLine.startsWith('Rendszer')) {
            direction = 'Kimenő';
            channel = firstLine.startsWith('AI Válasz') ? 'AI Asszisztens' : 'Rendszer';
            topic = 'AI válasz';
            messageText = content.replace(/^(AI Válasz|Rendszer):\s*/, '');
          } else if (firstLine.startsWith('E-mail')) {
            channel = 'Email';
            direction = 'Bejövő';
            messageText = content.replace(/^E-mail:\s*/, '');
          }
          
          const dateIso = timestampStr.replace(' ', 'T') + ':00';
          
          rows.push({
            date: dateIso,
            channel: channel,
            direction: direction,
            type: channel.toLowerCase(),
            topic: topic,
            summary: messageText.length > 80 ? messageText.substring(0, 80) + '...' : messageText,
            result: 'Lezárt',
            alert_tags: [],
            status: 'lezárt',
            handover: 'Nincs teendő',
            isFromNaplo: true
          });
        }
        return rows;
      }

      if (clientData) {
        // Ensure window.kanbanData is loaded
        if (!window.kanbanData || window.kanbanData.length === 0) {
          try {
            const res = await authFetch('/admin/api/clients');
            const data = await res.json();
            window.kanbanData = data.clients || [];
          } catch (e) {
            console.error("Hiba az ügyfelek betöltésekor:", e);
          }
        }

        // Enrich with custom_data from window.kanbanData if missing or by matching
        if (window.kanbanData) {
          // Robust loose match by stringified ID
          let fullClient = window.kanbanData.find(c => c.id && clientData.id && String(c.id) === String(clientData.id));
          if (!fullClient && clientData.name) {
            const cleanTargetName = cleanStr(clientData.name);
            fullClient = window.kanbanData.find(c => c.name && cleanStr(c.name) === cleanTargetName);
          }
          if (fullClient) {
            clientData.id = fullClient.id;
            clientData.custom_data = fullClient.custom_data;
            if (fullClient.email) clientData.email = fullClient.email;
            if (fullClient.phone) clientData.phone = fullClient.phone;
          }
        }

        // Parse custom_data if it is a serialized string
        if (clientData.custom_data && typeof clientData.custom_data === 'string') {
          try {
            clientData.custom_data = JSON.parse(clientData.custom_data);
          } catch (e) {
            clientData.custom_data = {};
          }
        }
        
        // Sync fields from custom_data if available (prioritizing clean database values over parsed DOM elements)
        if (clientData.custom_data) {
          const realName = clientData.custom_data.name || clientData.custom_data.Name || clientData.custom_data.nev || clientData.custom_data['név'] || clientData.custom_data['Név'];
          const realEmail = clientData.custom_data.email || clientData.custom_data.Email;
          const realPhone = clientData.custom_data.telefonszam || clientData.custom_data.phone || clientData.custom_data.telefon;
          
          if (realName) clientData.name = realName;
          if (realEmail) clientData.email = realEmail;
          if (realPhone) clientData.phone = realPhone;
        }
      }

      window.currentClientDataForLog = clientData;

      // Save current active view
      document.querySelectorAll('.customer-view').forEach(el => {
        if (el.style.display !== 'none' && el.id !== 'view-client-details') {
          lastActiveCustomerView = el.id.replace('view-', '');
        }
        el.style.display = 'none';
      });

      // Hide view switcher
      const switcher = document.querySelector('.view-switcher-container');
      if (switcher) switcher.style.display = 'none';

      // Show details view
      document.getElementById('view-client-details').style.display = 'block';

      if (clientData) {
        document.getElementById('cd-name').innerText = clientData.name || 'Ismeretlen ügyfél';
        
        // Status Badge
        let st = (clientData.status || 'Új ügyfél').toUpperCase();
        if (st === 'UJ') st = 'ÚJ ÜGYFÉL';
        document.getElementById('cd-status-badge').innerText = st;

        // Render client tags from custom_data
        renderClientTags();

        const emailEl = document.getElementById('cd-email');
        emailEl.innerText = clientData.email || 'Nincs megadva';

        const phoneEl = document.getElementById('cd-phone');
        phoneEl.innerText = clientData.phone || 'Nincs megadva';

        document.getElementById('cd-id').innerText = clientData.id ? `Eaisydesk azonosító: ${clientData.id}` : `Eaisydesk azonosító: PAC-${Math.floor(100000 + Math.random() * 900000)}`;

        let createdDateStr = 'N/A';
        if (clientData.created_at) {
            createdDateStr = clientData.created_at.split('T')[0].replace(/-/g, '. ') + '.';
        } else {
            createdDateStr = new Date().toISOString().split('T')[0].replace(/-/g, '. ') + '.';
        }
        document.getElementById('cd-reg-date').innerText = createdDateStr;
        
        
        const mainNotesEl = document.getElementById('cd-main-notes');
        if (mainNotesEl) {
            mainNotesEl.value = (clientData.custom_data && clientData.custom_data.notes) ? clientData.custom_data.notes : '';
        }
        document.getElementById('cd-total-interactions').innerText = 'Összes interakció: Betöltés...';

        const aptContainerInit = document.getElementById('cd-appointments');
        if (aptContainerInit) {
            aptContainerInit.innerHTML = '<div style="font-size:13px; color:#9ca3af; font-style:italic;">Betöltés...</div>';
        }

        document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;"><div class="spinner"></div>Betöltés...</td></tr>`;
        document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;"><div class="spinner"></div>Betöltés...</td></tr>`;

        authFetch('/admin/api/sessions/summary?limit=500')
          .then(res => res.json())
          .then(data => {
            const sessions = data.sessions || [];
            let clientInteractions = [];
            sessions.forEach(s => {
              const cleanCName = cleanStr(s.participant || s.client_name);
              const cleanClientName = cleanStr(clientData.name);
              const cleanClientEmail = cleanStr(clientData.email);
              
              const isMatch = (cleanClientName && cleanCName === cleanClientName) ||
                (cleanClientEmail && s.session_id.toLowerCase().includes(cleanClientEmail)) ||
                (clientData.custom_data && clientData.custom_data.messenger_id && s.session_id.includes(clientData.custom_data.messenger_id));
              if (isMatch) {
                (s.interactions || []).forEach(r => {
                  clientInteractions.push({
                    date: r.created_at || s.started_at,
                    channel: (r.type && r.type.toLowerCase().includes('email')) || (s.room_name && s.room_name.toLowerCase().includes('email')) || (s.session_id && s.session_id.startsWith('reminder_')) ? 'Email' :
                             ((r.type && r.type.toLowerCase().includes('messenger')) || (s.room_name && s.room_name.toLowerCase().includes('messenger')) ? 'Messenger' :
                              ((r.type && r.type.toLowerCase().includes('instagram')) || (s.room_name && s.room_name.toLowerCase().includes('instagram')) ? 'Instagram' : 'Telefon')),
                    direction: r.direction || 'Bejövő',
                    type: r.type || '-',
                    topic: r.topic || '-',
                    summary: r.summary || '-',
                    result: r.result || '',
                    alert_tags: r.alert_tags || [],
                    status: (r.approval_status || 'lezárt'),
                    handover: r.handover_reason || 'Nincs teendő',
                    ai_draft_response: r.ai_draft_response || null,
                    approval_status: r.approval_status || null,
                    interactionId: r.id || null,
                    topic_raw: r.topic || '',
                    summary_raw: r.summary || ''
                  });
                });
              }
            });

            // If we have custom_data.beszelgetes_naplo, parse it and append to clientInteractions
            if (clientData.custom_data && clientData.custom_data.beszelgetes_naplo) {
              const naploInteractions = parseBeszelgetesNaplo(clientData.custom_data.beszelgetes_naplo);
              naploInteractions.forEach(ni => {
                const isDuplicate = clientInteractions.some(ci => {
                  return ci.date.substring(0, 16) === ni.date.substring(0, 16) && 
                         ci.channel.toLowerCase() === ni.channel.toLowerCase();
                });
                if (!isDuplicate) {
                  clientInteractions.push(ni);
                }
              });
            }

            clientInteractions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            document.getElementById('cd-total-interactions').innerText = `Összes interakció: ${clientInteractions.length}`;
            
            // Extract and render past appointments
            const appointmentRegex1 = /időpontot foglalt:\s*(.*?)(?:,|$)/i;
            const appointmentRegex2 = /lefoglalva:.*?,?\s*(.*?)-kor/i;
            
            window.currentClientAppointments = [];
            
            clientInteractions.forEach(r => {
                const t = (r.type || '').toLowerCase();
                const topic = (r.topic || '').toLowerCase();
                if (t.includes('foglalás') || topic.includes('időpont')) {
                    let aptDate = r.date ? r.date.substring(0, 16).replace('T', ' ') : 'Ismeretlen időpont';
                    
                    const m1 = (r.summary || '').match(appointmentRegex1);
                    if (m1) {
                        aptDate = m1[1];
                    } else {
                        const m2 = (r.result || '').match(appointmentRegex2);
                        if (m2) aptDate = m2[1];
                    }
                    window.currentClientAppointments.push(aptDate);
                }
            });
            
            // Deduplicate local interaction appointments
            window.currentClientAppointments = [...new Set(window.currentClientAppointments)];
            
            // Query real calendar events as the source of truth for bookings
            authFetch('/admin/api/calendar')
              .then(res => res.json())
              .then(calData => {
                console.log("[Calendar Match] Start matching for", clientData.name, clientData.email);
                const events = calData.events || [];
                console.log("[Calendar Match] Total calendar events fetched:", events.length);
                
                events.forEach(ev => {
                  try {
                    const cleanClientEmail = cleanStr(clientData.email);
                    const cleanClientName = cleanStr(clientData.name);
                    const cleanEvEmail = cleanStr(ev.attendee_email);
                    const cleanEvAttendee = cleanStr(ev.attendee);
                    const cleanEvTitle = cleanStr(ev.title);
                    
                    // Incredibly robust matching logic
                    let match = false;
                    if (cleanClientEmail) {
                      if (cleanEvEmail && cleanClientEmail === cleanEvEmail) match = true;
                      if (cleanEvAttendee && cleanEvAttendee.includes(cleanClientEmail)) match = true;
                    }
                    if (cleanClientName) {
                      if (cleanEvAttendee && cleanEvAttendee.includes(cleanClientName)) match = true;
                      if (cleanEvTitle && cleanEvTitle.includes(cleanClientName)) match = true;
                    }
                    
                    if (match) {
                      console.log("[Calendar Match] FOUND MATCH!", ev.title, ev.start_dt);
                      
                      if (ev.start_dt) {
                        const utcIso = ev.start_dt.includes('Z') || ev.start_dt.includes('+') ? ev.start_dt : ev.start_dt + 'Z';
                        const d = new Date(utcIso);
                        let formatted = '';
                        if (!isNaN(d.getTime())) {
                          formatted = d.getFullYear() + '. ' + 
                                      String(d.getMonth() + 1).padStart(2, '0') + '. ' + 
                                      String(d.getDate()).padStart(2, '0') + '. ' + 
                                      String(d.getHours()).padStart(2, '0') + ':' + 
                                      String(d.getMinutes()).padStart(2, '0');
                        } else {
                          const parts = ev.start_dt.split('T');
                          const datePart = parts[0].replace(/-/g, '. ');
                          const timePart = parts[1] ? parts[1].substring(0, 5) : '00:00';
                          formatted = datePart + '. ' + timePart;
                        }
                        window.currentClientAppointments.push(formatted);
                      }
                    }
                  } catch (innerErr) {
                    console.error("[Calendar Match] Error processing calendar event:", ev, innerErr);
                  }
                });
                
                // Deduplicate and sort descending (newest first)
                window.currentClientAppointments = [...new Set(window.currentClientAppointments)];
                window.currentClientAppointments.sort((a, b) => b.localeCompare(a));
                
                let appointmentsHtml = '';
                const recentApts = window.currentClientAppointments.slice(0, 3);
                recentApts.forEach(aptDate => {
                    appointmentsHtml += `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                      <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      ${aptDate}
                    </div>`;
                });
                
                const aptContainer = document.getElementById('cd-appointments');
                if (aptContainer) {
                    if (appointmentsHtml === '') {
                        aptContainer.innerHTML = '<div style="font-size:13px; color:#9ca3af; font-style:italic;">Nincs korábbi foglalás.</div>';
                    } else {
                        aptContainer.innerHTML = appointmentsHtml;
                    }
                }
                
                const allBtn = document.getElementById('cd-all-appointments-btn');
                if (allBtn) {
                    if (window.currentClientAppointments && window.currentClientAppointments.length > 0) {
                        allBtn.style.display = 'block';
                    } else {
                        allBtn.style.display = 'none';
                    }
                }
                
                // Dynamic status badge update based on appointments count
                const badgeEl = document.getElementById('cd-status-badge');
                if (badgeEl && (badgeEl.innerText === 'ÚJ ÜGYFÉL' || badgeEl.innerText === 'UJ')) {
                  if (window.currentClientAppointments && window.currentClientAppointments.length > 1) {
                    badgeEl.innerText = 'VISSZATÉRŐ ÜGYFÉL';
                  } else {
                    badgeEl.innerText = 'ÚJ ÜGYFÉL';
                  }
                }
              })
              .catch(err => {
                console.error("Hiba a naptári időpontok letöltésekor:", err);
                
                // Fallback to text parsing
                window.currentClientAppointments.sort((a, b) => b.localeCompare(a));
                
                let appointmentsHtml = '';
                const recentApts = window.currentClientAppointments.slice(0, 3);
                recentApts.forEach(aptDate => {
                    appointmentsHtml += `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                      <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      ${aptDate}
                    </div>`;
                });
                
                const aptContainer = document.getElementById('cd-appointments');
                if (aptContainer) {
                    if (appointmentsHtml === '') {
                        aptContainer.innerHTML = '<div style="font-size:13px; color:#9ca3af; font-style:italic;">Nincs korábbi foglalás.</div>';
                    } else {
                        aptContainer.innerHTML = appointmentsHtml;
                    }
                }
                
                const allBtn = document.getElementById('cd-all-appointments-btn');
                if (allBtn) {
                    if (window.currentClientAppointments && window.currentClientAppointments.length > 0) {
                        allBtn.style.display = 'block';
                    } else {
                        allBtn.style.display = 'none';
                    }
                }
                
                // Dynamic status badge update: ÚJ / VISSZATÉRŐ / INAKTÍV
                const badgeEl = document.getElementById('cd-status-badge');
                if (badgeEl) {
                  const aptCnt = window.currentClientAppointments ? window.currentClientAppointments.length : 0;
                  // Check inactivity from client interactions
                  let lastIntDate = null;
                  if (clientData.custom_data && clientData.custom_data.beszelgetes_naplo) {
                    const logText = clientData.custom_data.beszelgetes_naplo;
                    const dateMatches = logText.match(/\[(\d{4}[-./]\d{2}[-./]\d{2}\s+\d{2}:\d{2})/g);
                    if (dateMatches && dateMatches.length > 0) {
                      const last = dateMatches[dateMatches.length - 1].replace('[', '');
                      lastIntDate = new Date(last.replace(/[./]/g, '-'));
                    }
                  }
                  // Also check from clientInteractions
                  if (clientInteractions.length > 0) {
                    const sorted = [...clientInteractions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    if (sorted[0] && sorted[0].date) {
                      const sessDate = new Date(sorted[0].date);
                      if (!lastIntDate || sessDate > lastIntDate) lastIntDate = sessDate;
                    }
                  }
                  const INACT_DAYS = window._inactivityDays || 60;
                  const isInactive = (!lastIntDate && aptCnt === 0) || (lastIntDate && (Date.now() - lastIntDate.getTime()) / (1000*60*60*24) > INACT_DAYS);
                  
                  if (isInactive) {
                    badgeEl.innerText = '🕒 INAKTÍV';
                    badgeEl.style.background = 'rgba(107,114,128,0.1)';
                    badgeEl.style.color = '#6b7280';
                  } else if (aptCnt > 1) {
                    badgeEl.innerText = 'VISSZATÉRŐ ÜGYFÉL';
                  } else {
                    badgeEl.innerText = 'ÚJ ÜGYFÉL';
                  }
                }
              });
            
            // Filter current vs past
            const currentInts = [];
            const pastInts = [];
            
            clientInteractions.forEach(r => {
                const stLower = (r.status || '').toLowerCase();
                const hoLower = (r.handover || '').toLowerCase();
                
                // Ha a státusz nyitott, folyamatban lévő, várakozik jóváhagyásra, vagy ha a handover (teendő) nem üres
                let isCurrent = false;
                if (stLower === 'nyitott' || stLower === 'pending' || stLower === 'várakozik jóváhagyásra') {
                    isCurrent = true;
                }
                if (hoLower && hoLower !== 'nincs teendő' && hoLower !== '-' && hoLower !== 'null') {
                    isCurrent = true; // van teendő
                }
                
                // DE ha már lezárt, akkor korábbi (még akkor is ha volt teendő)
                if (stLower === 'lezárt' || stLower === 'lezárva' || stLower === 'siker' || stLower === 'kuka') {
                    isCurrent = false;
                }
                
                if (isCurrent) {
                    currentInts.push(r);
                } else {
                    pastInts.push(r);
                }
            });

            window.currentClientInts = currentInts;
            window.pastClientInts = pastInts;

            const renderRow = (r, isCurrent, idx) => {
              let dStr = '-';
              let tStr = '-';
              if (r.date) {
                const pt = r.date.replace('T', ' ').split(' ');
                dStr = pt[0].replace(/-/g, '. ');
                tStr = pt[1] ? pt[1].substring(0, 5) : '';
              }
              const isUrgent = (r.alert_tags && (r.alert_tags.includes('urgent') || r.alert_tags.includes('kiemelt')));
              
              const stText = isCurrent ? 'NYITOTT' : 'LEZÁRT';
              const stColor = isCurrent ? '#b45309' : '#047857';
              const stBg = isCurrent ? '#fef3c7' : '#d1fae5';
              
              const isBejovo = r.direction.toLowerCase() === 'bejövő' || r.direction.toLowerCase() === 'inbound';
              const dirColor = isBejovo ? '#3b82f6' : '#6b7280';
              const dirText = isBejovo ? 'Bejövő' : 'Kimenő';
              
              const actionContent = isCurrent 
                ? `<input type="checkbox" style="cursor:pointer; width:16px; height:16px;" onclick="alert('Ez a funkció később kerül bekapcsolásra.')">` 
                : `<button onclick="viewFullLogForClient()" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;">Megtekintés</button>`;
              
              return `
                <tr ${isUrgent ? 'style="background-color:rgba(239, 68, 68, 0.05);"' : ''}>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text); font-weight:600;">${dStr}<br><span style="color:var(--text-muted);font-size:11px;font-weight:normal;">${tStr}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${esc(r.channel)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:${dirColor}; font-weight:600;">${dirText}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><span class="badge" style="background:#f3f4f6;color:#4b5563;font-weight:600;text-transform:uppercase;">${esc(r.topic)}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;">${((r.result || 'Válasz előkészítve').toLowerCase().includes('jóváhagyás') || (r.result || '').toLowerCase().includes('várakozik')) && r.ai_draft_response ? `<button onclick="openApprovalFromClientHistory('${isCurrent ? 'current' : 'past'}', ${idx})" style="background:rgba(251,191,36,0.12);color:#d97706;border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">⚠ ${esc(r.result || 'Várakozik jóváhagyásra')}</button>` : `<span style="color:#b45309; background:#fef3c7; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600;">${esc(r.result || 'Válasz előkészítve')}</span>`}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><span style="background:${stBg}; color:${stColor}; font-weight:bold; padding:4px 8px; border-radius:4px; font-size:11px;">${stText}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${esc(r.handover)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; text-align:center;">${actionContent}</td>
                </tr>
               `;
            };

            if (currentInts.length === 0) {
              document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">Nincsenek aktuális ügyek</td></tr>`;
            } else {
              document.getElementById('cd-history-body-current').innerHTML = currentInts.map((r, idx) => renderRow(r, true, idx)).join('');
            }
            
            if (pastInts.length === 0) {
              document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">Nincsenek korábbi interakciók</td></tr>`;
            } else {
              document.getElementById('cd-history-body-past').innerHTML = pastInts.map((r, idx) => renderRow(r, false, idx)).join('');
            }
          })
          .catch(err => {
            document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--red);">Hiba a betöltés során</td></tr>`;
            document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--red);">Hiba a betöltés során</td></tr>`;
          });
      }
    }
    
    function editClientProfile() {
        try {
            alert('JS fut');
            console.log('editClientProfile started');
            const data = window.currentClientDataForLog;
            if (!data) {
                alert('Nincs betöltve ügyfél adat (window.currentClientDataForLog üres).');
                return;
            }
            console.log('Client data:', data);
            
            const nameEl = document.getElementById('edit-profile-name');
            const phoneEl = document.getElementById('edit-profile-phone');
            const emailEl = document.getElementById('edit-profile-email');
            const notesEl = document.getElementById('edit-profile-notes');
            const modal = document.getElementById('edit-profile-modal');
            
            if (!nameEl || !phoneEl || !emailEl || !notesEl || !modal) {
                alert('Hiba: Nem található egy vagy több HTML elem a DOM-ban.');
                return;
            }
            
            nameEl.value = data.name || '';
            phoneEl.value = data.phone || '';
            emailEl.value = data.email || '';
            
            let notes = '';
            if (data.custom_data && data.custom_data.notes) {
                notes = data.custom_data.notes;
            }
            notesEl.value = notes;
            
            modal.style.display = 'flex';
        } catch (e) {
            alert('JS Hiba: ' + e.message);
        }
    }
    
    
    function quickSaveNotes(newNotes) {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        let updatedCustomData = data.custom_data ? JSON.parse(JSON.stringify(data.custom_data)) : {};
        updatedCustomData.name = data.name;
        updatedCustomData.email = data.email;
        updatedCustomData.phone = data.phone;
        updatedCustomData.notes = newNotes;
        
        const payload = {
            custom_data: updatedCustomData
        };
        
        authFetch(`/admin/api/clients/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.ok) {
                data.custom_data = updatedCustomData;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // CÍMKERENDSZER — Predefined Tags, Tag Picker, Tag Filter
    // ═══════════════════════════════════════════════════════════════════════════════

    const PREDEFINED_TAGS = [
      { name: 'árkérdés',       bg: '#fce4ec', color: '#c62828' },
      { name: 'kampány lead',   bg: '#e8f5e9', color: '#2e7d32' },
      { name: 'ajánlatkérés',   bg: '#fff3e0', color: '#e65100' },
      { name: 'törölt időpont', bg: '#fce4ec', color: '#c62828' },
      { name: 'no-show',        bg: '#fff8e1', color: '#f57f17' },
      { name: 'VIP',            bg: '#ede7f6', color: '#4527a0' },
    ];

    const GLOBAL_TAG_COLORS = {};
    PREDEFINED_TAGS.forEach(t => { GLOBAL_TAG_COLORS[t.name] = { bg: t.bg, color: t.color }; });

    function getTagColor(tagName) {
      return GLOBAL_TAG_COLORS[tagName] || { bg: '#f3f4f6', color: '#374151' };
    }

    function getCurrentClientTags() {
      const data = window.currentClientDataForLog;
      if (!data || !data.custom_data) return [];
      return data.custom_data.tags || [];
    }

    function renderClientTags() {
      const container = document.getElementById('cd-tags');
      if (!container) return;
      const tags = getCurrentClientTags();
      if (tags.length === 0) {
        container.innerHTML = '<span style="color:#9ca3af; font-size:12px; font-style:italic;">Nincs címke</span>';
        return;
      }
      container.innerHTML = tags.map(t => {
        const tc = getTagColor(t);
        return `<span style="background:${tc.bg};color:${tc.color};font-size:12px;padding:4px 10px;border-radius:16px;display:flex;align-items:center;gap:6px;font-weight:600;">
          ${esc(t)}
          <span onclick="event.stopPropagation();removeClientTag('${esc(t).replace(/'/g, "\\\\'")}')" style="cursor:pointer;font-size:10px;opacity:0.7;font-weight:bold;">&times;</span>
        </span>`;
      }).join('');
    }

    async function saveClientTags(tags) {
      const data = window.currentClientDataForLog;
      if (!data || !data.id) return;
      let updatedCustomData = data.custom_data ? JSON.parse(JSON.stringify(data.custom_data)) : {};
      updatedCustomData.tags = tags;
      const payload = { custom_data: updatedCustomData };
      try {
        const res = await authFetch(`/admin/api/clients/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resData = await res.json();
        if (resData.ok) {
          data.custom_data = updatedCustomData;
        }
      } catch (e) {
        console.error('Tag save error:', e);
      }
    }

    async function addClientTag(tagName) {
      const tags = getCurrentClientTags();
      if (tags.includes(tagName)) return;
      tags.push(tagName);
      await saveClientTags(tags);
      renderClientTags();
      renderTagPickerPredefined();
    }

    async function removeClientTag(tagName) {
      let tags = getCurrentClientTags();
      tags = tags.filter(t => t !== tagName);
      await saveClientTags(tags);
      renderClientTags();
      renderTagPickerPredefined();
    }

    function toggleTagPicker() {
      const picker = document.getElementById('cd-tag-picker');
      if (!picker) return;
      const isVisible = picker.style.display !== 'none';
      picker.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        renderTagPickerPredefined();
        document.getElementById('cd-tag-custom-input').value = '';
      }
    }

    function renderTagPickerPredefined() {
      const container = document.getElementById('cd-tag-picker-predefined');
      if (!container) return;
      const current = getCurrentClientTags();
      container.innerHTML = PREDEFINED_TAGS.map(pt => {
        const active = current.includes(pt.name);
        return `<button onclick="event.stopPropagation(); ${active ? "removeClientTag" : "addClientTag"}('${pt.name.replace(/'/g, "\\\\'")}')" style="
          display:flex; align-items:center; gap:8px; width:100%; padding:6px 8px; border:none;
          background:${active ? 'rgba(28,238,224,0.08)' : 'transparent'}; border-radius:6px; cursor:pointer;
          font-size:12px; font-weight:${active ? '700' : '500'}; color:${pt.color}; text-align:left;
          transition: background 0.15s;
        " onmouseover="this.style.background='${active ? 'rgba(28,238,224,0.12)' : '#f9fafb'}'" onmouseout="this.style.background='${active ? 'rgba(28,238,224,0.08)' : 'transparent'}'">
          <span style="width:16px;text-align:center;font-size:13px;">${active ? '✓' : ''}</span>
          <span style="background:${pt.bg};color:${pt.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${esc(pt.name)}</span>
        </button>`;
      }).join('');
    }

    function addCustomTag() {
      const input = document.getElementById('cd-tag-custom-input');
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      addClientTag(val);
      input.value = '';
    }

    // Close tag picker when clicking outside
    document.addEventListener('click', function(e) {
      const picker = document.getElementById('cd-tag-picker');
      const btn = document.getElementById('cd-tag-add-btn');
      if (picker && picker.style.display !== 'none') {
        if (!picker.contains(e.target) && e.target !== btn) {
          picker.style.display = 'none';
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // TAG FILTER BAR — Ügyféllista szűrő
    // ═══════════════════════════════════════════════════════════════════════════════

    let activeTagFilters = new Set();

    function renderTagFilterBar() {
      const bar = document.getElementById('tag-filter-bar');
      if (!bar) return;
      
      // Collect all unique tags from cached clients
      const allTags = new Set();
      (_cachedClientsData || []).forEach(c => {
        try {
          const co = c.custom_data ? JSON.parse(c.custom_data) : {};
          (co.tags || []).forEach(t => allTags.add(t));
        } catch(e) {}
      });
      
      // Merge predefined + any custom tags from clients
      const allUniqueTags = [...new Set([...PREDEFINED_TAGS.map(t => t.name), ...allTags])];
      
      if (allUniqueTags.length === 0) {
        bar.innerHTML = '';
        return;
      }

      const hasActive = activeTagFilters.size > 0;
      const activeCount = activeTagFilters.size;

      bar.innerHTML = `
        <div style="
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: 12px; padding: 10px 16px;
          ${hasActive ? 'border-color: var(--accent); box-shadow: 0 0 0 1px rgba(28,238,224,0.08);' : ''}
        ">
          <div style="display:flex; align-items:center; gap:6px; padding-right:10px; border-right:1px solid var(--border); margin-right:2px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${hasActive ? 'var(--accent)' : 'var(--text-muted)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            <span style="font-size:12px; font-weight:700; color:${hasActive ? 'var(--accent)' : 'var(--text-muted)'}; letter-spacing:0.3px;">Szűrés${hasActive ? ' (' + activeCount + ')' : ''}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            ${allUniqueTags.map(t => {
              const active = activeTagFilters.has(t);
              const tc = getTagColor(t);
              return `<button onclick="toggleTagFilter('${t.replace(/'/g, "\\\\\\\\'")}')" 
                onmouseenter="this.style.transform='translateY(-1px)';this.style.boxShadow='0 3px 8px rgba(0,0,0,0.12)'"
                onmouseleave="this.style.transform='';this.style.boxShadow='${active ? '0 0 12px ' + tc.color + '30, inset 0 0 0 1px ' + tc.color : 'none'}'"
                style="
                  background: ${active ? tc.color : 'transparent'};
                  color: ${active ? '#fff' : tc.color};
                  border: 1.5px solid ${active ? tc.color : tc.color + '40'};
                  padding: 5px 14px; border-radius: 20px; font-size: 11px;
                  font-weight: 600; cursor: pointer; transition: all 0.2s ease;
                  display: inline-flex; align-items: center; gap: 5px;
                  ${active ? 'box-shadow: 0 0 12px ' + tc.color + '30, inset 0 0 0 1px ' + tc.color + ';' : ''}
                  font-family: inherit; line-height: 1;
                ">${active ? '<span style="font-size:13px;">✓</span> ' : ''}${esc(t)}${active ? ' <span style="opacity:0.7;font-size:13px;margin-left:2px;">×</span>' : ''}</button>`;
            }).join('')}
          </div>
          ${hasActive ? `
            <button onclick="clearAllTagFilters()" style="
              margin-left:auto; background:transparent; border:1px solid var(--border);
              color:var(--text-muted); padding:4px 12px; border-radius:8px;
              font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s;
              font-family:inherit; display:flex; align-items:center; gap:4px;
            " onmouseenter="this.style.borderColor='#ef4444';this.style.color='#ef4444'" onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">
              <span style="font-size:12px;">✕</span> Összes törlése
            </button>
          ` : ''}
        </div>
      `;
    }

    function clearAllTagFilters() {
      activeTagFilters.clear();
      renderTagFilterBar();
      toggleTagFilter._skipToggle = true;
      // Re-show all rows
      const tbody = document.getElementById('clients-body');
      if (tbody) {
        tbody.querySelectorAll('tr').forEach(row => row.style.display = '');
      }
      if (_clientsViewMode === 'cards' && _cachedClientsData) {
        renderClientsCards(_cachedClientsData, _cachedStatusMap, _cachedCalendarEvents, _cachedLatestSession);
      }
    }

    function toggleTagFilter(tag) {
      if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
      else activeTagFilters.add(tag);
      renderTagFilterBar();
      // Re-filter clients
      if (_cachedClientsData) {
        let filtered = [..._cachedClientsData];
        if (activeTagFilters.size > 0) {
          filtered = filtered.filter(c => {
            try {
              const co = c.custom_data ? JSON.parse(c.custom_data) : {};
              const clientTags = co.tags || [];
              return [...activeTagFilters].every(t => clientTags.includes(t));
            } catch(e) { return false; }
          });
        }
        // Re-render the current view with filtered data
        if (_clientsViewMode === 'cards') {
          renderClientsCards(filtered, _cachedStatusMap, _cachedCalendarEvents, _cachedLatestSession);
        } else {
          // For table view, hide/show rows
          const tbody = document.getElementById('clients-body');
          if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            const filteredIds = new Set(filtered.map(c => String(c.id)));
            rows.forEach(row => {
              const checkbox = row.querySelector('.client-checkbox');
              if (checkbox) {
                row.style.display = filteredIds.has(checkbox.value) ? '' : 'none';
              }
            });
          }
        }
      }
    }


    function saveClientProfile() {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        const btn = document.querySelector('#edit-profile-modal button:last-child');
        const oldText = btn.innerText;
        btn.innerText = 'Mentés...';
        btn.disabled = true;
        
        const newName = document.getElementById('edit-profile-name').value.trim();
        const newPhone = document.getElementById('edit-profile-phone').value.trim();
        const newEmail = document.getElementById('edit-profile-email').value.trim();
        const newNotes = document.getElementById('edit-profile-notes').value.trim();
        
        // Merge with existing custom_data to avoid losing tags etc.
        let updatedCustomData = data.custom_data ? JSON.parse(JSON.stringify(data.custom_data)) : {};
        updatedCustomData.name = newName;
        updatedCustomData.phone = newPhone;
        updatedCustomData.email = newEmail;
        updatedCustomData.notes = newNotes;
        
        const payload = {
            custom_data: updatedCustomData
        };
        
        authFetch(`/admin/api/clients/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(resData => {
            btn.innerText = oldText;
            btn.disabled = false;
            
            if (resData.ok) {
                document.getElementById('edit-profile-modal').style.display = 'none';
                // Update local data
                data.name = newName;
                data.phone = newPhone;
                data.email = newEmail;
                data.custom_data = updatedCustomData;
                
                // Refresh view
                openClientDetails(data);
                // Refresh list if needed (optional)
                if (typeof loadClients === 'function') loadClients();
            } else {
                alert('Hiba történt a mentés során.');
            }
        })
        .catch(err => {
            btn.innerText = oldText;
            btn.disabled = false;
            console.error(err);
            alert('Hiba történt a mentés során.');
        });
    }

    function closeClientDetails() {
      document.getElementById('view-client-details').style.display = 'none';

      if (_clientDetailSource === 'interactions') {
        showPage('interactions');
      } else {
        // Show view switcher
        const switcher = document.querySelector('.view-switcher-container');
        if (switcher) switcher.style.display = 'flex';
        // Restore last active view
        switchCustomerView(lastActiveCustomerView);
      }
      _clientDetailSource = 'clients';
    }

    document.addEventListener('click', function (e) {
      // Kanban card click
      const card = e.target.closest('.kanban-card');

      // Skip if we clicked a button/link inside the card or row
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-delete')) return;

      if (card) {
        const clientId = card.getAttribute('data-client-id');
        let fullClient = null;
        if (clientId && window.kanbanData) {
          fullClient = window.kanbanData.find(c => c.id == clientId);
        }
        if (fullClient) {
          openClientDetails(fullClient);
        } else {
          let name = "Ügyfél";
          const nameDiv = card.querySelector('.client-name');
          if (nameDiv) name = nameDiv.innerText;

          let email = '';
          let phone = '';
          const infoDivs = card.querySelectorAll('.client-info');
          infoDivs.forEach(d => {
            if (d.innerText.includes('@')) email = d.innerText.trim();
            else if (d.innerText.trim().length > 0) phone = d.innerText.trim();
          });

          openClientDetails({ name: name, email: email, phone: phone });
        }
      }
      // NOTE: Interaction rows (#interactions-flat-body tr) are handled by their own
      // onclick="openInteractionSummaryModal(idx)" — no need for delegation here.
    });

    
    // --- Telephelyek CRUD ---
    let globalClinics = [];
    
    function fetchClinics() {
      authFetch('/admin/api/clinics')
        .then(res => res.json())
        .then(clinics => {
          globalClinics = clinics || [];
          const list = document.getElementById('clinics-list');
          if (!list) return;
          list.innerHTML = '';
          if (clinics && clinics.length > 0) {
            clinics.forEach(c => list.appendChild(createClinicRow(c)));
          } else {
            list.innerHTML = '<div style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek telephelyek.</div>';
          }
        })
        .catch(err => console.error("Hiba a telephelyek betöltésekor:", err));
    }

    function createClinicRow(c = { id: '', name_and_address: '', access_info: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-clinic-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1fr auto';
      row.style.gap = '16px';
      row.style.alignItems = 'end';
      row.style.background = '#f9fafb';
      row.style.padding = '16px';
      row.style.borderRadius = '8px';
      row.dataset.id = c.id || '';

      const isNew = !c.id;
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Telephely neve és címe</label>
          <input class="tt-input clinic-name" type="text" placeholder="pl. 1052 Budapest, Petőfi Sándor utca 12." value="${esc(c.name_and_address)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Megközelítés (opcionális)</label>
          <input class="tt-input clinic-access" type="text" placeholder="pl. 2-es metró Astoria megállótól..." value="${esc(c.access_info || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 38px;">
          <button class="tt-remove-btn" onclick="this.closest('.tt-clinic-row').remove();"></button>
        </div>
      `;
      return row;
    }

    function addClinicUiRow() {
      const list = document.getElementById('clinics-list');
      if (list.querySelector('div[style*="text-align:center"]')) list.innerHTML = '';
      const newRow = createClinicRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    async function saveAllClinics(isAutoSave) {
      const rows = document.querySelectorAll('#clinics-list .tt-clinic-row');
      const clinicsToSave = [];
      
      for (let row of rows) {
        const id = row.dataset.id;
        const name = row.querySelector('.clinic-name').value.trim();
        const access = row.querySelector('.clinic-access').value.trim();
        
        if (name) {
          const cObj = { name_and_address: name, access_info: access };
          if (id) cObj.id = parseInt(id);
          clinicsToSave.push(cObj);
        }
      }
      
      try {
        const res = await authFetch('/admin/api/clinics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clinicsToSave)
        });
        if (res.ok) {
          fetchClinics();
        if (isAutoSave && typeof showAutoSaveToast === 'function') { showAutoSaveToast('Telephelyek sikeresen mentve!'); return; }
          showToast('success', 'Telephelyek sikeresen mentve!');
        } else {
          showToast('error', 'Hiba a telephelyek mentésekor!');
        }
      } catch (err) {
        console.error(err);
        showToast('error', 'Hálózati hiba!');
      }
    }

    // --- Orvosok CRUD ---
    let globalDoctors = [];
    
    function fetchDoctors() {
      authFetch('/admin/api/doctors')
        .then(res => res.json())
        .then(docs => {
          globalDoctors = docs || [];
          const list = document.getElementById('doctors-list');
          if (!list) return;
          list.innerHTML = '';
          if (docs && docs.length > 0) {
            docs.forEach(doc => list.appendChild(createDoctorRow(doc)));
          } else {
            list.innerHTML = '<tr><td colspan="3" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek orvosok.</td></tr>';
          }
          fetchServices(); // Orvosok letöltése után töltsük le a szolgáltatásokat, mert kell az orvos lista!
          fetchClinics(); // Telephelyeket is itt töltjük le
        })
        .catch(err => console.error("Hiba az orvosok betöltésekor:", err));
    }

    function createDoctorRow(doc = { id: '', name: '', specialty: '', related_services: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-doctor-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1fr 2fr auto';
      row.style.gap = '16px';
      row.style.alignItems = 'end';
      row.style.background = '#f9fafb';
      row.style.padding = '16px';
      row.style.borderRadius = '8px';
      row.dataset.id = doc.id || '';

      const isNew = !doc.id;
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos neve</label>
          <input class="tt-input doc-name" type="text" placeholder="Orvos neve" value="${esc(doc.name)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szakterület</label>
          <input class="tt-input doc-spec" type="text" placeholder="Szakterület" value="${esc(doc.specialty)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Kapcsolódó szolgáltatás</label>
          <input class="tt-input doc-svc" type="text" placeholder="Kapcsolódó szolgáltatás" value="${esc(doc.related_services || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 38px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-doctor-row').remove(); } else { deleteDoctor(${doc.id}, this.closest('.tt-doctor-row')); }"></button>
        </div>
      `;
      return row;
    }

    function addDoctorUiRow() {
      const list = document.getElementById('doctors-list');
      if (list.querySelector('td[colspan]')) list.innerHTML = '';
      const newRow = createDoctorRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    function editDoctorRow(btn) {
      const tr = btn.closest('tr');
      const inputs = tr.querySelectorAll('input');
      inputs.forEach(inp => {
        inp.readOnly = false;
        inp.style.borderColor = '#e5e7eb';
        inp.style.background = '#fff';
      });
      const td = tr.cells[2];
      td.innerHTML = `
        <button onclick="saveAllDoctors()" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
        <button onclick="fetchDoctors()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
      `;
    }

    async function saveAllDoctors(isAutoSave) {
      const rows = document.querySelectorAll('#doctors-list .tt-doctor-row');
      const promises = [];
      
      for (let row of rows) {
        const docId = row.dataset.id;
        const name = row.querySelector('.doc-name').value.trim();
        const specialty = row.querySelector('.doc-spec').value.trim();
        const related_services = row.querySelector('.doc-svc').value.trim();

        if (!name && !specialty && !related_services) continue; // Skip completely empty rows
        if (!name) {
          showToast('error', 'Minden orvosnál kötelező megadni a nevet!');
          return;
        }

        const url = docId ? '/admin/api/doctors/' + docId : '/admin/api/doctors';
        const method = docId ? 'PUT' : 'POST';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, specialty, related_services })
          }).then(res => {
            if (!res.ok) throw new Error('Hiba mentéskor');
          })
        );
      }
      
      try {
        if (promises.length > 0) {
          await Promise.all(promises);
          if (isAutoSave && typeof showAutoSaveToast === 'function') { showAutoSaveToast('Orvosok sikeresen mentve!'); } else { showToast('success', '✅ Minden orvos elmentve!'); }
        }
        fetchDoctors(); // Refresh from server
      } catch (err) {
        console.error(err);
        showToast('error', 'Hiba történt a mentéskor!');
      }
    }

    function deleteDoctor(docId, rowElement) {
      if (!confirm('Biztosan törlöd ezt az orvost? (A hozzá tartozó szolgáltatásoknál az orvos "Mind" lesz)')) return;
      authFetch('/admin/api/doctors/' + docId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Orvos törölve');
        rowElement.remove(); // Remove immediately without fetching everything
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }

    // --- Szolgáltatások CRUD ---
    function fetchServices() {
      authFetch('/admin/api/services')
        .then(res => res.json())
        .then(svcs => {
          const list = document.getElementById('services-list');
          if (!list) return;
          list.innerHTML = '';
          if (svcs && svcs.length > 0) {
            svcs.forEach(svc => list.appendChild(createServiceRow(svc)));
          } else {
            list.innerHTML = '<tr><td colspan="4" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek szolgáltatások.</td></tr>';
          }
        })
        .catch(err => console.error("Hiba a szolgáltatások betöltésekor:", err));
    }

    function createServiceRow(svc = { id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-service-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '3fr 2fr 3fr 3fr auto';
      row.style.gap = '16px';
      row.style.alignItems = 'end';
      row.style.background = '#f9fafb';
      row.style.padding = '16px';
      row.style.borderRadius = '8px';
      row.dataset.id = svc.id || '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach(d => {
        const sel = (svc.doctor_id === d.id) ? 'selected' : '';
        docOptions += `<option value="${d.id}" ${sel}>${esc(d.name)}</option>`;
      });
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szolgáltatás neve</label>
          <input class="tt-input svc-name" type="text" placeholder="Konzultáció" value="${esc(svc.service_name)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Időtartam (perc)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input class="tt-input svc-dur" type="number" placeholder="30" value="${svc.duration_minutes}" style="flex: 1;">
            <span style="font-size: 13px; color: #6b7280; padding-right: 8px; margin-bottom: 0;">perc</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos</label>
          <select class="tt-select svc-doc">
            ${docOptions}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Megjegyzés</label>
          <input class="tt-input svc-note" type="text" placeholder="Megjegyzés" value="${esc(svc.note || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 38px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-service-row').remove(); } else { deleteService(${svc.id}, this.closest('.tt-service-row')); }"></button>
        </div>
      `;
      return row;
    }

    function addServiceUiRow() {
      const list = document.getElementById('services-list');
      if (list.querySelector('td[colspan]')) list.innerHTML = '';
      const newRow = createServiceRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    async function saveAllServices(isAutoSave) {
      const rows = document.querySelectorAll('#services-list .tt-service-row');
      const promises = [];
      
      for (let row of rows) {
        const srvId = row.dataset.id;
        const service_name = row.querySelector('.svc-name').value.trim();
        const duration_minutes = parseInt(row.querySelector('.svc-dur').value) || 30;
        const docVal = row.querySelector('.svc-doc').value;
        const doctor_id = docVal ? parseInt(docVal) : null;
        const note = row.querySelector('.svc-note').value.trim();

        if (!service_name) continue;

        const url = srvId ? '/admin/api/services/' + srvId : '/admin/api/services';
        const method = srvId ? 'PUT' : 'POST';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_name, duration_minutes, doctor_id, note })
          }).then(res => {
            if (!res.ok) throw new Error('Hiba mentéskor');
          })
        );
      }
      
      try {
        if (promises.length > 0) {
          await Promise.all(promises);
          if (isAutoSave && typeof showAutoSaveToast === 'function') { showAutoSaveToast('Szolgáltatások sikeresen mentve!'); } else { showToast('success', '✅ Szolgáltatások elmentve!'); }
        }
        fetchServices();
      } catch (err) {
        console.error(err);
        showToast('error', 'Hiba történt a szolgáltatások mentésekor!');
      }
    }

    function deleteService(srvId, rowElement) {
      if (!confirm('Biztosan törlöd ezt a szolgáltatást?')) return;
      authFetch('/admin/api/services/' + srvId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Szolgáltatás törölve');
        rowElement.remove();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }


    // --- Triázs Szabályok Logika ---
    function fetchTriageRules() {
      authFetch('/admin/api/triage_rules')
        .then(res => res.json())
        .then(rules => {
          const list = document.getElementById('triage-rules-list');
          if (!list) return;
          list.innerHTML = '';
          if (rules && rules.length > 0) {
            rules.forEach(rule => {
              list.appendChild(createTriageRuleRow(rule));
            });
          } else {
            list.innerHTML = '<tr><td colspan="4" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek még triázs szabályok.</td></tr>';
          }
        })
        .catch(err => console.error("Hiba a triázs szabályok betöltésekor:", err));
    }

    function createTriageRuleRow(rule = { id: '', situation: '', priority: 'Normál', escalation_email: '' }) {
      const tr = document.createElement('tr');
      tr.className = 'triage-row';
      tr.style.borderBottom = '1px solid #f3f4f6';
      tr.dataset.id = rule.id || '';

      const isKiemelt = rule.priority === 'Kiemelt';

      tr.innerHTML = `
        <td style="padding: 16px;">
          <input class="tt-input triage-situation" type="text" placeholder="Helyzet (pl. Erős fájdalom)" value="${rule.situation || ''}" 
                 style="margin:0; border:none; background:transparent; width:100%; box-shadow:none; padding:0; color: #4b5563; font-size: 13px; outline: none;" />
        </td>
        <td style="padding: 16px;">
          <select class="tt-select triage-priority" onchange="toggleTriageEmail(this);" 
                  style="margin:0; border:none; background:#f3f4f6; padding:10px 14px; border-radius:6px; color: #4b5563; font-size: 13px; width:100%; cursor:pointer; outline:none;">
            <option value="Normál" ${rule.priority === 'Normál' ? 'selected' : ''}>Normál – önálló válasz engedélyezett</option>
            <option value="Fontos" ${rule.priority === 'Fontos' ? 'selected' : ''}>Fontos – visszahívás szükséges</option>
            <option value="Sürgős" ${rule.priority === 'Sürgős' ? 'selected' : ''}>Sürgős – azonnali átadás szükséges</option>
            <option value="Kiemelt" ${rule.priority === 'Kiemelt' ? 'selected' : ''}>Kiemelt – vezető értesítése szükséges</option>
          </select>
        </td>
        <td style="padding: 16px;">
          <div class="triage-email-container" style="visibility: ${isKiemelt ? 'visible' : 'hidden'};">
            <input class="tt-input triage-email" type="email" placeholder="Eszkalációs e-mail" value="${rule.escalation_email || ''}" 
                   style="margin:0; border:none; background:#f3f4f6; padding:10px 14px; border-radius:6px; color: #4b5563; font-size: 13px; width:100%; outline:none;" />
          </div>
        </td>
        <td style="padding: 16px; text-align:right;">
          <button class="tt-remove-btn" onclick="deleteTriageRule(this)" style="margin: 0; display:inline-block; vertical-align:middle; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5"></button>
        </td>
      `;
      return tr;
    }

    function toggleTriageEmail(selectElem) {
      const row = selectElem.closest('tr');
      const emailContainer = row.querySelector('.triage-email-container');
      const emailInput = row.querySelector('.triage-email');
      
      if (selectElem.value === 'Sürgős' || selectElem.value === 'Kiemelt') {
        emailContainer.style.visibility = 'visible';
      } else {
        emailContainer.style.visibility = 'hidden';
        emailInput.value = '';
      }
    }

    function addTriageRule() {
      const list = document.getElementById('triage-rules-list');
      if (list.innerHTML.includes('Nincsenek')) list.innerHTML = '';
      list.appendChild(createTriageRuleRow());
    }

    async function saveAllTriageRules(isAutoSave) {
      const rows = document.querySelectorAll('.triage-row');
      const promises = [];
      let hasError = false;

      for (const row of rows) {
        const ruleId = row.dataset.id;
        const data = {
          situation: row.querySelector('.triage-situation').value.trim(),
          priority: row.querySelector('.triage-priority').value,
          escalation_email: row.querySelector('.triage-email').value.trim()
        };

        if (!data.situation) continue; // Skip empty
        if (data.priority === 'Kiemelt' && !data.escalation_email) {
          showToast('error', 'Kérlek add meg az eszkalációs e-mailt a kiemelt szabályokhoz!');
          return;
        }

        const method = ruleId ? 'PUT' : 'POST';
        const url = ruleId ? '/admin/api/triage_rules/' + ruleId : '/admin/api/triage_rules';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(res => res.json()).then(resData => {
            if (resData.ok && !ruleId && resData.id) {
              row.dataset.id = resData.id;
            }
          }).catch(err => {
            hasError = true;
            console.error(err);
          })
        );
      }

      const btn = document.querySelector('button[onclick="saveAllTriageRules()"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Mentés...';
      btn.disabled = true;

      await Promise.all(promises);
      
      btn.disabled = false;
      if (hasError) {
        showToast('error', 'Hiba történt néhány szabály mentésekor!');
        btn.innerHTML = originalText;
      } else {
        if (isAutoSave && typeof showAutoSaveToast === 'function') { showAutoSaveToast('Triázs szabályok mentve!'); return; }
        showFancySuccess('Szabályok sikeresen elmentve');
        btn.innerHTML = '&#128190; Mentve';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      }
    }

    function showFancySuccess(msg) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; background: rgba(16, 185, 129, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.2); padding: 14px 24px; border-radius: 50px; box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.15);">
          <div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:#10b981; color:#fff; border-radius:50%; font-size:12px;">✓</div>
          <span style="color:#065f46; font-weight:600; font-size:15px;">${msg}</span>
        </div>
      `;
      el.style.position = 'fixed';
      el.style.top = '-100px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.zIndex = '10000';
      el.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      document.body.appendChild(el);
      
      requestAnimationFrame(() => {
        el.style.top = '40px';
      });
      
      setTimeout(() => {
        el.style.top = '-100px';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
      }, 3000);
    }

    function deleteTriageRule(btn) {
      if (!confirm("Biztosan törlöd ezt a triázs szabályt?")) return;
      const row = btn.closest('tr');
      const ruleId = row.dataset.id;
      
      if (!ruleId) {
        row.remove();
        return;
      }

      authFetch('/admin/api/triage_rules/' + ruleId, { method: 'DELETE' })
        .then(res => res.json())
        .then(resData => {
          if (resData.ok) row.remove();
          else alert("Hiba a törlés során.");
        })
        .catch(err => alert("Hiba a hálózatban."));
    }

    // Call fetchTriageRules when the page loads
    document.addEventListener('DOMContentLoaded', () => {
      fetchTriageRules();
      fetchDoctors();
      setApprovalView(localStorage.getItem('thinkai_approval_view') || 'grid');
    });

  
    // ═══════════════════════════════════════════════════════════════════════════════
    // JÓVÁHAGYÓ RENDSZER (HUMAN-IN-THE-LOOP) LOGIKA
    // ═══════════════════════════════════════════════════════════════════════════════
    let currentApprovalTab = 'pending';
    let currentApprovalId = null;

    function switchApprovalTab(tab) {
      currentApprovalTab = tab;
      document.getElementById('btn-tab-pending').classList.toggle('active', tab === 'pending');
      document.getElementById('btn-tab-history').classList.toggle('active', tab === 'history');
      loadApprovals();
    }

    function setApprovalView(view) {
      localStorage.setItem('thinkai_approval_view', view);
      const grid = document.getElementById('approvals-grid');
      const btnGrid = document.getElementById('btn-layout-grid');
      const btnList = document.getElementById('btn-layout-list');
      
      if (grid && btnGrid && btnList) {
        if (view === 'list') {
          grid.classList.add('list-view');
          btnGrid.classList.remove('active');
          btnList.classList.add('active');
        } else {
          grid.classList.remove('list-view');
          btnGrid.classList.add('active');
          btnList.classList.remove('active');
        }
      }
    }

    
    function toggleAllApprovals(source) {
      const checkboxes = document.querySelectorAll('.approval-checkbox');
      checkboxes.forEach(cb => cb.checked = source.checked);
      updateApprovalBulkActions();
    }
    
    function updateApprovalBulkActions() {
      const checkboxes = document.querySelectorAll('.approval-checkbox:checked');
      const count = checkboxes.length;
      const bar = document.getElementById('approval-bulk-actions');
      const countLabel = document.getElementById('approval-selected-count');
      
      if (count > 0) {
        bar.style.display = 'flex';
        countLabel.innerText = `${count} kijelölve`;
      } else {
        bar.style.display = 'none';
        document.getElementById('approval-select-all').checked = false;
      }
    }
    
    async function deleteSelectedApprovals() {
      const checkboxes = document.querySelectorAll('.approval-checkbox:checked');
      if (checkboxes.length === 0) return;
      
      if (!confirm(`Biztosan törölni szeretnél ${checkboxes.length} db üzenetet? Ez a művelet nem vonható vissza!`)) {
        return;
      }
      
      const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
      const token = localStorage.getItem('thinkai_admin_token') || authToken;
      
      try {
        const res = await fetch('/admin/api/approvals', {
          method: 'DELETE',
          headers: {
             'Authorization': 'Bearer ' + token,
             'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: ids })
        });
        
        if (!res.ok) throw new Error('Hiba a törlés során');
        
        document.getElementById('approval-select-all').checked = false;
        updateApprovalBulkActions();
        loadApprovals();
        // Refresh member analytics dashboard
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager') loadMemberAnalytics();
      } catch (err) {
        alert(err.message);
      }
    }

    async function loadApprovals() {
      const grid = document.getElementById('approvals-grid');
      if (!grid) return;
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><div style="display:inline-block; animation: callPulse 1.5s infinite; font-size: 24px;">⌛</div><br><br>Betöltés...</div>';
      
      try {
        // Always reload clients for accurate name resolution
        try {
          const cres = await authFetch('/admin/api/clients');
          const cdata = await cres.json();
          window.kanbanData = cdata.clients || [];
        } catch(e) {}
        
        // Also load sessions for participant name resolution
        let sessionsMap = {};
        try {
          const sres = await authFetch('/admin/api/sessions/summary?limit=500');
          const sdata = await sres.json();
          (sdata.sessions || []).forEach(s => { sessionsMap[s.session_id] = s; });
        } catch(e) {}
        
        const res = await authFetch('/admin/api/approvals?status=' + currentApprovalTab);
        if (!res.ok) { const text = await res.text(); throw new Error('Hiba a jóváhagyások betöltésekor: ' + text); }
        const data = await res.json();
        let items = data.approvals || [];
        
        // ── Member filtering: only show approvals for assigned clients + own campaigns ──
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager') {
          await loadMyAssignedClients();
          items = items.filter(c => isApprovalAssignedToMe(c));
        }
        
        const filterCat = document.getElementById('approval-category-filter') ? document.getElementById('approval-category-filter').value : 'all';
        
        // Filter items
        let filteredItems = items;
        if (filterCat !== 'all') {
           filteredItems = items.filter(c => {
               const tags = c.alert_tags || [];
               const stage = c.funnel_stage || '';
               if (filterCat === 'urgent') return tags.includes('urgent');
               if (filterCat === 'complaint') return tags.includes('complaint');
               if (filterCat === 'stuck') return tags.includes('stuck');
               if (filterCat === 'ajanlat') return stage === 'ajanlat';
               if (filterCat === 'foglalt') return stage === 'foglalt';
               if (filterCat === 'irrelevant') return stage === 'irrelevant';
               if (filterCat === 'other') return !tags.length && !['ajanlat', 'foglalt', 'irrelevant'].includes(stage);
               return true;
           });
        }
        
        const countLabel = document.getElementById('approval-count-label');
        if (countLabel) {
           countLabel.innerText = `${filteredItems.length} megjelenítve`;
        }
        const selectAll = document.getElementById('approval-select-all');
        if (selectAll) selectAll.checked = false;
        if (typeof updateApprovalBulkActions === 'function') updateApprovalBulkActions();
        
        if (filteredItems.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><svg fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24" style="width:48px;height:48px;margin-bottom:16px;display:inline-block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><br><br>Nincs megjeleníthető elem a kiválasztott szűrők alapján!</div>';
          return;
        }
        
        grid.innerHTML = filteredItems.map(c => {
          let draftData = {};
          try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e){}

          // === DEBUG LOG ===
          console.log(`[Approval DEBUG] id=${c.id} session=${c.session_id} to_name="${draftData.to_name}" sender_id="${draftData.sender_id}" channel="${draftData.channel}"`);

          // Detect campaign
          const isCampaign = !!(draftData.campaign_name || (c.topic && c.topic.startsWith('Kampány:')));
          const campaignName = draftData.campaign_name || '';
          const isMulti = !!draftData.multi_channel;

          // Build channel display
          let channelParts = [];
          if (isMulti && draftData.drafts) {
            draftData.drafts.forEach(d => channelParts.push(d.channel));
          } else {
            channelParts.push(draftData.channel || c.type || 'email');
          }

          const chIcons = { 'Email': '📧', 'email': '📧', 'E-mail': '📧', 'Messenger': '💬', 'messenger': '💬', 'WhatsApp': '📱', 'whatsapp': '📱' };
          const chColors = { 'Email': '#eab308', 'email': '#eab308', 'E-mail': '#eab308', 'Messenger': '#3b82f6', 'messenger': '#3b82f6', 'WhatsApp': '#22c55e', 'whatsapp': '#22c55e' };
          const channelDisplay = channelParts.map(ch => `<span style="color:${chColors[ch]||'var(--text-muted)'}">${chIcons[ch]||'📨'} ${ch}</span>`).join(' <span style="color:var(--text-muted)">+</span> ');
          
          let senderName = '';
          // Helper: detect raw numeric PSID (not a real name)
          const _isRawId = (v) => v && /^\d{8,}$/.test(v);
          
          // 1. Start with to_name if it's a real name (not a raw PSID)
          const rawToName = draftData.to_name || '';
          if (rawToName && !_isRawId(rawToName)) senderName = rawToName;
          console.log(`[Approval DEBUG]   1. to_name check: rawToName="${rawToName}" isRawId=${_isRawId(rawToName)} => senderName="${senderName}"`);
          
          // 2. If we don't have a name yet, resolve from clients DB
          if (!senderName) {
            // Collect all messenger IDs to try matching
            const _lookupIds = new Set();
            if (draftData.sender_id) _lookupIds.add(String(draftData.sender_id).trim());
            // Extract from to_name if it's a raw ID
            if (_isRawId(rawToName)) _lookupIds.add(rawToName.trim());
            // Extract from session_id (e.g. "messenger_26629190113363954")
            const _sid = c.session_id || '';
            const _prefixMatch = _sid.match(/^(?:messenger|instagram|whatsapp)_(\d+)/);
            if (_prefixMatch) _lookupIds.add(_prefixMatch[1]);
            
            console.log(`[Approval DEBUG]   2. Client DB lookup IDs:`, [..._lookupIds]);
            
            // Search through ALL clients
            const allClients = window.kanbanData || [];
            for (const cl of allClients) {
              let cd = cl.custom_data;
              if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch(e) { cd = {}; } }
              if (!cd || typeof cd !== 'object') cd = {};
              
              // Get this client's messenger ID
              const clMid = String(cd.messenger_id || cd.messenger_psid || '').trim();
              if (!clMid) continue;
              
              // Check if any of our lookup IDs match
              if (_lookupIds.has(clMid)) {
                // Found the client! Extract name
                const n = cd.nev || cd.name || cd['név'] || cl.name;
                console.log(`[Approval DEBUG]   2. Found client #${cl.id}: cl.name="${cl.name}" cd.name="${cd.name}" cd.nev="${cd.nev}" => n="${n}"`);
                if (n && n !== 'Névtelen' && n !== '-' && !_isRawId(n)) {
                  senderName = n;
                }
                break;
              }
            }
          }
          
          // 3. If still no name, check session participant
          if (!senderName) {
            const _sid = c.session_id || '';
            const sessionData = sessionsMap[_sid];
            if (sessionData && sessionData.participant) {
              const pName = sessionData.participant;
              console.log(`[Approval DEBUG]   3. Session participant: "${pName}"`);
              if (pName && pName !== 'Ismeretlen' && !_isRawId(pName)) {
                senderName = pName;
              }
            }
          }
          
          // 4. Final fallback
          if (!senderName) senderName = 'Ismeretlen';
          console.log(`[Approval DEBUG]   FINAL senderName="${senderName}"`);
          const senderEmail = (isMulti && draftData.drafts) ? (draftData.drafts.find(d => d.to_email) || {}).to_email || '' : (draftData.to_email || '');
          
          let tagHtml = '';
          
          // Campaign badge
          if (isCampaign) {
            tagHtml += `<div class="approval-card-tag" style="background:rgba(168,85,247,0.1); color:#a855f7; border-color:#a855f7;">📢 Kampány</div>`;
          }

          const localMap = {
             'urgent': 'Sürgős', 'kiemelt': 'Kiemelt', 'complaint': 'Panasz',
             'stuck': 'Technikai hiba', 'ajanlat': 'Árajánlat',
             'foglalt': 'Időpontfoglalás', 'irrelevant': 'Irreleváns / Spam'
          };
          
          if (c.alert_tags && c.alert_tags.length > 0) {
            const isUrgent = c.alert_tags.includes('urgent');
            const dispTag = localMap[c.alert_tags[0]] || c.alert_tags[0];
            tagHtml += `<div class="approval-card-tag ${isUrgent ? 'urgent' : ''}">${dispTag}</div>`;
          }
          
          if (!tagHtml || (tagHtml && isCampaign && c.alert_tags && c.alert_tags.length === 0)) {
            if (!isCampaign) {
              let dispStage = localMap[c.funnel_stage];
              if (!dispStage) dispStage = 'Egyéb';
              tagHtml += `<div class="approval-card-tag" style="background: var(--bg2); color: var(--text-muted); border-color: var(--border);">${dispStage}</div>`;
            }
          }
          
          if (currentApprovalTab === 'history') {
             const statusColor = c.approval_status === 'approved' ? '#22c55e' : '#ef4444';
             const statusText = c.approval_status === 'approved' ? 'Elküldve' : 'Elutasítva';
             tagHtml += `<div class="approval-card-tag" style="background: transparent; color: ${statusColor}; border-color: ${statusColor};">${statusText}</div>`;
          }
          
          const dateStr = new Date(c.created_at).toLocaleString('hu-HU', {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          const safeC = JSON.stringify(c).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

          const previewBody = isMulti && draftData.drafts ? draftData.drafts[0].body || '' : (draftData.body || '');

          return `
            <div class="approval-card" onclick="openApprovalModal(${safeC})" style="position: relative;">
              <input type="checkbox" class="approval-checkbox" value="${c.id}" onclick="event.stopPropagation(); updateApprovalBulkActions()" style="position: absolute; top: 16px; left: 16px; z-index: 10; width: 18px; height: 18px; cursor: pointer;">
              <div class="approval-card-header">
                <div class="approval-card-channel" style="display: flex; align-items: center; gap: 6px; padding-left: 28px; font-size: 12px; font-weight: 600;">${channelDisplay}</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">${tagHtml}</div>
              </div>
              <div class="approval-card-title">${esc(senderName)}</div>
              ${senderEmail ? `<div class="approval-card-subtitle">${esc(senderEmail)}</div>` : ''}
              ${campaignName ? `<div style="font-size:11px; color:#a855f7; font-weight:600; margin-bottom:6px;">📢 ${esc(campaignName)}</div>` : ''}
              <div class="approval-card-preview">${esc(previewBody.replace(/<br\s*\/?>/gi, ' '))}</div>
              <div class="approval-card-footer">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ${dateStr}
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">${e.message}</div>`;
      }
    }

    window.openApprovalFromClientHistory = function(type, idx) {
      const arr = type === 'current' ? window.currentClientInts : window.pastClientInts;
      const r = arr ? arr[idx] : null;
      if (!r) return;
      const approvalObj = {
        id: r.interactionId,
        topic: r.topic || '',
        summary: r.summary || '',
        ai_draft_response: r.ai_draft_response || '{}',
        approval_status: r.approval_status || 'pending'
      };
      openApprovalModal(approvalObj);
    };

    function openApprovalModal(c) {
      currentApprovalId = c.id;
      let draftData = {};
      try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e){}
      
      // Topic
      let topicText = (c.topic || '') + " - " + (c.summary || '');
      document.getElementById('approval-original-topic').textContent = topicText;

      // Build draft text – multi-channel shows all drafts
      let initialDraft = '';
      if (draftData.multi_channel && draftData.drafts && draftData.drafts.length > 1) {
        initialDraft = draftData.drafts.map(d => {
          const chIcon = {'Email':'📧','Messenger':'💬','WhatsApp':'📱'}[d.channel] || '📨';
          return `━━━ ${chIcon} ${d.channel} ━━━\n${d.body || ''}`;
        }).join('\n\n');
      } else {
        initialDraft = draftData.body || '';
      }
      initialDraft = initialDraft.replace(/<br\s*\/?>/gi, '\n');
      document.getElementById('approval-draft-text').value = initialDraft;
      
      const isHistory = currentApprovalTab === 'history';
      document.getElementById('btn-approval-approve').style.display = isHistory ? 'none' : 'block';
      document.getElementById('approval-draft-text').disabled = isHistory;
      
      document.getElementById('approval-modal').style.display = 'flex';
    }

    function closeApprovalModal() {
      document.getElementById('approval-modal').style.display = 'none';
      currentApprovalId = null;
    }

    async function submitApproval(action) {
      if (!currentApprovalId) return;
      const text = document.getElementById('approval-draft-text').value;
      const btn = document.getElementById('btn-approval-approve');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kis türelmet...';
      btn.disabled = true;
      
      try {
        let endpoint = `/admin/api/approvals/${currentApprovalId}/${action}`;
        const res = await authFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modified_draft: text })
        });
        
        if (!res.ok) {
           const d = await res.json();
           throw new Error(d.detail || 'Hiba történt a mentés során');
        }
        
        const approvedId = currentApprovalId; // Save before close nullifies it
        closeApprovalModal();
        loadApprovals(); // Frissíti a jóváhagyások listát (ha az oldalon van)
        
        // Mark the todo as completed locally (strikethrough) instead of removing it
        if (currentUserRole !== 'admin' && currentUserRole !== 'manager' && window._memberTodos) {
          const todo = window._memberTodos.find(t => t.type === 'approval' && t.approvalId === approvedId);
          if (todo) {
            todo.completed = true;
            todo.desc = todo.desc.replace('szükséges', 'elküldve ✓');
            // Persist to localStorage (daily key)
            const todayKey = 'completedTodos_' + new Date().toISOString().slice(0, 10);
            let cIds = [];
            try { cIds = JSON.parse(localStorage.getItem(todayKey) || '[]'); } catch(e) {}
            if (!cIds.includes(String(todo.id))) cIds.push(String(todo.id));
            localStorage.setItem(todayKey, JSON.stringify(cIds));
            renderMemberTodos();
          } else {
            loadMemberAnalytics();
          }
        }
        showToast('Válasz jóváhagyva és elküldve!', 'success');
      } catch (e) {
        alert(e.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    // ── Column Toggle for Interactions Table ──
    function toggleColumnDropdown() {
      const dd = document.getElementById('col-toggle-dropdown');
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    }

    function toggleIntColumn(colIdx, visible) {
      const table = document.getElementById('interactions-flat-table');
      if (!table) return;
      // colIdx is 1-based (skip checkbox col 0)
      const realIdx = colIdx; // th/td index (0=checkbox, 1=date, 2=client, ...)
      table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('th, td');
        if (cells[realIdx]) {
          cells[realIdx].style.display = visible ? '' : 'none';
        }
      });
      // Save state
      let state = JSON.parse(localStorage.getItem('int_col_visibility') || '{}');
      state[colIdx] = visible;
      localStorage.setItem('int_col_visibility', JSON.stringify(state));
    }

    // Restore column visibility on page load
    function restoreIntColumnVisibility() {
      const state = JSON.parse(localStorage.getItem('int_col_visibility') || '{}');
      Object.entries(state).forEach(([col, visible]) => {
        const colIdx = parseInt(col);
        if (!visible) {
          toggleIntColumn(colIdx, false);
          const label = document.querySelector(`.col-toggle-item[data-col="${colIdx}"] input`);
          if (label) label.checked = false;
        }
      });
    }

    // Close dropdown on click outside
    document.addEventListener('click', function(e) {
      const dd = document.getElementById('col-toggle-dropdown');
      if (!dd || dd.style.display === 'none') return;
      const wrapper = dd.parentElement;
      if (!wrapper.contains(e.target)) dd.style.display = 'none';
    });

    // ── Client table column toggle ──
    function toggleClientColumnDropdown() {
      const dd = document.getElementById('client-col-toggle-dropdown');
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    }

    function toggleClientCol(colIdx, visible) {
      const table = document.querySelector('#clients-table-wrapper table');
      if (!table) return;
      table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('th, td');
        if (cells[colIdx]) {
          cells[colIdx].style.display = visible ? '' : 'none';
        }
      });
      let state = JSON.parse(localStorage.getItem('client_col_visibility') || '{}');
      state[colIdx] = visible;
      localStorage.setItem('client_col_visibility', JSON.stringify(state));
    }

    function restoreClientColumnVisibility() {
      const state = JSON.parse(localStorage.getItem('client_col_visibility') || '{}');
      Object.entries(state).forEach(([col, visible]) => {
        const colIdx = parseInt(col);
        if (!visible) {
          toggleClientCol(colIdx, false);
          const labels = document.querySelectorAll('#client-col-toggle-dropdown label');
          if (labels[colIdx - 1]) {
            const inp = labels[colIdx - 1].querySelector('input');
            if (inp) inp.checked = false;
          }
        }
      });
    }

    document.addEventListener('click', function(e) {
      const dd = document.getElementById('client-col-toggle-dropdown');
      if (!dd || dd.style.display === 'none') return;
      const wrapper = dd.parentElement;
      if (!wrapper.contains(e.target)) dd.style.display = 'none';
    });

window.forceOpenProfile = function() {
    try {
        const data = window.currentClientDataForLog;
        if (!data) {
            alert("Nincs kiválasztva ügyfél.");
            return;
        }
        
        let modal = document.getElementById('edit-profile-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'edit-profile-modal';
            modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(8,36,50,0.5); z-index:2147483647; align-items:center; justify-content:center;';
            
            modal.innerHTML = `
            <div style="background:white; border-radius:12px; width:400px; max-width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
              <div style="padding:20px 24px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; background:#f9fafb;">
                <h3 style="margin:0; font-size:16px; font-weight:bold; color:#082432;">Profil módosítása</h3>
                <button onclick="document.getElementById('edit-profile-modal').style.display='none'" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#6b7280;">&times;</button>
              </div>
              <div style="padding:24px; display:flex; flex-direction:column; gap:16px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Név</label>
                  <input type="text" id="edit-profile-name" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="Ügyfél neve">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Telefonszám</label>
                  <input type="text" id="edit-profile-phone" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="+36 30 ...">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Email cím</label>
                  <input type="email" id="edit-profile-email" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="email@példa.hu">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Megjegyzés</label>
                  <textarea id="edit-profile-notes" style="width:100%; height:80px; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none; resize:none;" placeholder="Adminisztrációs megjegyzések..."></textarea>
                </div>
              </div>
              <div style="padding:16px 24px; border-top:1px solid #e5e7eb; display:flex; justify-content:flex-end; gap:12px; background:#f9fafb;">
                <button onclick="document.getElementById('edit-profile-modal').style.display='none'" style="background:white; border:1px solid #d1d5db; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:#4b5563; cursor:pointer;">Mégsem</button>
                <button onclick="if(window.saveClientProfile) window.saveClientProfile(); else alert('Hiányzó mentés funkció!');" style="background:#082432; border:none; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:white; cursor:pointer;">Mentés</button>
              </div>
            </div>
            `;
            document.body.appendChild(modal);
        }
        
        document.getElementById('edit-profile-name').value = data.name || '';
        document.getElementById('edit-profile-phone').value = data.phone || '';
        document.getElementById('edit-profile-email').value = data.email || '';
        
        let notes = '';
        if (data.custom_data && data.custom_data.notes) {
            notes = data.custom_data.notes;
        }
        document.getElementById('edit-profile-notes').value = notes;
        
        modal.style.display = 'flex';
    } catch (e) {
        alert("Kritikus hiba az ablak megnyitásakor: " + e.message);
    }
};
