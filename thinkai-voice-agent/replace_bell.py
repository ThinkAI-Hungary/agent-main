import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

old_bell = """    <div id="urgent-bell-container" title="Sürgős esetek" onclick="if(typeof showPage === 'function') showPage('clients'); if(typeof switchCustomerView === 'function') { const btn = document.querySelector('.view-btn[onclick*=\\'kanban\\']'); if(btn) switchCustomerView('kanban', btn); }" style="position:fixed; top:24px; right:32px; z-index:100; cursor:pointer; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); transition:all 0.2s;">"""

new_bell = """    <div id="urgent-bell-wrapper" style="position:fixed; top:24px; right:32px; z-index:100;">
      <div id="urgent-bell-container" title="Sürgős esetek" onclick="toggleUrgentDropdown()" style="cursor:pointer; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); transition:all 0.2s;">"""

content = content.replace(old_bell, new_bell)

old_bell_end = """      <span id="urgent-badge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ef4444; color:white; border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:bold; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(239,68,68,0.3);">0</span>
    </div>
    <div id="urgent-toast-container\""""

new_bell_end = """      <span id="urgent-badge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ef4444; color:white; border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:bold; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(239,68,68,0.3);">0</span>
      </div>
      <div id="urgent-dropdown" style="display:none; position:absolute; top:54px; right:0; width:300px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); max-height:400px; overflow-y:auto; flex-direction:column;">
        <div style="padding:12px 16px; border-bottom:1px solid var(--border); font-weight:600; font-size:14px; color:var(--text);">Sürgős riasztások</div>
        <div id="urgent-dropdown-list" style="display:flex; flex-direction:column;">
          <!-- List items will be injected here -->
        </div>
      </div>
    </div>
    <div id="urgent-toast-container\""""

content = content.replace(old_bell_end, new_bell_end)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print("Done")
