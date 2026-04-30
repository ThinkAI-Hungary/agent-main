import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Add bulk action bar to the header
old_header_start = """          <div style="display: flex; align-items: center; background: transparent; padding: 4px; gap: 8px; margin-left: 32px;">"""
new_header_start = """          <div style="display: flex; align-items: center; background: transparent; padding: 4px; gap: 8px; margin-left: 32px;">
            <div id="approval-bulk-actions" style="display: none; align-items: center; gap: 8px; margin-right: 16px; border-right: 1px solid var(--border); padding-right: 16px;">
              <span id="approval-selected-count" style="color: var(--text-muted); font-size: 13px; font-weight: 600;">0 kijelölve</span>
              <button onclick="deleteSelectedApprovals()" style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; display: flex; align-items: center;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 6px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Törlés
              </button>
            </div>
            
            <label style="display: flex; align-items: center; cursor: pointer; margin-right: 8px; color: var(--text-muted); font-size: 13px; font-weight: 600;">
              <input type="checkbox" id="approval-select-all" onclick="toggleAllApprovals(this)" style="margin-right: 6px; cursor: pointer; width: 16px; height: 16px;"> Mind
            </label>
"""

if 'id="approval-bulk-actions"' not in content:
    content = content.replace(old_header_start, new_header_start)

# 2. Add checkbox to each card
old_card_start = """          return `<div class="approval-card" onclick="openApprovalModal(${c.id})">"""
new_card_start = """          return `<div class="approval-card" onclick="openApprovalModal(${c.id})" style="position: relative;">
            <input type="checkbox" class="approval-checkbox" value="${c.id}" onclick="event.stopPropagation(); updateApprovalBulkActions()" style="position: absolute; top: 16px; left: 16px; z-index: 10; width: 18px; height: 18px; cursor: pointer;">"""

content = content.replace(old_card_start, new_card_start)

# We also need to add a padding left to the top row so the checkbox doesn't overlap the channel icon.
# The original header row is: <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
old_card_header = """            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="approval-card-channel" style="color: ${channelColor}; display: flex; align-items: center; gap: 6px;">${channelIconSVG} <span>${c.type === 'email' ? 'E-mail' : c.type}</span></div>"""

new_card_header = """            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-left: 28px;">
              <div class="approval-card-channel" style="color: ${channelColor}; display: flex; align-items: center; gap: 6px;">${channelIconSVG} <span>${c.type === 'email' ? 'E-mail' : c.type}</span></div>"""

content = content.replace(old_card_header, new_card_header)


# 3. Add the javascript logic
js_logic = """
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
      const token = localStorage.getItem('token');
      
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
"""

# Insert JS logic right before the end of the script block or near loadApprovals
if 'function deleteSelectedApprovals' not in content:
    content = content.replace("async function loadApprovals() {", js_logic + "\n    async function loadApprovals() {")

# Also, reset selection when tabs change or refresh happens
old_load = """        if (countLabel) {
           countLabel.innerText = `${filteredItems.length} megjelenítve`;
        }"""
new_load = """        if (countLabel) {
           countLabel.innerText = `${filteredItems.length} megjelenítve`;
        }
        document.getElementById('approval-select-all').checked = false;
        updateApprovalBulkActions();"""

content = content.replace(old_load, new_load)


with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
