import os

file_path = "admin.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Bell and Toast Container
main_tag = '<main class="main">'
new_main_content = """<main class="main">
    <!-- ÉRTESÍTÉSI HARANG ÉS TOAST KONTÉNER (SÜRGŐS ESETEK) -->
    <div id="urgent-bell-container" title="Sürgős esetek" onclick="if(typeof showPage === 'function') showPage('clients'); if(typeof switchCustomerView === 'function') { const btn = document.querySelector('.view-btn[onclick*=\\'kanban\\']'); if(btn) switchCustomerView('kanban', btn); }" style="position:fixed; top:24px; right:32px; z-index:100; cursor:pointer; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); transition:all 0.2s;">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="20" height="20" style="color:var(--text);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      <span id="urgent-badge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ef4444; color:white; border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:bold; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(239,68,68,0.3);">0</span>
    </div>
    <div id="urgent-toast-container" style="position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:12px; pointer-events:none;"></div>
"""
if '<div id="urgent-bell-container"' not in content:
    content = content.replace(main_tag, new_main_content)

# 2. Add Polling Logic
helpers_end = """    function esc(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }"""

polling_script = """    function esc(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── SÜRGŐS ESETEK (URGENT ALERTS) POLLING ──────────────────────────────────────
    let knownUrgentIds = new Set();
    const urgentAudio = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); // Fallback placeholder ha nincs natív, de inkább egy diszkrét ding:
    urgentAudio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"; // Rövid csilingelés
    
    async function pollUrgentCases() {
      if (!authToken) return;
      try {
        const res = await authFetch('/admin/api/alerts/urgent');
        if (!res.ok) return;
        const data = await res.json();
        const urgentClients = data.urgent_clients || [];
        
        let newCount = 0;
        urgentClients.forEach(c => {
          if (!knownUrgentIds.has(c.id)) {
            knownUrgentIds.add(c.id);
            newCount++;
            showUrgentToast(c);
          }
        });
        
        const badge = document.getElementById('urgent-badge');
        if (urgentClients.length > 0) {
          badge.textContent = urgentClients.length;
          badge.style.display = 'flex';
          if (newCount > 0) {
            urgentAudio.play().catch(e => console.log('Audio autoplay prevented'));
          }
        } else {
          badge.style.display = 'none';
        }
      } catch (e) {
        console.error('Hiba a sürgős esetek lekérdezésekor:', e);
      }
    }
    
    function showUrgentToast(c) {
      const container = document.getElementById('urgent-toast-container');
      if (!container) return;
      
      const toast = document.createElement('div');
      // Tailwind stílusú felugró ablak
      toast.style.cssText = 'pointer-events:auto; width:320px; background:white; border-left:4px solid #ef4444; border-radius:6px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); padding:16px; transform:translateX(120%); opacity:0; transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; gap:6px;';
      
      if (document.body.classList.contains('dark')) {
         toast.style.background = '#1e293b';
         toast.style.color = '#f8fafc';
         toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.5)';
      }
      
      toast.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:16px;">🚨</span>
            <span style="font-weight:700; font-size:13px; color:#ef4444;">Sürgős eset beérkezett!</span>
          </div>
          <button style="background:none; border:none; cursor:pointer; color:#9ca3af; font-size:16px;" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div style="font-size:14px; font-weight:600; margin-top:4px; color:var(--text);">${esc(c.name)} <span style="font-size:11px; font-weight:500; color:#6b7280; padding:2px 6px; background:#f3f4f6; border-radius:4px; margin-left:6px;">${esc(c.channel)}</span></div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">${esc(c.problem)}</div>
        <button onclick="if(typeof showPage === 'function') showPage('clients'); if(typeof switchCustomerView === 'function') { const btn = document.querySelector('.view-btn[onclick*=\\'kanban\\']'); if(btn) switchCustomerView('kanban', btn); }; this.parentElement.remove();" style="margin-top:8px; align-self:flex-start; font-size:12px; font-weight:600; color:#2563eb; background:none; border:none; cursor:pointer; padding:0;">Megtekintés a Kanban táblán ➔</button>
      `;
      
      container.appendChild(toast);
      
      // Animáció be
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
      
      // 10 másodperc után eltűnik
      setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
      }, 10000);
    }
    
    // Indítás
    setInterval(pollUrgentCases, 15000);
    setTimeout(pollUrgentCases, 2000);
"""
if 'pollUrgentCases' not in content:
    content = content.replace(helpers_end, polling_script)

# 3. Update Kanban Board
kanban_old = """        currentKanbanColumns.forEach(col => {
          const container = document.getElementById('cards-' + col.id);
          const colClients = clientsByStatus[col.id] || [];
          colClients.forEach(c => {"""

kanban_new = """        currentKanbanColumns.forEach(col => {
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
          
          colClients.forEach(c => {"""

if 'Sürgős esetek rendezése legfelülre' not in content:
    content = content.replace(kanban_old, kanban_new)

kanban_ui_old = """            // Build dynamic UI for card
            const fieldsCount = currentClientFields.length;
            let titleVal = fieldsCount > 0 && c.custom_data ? JSON.parse(c.custom_data)[currentClientFields[0].id] : c.name;
            let otherHtml = currentClientFields.slice(1, 3).map(f => {
              let val = c.custom_data ? JSON.parse(c.custom_data)[f.id] : '';
              return val ? `<div class="client-info"> ${esc(val)}</div>` : '';
            }).join('');

            div.innerHTML = `
              <div class="client-name">${esc(titleVal || "Névtelen")}</div>
              ${otherHtml}
              <div style="text-align:right"><button onclick="deleteClient(${c.id})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:11px;">Törlés</button></div>
            `;"""

kanban_ui_new = """            // Build dynamic UI for card
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

            div.innerHTML = `
              ${isSurgos ? '<div style="display:inline-block;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:6px;box-shadow:0 1px 2px rgba(239,68,68,0.4);">🚨 SÜRGŐS</div>' : ''}
              <div class="client-name">${esc(titleVal || "Névtelen")}</div>
              ${otherHtml}
              <div style="text-align:right"><button onclick="deleteClient(${c.id})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:11px;">Törlés</button></div>
            `;"""

if 'isSurgos' not in content:
    content = content.replace(kanban_ui_old, kanban_ui_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("admin.html patched.")
