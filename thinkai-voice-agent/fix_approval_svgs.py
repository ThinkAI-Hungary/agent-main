import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

svg_envelope_header = """<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 24px; height: 24px; color: #1e293b;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>"""

svg_envelope_sidebar = """<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 20px; height: 20px; margin-right: 14px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
        </svg>"""

svg_inbox = """<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 18px; height: 18px; margin-right: 8px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
              </svg>"""

svg_history = """<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 18px; height: 18px; margin-right: 8px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>"""

svg_refresh = """<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>"""

# 1. Update Header Envelope
old_env_header = '<i class="fa-regular fa-envelope" style="font-size: 24px; color: #1e293b;"></i>'
content = content.replace(old_env_header, svg_envelope_header)

# 2. Update Sidebar Nav Item
old_nav_envelope = '<i class="fa-regular fa-envelope" style="font-size: 20px; width: 24px; text-align: center;"></i>'
if old_nav_envelope in content:
    content = content.replace(old_nav_envelope, svg_envelope_sidebar)
else:
    # try another match
    old_nav_envelope2 = '<i class="fa-regular fa-envelope" style="font-size: 20px; width: 24px; text-align: center;"></i>'
    content = content.replace(old_nav_envelope2, svg_envelope_sidebar)

# 3. Update the Tabs (replace button tags and inner icons)
old_tabs = """          <div style="display: flex; align-items: center; background: transparent; padding: 4px; gap: 8px; margin-left: 32px;">
            <button id="btn-tab-pending" onclick="switchApprovalTab('pending')" style="background: #1e293b; color: #f8fafc; border-radius: 10px; padding: 10px 18px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; font-size: 14px;">
              <i class="fa-solid fa-inbox" style="margin-right: 8px; opacity: 0.8;"></i> Várakozó
            </button>
            <button id="btn-tab-history" onclick="switchApprovalTab('history')" style="background: transparent; color: #94a3b8; border-radius: 10px; padding: 10px 18px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; font-size: 14px;">
              <i class="fa-solid fa-clock-rotate-left" style="margin-right: 8px; opacity: 0.8;"></i> Előzmények
            </button>
          </div>"""

new_tabs = f"""          <div class="view-switcher-container" style="margin-left: 32px; display: flex; gap: 8px;">
            <button class="view-btn active" id="btn-tab-pending" onclick="switchApprovalTab('pending')" style="display: flex; align-items: center;">
              {svg_inbox} Várakozó
            </button>
            <button class="view-btn" id="btn-tab-history" onclick="switchApprovalTab('history')" style="display: flex; align-items: center;">
              {svg_history} Előzmények
            </button>
          </div>"""

content = content.replace(old_tabs, new_tabs)

# 4. Update the Refresh Button
old_refresh = '<button class="btn-refresh" onclick="loadApprovals()"><i class="fa-solid fa-rotate"></i></button>'
new_refresh = f'<button class="btn-refresh" onclick="loadApprovals()">{svg_refresh}</button>'
content = content.replace(old_refresh, new_refresh)

# 5. Fix switchApprovalTab JS logic
old_js = """    function switchApprovalTab(tab) {
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

new_js = """    function switchApprovalTab(tab) {
      currentApprovalTab = tab;
      document.getElementById('btn-tab-pending').classList.toggle('active', tab === 'pending');
      document.getElementById('btn-tab-history').classList.toggle('active', tab === 'history');
      loadApprovals();
    }"""

content = content.replace(old_js, new_js)

# Also need to check if there are any other FontAwesome icons used in the approvals grid!
# Yes, the items.map uses FontAwesome!
# channelIcon
old_icons_map = """          let channelIcon = 'fa-solid fa-envelope';
          let channelColor = '#eab308';
          if (c.type === 'messenger' || c.type === 'meta') { channelIcon = 'fa-brands fa-facebook-messenger'; channelColor = '#3b82f6'; }
          if (c.type === 'whatsapp') { channelIcon = 'fa-brands fa-whatsapp'; channelColor = '#22c55e'; }"""

new_icons_map = """          let channelIconSVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`;
          let channelColor = '#eab308';
          if (c.type === 'messenger' || c.type === 'meta') { 
             channelIconSVG = `<svg fill="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M12 2C6.477 2 2 6.145 2 11.26c0 2.91 1.5 5.513 3.843 7.185v3.42c0 .484.542.766.945.502l3.435-2.22c1.7.472 3.518.472 5.218 0l3.435 2.22c.403.264.945-.018.945-.502v-3.42C20.5 16.773 22 14.17 22 11.26 22 6.145 17.523 2 12 2zm1 9h-2V7h2v4zm0 4h-2v-2h2v2z"/></svg>`;
             channelColor = '#3b82f6'; 
          }
          if (c.type === 'whatsapp') { 
             channelIconSVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>`;
             channelColor = '#22c55e'; 
          }"""

content = content.replace(old_icons_map, new_icons_map)

# Replace the usage of channelIcon in HTML
old_card_channel = '<div class="approval-card-channel" style="color: ${channelColor};"><i class="${channelIcon}"></i> ${c.type === \'email\' ? \'E-mail\' : c.type}</div>'
new_card_channel = '<div class="approval-card-channel" style="color: ${channelColor}; display: flex; align-items: center; gap: 6px;">${channelIconSVG} <span>${c.type === \'email\' ? \'E-mail\' : c.type}</span></div>'
content = content.replace(old_card_channel, new_card_channel)

# Also fix the empty state icons
old_empty1 = '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>'
new_empty1 = '<div style="display:inline-block; animation: callPulse 1.5s infinite; font-size: 24px;">⌛</div>'
content = content.replace(old_empty1, new_empty1)

old_empty2 = '<i class="fa-solid fa-check-circle fa-2x" style="color: var(--success); margin-bottom: 16px;"></i>'
new_empty2 = '<svg fill="none" stroke="var(--success)" stroke-width="2" viewBox="0 0 24 24" style="width:48px;height:48px;margin-bottom:16px;display:inline-block;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
content = content.replace(old_empty2, new_empty2)

# Fix clock icon
old_clock = '<i class="fa-regular fa-clock"></i>'
new_clock = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
content = content.replace(old_clock, new_clock)


with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
