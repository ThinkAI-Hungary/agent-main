import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace HTML section
# Start: <div class="customer-view" id="view-client-details"
# End: </div>\n          <div class="customer-view" id="view-emails"

html_pattern = re.compile(r'(<div class="customer-view" id="view-client-details"[\s\S]*?)(\s*<div class="customer-view" id="view-emails")', re.DOTALL)

new_html = r'''<div class="customer-view" id="view-client-details"
            style="display:none; width: 100%; animation: fadein 0.3s ease;">
            <!-- Back button -->
            <button class="int-toolbar-btn" onclick="closeClientDetails()"
              style="margin-bottom: 20px; border:none; background:transparent; font-weight:600; font-size:14px; cursor:pointer;">
              <span style="margin-right:6px;">←</span> Vissza az interakciós listához
            </button>
            
            <!-- Top Card (Mint gradient) -->
            <div class="cd-top-card" style="display: flex; justify-content: space-between; align-items: stretch; background: linear-gradient(90deg, #c4f2e8 0%, #b8eae0 100%); padding: 24px 32px; border-radius: 12px; margin-bottom: 24px; position: relative;">
              
              <!-- Left: Avatar & Info -->
              <div style="display:flex; align-items:flex-start; gap:20px;">
                <div class="cd-avatar" style="width: 56px; height: 56px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg fill="none" height="28" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                    stroke-width="2" style="color:var(--accent);" viewbox="0 0 24 24" width="28">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:12px; margin-bottom: 4px;">
                    <h2 id="cd-name" style="margin:0; font-size:24px; font-weight:bold; color:#082432;">Ügyfél Neve</h2>
                    <span id="cd-status-badge" style="background:#082432; color:white; font-size:11px; font-weight:bold; padding:4px 8px; border-radius:6px; letter-spacing:0.5px;">ÚJ ÜGYFÉL</span>
                  </div>
                  <div id="cd-id" style="color:rgba(8,36,50,0.8); font-size:14px; margin-bottom: 16px;">DigiDesk azonosító: PAC-001234</div>
                  
                  <div style="display:flex; gap:32px; font-size:14px; color:#082432;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <svg class="cd-contact-icon" fill="none" height="16" stroke="currentColor" stroke-width="2"
                        viewbox="0 0 24 24" width="16" style="opacity:0.7;">
                        <path
                          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z">
                        </path>
                      </svg>
                      <span id="cd-phone" style="font-weight:500;">+36 30 123 4567</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <svg class="cd-contact-icon" fill="none" height="16" stroke="currentColor" stroke-width="2"
                        viewbox="0 0 24 24" width="16" style="opacity:0.7;">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                      <span id="cd-email" style="font-weight:500;">email@example.com</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Right: Profile Edit & Registration Date -->
              <div style="display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end;">
                <button onclick="editClientProfile()" style="background:transparent; border:none; cursor:pointer; color:#082432; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px;">
                  <svg fill="none" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewbox="0 0 24 24" width="16">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Profil módosítása
                </button>
                
                <div style="background:white; padding:12px 20px; border-radius:12px; display:flex; flex-direction:column; align-items:center; min-width:120px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                  <div style="font-size:11px; color:rgba(8,36,50,0.6); display:flex; align-items:center; gap:4px; font-weight:600; text-transform:uppercase;">
                    <svg fill="none" height="12" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24" width="12">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Regisztrálva:
                  </div>
                  <div id="cd-reg-date" style="font-size:16px; font-weight:bold; color:#082432; margin-top:4px;">N/A</div>
                </div>
              </div>
            </div>

            <!-- Middle Cards: Tags, Appointments, Notes -->
            <div style="display:grid; grid-template-columns: 1fr 1fr 1.5fr; gap:20px; margin-bottom:24px;">
              <!-- Tags -->
              <div style="background:#f3f4f6; border-radius:12px; padding:20px; display:flex; flex-direction:column; position:relative;">
                <h3 style="font-size:12px; font-weight:bold; color:#6b7280; text-transform:uppercase; margin-top:0; margin-bottom:16px;">Címkék</h3>
                <div id="cd-tags" style="display:flex; flex-wrap:wrap; gap:8px;">
                  <span style="background:#ffcdd2; color:#b71c1c; font-size:12px; padding:4px 10px; border-radius:16px; display:flex; align-items:center; gap:6px;">Árkérdés <span style="cursor:pointer; font-size:10px;">x</span></span>
                </div>
                <button style="margin-top:16px; background:transparent; border:none; color:#6b7280; font-size:12px; font-weight:600; text-align:left; cursor:pointer; padding:0;">+ Címke hozzáadása</button>
              </div>

              <!-- Previous Appointments -->
              <div style="background:#f3f4f6; border-radius:12px; padding:20px; display:flex; flex-direction:column; position:relative;">
                <h3 style="font-size:12px; font-weight:bold; color:#6b7280; text-transform:uppercase; margin-top:0; margin-bottom:16px;">Korábbi időpontok</h3>
                <div id="cd-appointments" style="display:flex; flex-direction:column; gap:8px;">
                  <!-- Mock Data initially -->
                  <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                    <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    2026. 05. 01. 13:00
                  </div>
                  <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                    <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    2026. 04. 11. 16:00
                  </div>
                  <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                    <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    2026. 03. 04. 17:00
                  </div>
                </div>
                <div style="margin-top:auto; text-align:right; font-size:12px; font-weight:600; color:#6b7280; cursor:pointer;">Összes időpont</div>
              </div>

              <!-- Notes -->
              <div style="background:white; border:1px solid var(--accent); border-radius:12px; padding:20px; display:flex; flex-direction:column;">
                <textarea placeholder="Megjegyzés" style="width:100%; height:100%; border:none; resize:none; font-family:inherit; font-size:14px; color:#082432; outline:none;"></textarea>
              </div>
            </div>

            <!-- Total Interactions -->
            <div id="cd-total-interactions" style="font-size:14px; font-weight:600; color:#4b5563; margin-bottom:16px;">
              Összes interakció: 0
            </div>

            <!-- Current Matters (Aktuális ügyek) Table -->
            <div style="margin-bottom: 32px;">
              <h3 style="font-size:14px; font-weight:bold; margin-bottom:16px; color:#4b5563; text-transform:uppercase;">Aktuális ügyek</h3>
              <div class="int-table-wrapper" style="border-radius:12px; border:1px solid var(--border); overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; text-align:left; background:white;">
                  <thead class="int-thead" style="background:#f9fafb;">
                    <tr>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Interakció időpontja</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Csatorna</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Interakció iránya</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Ügytípus</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Eredmény</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Státusz</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Teendő</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase; text-align:center;">Elvégezve</th>
                    </tr>
                  </thead>
                  <tbody id="cd-history-body-current">
                    <tr><td colspan="8" style="padding:32px; text-align:center; color:var(--text-muted); font-size:14px;">Még nincsenek adatok...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Past Interactions (Korábbi interakciók) Table -->
            <div style="margin-bottom: 32px;">
              <h3 style="font-size:14px; font-weight:bold; margin-bottom:16px; color:#4b5563; text-transform:uppercase;">Korábbi interakciók</h3>
              <div class="int-table-wrapper" style="border-radius:12px; border:1px solid var(--border); overflow:hidden; opacity:0.8;">
                <table style="width:100%; border-collapse:collapse; text-align:left; background:white;">
                  <thead class="int-thead" style="background:#f9fafb;">
                    <tr>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Interakció időpontja</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Csatorna</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Interakció iránya</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Ügytípus</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Eredmény</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Státusz</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase;">Teendő</th>
                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border); text-transform:uppercase; text-align:center;">Napló</th>
                    </tr>
                  </thead>
                  <tbody id="cd-history-body-past">
                    <tr><td colspan="8" style="padding:32px; text-align:center; color:var(--text-muted); font-size:14px;">Még nincsenek adatok...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>'''

content = html_pattern.sub(new_html + r'\2', content)

# 2. Replace JS section
js_pattern = re.compile(r'function openClientDetails\(clientData\) \{[\s\S]*?\}\n\n    function closeClientDetails\(\)', re.DOTALL)

new_js = r'''function openClientDetails(clientData) {
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
        alert("Profil módosítása funkció hamarosan elérhető lesz!");
    }

    function closeClientDetails()'''

content = js_pattern.sub(new_js, content)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully.")
