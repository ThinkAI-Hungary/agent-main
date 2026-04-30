import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Fix Modal HTML
old_modal = """  <!-- APPROVAL MODAL -->
  <div class="modal" id="approval-modal">
    <div class="modal-content" style="max-width: 800px; padding: 24px;">"""

new_modal = """  <!-- APPROVAL MODAL -->
  <div id="approval-modal" style="display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center;">
    <div class="login-card" style="width:800px; max-width:90vw; padding:24px;">"""

if old_modal in content:
    content = content.replace(old_modal, new_modal)

# 2. Append JS
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
          
          // Replace single quotes for html onclick
          const safeC = JSON.stringify(c).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
          return `
            <div class="approval-card" onclick="openApprovalModal(${safeC})">
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
"""

if "function loadApprovals" not in content:
    idx = content.rfind('</script>')
    if idx != -1:
        content = content[:idx] + js_content + '\n  ' + content[idx:]

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
