    // ══ ÉRTESÍTÉSI KÖZPONT (UNIFIED NOTIFICATION CENTER) ══════════════════════════
    const _notifications = [];        // All notifications array
    let _notifIdCounter = 0;
    let knownUrgentIds = new Set();
    let viewedUrgentIds = new Set();
    let knownCancelledIds = new Set();
    let viewedCancelledIds = new Set();
    let _lastInteractionPollTime = null;
    const urgentAudio = new Audio();
    urgentAudio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

    // ── Type config ──
    const _notifTypeConfig = {
      urgent:      { label: 'Sürgős',            color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '🔴', borderColor: '#ef4444' },
      interaction: { label: 'Új interakció',      color: '#1ceee0', bg: 'rgba(28,238,224,0.08)', icon: '💬', borderColor: '#1ceee0' },
      cancelled:   { label: 'Időpont lemondva',   color: '#f97316', bg: 'rgba(249,115,22,0.08)', icon: '⚠️', borderColor: '#f97316' }
    };

    function addNotification(type, data) {
      const id = ++_notifIdCounter;
      _notifications.unshift({ id, type, data, time: new Date(), read: false });
      // Keep max 50
      if (_notifications.length > 50) _notifications.length = 50;
      renderNotificationDropdown();
      updateNotificationBadge();
      // Toast only for urgent alerts
      if (type === 'urgent') showNotificationToast(type, data);
    }

    function renderNotificationDropdown() {
      const listDiv = document.getElementById('urgent-dropdown-list');
      if (!listDiv) return;

      if (_notifications.length === 0) {
        listDiv.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">Nincs új értesítés.</div>';
        return;
      }

      const items = _notifications.slice(0, 30);
      listDiv.innerHTML = items.map(n => {
        const cfg = _notifTypeConfig[n.type] || _notifTypeConfig.interaction;
        const timeStr = n.time.toLocaleString('hu-HU', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        const name = esc(n.data.name || n.data.client || 'Ismeretlen');
        const detail = esc(n.data.problem || n.data.summary || '');
        const channelBadge = n.data.channel ? `<span style="font-size:10px;font-weight:500;color:${cfg.color};background:${cfg.bg};padding:2px 6px;border-radius:4px;">${esc(n.data.channel)}</span>` : '';

        return `<div onclick="handleNotificationClick(${n.id})" style="padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; gap:10px; align-items:flex-start; transition:background 0.15s; background:${cfg.bg};" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='${cfg.bg}'">
          <div style="flex-shrink:0;width:8px;height:8px;border-radius:50%;margin-top:6px;background:${cfg.color};"></div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
              <span style="font-size:11px;font-weight:700;color:${cfg.color};text-transform:uppercase;letter-spacing:0.3px;">${cfg.icon} ${cfg.label}</span>
              <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">${timeStr}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:600;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
              ${channelBadge}
            </div>
            ${detail ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${detail}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    function updateNotificationBadge() {
      const badge = document.getElementById('urgent-badge');
      if (!badge) return;
      const count = _notifications.length;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function handleNotificationClick(notifId) {
      const idx = _notifications.findIndex(x => x.id === notifId);
      if (idx === -1) return;
      const n = _notifications[idx];
      _notifications.splice(idx, 1);
      document.getElementById('urgent-dropdown').style.display = 'none';
      updateNotificationBadge();
      renderNotificationDropdown();

      if (n.type === 'urgent') {
        viewedUrgentIds.add(n.data.clientId || n.data.id);
        if (n.data.clientId || n.data.id) {
          try { authFetch('/admin/api/alerts/urgent/' + (n.data.clientId || n.data.id) + '/view', { method: 'POST' }); } catch(e) {}
        }
        if(typeof showPage === 'function') showPage('clients');
        if(typeof openClientDetails === 'function') openClientDetails({id: n.data.clientId || n.data.id, name: n.data.name, email: n.data.email || '', phone: n.data.phone || ''});
      } else if (n.type === 'cancelled') {
        viewedCancelledIds.add(n.data.clientId || n.data.id);
        if (n.data.clientId || n.data.id) {
          try { authFetch('/admin/api/alerts/cancelled/' + (n.data.clientId || n.data.id) + '/view', { method: 'POST' }); } catch(e) {}
        }
        if(typeof showPage === 'function') showPage('clients');
        if(typeof openClientDetails === 'function') openClientDetails({id: n.data.clientId || n.data.id, name: n.data.name, email: n.data.email || '', phone: n.data.phone || ''});
      } else if (n.type === 'interaction') {
        if(typeof showPage === 'function') showPage('interactions');
      }
    }

    // ── Toast Notification (for all types) ──
    function showNotificationToast(type, data) {
      const container = document.getElementById('urgent-toast-container');
      if (!container) return;
      const cfg = _notifTypeConfig[type] || _notifTypeConfig.interaction;
      const toast = document.createElement('div');
      toast.style.cssText = `pointer-events:auto; width:340px; background:white; border-left:4px solid ${cfg.borderColor}; border-radius:8px; box-shadow:0 10px 25px -3px rgba(0,0,0,0.12), 0 4px 8px -2px rgba(0,0,0,0.06); padding:14px 16px; transform:translateX(120%); opacity:0; transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; gap:4px;`;

      if (document.body.classList.contains('dark')) {
         toast.style.background = '#1e293b';
         toast.style.color = '#f8fafc';
         toast.style.boxShadow = '0 10px 25px -3px rgba(0,0,0,0.5)';
      }

      const name = esc(data.name || data.client || 'Ismeretlen');
      const detail = esc(data.problem || data.summary || '');
      const channel = esc(data.channel || '');

      toast.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">${cfg.icon}</span>
            <span style="font-weight:700; font-size:12px; color:${cfg.color};">${cfg.label}</span>
          </div>
          <button style="background:none; border:none; cursor:pointer; color:#9ca3af; font-size:16px; line-height:1;" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="font-size:13px; font-weight:600; color:var(--text);">${name}</span>
          ${channel ? `<span style="font-size:10px;font-weight:500;color:#6b7280;padding:2px 6px;background:#f3f4f6;border-radius:4px;">${channel}</span>` : ''}
        </div>
        ${detail ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${detail}</div>` : ''}
      `;

      container.appendChild(toast);
      requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; toast.style.opacity = '1'; });
      setTimeout(() => { toast.style.transform = 'translateX(120%)'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 8000);
    }

    // ── POLL: Sürgős esetek ──
    async function pollUrgentCases() {
      if (!authToken) return;
      try {
        const res = await authFetch('/admin/api/alerts/urgent');
        if (!res.ok) return;
        const data = await res.json();
        const urgentClients = (data.urgent_clients || []).filter(c => !viewedUrgentIds.has(c.id));

        let newCount = 0;
        urgentClients.forEach(c => {
          if (!knownUrgentIds.has(c.id)) {
            knownUrgentIds.add(c.id);
            newCount++;
            addNotification('urgent', { clientId: c.id, name: c.name, email: c.email, phone: c.phone, channel: c.channel, problem: c.problem });
          }
        });

        if (newCount > 0) {
          urgentAudio.play().catch(e => console.log('Audio autoplay prevented'));
        }
      } catch (e) {
        console.error('Hiba a sürgős esetek lekérdezésekor:', e);
      }
    }

    // ── POLL: Lemondott időpontok ──
    async function pollCancelledCases() {
      if (!authToken) return;
      try {
        const res = await authFetch('/admin/api/alerts/cancelled');
        if (!res.ok) return;
        const data = await res.json();
        const cancelledClients = (data.cancelled_clients || []).filter(c => !viewedCancelledIds.has(c.id));

        cancelledClients.forEach(c => {
          if (!knownCancelledIds.has(c.id)) {
            knownCancelledIds.add(c.id);
            addNotification('cancelled', { clientId: c.id, name: c.name, email: c.email, phone: c.phone, channel: c.channel, summary: 'Időpont lemondva' });
          }
        });
      } catch (e) {
        console.error('Hiba a lemondott esetek lekérdezésekor:', e);
      }
    }

    // ── POLL: Új interakciók ──
    // Smart summary builder for notifications
    function _buildFriendlyInteractionSummary(session, channel) {
      // Collect all meaningful text from the session
      const parts = [];
      if (session.interactions && session.interactions.length > 0) {
        const latest = session.interactions[session.interactions.length - 1];
        if (latest.topic) parts.push(latest.topic);
        if (latest.summary) parts.push(latest.summary);
        if (latest.type) parts.push(latest.type);
      }
      if (session.summary) parts.push(session.summary);
      if (session.topic) parts.push(session.topic);
      
      const combined = parts.join(' ').toLowerCase();
      
      // Match to friendly categories
      if (combined.includes('időpont') || combined.includes('foglal') || combined.includes('booking') || combined.includes('lemondás'))
        return 'Időpontfoglalással kapcsolatos megkeresés';
      if (combined.includes('panasz') || combined.includes('reklamáció') || combined.includes('complaint'))
        return 'Panasz érkezett';
      if (combined.includes('kérdés') || combined.includes('question') || combined.includes('információ') || combined.includes('érdeklőd'))
        return 'Kérdés érkezett';
      if (combined.includes('kérés') || combined.includes('request') || combined.includes('igény'))
        return 'Új kérés érkezett';
      if (combined.includes('ár') || combined.includes('árajánlat') || combined.includes('költség'))
        return 'Árajánlat kérés érkezett';
      if (combined.includes('email') || combined.includes('e-mail'))
        return 'Email üzenet érkezett';
      
      // Fallback: channel-based friendly text
      const channelMap = {
        'Messenger': 'Új Messenger üzenet érkezett',
        'Instagram': 'Új Instagram üzenet érkezett',
        'WhatsApp': 'Új WhatsApp üzenet érkezett',
        'Email': 'Új email érkezett',
        'Telefon': 'Új telefonos megkeresés'
      };
      return channelMap[channel] || 'Új üzenet érkezett';
    }

    // Track seen interaction IDs (from the interactions table directly)
    let _seenInteractionIds = new Set();

    async function pollNewInteractions() {
      if (!authToken) return;
      try {
        const res = await authFetch('/admin/api/interactions?limit=30');
        if (!res.ok) return;
        const data = await res.json();
        const interactions = data.interactions || [];

        if (_lastInteractionPollTime === null) {
          // First run — register all existing interaction IDs silently
          interactions.forEach(i => _seenInteractionIds.add(i.id));
          _lastInteractionPollTime = Date.now();
          return;
        }

        // Check for new interactions (ones we haven't seen before)
        interactions.forEach(i => {
          if (!_seenInteractionIds.has(i.id)) {
            _seenInteractionIds.add(i.id);

            // Detect channel from type field
            const t = (i.type || '').toLowerCase();
            let channel = 'Telefon';
            if (t.includes('messenger')) channel = 'Messenger';
            else if (t.includes('email')) channel = 'Email';
            else if (t.includes('instagram')) channel = 'Instagram';
            else if (t.includes('whatsapp')) channel = 'WhatsApp';

            // Get client name from session or interaction
            const clientName = i.participant || i.client_name || 'Ismeretlen';

            // Check if this is an urgent interaction
            const tags = i.alert_tags || [];
            const isUrgent = tags.includes('urgent');

            if (isUrgent) {
              // Fire urgent notification (with toast + sound)
              addNotification('urgent', { name: clientName, channel: channel, problem: 'Sürgős megkeresés beérkezett.' });
              urgentAudio.play().catch(e => console.log('Audio autoplay prevented'));
            } else {
              // Regular interaction notification
              const summary = _buildFriendlyInteractionSummary({ interactions: [i], summary: i.summary || '' }, channel);
              addNotification('interaction', { client: clientName, channel: channel, summary: summary });
            }
          }
        });
      } catch (e) {
        console.error('Hiba az új interakciók lekérdezésekor:', e);
      }
    }

    // ── Start polling ──
    setInterval(pollUrgentCases, 15000);
    setTimeout(pollUrgentCases, 2000);
    setInterval(pollCancelledCases, 15000);
    setTimeout(pollCancelledCases, 2500);
    setInterval(pollNewInteractions, 15000);
    setTimeout(pollNewInteractions, 3000);
    
    function toggleUrgentDropdown() {
      const dropdown = document.getElementById('urgent-dropdown');
      if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'flex';
      } else {
        dropdown.style.display = 'none';
      }
    }


    // ── Auto login if token exists ────────────────────────────────────────────────
    if (authToken) {
      authFetch('/admin/api/stats?period=month')
        .then(() => enterApp())
        .catch(() => {
          authToken = '';
          localStorage.removeItem('thinkai_admin_token');
        });
    }
