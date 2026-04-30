import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Update Sidebar Nav Item
old_nav = """      <button class="nav-item" id="nav-approvals" onclick="showPage('approvals')">
        <i class="fa-solid fa-clipboard-check" style="font-size: 20px; width: 24px; text-align: center;"></i>
        <span>Jóváhagyó rendszer</span>
      </button>"""

new_nav = """      <button class="nav-item" id="nav-approvals" onclick="showPage('approvals')">
        <i class="fa-regular fa-envelope" style="font-size: 20px; width: 24px; text-align: center;"></i>
        <span>Jóváhagyó rendszer</span>
      </button>"""

if old_nav in content:
    content = content.replace(old_nav, new_nav)
else:
    print('Failed to replace nav item')

# 2. Update Page Header HTML
old_header = """        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="page-title"><i class="fa-solid fa-clipboard-check" style="margin-right: 8px;"></i> E-mail jóváhagyás</div>
          </div>
          <div class="view-switcher-container">
            <button class="view-btn active" id="btn-tab-pending" onclick="switchApprovalTab('pending')"><i class="fa-solid fa-hourglass-half" style="margin-right: 6px;"></i> Várakozó</button>
            <button class="view-btn" id="btn-tab-history" onclick="switchApprovalTab('history')"><i class="fa-solid fa-clock-rotate-left" style="margin-right: 6px;"></i> Előzmények</button>
          </div>
          <button class="btn-refresh" onclick="loadApprovals()" style="margin-left: auto;"><i class="fa-solid fa-rotate"></i></button>
        </div>"""

new_header = """        <div class="page-header" style="margin-bottom:18px; display: flex; align-items: center;">
          <div style="display: flex; align-items: center;">
            <div style="width: 48px; height: 48px; background: #eef2f6; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
              <i class="fa-regular fa-envelope" style="font-size: 24px; color: #1e293b;"></i>
            </div>
            <div class="page-title" style="margin:0;">E-mail jóváhagyás</div>
          </div>
          
          <div style="display: flex; align-items: center; background: transparent; padding: 4px; gap: 8px; margin-left: 32px;">
            <button id="btn-tab-pending" onclick="switchApprovalTab('pending')" style="background: #1e293b; color: #f8fafc; border-radius: 10px; padding: 10px 18px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; font-size: 14px;">
              <i class="fa-solid fa-inbox" style="margin-right: 8px; opacity: 0.8;"></i> Várakozó
            </button>
            <button id="btn-tab-history" onclick="switchApprovalTab('history')" style="background: transparent; color: #94a3b8; border-radius: 10px; padding: 10px 18px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; font-size: 14px;">
              <i class="fa-solid fa-clock-rotate-left" style="margin-right: 8px; opacity: 0.8;"></i> Előzmények
            </button>
          </div>

          <div style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
            <select id="approval-category-filter" onchange="loadApprovals()" style="background: var(--bg2); color: var(--text); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 16px; font-weight: 600; outline: none; cursor: pointer;">
              <option value="all">Összes kategória</option>
              <option value="urgent">Sürgős</option>
              <option value="complaint">Panasz</option>
              <option value="stuck">Technikai hiba</option>
              <option value="ajanlat">Árajánlat</option>
              <option value="foglalt">Időpontfoglalás</option>
              <option value="irrelevant">Spam / Irreleváns</option>
            </select>
            <button class="btn-refresh" onclick="loadApprovals()"><i class="fa-solid fa-rotate"></i></button>
          </div>
        </div>"""

if old_header in content:
    content = content.replace(old_header, new_header)
else:
    print('Failed to replace header')


# 3. Update JS Logic
# a) update switchApprovalTab to handle the new tab styles
old_switch = """    function switchApprovalTab(tab) {
      currentApprovalTab = tab;
      document.getElementById('btn-tab-pending').classList.toggle('active', tab === 'pending');
      document.getElementById('btn-tab-history').classList.toggle('active', tab === 'history');
      loadApprovals();
    }"""

new_switch = """    function switchApprovalTab(tab) {
      currentApprovalTab = tab;
      
      const btnPending = document.getElementById('btn-tab-pending');
      const btnHistory = document.getElementById('btn-tab-history');
      
      if (tab === 'pending') {
         btnPending.style.background = '#1e293b';
         btnPending.style.color = '#f8fafc';
         btnHistory.style.background = 'transparent';
         btnHistory.style.color = '#94a3b8';
      } else {
         btnHistory.style.background = '#1e293b';
         btnHistory.style.color = '#f8fafc';
         btnPending.style.background = 'transparent';
         btnPending.style.color = '#94a3b8';
      }
      
      loadApprovals();
    }"""

content = content.replace(old_switch, new_switch)

# b) update loadApprovals filtering and localization
# We need to insert logic before items.map
old_items = """        if (items.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><i class="fa-solid fa-check-circle fa-2x" style="color: var(--success); margin-bottom: 16px;"></i><br><br>Nincs megjeleníthető elem. Minden üzenet feldolgozva!</div>';
          return;
        }
        
        grid.innerHTML = items.map(c => {"""

new_items = """        const filterCat = document.getElementById('approval-category-filter') ? document.getElementById('approval-category-filter').value : 'all';
        
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
               return true;
           });
        }
        
        if (filteredItems.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><i class="fa-solid fa-check-circle fa-2x" style="color: var(--success); margin-bottom: 16px;"></i><br><br>Nincs megjeleníthető elem a kiválasztott szűrők alapján!</div>';
          return;
        }
        
        grid.innerHTML = filteredItems.map(c => {"""

content = content.replace(old_items, new_items)

# c) update tag translation
old_tags = """          let tagHtml = '';
          if (c.alert_tags && c.alert_tags.length > 0) {
            const isUrgent = c.alert_tags.includes('urgent');
            tagHtml = `<div class="approval-card-tag ${isUrgent ? 'urgent' : ''}">${c.alert_tags[0]}</div>`;
          }"""

new_tags = """          let tagHtml = '';
          
          // Localization map for tags and stages
          const localMap = {
             'urgent': 'Sürgős',
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
          if (!tagHtml && c.funnel_stage) {
            const dispStage = localMap[c.funnel_stage];
            if (dispStage) {
               tagHtml += `<div class="approval-card-tag" style="background: var(--bg2); color: var(--text-muted); border-color: var(--border);">${dispStage}</div>`;
            }
          }"""

content = content.replace(old_tags, new_tags)


with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
