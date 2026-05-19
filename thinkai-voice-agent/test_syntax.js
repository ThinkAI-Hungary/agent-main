

    // Customer Center JS

    function switchSettingsView(viewId, btn) {
      document.querySelectorAll('.settings-subview').forEach(el => el.style.display = 'none');
      document.querySelectorAll('#page-settings .view-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('settings-view-' + viewId).style.display = 'block';
      if (btn) btn.classList.add('active');
      if (viewId === 'praxis') loadPraxisinfo();
    }

    function switchCustomerView(viewId, btn) {
      document.querySelectorAll('.customer-view').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.view-btn').forEach(el => {
        el.classList.remove('active');
      });

      document.getElementById('view-' + viewId).style.display = 'block';

      if (btn) {
        btn.classList.add('active');
      }

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

    function openClientDetails(clientData) {
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
        const st = (clientData.status || 'Új ügyfél').toUpperCase();
        document.getElementById('cd-status-badge').innerText = st;

        const emailEl = document.getElementById('cd-email');
        emailEl.innerText = clientData.email || 'Nincs megadva';

        const phoneEl = document.getElementById('cd-phone');
        phoneEl.innerText = clientData.phone || 'Nincs megadva';

        document.getElementById('cd-id').innerText = clientData.id ? `DigiDesk azonosító: ${clientData.id}` : `DigiDesk azonosító: PAC-${Math.floor(100000 + Math.random() * 900000)}`;

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


        document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;"><div class="spinner"></div>Betöltés...</td></tr>`;
        document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;"><div class="spinner"></div>Betöltés...</td></tr>`;

        authFetch('/admin/api/sessions/summary?limit=500')
          .then(res => res.json())
          .then(data => {
            const sessions = data.sessions || [];
            let clientInteractions = [];
            sessions.forEach(s => {
              const cName = (s.participant || s.client_name || '').toLowerCase();
              const isMatch = (clientData.name && cName === clientData.name.toLowerCase()) ||
                (clientData.email && s.session_id.toLowerCase().includes(clientData.email.toLowerCase())) ||
                (clientData.custom_data && clientData.custom_data.messenger_id && s.session_id.includes(clientData.custom_data.messenger_id));
              if (isMatch) {
                (s.interactions || []).forEach(r => {
                  clientInteractions.push({
                    date: r.created_at || s.started_at,
                    channel: s.room_name && s.room_name.includes('Email') ? 'Email' : 'Telefon',
                    direction: r.direction || 'Bejövő',
                    type: r.type || '-',
                    topic: r.topic || '-',
                    summary: r.summary || '-',
                    result: r.result || '',
                    alert_tags: r.alert_tags || [],
                    status: (r.approval_status || 'lezárt'),
                    handover: r.handover_reason || 'Nincs teendő'
                  });
                });
              }
            });

            clientInteractions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            document.getElementById('cd-total-interactions').innerText = `Összes interakció: ${clientInteractions.length}`;
            
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

            const renderRow = (r, isCurrent) => {
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
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><span style="color:#b45309; background:#fef3c7; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600;">${esc(r.result || 'Válasz előkészítve')}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><span style="background:${stBg}; color:${stColor}; font-weight:bold; padding:4px 8px; border-radius:4px; font-size:11px;">${stText}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${esc(r.handover)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; text-align:center;">${actionContent}</td>
                </tr>
               `;
            };

            if (currentInts.length === 0) {
              document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">Nincsenek aktuális ügyek</td></tr>`;
            } else {
              document.getElementById('cd-history-body-current').innerHTML = currentInts.map(r => renderRow(r, true)).join('');
            }
            
            if (pastInts.length === 0) {
              document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">Nincsenek korábbi interakciók</td></tr>`;
            } else {
              document.getElementById('cd-history-body-past').innerHTML = pastInts.map(r => renderRow(r, false)).join('');
            }
          })
          .catch(err => {
            document.getElementById('cd-history-body-current').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--red);">Hiba a betöltés során</td></tr>`;
            document.getElementById('cd-history-body-past').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--red);">Hiba a betöltés során</td></tr>`;
          });
      }
    }
    
    function editClientProfile() {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        document.getElementById('edit-profile-name').value = data.name || '';
        document.getElementById('edit-profile-phone').value = data.phone || '';
        document.getElementById('edit-profile-email').value = data.email || '';
        
        // Extract notes from custom_data if exists
        let notes = '';
        if (data.custom_data && data.custom_data.notes) {
            notes = data.custom_data.notes;
        }
        document.getElementById('edit-profile-notes').value = notes;
        
        const modal = document.getElementById('edit-profile-modal');
        modal.style.display = 'flex';
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

      // Show view switcher
      const switcher = document.querySelector('.view-switcher-container');
      if (switcher) switcher.style.display = 'flex';

      // Restore last active view
      switchCustomerView(lastActiveCustomerView);
    }

    document.addEventListener('click', function (e) {
      // Kanban card click
      const card = e.target.closest('.kanban-card');
      // Interactions flat body click
      const interactionTr = e.target.closest('#interactions-flat-body tr');

      // Skip if we clicked a button/link inside the card or row
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-delete')) return;

      if (card) {
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
      } else if (interactionTr && !interactionTr.querySelector('th')) {
        let name = "Ügyfél";
        // In Interactions table, name is usually in the 3rd column (index 2)
        if (interactionTr.cells && interactionTr.cells[2]) name = interactionTr.cells[2].innerText;
        openClientDetails({ name: name, email: '', phone: '' });
      }
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

    async function saveAllClinics() {
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
        <button onclick="saveDoctorRow(this)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
        <button onclick="fetchDoctors()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
      `;
    }

    async function saveAllDoctors() {
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
          showToast('success', '✅ Minden orvos elmentve!');
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

    async function saveAllServices() {
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
          showToast('success', '✅ Szolgáltatások elmentve!');
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

    async function saveAllTriageRules() {
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
      } catch (err) {
        alert(err.message);
      }
    }

    async function loadApprovals() {
      const grid = document.getElementById('approvals-grid');
      if (!grid) return;
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><div style="display:inline-block; animation: callPulse 1.5s infinite; font-size: 24px;">⌛</div><br><br>Betöltés...</div>';
      
      try {
        const res = await authFetch('/admin/api/approvals?status=' + currentApprovalTab);
        if (!res.ok) { const text = await res.text(); throw new Error('Hiba a jóváhagyások betöltésekor: ' + text); }
        const data = await res.json();
        const items = data.approvals || [];
        
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
        document.getElementById('approval-select-all').checked = false;
        updateApprovalBulkActions();
        
        if (filteredItems.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><svg fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24" style="width:48px;height:48px;margin-bottom:16px;display:inline-block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><br><br>Nincs megjeleníthető elem a kiválasztott szűrők alapján!</div>';
          return;
        }
        
        grid.innerHTML = filteredItems.map(c => {
          let channelIconSVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`;
          let channelColor = '#eab308';
          if (c.type === 'messenger' || c.type === 'meta') { 
             channelIconSVG = `<svg fill="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M12 2C6.477 2 2 6.145 2 11.26c0 2.91 1.5 5.513 3.843 7.185v3.42c0 .484.542.766.945.502l3.435-2.22c1.7.472 3.518.472 5.218 0l3.435 2.22c.403.264.945-.018.945-.502v-3.42C20.5 16.773 22 14.17 22 11.26 22 6.145 17.523 2 12 2zm1 9h-2V7h2v4zm0 4h-2v-2h2v2z"/></svg>`;
             channelColor = '#3b82f6'; 
          }
          if (c.type === 'whatsapp') { 
             channelIconSVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>`;
             channelColor = '#22c55e'; 
          }
          
          let draftData = {};
          try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e){}
          
          const senderName = draftData.to_name || draftData.sender_id || c.session_id || 'Ismeretlen';
          const senderEmail = draftData.to_email || '';
          
          let tagHtml = '';
          
          // Localization map for tags and stages
          const localMap = {
             'urgent': 'Sürgős',
             'kiemelt': 'Kiemelt',
             'complaint': 'Panasz',
             'stuck': 'Technikai hiba',
             'ajanlat': 'Árajánlat',
             'foglalt': 'Időpontfoglalás',
             'irrelevant': 'Irreleváns / Spam'
          };
          
          // Show alert tags first
          if (c.alert_tags && c.alert_tags.length > 0) {
            const isUrgent = c.alert_tags.includes('urgent');
            const dispTag = localMap[c.alert_tags[0]] || c.alert_tags[0];
            tagHtml += `<div class="approval-card-tag ${isUrgent ? 'urgent' : ''}">${dispTag}</div>`;
          }
          
          // Show funnel stage if relevant and no tags
          if (!tagHtml) {
            let dispStage = localMap[c.funnel_stage];
            if (!dispStage) {
               dispStage = 'Egyéb'; // Fallback for unknown/empty stages like 'relevant', 'valaszolt'
            }
            tagHtml += `<div class="approval-card-tag" style="background: var(--bg2); color: var(--text-muted); border-color: var(--border);">${dispStage}</div>`;
          }
          
          if (currentApprovalTab === 'history') {
             const statusColor = c.approval_status === 'approved' ? '#22c55e' : '#ef4444';
             const statusText = c.approval_status === 'approved' ? 'Elküldve' : 'Elutasítva';
             tagHtml += `<div class="approval-card-tag" style="background: transparent; color: ${statusColor}; border-color: ${statusColor};">${statusText}</div>`;
          }
          
          const dateStr = new Date(c.created_at).toLocaleString('hu-HU', {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          
          // Replace single quotes for html onclick
          const safeC = JSON.stringify(c).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
          return `
            <div class="approval-card" onclick="openApprovalModal(${safeC})" style="position: relative;">
              <input type="checkbox" class="approval-checkbox" value="${c.id}" onclick="event.stopPropagation(); updateApprovalBulkActions()" style="position: absolute; top: 16px; left: 16px; z-index: 10; width: 18px; height: 18px; cursor: pointer;">
              <div class="approval-card-header">
                <div class="approval-card-channel" style="color: ${channelColor}; display: flex; align-items: center; gap: 6px; padding-left: 28px;">${channelIconSVG} <span>${c.type === 'email' ? 'E-mail' : c.type}</span></div>
                <div style="display:flex; gap:6px;">${tagHtml}</div>
              </div>
              <div class="approval-card-title">${esc(senderName)}</div>
              ${senderEmail ? `<div class="approval-card-subtitle">${esc(senderEmail)}</div>` : ''}
              <div class="approval-card-preview">${esc((draftData.body || '').replace(/<br\s*\/?>/gi, ' '))}</div>
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

    function openApprovalModal(c) {
      currentApprovalId = c.id;
      let draftData = {};
      try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e){}
      
      document.getElementById('approval-original-topic').textContent = (c.topic || '') + " - " + (c.summary || '');
      let initialDraft = draftData.body || '';
      initialDraft = initialDraft.replace(/<br\s*\/?>/gi, '\n');
      document.getElementById('approval-draft-text').value = initialDraft;
      
      const isHistory = currentApprovalTab === 'history';
      document.getElementById('btn-approval-approve').style.display = isHistory ? 'none' : 'block';
      document.getElementById('btn-approval-reject').style.display = isHistory ? 'none' : 'block';
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
      const btn = action === 'approve' ? document.getElementById('btn-approval-approve') : document.getElementById('btn-approval-reject');
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
        
        closeApprovalModal();
        loadApprovals(); // Frissíti a listát
        showToast('Sikeres művelet!', 'success');
      } catch (e) {
        alert(e.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

  