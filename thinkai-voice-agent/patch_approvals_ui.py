import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Sidebar menu item
sidebar_item = """      <button class="nav-item" id="nav-approvals" onclick="showPage('approvals')">
        <i class="fa-solid fa-clipboard-check" style="font-size: 20px; width: 24px; text-align: center;"></i>
        <span>Jóváhagyó rendszer</span>
      </button>"""

if 'id="nav-approvals"' not in content:
    content = content.replace('      <button class="nav-item" id="nav-settings"', sidebar_item + '\n      <button class="nav-item" id="nav-settings"')

# 2. HTML Page & Modal
html_content = """      <!-- APPROVALS PAGE -->
      <div class="page" id="page-approvals">
        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="page-title"><i class="fa-solid fa-clipboard-check" style="margin-right: 8px;"></i> E-mail jóváhagyás</div>
          </div>
          <div class="view-switcher-container">
            <button class="view-btn active" id="btn-tab-pending" onclick="switchApprovalTab('pending')"><i class="fa-solid fa-hourglass-half" style="margin-right: 6px;"></i> Várakozó</button>
            <button class="view-btn" id="btn-tab-history" onclick="switchApprovalTab('history')"><i class="fa-solid fa-clock-rotate-left" style="margin-right: 6px;"></i> Előzmények</button>
          </div>
          <button class="btn-refresh" onclick="loadApprovals()" style="margin-left: auto;"><i class="fa-solid fa-rotate"></i></button>
        </div>

        <div class="approvals-grid" id="approvals-grid">
          <!-- Cards will be injected here -->
        </div>
      </div>
      
  <!-- APPROVAL MODAL -->
  <div class="modal" id="approval-modal">
    <div class="modal-content" style="max-width: 800px; padding: 24px;">
      <div class="modal-header" style="margin-bottom: 20px;">
        <h3 class="modal-title" style="font-size: 20px;"><i class="fa-solid fa-check-double" style="margin-right: 8px; color: var(--primary);"></i> Üzenet jóváhagyása</h3>
        <button class="close-modal" onclick="closeApprovalModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 16px; background: var(--bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; font-weight: 700;">Eredeti üzenet / Kontextus:</div>
          <div id="approval-original-topic" style="font-weight: 500; font-size: 15px; line-height: 1.5;"></div>
        </div>
        <div style="margin-bottom: 24px;">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; font-weight: 700;">AI által generált válasz piszkozata:</div>
          <textarea id="approval-draft-text" class="form-control" style="height: 350px; resize: vertical; width: 100%; font-family: inherit; font-size: 14px; line-height: 1.6; padding: 16px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);"></textarea>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary" onclick="submitApproval('reject')" id="btn-approval-reject" style="padding: 10px 24px; font-weight: 600;"><i class="fa-solid fa-xmark" style="margin-right: 6px;"></i> Elutasítás</button>
          <button class="btn btn-primary" onclick="submitApproval('approve')" id="btn-approval-approve" style="padding: 10px 24px; font-weight: 600;"><i class="fa-solid fa-paper-plane" style="margin-right: 6px;"></i> Jóváhagyás és Küldés</button>
        </div>
      </div>
    </div>
  </div>"""

if 'id="page-approvals"' not in content:
    content = content.replace('      <!-- SETTINGS PAGE -->', html_content + '\n\n      <!-- SETTINGS PAGE -->')

# 3. CSS
css_content = """
    /* APPROVALS PAGE CSS */
    .approvals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .approval-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .approval-card:hover {
      border-color: var(--primary);
      transform: translateY(-4px);
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
    }
    .approval-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .approval-card-channel {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .approval-card-tag {
      font-size: 10px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .approval-card-tag.urgent { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
    .approval-card-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .approval-card-subtitle {
      font-size: 13px;
      color: var(--primary);
      margin-bottom: 14px;
      font-weight: 500;
    }
    .approval-card-preview {
      font-size: 14px;
      color: var(--text);
      line-height: 1.6;
      opacity: 0.85;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex-grow: 1;
    }
    .approval-card-footer {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
"""

if '/* APPROVALS PAGE CSS */' not in content:
    content = content.replace('  </style>', css_content + '\n  </style>')

# 4. JS
js_content = """
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

    async function loadApprovals() {
      const grid = document.getElementById('approvals-grid');
      if (!grid) return;
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Betöltés...</div>';
      
      try {
        const res = await authFetch('/admin/api/approvals?status=' + currentApprovalTab);
        if (!res.ok) throw new Error('Hiba a jóváhagyások betöltésekor');
        const data = await res.json();
        const items = data.approvals || [];
        
        if (items.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><i class="fa-solid fa-check-circle fa-2x" style="color: var(--success); margin-bottom: 16px;"></i><br><br>Nincs megjeleníthető elem. Minden üzenet feldolgozva!</div>';
          return;
        }
        
        grid.innerHTML = items.map(c => {
          let channelIcon = 'fa-solid fa-envelope';
          let channelColor = '#eab308';
          if (c.type === 'messenger' || c.type === 'meta') { channelIcon = 'fa-brands fa-facebook-messenger'; channelColor = '#3b82f6'; }
          if (c.type === 'whatsapp') { channelIcon = 'fa-brands fa-whatsapp'; channelColor = '#22c55e'; }
          
          let draftData = {};
          try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e){}
          
          const senderName = draftData.to_name || draftData.sender_id || c.session_id || 'Ismeretlen';
          const senderEmail = draftData.to_email || '';
          
          let tagHtml = '';
          if (c.alert_tags && c.alert_tags.length > 0) {
            const isUrgent = c.alert_tags.includes('urgent');
            tagHtml = `<div class="approval-card-tag ${isUrgent ? 'urgent' : ''}">${c.alert_tags[0]}</div>`;
          }
          
          if (currentApprovalTab === 'history') {
             const statusColor = c.approval_status === 'approved' ? '#22c55e' : '#ef4444';
             const statusText = c.approval_status === 'approved' ? 'Elküldve' : 'Elutasítva';
             tagHtml += `<div class="approval-card-tag" style="background: transparent; color: ${statusColor}; border-color: ${statusColor};">${statusText}</div>`;
          }
          
          const dateStr = new Date(c.created_at).toLocaleString('hu-HU', {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          
          return `
            <div class="approval-card" onclick='openApprovalModal(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
              <div class="approval-card-header">
                <div class="approval-card-channel" style="color: ${channelColor};"><i class="${channelIcon}"></i> ${c.type === 'email' ? 'E-mail' : c.type}</div>
                <div style="display:flex; gap:6px;">${tagHtml}</div>
              </div>
              <div class="approval-card-title">${esc(senderName)}</div>
              ${senderEmail ? `<div class="approval-card-subtitle">${esc(senderEmail)}</div>` : ''}
              <div class="approval-card-preview">${esc(draftData.body || '')}</div>
              <div class="approval-card-footer">
                <i class="fa-regular fa-clock"></i> ${dateStr}
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
      document.getElementById('approval-draft-text').value = draftData.body || '';
      
      const isHistory = currentApprovalTab === 'history';
      document.getElementById('btn-approval-approve').style.display = isHistory ? 'none' : 'block';
      document.getElementById('btn-approval-reject').style.display = isHistory ? 'none' : 'block';
      document.getElementById('approval-draft-text').disabled = isHistory;
      
      document.getElementById('approval-modal').classList.add('active');
    }

    function closeApprovalModal() {
      document.getElementById('approval-modal').classList.remove('active');
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
"""

# Append JS before the LAST </script> tag
if 'switchApprovalTab' not in content:
    idx = content.rfind('</script>')
    if idx != -1:
        content = content[:idx] + js_content + '\n  ' + content[idx:]

# Also make sure loadApprovals is called when showPage('approvals') happens
# Find function showPage(pageId)
show_page_addition = """    function showPage(pageId) {
      // Rejtjük az összes oldalt
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const activePage = document.getElementById('page-' + pageId);
      if (activePage) activePage.classList.add('active');

      // Frissítjük a navigációs gombok állapotát
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      const activeNav = document.getElementById('nav-' + pageId);
      if (activeNav) activeNav.classList.add('active');
      
      if (pageId === 'approvals') {
        loadApprovals();
      }"""

if "if (pageId === 'approvals') {" not in content:
    content = content.replace("    function showPage(pageId) {", show_page_addition)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print("admin.html patched!")
