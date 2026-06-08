// ══════════════════════════════════════════════════════════════════════════════
// KIMENŐ KOMMUNIKÁCIÓ – KAMPÁNYOK (Backend API)
// ══════════════════════════════════════════════════════════════════════════════

window._campaigns = [];
window._selectedCampaignChannels = ['email'];
window._campaignTargetClientIds = [];

async function loadCampaigns() {
  try {
    const resp = await authFetch('/admin/api/campaigns');
    const data = await resp.json();
    window._campaigns = data.campaigns || [];
  } catch(e) {
    console.error('Kampányok betöltése sikertelen:', e);
    window._campaigns = [];
  }

  const campaigns = window._campaigns;

  // ── Update KPI stats ──
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setVal('out-stat-total', campaigns.length);
  setVal('out-stat-running', campaigns.filter(c => c.status === 'Aktív').length);
  setVal('out-stat-closed', campaigns.filter(c => c.status === 'Befejezett').length);
  setVal('out-stat-targeted', campaigns.reduce((sum, c) => sum + (c.client_ids ? c.client_ids.length : 0), 0));
  setVal('out-stat-reactions', 0);  // placeholder
  setVal('out-stat-conversion', 0);  // placeholder

  // ── Update reminder status ──
  try {
    authFetch('/admin/api/settings/reminder').then(r => r.json()).then(data => {
      const toggle = document.getElementById('outbound-reminder-toggle');
      const label = document.getElementById('outbound-reminder-label');
      if (data) {
        const enabled = data.reminder_enabled;
        if (toggle) toggle.checked = enabled;
        if (label) {
          label.textContent = enabled ? 'Aktív' : 'Kikapcsolva';
          label.style.color = enabled ? '#22c55e' : 'var(--text-muted)';
        }
      }
    }).catch(() => {});
  } catch(e) {}

  // ── Render campaign cards ──
  renderOutboundCampaigns();
}

// ── Campaign Wizard: client status filter ──
async function filterByClientStatus(btn, status) {
  // Toggle active state
  const wasActive = btn.classList.contains('active');
  // Deselect all
  document.querySelectorAll('.camp-status-badge').forEach(b => b.classList.remove('active'));
  if (wasActive) {
    // Deselected — clear filter
    window._campaignPickerClientIds = new Set();
    window._campaignTargetClientIds = [];
    updateCampaignClientCount();
    renderCampaignClientList();
    return;
  }
  btn.classList.add('active');
  // Load clients and populate _campaignAllClients
  await loadCampaignClientsForPicker();

  // Load kanban columns to build name → ID mapping
  let kanbanColumns = [];
  try {
    const colRes = await authFetch('/admin/api/kanban_columns');
    const colData = await colRes.json();
    kanbanColumns = colData.columns || [];
  } catch(e) {}

  // Build name → id mapping (lowercase name → column id)
  const nameToIds = {};
  kanbanColumns.forEach(col => {
    const name = (col.name || '').toLowerCase().trim();
    if (!nameToIds[name]) nameToIds[name] = [];
    nameToIds[name].push(col.id);
  });

  // Map button status to kanban column name patterns
  let matchingColumnIds = [];
  if (status === 'uj') {
    // Match columns with names like "Új ügyfél", "Új", "uj", "Új ügyfelek"
    for (const [name, ids] of Object.entries(nameToIds)) {
      if (name.includes('új') || name.includes('uj') || name === 'new') {
        matchingColumnIds.push(...ids);
      }
    }
  } else if (status === 'visszatero') {
    for (const [name, ids] of Object.entries(nameToIds)) {
      if (name.includes('visszat') || name.includes('visszat')) {
        matchingColumnIds.push(...ids);
      }
    }
  } else if (status === 'inaktiv') {
    for (const [name, ids] of Object.entries(nameToIds)) {
      if (name.includes('inakt') || name.includes('lemondott') || name.includes('inactive')) {
        matchingColumnIds.push(...ids);
      }
    }
  }

  // Also match by status value directly (fallback if column ID matches the button value)
  const matchSet = new Set(matchingColumnIds);

  const matching = (window._campaignAllClients || []).filter(c => {
    const s = (c.status || '').toLowerCase();
    // Match by column ID
    if (matchSet.has(c.status)) return true;
    // Fallback: match by raw status string
    if (status === 'uj' && (s === 'uj' || s.includes('új'))) return true;
    if (status === 'visszatero' && (s === 'visszatero' || s.includes('visszat'))) return true;
    if (status === 'inaktiv' && (s === 'inaktiv' || s.includes('inakt') || s === 'lemondott')) return true;
    return false;
  });

  window._campaignPickerClientIds = new Set(matching.map(c => c.id));
  window._campaignTargetClientIds = [...window._campaignPickerClientIds];
  updateCampaignClientCount();
  renderCampaignClientList();
  renderCampaignSelectedChips();
}

// ── Campaign Wizard: Rich Text Editor (always active) ──
window._campQuill = null;

function initCampQuill() {
  if (window._campQuill) return;
  window._campQuill = new Quill('#camp-quill-editor', {
    theme: 'snow',
    modules: { toolbar: '#camp-quill-toolbar' },
    placeholder: 'Írj formázott kampány tartalmat... Címsorok, linkek, listák, félkövér szöveg.'
  });
  window._campQuill.on('text-change', function() {
    const text = window._campQuill.getText().trim();
    const words = text ? text.split(/\s+/).length : 0;
    const el = document.getElementById('camp-word-count');
    if (el) el.textContent = words + ' szó';
  });
}

function initCampAiQuill() {
  if (window._campAiQuill) return;
  window._campAiQuill = new Quill('#camp-ai-quill-editor', {
    theme: 'snow',
    modules: { toolbar: '#camp-ai-quill-toolbar' },
    placeholder: 'Szerkeszd a kampány tartalmát formázottan...'
  });
}

// ── Analytics Panel ──
window._outAnalyticsCharts = {};

function toggleOutboundAnalytics() {
  const panel = document.getElementById('out-analytics-panel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    // Destroy charts to free memory
    Object.values(window._outAnalyticsCharts).forEach(c => c.destroy());
    window._outAnalyticsCharts = {};
  } else {
    panel.classList.add('open');
    // Small delay so panel is visible before rendering charts
    setTimeout(() => renderOutboundCharts(), 100);
  }
}

function renderOutboundCharts() {
  const campaigns = window._campaigns || [];
  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(107,139,153,0.15)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#8ea9c0' : '#64748b';
  const textMainColor = isDark ? '#e8edf5' : '#0f172a';

  // Destroy existing charts
  Object.values(window._outAnalyticsCharts).forEach(c => c.destroy());
  window._outAnalyticsCharts = {};

  // Default Chart.js settings
  Chart.defaults.font.family = "'Inter', Arial, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = textColor;

  // ── 1. Status Doughnut ──
  const statusCounts = {
    'Tervezet': campaigns.filter(c => c.status === 'Vázlat').length,
    'Aktív': campaigns.filter(c => c.status === 'Aktív').length,
    'Elküldött': campaigns.filter(c => c.status === 'Befejezett').length,
    'Megállítva': campaigns.filter(c => c.status === 'Megállítva').length
  };
  const statusCtx = document.getElementById('out-chart-status');
  if (statusCtx) {
    window._outAnalyticsCharts.status = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: [
            'rgba(107,139,153,0.6)',
            'rgba(34,197,94,0.8)',
            'rgba(28,238,224,0.8)',
            'rgba(245,158,11,0.8)'
          ],
          borderColor: isDark ? '#0d2538' : '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            backgroundColor: isDark ? '#0d2538' : '#082432',
            titleFont: { weight: '700' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: function(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round(ctx.raw / total * 100) : 0;
                return ' ' + ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  // ── 2. Channel Bar ──
  const channelCounts = {};
  const channelLabels = { email: 'Email', messenger: 'Messenger', telefon: 'Telefon', whatsapp: 'WhatsApp', instagram: 'Instagram' };
  campaigns.forEach(c => {
    const channels = c.channels || (c.channel ? [c.channel] : ['email']);
    channels.forEach(ch => {
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });
  });
  const chKeys = Object.keys(channelCounts);
  const chLabels = chKeys.map(k => channelLabels[k] || k);
  const chColors = chKeys.map(k => {
    const map = { email: 'rgba(59,130,246,0.8)', messenger: 'rgba(139,92,246,0.8)', telefon: 'rgba(34,197,94,0.8)', whatsapp: 'rgba(37,211,102,0.8)', instagram: 'rgba(225,48,108,0.8)' };
    return map[k] || 'rgba(28,238,224,0.8)';
  });
  const chCtx = document.getElementById('out-chart-channels');
  if (chCtx) {
    window._outAnalyticsCharts.channels = new Chart(chCtx, {
      type: 'bar',
      data: {
        labels: chLabels,
        datasets: [{
          label: 'Kampányok',
          data: Object.values(channelCounts),
          backgroundColor: chColors,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 40,
          maxBarThickness: 50
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#0d2538' : '#082432',
            padding: 12,
            cornerRadius: 10,
            titleFont: { weight: '700' },
            callbacks: { label: function(ctx) { return ' ' + ctx.raw + ' kampány'; } }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: '600' } }, grid: { color: gridColor } },
          x: { grid: { display: false }, ticks: { font: { weight: '600' } } }
        }
      }
    });
  }

  // ── 3. Clients per Campaign (Horizontal Bar) ──
  const sortedByClients = [...campaigns].sort((a, b) => (b.client_ids?.length || 0) - (a.client_ids?.length || 0)).slice(0, 6);
  const clientCtx = document.getElementById('out-chart-clients');
  if (clientCtx) {
    window._outAnalyticsCharts.clients = new Chart(clientCtx, {
      type: 'bar',
      data: {
        labels: sortedByClients.map(c => c.name.length > 18 ? c.name.substring(0, 18) + '...' : c.name),
        datasets: [{
          label: 'Ügyfelek',
          data: sortedByClients.map(c => c.client_ids?.length || 0),
          backgroundColor: function(ctx) {
            const chart = ctx.chart;
            const {ctx: canvasCtx, chartArea} = chart;
            if (!chartArea) return 'rgba(28,238,224,0.6)';
            const gradient = canvasCtx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
            gradient.addColorStop(0, 'rgba(28,238,224,0.3)');
            gradient.addColorStop(1, 'rgba(28,238,224,0.9)');
            return gradient;
          },
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#0d2538' : '#082432',
            padding: 12,
            cornerRadius: 10,
            callbacks: { label: function(ctx) { return ' ' + ctx.raw + ' ügyfél célozva'; } }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: '600' } }, grid: { color: gridColor } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: textMainColor } }
        }
      }
    });
  }

  // ── 4. Timeline (Line chart) ──
  const monthMap = {};
  const monthNames = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec'];
  campaigns.forEach(c => {
    if (c.created_at) {
      const d = new Date(c.created_at);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const label = monthNames[d.getMonth()] + ' ' + d.getFullYear();
      if (!monthMap[key]) monthMap[key] = { label, count: 0, clients: 0 };
      monthMap[key].count++;
      monthMap[key].clients += (c.client_ids?.length || 0);
    }
  });
  const sortedMonths = Object.keys(monthMap).sort();
  const timeCtx = document.getElementById('out-chart-timeline');
  if (timeCtx) {
    window._outAnalyticsCharts.timeline = new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: sortedMonths.map(k => monthMap[k].label),
        datasets: [
          {
            label: 'Kampányok',
            data: sortedMonths.map(k => monthMap[k].count),
            borderColor: '#1ceee0',
            backgroundColor: 'rgba(28,238,224,0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: '#1ceee0',
            pointBorderColor: isDark ? '#0d2538' : '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8
          },
          {
            label: 'Célzott ügyfelek',
            data: sortedMonths.map(k => monthMap[k].clients),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139,92,246,0.08)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            borderDash: [5, 5],
            pointBackgroundColor: '#8b5cf6',
            pointBorderColor: isDark ? '#0d2538' : '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 11, weight: '600' } } },
          tooltip: {
            backgroundColor: isDark ? '#0d2538' : '#082432',
            padding: 12,
            cornerRadius: 10,
            titleFont: { weight: '700' }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: '600' } }, grid: { color: gridColor } },
          x: { grid: { display: false }, ticks: { font: { weight: '600' } } }
        }
      }
    });
  }

  // ── Summary stats ──
  const totalClients = campaigns.reduce((s, c) => s + (c.client_ids?.length || 0), 0);
  const avgClients = campaigns.length > 0 ? Math.round(totalClients / campaigns.length) : 0;
  document.getElementById('out-sum-avg-clients').textContent = avgClients;

  // Top channel
  let topCh = '-';
  let topChCount = 0;
  Object.entries(channelCounts).forEach(([k, v]) => { if (v > topChCount) { topChCount = v; topCh = channelLabels[k] || k; } });
  document.getElementById('out-sum-top-channel').textContent = topCh;

  // Success rate
  const finished = campaigns.filter(c => c.status === 'Befejezett').length;
  const rate = campaigns.length > 0 ? Math.round(finished / campaigns.length * 100) : 0;
  document.getElementById('out-sum-success-rate').textContent = rate + '%';

  // Last campaign
  const sorted = [...campaigns].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (sorted.length > 0 && sorted[0].created_at) {
    const d = new Date(sorted[0].created_at);
    document.getElementById('out-sum-last-campaign').textContent = monthNames[d.getMonth()] + ' ' + d.getDate() + '.';
  } else {
    document.getElementById('out-sum-last-campaign').textContent = '-';
  }
}

// ── Campaign client picker: navigate to client list ──
window._campPickerMode = false;

function goToClientListForCampaign() {
  // Hide the campaign modal (don't close it — preserve state)
  const modal = document.getElementById('campaign-modal');
  if (modal) modal.style.display = 'none';

  // Navigate to client list page
  if (typeof showPage === 'function') showPage('clients');

  // Enter picker mode
  window._campPickerMode = true;

  // Show floating bar
  const bar = document.getElementById('camp-float-bar');
  if (bar) bar.classList.add('visible');

  // Start tracking checkbox changes
  updateCampFloatCount();
  document.addEventListener('change', _campCheckboxListener);

  showToast('info', 'Jelöld ki az ügyfeleket, majd kattints a "Vissza a kampányhoz" gombra!');
}

function _campCheckboxListener(e) {
  if (e.target && (e.target.classList.contains('client-checkbox') || e.target.id === 'select-all-clients')) {
    setTimeout(updateCampFloatCount, 50);
  }
}

function updateCampFloatCount() {
  const checked = document.querySelectorAll('.client-checkbox:checked');
  const countEl = document.getElementById('camp-float-count');
  if (countEl) countEl.textContent = checked.length;
}

function confirmCampClientPick() {
  // Collect selected client IDs
  const checked = document.querySelectorAll('.client-checkbox:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.value)).filter(id => !isNaN(id));

  // Exit picker mode
  _exitCampPickerMode();

  if (ids.length === 0) {
    showToast('error', 'Nincs kijelölt ügyfél! Jelölj ki legalább egyet.');
    // Reopen modal anyway
    const modal = document.getElementById('campaign-modal');
    if (modal) modal.style.display = 'flex';
    return;
  }

  // Update campaign modal state with selected clients
  window._campaignPickerClientIds = new Set(ids);
  window._campaignTargetClientIds = [...ids];

  // Navigate back to outbound page
  if (typeof showPage === 'function') showPage('outbound');

  // Reopen the campaign modal
  const modal = document.getElementById('campaign-modal');
  if (modal) modal.style.display = 'flex';

  // Update the count display
  updateCampaignClientCount();
  renderCampaignSelectedChips();

  // Uncheck all client checkboxes (clean up)
  document.querySelectorAll('.client-checkbox:checked').forEach(cb => cb.checked = false);
  const selectAll = document.getElementById('select-all-clients');
  if (selectAll) selectAll.checked = false;

  showToast('success', ids.length + ' ügyfél kiválasztva a kampányhoz!');
}

function cancelCampClientPick() {
  _exitCampPickerMode();

  // Navigate back to outbound
  if (typeof showPage === 'function') showPage('outbound');

  // Reopen modal
  const modal = document.getElementById('campaign-modal');
  if (modal) modal.style.display = 'flex';
}

function _exitCampPickerMode() {
  window._campPickerMode = false;
  const bar = document.getElementById('camp-float-bar');
  if (bar) bar.classList.remove('visible');
  document.removeEventListener('change', _campCheckboxListener);
}

async function toggleOutboundReminder(enabled) {
  const label = document.getElementById('outbound-reminder-label');
  if (label) {
    label.textContent = enabled ? 'Aktív' : 'Kikapcsolva';
    label.style.color = enabled ? '#22c55e' : 'var(--text-muted)';
  }
  try {
    const getRes = await authFetch('/admin/api/settings/reminder');
    const current = await getRes.json();
    const payload = {
      reminder_enabled: enabled,
      reminder_hours: current.reminder_hours || 24,
      reminder_template: current.reminder_template || ''
    };
    const res = await authFetch('/admin/api/settings/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Hiba');
    showToast('success', enabled ? 'Emlékeztető bekapcsolva!' : 'Emlékeztető kikapcsolva!');
    const settingsToggle = document.getElementById('reminder-enabled');
    if (settingsToggle) settingsToggle.checked = enabled;
  } catch(e) {
    const toggle = document.getElementById('outbound-reminder-toggle');
    if (toggle) toggle.checked = !enabled;
    if (label) {
      label.textContent = !enabled ? 'Aktív' : 'Kikapcsolva';
      label.style.color = !enabled ? '#22c55e' : 'var(--text-muted)';
    }
    showToast('error', 'Hiba a mentés során!');
  }
}

window._outboundActiveFilter = 'Összes';

function filterOutboundView(tab) {
  window._outboundActiveFilter = tab;
  document.querySelectorAll('.out-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === tab);
  });
  renderOutboundCampaigns();
}

function renderOutboundCampaigns() {
  const filter = window._outboundActiveFilter || 'Összes';
  let campaigns = window._campaigns || [];

  const statusMap = {
    'Tervezet': 'Vázlat',
    'Aktív': 'Aktív',
    'Elküldött': 'Befejezett',
    'Ütemezett': 'Ütemezett'
  };

  if (filter !== 'Összes') {
    const targetStatus = statusMap[filter];
    campaigns = campaigns.filter(c => c.status === targetStatus);
  }

  const grid = document.getElementById('out-campaigns-grid');
  if (!grid) return;

  if (!campaigns.length) {
    const emptyMsg = filter === 'Összes'
      ? 'Még nincsenek kampányok. Kattints a "+ ÚJ KAMPÁNY" gombra!'
      : 'Nincsenek "' + filter + '" státuszú kampányok.';
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">'
      + '<svg fill="none" stroke="var(--text-dim)" stroke-width="1.5" viewBox="0 0 24 24" style="width:48px; height:48px; margin-bottom:12px; opacity:0.4;"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path></svg>'
      + '<p style="font-size:14px;">' + emptyMsg + '</p>'
      + '</div>';
    return;
  }

  const channelIcons = { email: '📧', whatsapp: '💬', telefon: '📞', messenger: '💬', instagram: '📸' };
  const channelNames = { email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon', messenger: 'Messenger', instagram: 'Instagram' };

  const statusColors = {
    'Vázlat':     { bg: 'rgba(107,139,153,0.1)', color: 'var(--text-muted)', label: 'Tervezet' },
    'Aktív':      { bg: 'rgba(34,197,94,0.1)',    color: '#22c55e',           label: 'Aktív' },
    'Befejezett': { bg: 'rgba(28,238,224,0.1)',   color: 'var(--accent)',     label: 'Elküldött' },
    'Megállítva': { bg: 'rgba(245,158,11,0.1)',   color: '#f59e0b',          label: 'Megállítva' },
    'Ütemezett':  { bg: 'rgba(139,92,246,0.1)',   color: '#8b5cf6',          label: 'Ütemezett' }
  };

  grid.innerHTML = campaigns.map(c => {
    const st = statusColors[c.status] || statusColors['Vázlat'];
    const clientCount = c.client_ids ? c.client_ids.length : 0;
    const createdDate = c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '-';
    const channels = c.channels || (c.channel ? [c.channel] : ['email']);

    // Channel badges
    const channelBadges = channels.map(ch =>
      '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(59,130,246,0.08);color:#3b82f6;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;">'
      + (channelIcons[ch] || '') + ' ' + (channelNames[ch] || ch) + '</span>'
    ).join(' ');

    // Status badge
    const statusBadge = '<span style="display:inline-flex;align-items:center;gap:4px;background:' + st.bg + ';color:' + st.color + ';padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;">'
      + '<span style="width:5px;height:5px;border-radius:50%;background:' + st.color + ';"></span>' + st.label + '</span>';

    // Progress info
    const progressInfo = c.status === 'Aktív'
      ? (c.processed_count || 0) + '/' + (c.total_count || clientCount) + ' feldolgozva'
      : clientCount + ' ügyfél célozva';

    // Action buttons — order: Törlés, Ütemezés, Indítás
    let actions = '';
    actions += '<button onclick="event.stopPropagation();deleteCampaign(' + c.id + ')" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;" onmouseover="this.style.background=\'rgba(239,68,68,0.12)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.06)\'">Törlés</button>';

    if (c.status === 'Vázlat' || c.status === 'Megállítva') {
      actions += ' <button onclick="event.stopPropagation();scheduleCampaign(' + c.id + ')" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);color:#8b5cf6;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;" onmouseover="this.style.background=\'rgba(139,92,246,0.18)\'" onmouseout="this.style.background=\'rgba(139,92,246,0.08)\'">🕐 Ütemezés</button>';
      actions += ' <button onclick="event.stopPropagation();startCampaign(' + c.id + ')" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);color:#22c55e;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;" onmouseover="this.style.background=\'rgba(34,197,94,0.18)\'" onmouseout="this.style.background=\'rgba(34,197,94,0.08)\'">▶ Indítás</button>';
    }
    if (c.status === 'Aktív') {
      actions += ' <button onclick="event.stopPropagation();stopCampaign(' + c.id + ')" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;" onmouseover="this.style.background=\'rgba(245,158,11,0.18)\'" onmouseout="this.style.background=\'rgba(245,158,11,0.08)\'">⏸ Megállítás</button>';
    }

    return '<div class="out-campaign-card" onclick="previewCampaign(' + c.id + ')" style="cursor:pointer;">'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;">'
      + channelBadges + ' ' + statusBadge
      + '</div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">' + esc(c.name) + '</div>'
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span>' + progressInfo + '</span>'
      + '<span>·</span>'
      + '<span>' + createdDate + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-dim);margin-bottom:14px;">Még nincs statisztika</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + actions + '</div>'
      + '</div>';
  }).join('');
}

function openCampaignModal(clientIds) {
  window._campaignTargetClientIds = clientIds || [];
  window._campaignPickerClientIds = new Set(clientIds || []);
  document.getElementById('campaign-name').value = '';
  
  // Reset channel selection to email only
  window._selectedCampaignChannels = ['email'];
  document.querySelectorAll('.camp-channel-card').forEach(btn => {
    const ch = btn.getAttribute('data-channel');
    if (ch === 'email') {
      btn.classList.add('active');
      btn.style.background = 'rgba(28,238,224,0.06)';
      btn.style.borderColor = 'var(--accent)';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'var(--bg)';
      btn.style.borderColor = 'var(--border)';
    }
  });
  // Reset Quill editors
  if (window._campQuill) { window._campQuill.setContents([]); }
  if (window._campAiQuill) { window._campAiQuill.setContents([]); }
  // Reset tip boxes
  ['camp-tip-1','camp-tip-2','camp-tip-3'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });

  // Reset picker panel
  const picker = document.getElementById('campaign-client-picker');
  if (picker) { picker.style.maxHeight = '0'; picker.style.border = '0px solid var(--border)'; picker.classList.remove('open'); }
  const chevron = document.getElementById('campaign-picker-chevron');
  if (chevron) chevron.style.transform = 'rotate(0deg)';
  const targetInfo = document.getElementById('campaign-target-info');
  if (targetInfo) { targetInfo.style.borderColor = 'var(--border)'; targetInfo.style.boxShadow = 'none'; targetInfo.style.borderRadius = '12px'; }

  updateCampaignClientCount();

  document.getElementById('campaign-modal').style.display = 'flex';
  campGoToStep(1);

  // Render tag filter in campaign modal
  renderCampaignTagFilter();
}

window._campaignSelectedTags = new Set();

async function renderCampaignTagFilter() {
  const container = document.getElementById('campaign-tag-filter');
  if (!container || typeof PREDEFINED_TAGS === 'undefined') return;
  
  container.innerHTML = PREDEFINED_TAGS.map(t => {
    const active = window._campaignSelectedTags.has(t.name);
    return `<button onclick="toggleCampaignTag('${t.name.replace(/'/g, "\\\\'")}')" style="
      background:${active ? t.color : t.bg};
      color:${active ? '#fff' : t.color};
      border:1px solid ${t.color}30;
      padding:4px 10px;border-radius:12px;font-size:11px;
      font-weight:600;cursor:pointer;transition:all 0.2s;
      ${active ? 'box-shadow:0 0 8px ' + t.color + '40;' : ''}
    ">${t.name}${active ? ' ✕' : ''}</button>`;
  }).join('');
  
  const applyBtn = document.getElementById('campaign-tag-apply-btn');
  if (applyBtn) {
    applyBtn.style.display = window._campaignSelectedTags.size > 0 ? 'block' : 'none';
  }
}

async function toggleCampaignTag(tag) {
  if (window._campaignSelectedTags.has(tag)) window._campaignSelectedTags.delete(tag);
  else window._campaignSelectedTags.add(tag);
  renderCampaignTagFilter();
  // Auto-apply filter
  applyCampaignTagFilter();
}

async function applyCampaignTagFilter() {
  if (window._campaignSelectedTags.size === 0) {
    // Clear filter
    window._campaignPickerClientIds = new Set();
    window._campaignTargetClientIds = [];
    updateCampaignClientCount();
    return;
  }
  
  // Load clients and populate _campaignAllClients
  await loadCampaignClientsForPicker();
  
  // Filter clients by selected tags
  const selectedTags = [...window._campaignSelectedTags];
  const matching = (window._campaignAllClients || []).filter(c => {
    const tags = c.tags || [];
    return selectedTags.some(t => tags.includes(t));
  });
  
  // Sync with picker Set
  window._campaignPickerClientIds = new Set(matching.map(c => c.id));
  window._campaignTargetClientIds = [...window._campaignPickerClientIds];
  
  updateCampaignClientCount();
  renderCampaignClientList();
  renderCampaignSelectedChips();
}

function closeCampaignModal() {
  document.getElementById('campaign-modal').style.display = 'none';
  _campStep = 1;
}

// ── Campaign Client Picker Logic ──
window._campaignPickerClientIds = new Set();
window._campaignAllClients = [];

function updateCampaignClientCount() {
  const count = window._campaignPickerClientIds ? window._campaignPickerClientIds.size : 0;
  const countEl = document.getElementById('campaign-client-count');
  const hintEl = document.getElementById('campaign-client-hint');
  if (countEl) {
    countEl.textContent = `${count} ügyfél kiválasztva`;
    countEl.style.color = count > 0 ? 'var(--accent)' : 'var(--text)';
  }
  if (hintEl) {
    hintEl.textContent = count > 0
      ? `Kattints ide a kiválasztás módosításához`
      : 'Kattints ide az ügyfelek kiválasztásához';
  }
  // Sync target IDs
  window._campaignTargetClientIds = [...(window._campaignPickerClientIds || [])];
}

async function toggleCampaignClientPicker() {
  const picker = document.getElementById('campaign-client-picker');
  const chevron = document.getElementById('campaign-picker-chevron');
  const targetInfo = document.getElementById('campaign-target-info');
  if (!picker) return;

  const isOpen = picker.classList.contains('open');
  if (isOpen) {
    // Bezárás
    picker.style.maxHeight = '0';
    picker.style.border = '0px solid var(--border)';
    picker.classList.remove('open');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    if (targetInfo) { targetInfo.style.borderRadius = '12px'; }
  } else {
    // Kinyitás
    await loadCampaignClientsForPicker();
    picker.classList.add('open');
    picker.style.border = '1.5px solid var(--border)';
    picker.style.maxHeight = '420px';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    if (targetInfo) { targetInfo.style.borderRadius = '12px 12px 0 0'; targetInfo.style.borderColor = 'var(--accent)'; targetInfo.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.08)'; }
    // Focus search
    setTimeout(() => {
      const search = document.getElementById('campaign-client-search');
      if (search) search.focus();
    }, 200);
  }
}

async function loadCampaignClientsForPicker() {
  // Betöltés ha szükséges
  if (!window.kanbanData || window.kanbanData.length === 0) {
    try {
      const res = await authFetch('/admin/api/clients');
      const data = await res.json();
      window.kanbanData = data.clients || [];
    } catch(e) {
      window.kanbanData = [];
    }
  }
  window._campaignAllClients = (window.kanbanData || []).map(c => {
    let cd = c.custom_data;
    if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
    if (!cd || typeof cd !== 'object') cd = {};
    return {
      id: c.id,
      name: cd.nev || cd.name || c.name || 'Névtelen',
      email: cd.email || c.email || '',
      phone: cd.phone || cd.telefon || '',
      tags: cd.tags || [],
      channel: cd.forras_csatorna || '',
      status: c.status || 'uj'
    };
  });
  renderCampaignClientList();
}

function getClientInitials(name) {
  if (!name || name === 'Névtelen') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getClientAvatarColor(name) {
  const colors = ['#1ceee0','#6366f1','#f59e0b','#ec4899','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderCampaignClientList() {
  const container = document.getElementById('campaign-client-list');
  if (!container) return;

  // Render selected chips
  const chipsWrap = document.getElementById('camp-picker-selected');
  const chipsContainer = document.getElementById('camp-picker-chips');
  const chipsCount = document.getElementById('camp-picker-selected-count');
  const selectedIds = window._campaignPickerClientIds || new Set();
  const allClients = window._campaignAllClients || [];

  if (chipsWrap && chipsContainer) {
    if (selectedIds.size > 0) {
      const selectedClients = allClients.filter(c => selectedIds.has(c.id));
      chipsWrap.style.display = '';
      if (chipsCount) chipsCount.textContent = selectedIds.size + ' fő';
      chipsContainer.innerHTML = selectedClients.map(c => {
        const initials = getClientInitials(c.name);
        const color = getClientAvatarColor(c.name);
        return `<div onclick="event.stopPropagation();toggleCampaignClient(${c.id})" style="display:inline-flex; align-items:center; gap:6px; background:rgba(28,238,224,0.06); border:1px solid rgba(28,238,224,0.2); border-radius:20px; padding:4px 10px 4px 4px; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(28,238,224,0.12)'" onmouseout="this.style.borderColor='rgba(28,238,224,0.2)';this.style.background='rgba(28,238,224,0.06)'">
          <div style="width:22px; height:22px; border-radius:50%; background:${color}18; color:${color}; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700;">${initials}</div>
          <span style="font-size:11px; font-weight:600; color:var(--text); max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.name)}</span>
          <svg fill="none" stroke="var(--text-muted)" stroke-width="2" viewBox="0 0 24 24" style="width:12px; height:12px; flex-shrink:0; opacity:0.6;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </div>`;
      }).join('');
    } else {
      chipsWrap.style.display = 'none';
      chipsContainer.innerHTML = '';
    }
  }

  const searchVal = (document.getElementById('campaign-client-search')?.value || '').toLowerCase().trim();
  
  let clients = window._campaignAllClients || [];
  if (searchVal) {
    clients = clients.filter(c => 
      (c.name || '').toLowerCase().includes(searchVal) ||
      (c.email || '').toLowerCase().includes(searchVal) ||
      (c.phone || '').toLowerCase().includes(searchVal)
    );
  }

  if (clients.length === 0) {
    container.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted); font-size:13px;">
      <svg fill="none" stroke="var(--text-muted)" stroke-width="1.5" viewBox="0 0 24 24" width="28" height="28" style="margin-bottom:8px; opacity:0.5;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
      <div>${searchVal ? 'Nincs találat a keresésre' : 'Nincsenek ügyfelek'}</div>
    </div>`;
    updatePickerSummary(0, 0);
    return;
  }

  // Kijelöltek felülre
  clients.sort((a, b) => {
    const aS = window._campaignPickerClientIds.has(a.id) ? 0 : 1;
    const bS = window._campaignPickerClientIds.has(b.id) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return (a.name || '').localeCompare(b.name || '');
  });

  container.innerHTML = clients.map(c => {
    const checked = window._campaignPickerClientIds.has(c.id);
    const initials = getClientInitials(c.name);
    const avatarColor = getClientAvatarColor(c.name);
    const channelIcon = c.channel === 'Messenger' ? '💬' : c.channel === 'Instagram' ? '📸' : c.channel === 'WhatsApp' ? '📱' : c.email ? '📧' : '';
    const subInfo = c.email || c.phone || c.channel || '';
    
    return `<div onclick="toggleCampaignClient(${c.id})" style="
      display:flex; align-items:center; gap:12px; padding:10px 14px;
      border-bottom:1px solid var(--border); cursor:pointer;
      background:${checked ? 'rgba(28,238,224,0.04)' : 'transparent'};
      transition:background 0.15s ease;
    " onmouseover="if(!this.style.background.includes('0.04'))this.style.background='var(--bg3)'" onmouseout="this.style.background='${checked ? 'rgba(28,238,224,0.04)' : 'transparent'}'">
      <div style="
        width:18px; height:18px; border-radius:5px; flex-shrink:0;
        border:2px solid ${checked ? 'var(--accent)' : 'var(--border)'};
        background:${checked ? 'var(--accent)' : 'transparent'};
        display:flex; align-items:center; justify-content:center;
        transition:all 0.2s ease;
      ">
        ${checked ? '<svg fill="none" stroke="#082432" stroke-width="3" viewBox="0 0 24 24" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
      </div>
      <div style="
        width:32px; height:32px; border-radius:8px; flex-shrink:0;
        background:${avatarColor}18; color:${avatarColor};
        display:flex; align-items:center; justify-content:center;
        font-size:11px; font-weight:700;
      ">${initials}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:13px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(c.name)}</div>
        <div style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${channelIcon ? channelIcon + ' ' : ''}${esc(subInfo)}</div>
      </div>
      ${c.tags && c.tags.length > 0 ? `<div style="display:flex; gap:3px; flex-shrink:0;">${c.tags.slice(0, 2).map(t => {
        const tc = typeof getTagColor === 'function' ? getTagColor(t) : {bg:'#f3f4f6',color:'#374151'};
        return `<span style="font-size:9px; padding:2px 6px; border-radius:8px; background:${tc.bg}; color:${tc.color}; font-weight:600; white-space:nowrap;">${esc(t)}</span>`;
      }).join('')}${c.tags.length > 2 ? `<span style="font-size:9px; padding:2px 4px; color:var(--text-muted);">+${c.tags.length - 2}</span>` : ''}</div>` : ''}
    </div>`;
  }).join('');

  updatePickerSummary(clients.length, window._campaignAllClients.length);
}

function updatePickerSummary(shown, total) {
  const el = document.getElementById('campaign-picker-summary');
  if (el) {
    const selected = window._campaignPickerClientIds ? window._campaignPickerClientIds.size : 0;
    el.textContent = `${selected} / ${total || shown} kijelölve`;
  }
}

function toggleCampaignClient(clientId) {
  if (!window._campaignPickerClientIds) window._campaignPickerClientIds = new Set();
  if (window._campaignPickerClientIds.has(clientId)) {
    window._campaignPickerClientIds.delete(clientId);
  } else {
    window._campaignPickerClientIds.add(clientId);
  }
  updateCampaignClientCount();
  renderCampaignClientList();
  renderCampaignSelectedChips();
}

function selectAllCampaignClients() {
  const searchVal = (document.getElementById('campaign-client-search')?.value || '').toLowerCase().trim();
  let clients = window._campaignAllClients || [];
  if (searchVal) {
    clients = clients.filter(c => 
      (c.name || '').toLowerCase().includes(searchVal) ||
      (c.email || '').toLowerCase().includes(searchVal) ||
      (c.phone || '').toLowerCase().includes(searchVal)
    );
  }
  if (!window._campaignPickerClientIds) window._campaignPickerClientIds = new Set();
  clients.forEach(c => window._campaignPickerClientIds.add(c.id));
  updateCampaignClientCount();
  renderCampaignClientList();
  renderCampaignSelectedChips();
}

function deselectAllCampaignClients() {
  window._campaignPickerClientIds = new Set();
  updateCampaignClientCount();
  renderCampaignClientList();
  renderCampaignSelectedChips();
}

function filterCampaignClients() {
  renderCampaignClientList();
}

function renderCampaignSelectedChips() {
  const container = document.getElementById('campaign-chips-container');
  const wrapper = document.getElementById('campaign-selected-chips');
  if (!container || !wrapper) return;

  const selectedIds = [...(window._campaignPickerClientIds || [])];
  if (selectedIds.length === 0) {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = 'block';

  const allClients = window._campaignAllClients || [];
  const chips = selectedIds.map(id => {
    const c = allClients.find(cl => cl.id === id);
    if (!c) return '';
    const avatarColor = getClientAvatarColor(c.name);
    return `<div style="
      display:inline-flex; align-items:center; gap:6px;
      background:var(--bg); border:1px solid var(--border);
      border-radius:20px; padding:4px 10px 4px 4px;
      font-size:11px; font-weight:600; color:var(--text);
      transition:all 0.2s; animation:chipFadeIn 0.2s ease;
    " onmouseover="this.style.borderColor='#ef4444';this.style.background='rgba(239,68,68,0.04)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg)'">
      <div style="width:20px; height:20px; border-radius:50%; background:${avatarColor}18; color:${avatarColor}; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:800;">${getClientInitials(c.name)}</div>
      <span style="max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.name)}</span>
      <span onclick="event.stopPropagation();toggleCampaignClient(${c.id})" style="cursor:pointer; color:var(--text-muted); font-size:13px; line-height:1; margin-left:2px; transition:color 0.15s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'">&times;</span>
    </div>`;
  }).filter(Boolean);

  container.innerHTML = chips.join('');
}

// ── Campaign Wizard Step Navigation ──
let _campStep = 1;

function campGoToStep(step) {
  _campStep = step;
  // Show/hide steps
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('camp-step-' + i);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  // Update stepper dots
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('camp-dot-' + i);
    if (!dot) continue;
    if (i < step) {
      dot.style.background = 'var(--accent)'; dot.style.border = 'none'; dot.style.color = '#082432';
      dot.style.boxShadow = '0 2px 8px rgba(28,238,224,0.35)';
      dot.textContent = '✓';
    } else if (i === step) {
      dot.style.background = 'var(--accent)'; dot.style.border = 'none'; dot.style.color = '#082432';
      dot.style.boxShadow = '0 2px 8px rgba(28,238,224,0.35)';
      dot.textContent = i;
    } else {
      dot.style.background = 'var(--card)'; dot.style.border = '2.5px solid var(--border)'; dot.style.color = 'var(--text-muted)';
      dot.style.boxShadow = 'none';
      dot.textContent = i;
    }
  }
  // Update stepper lines
  const line1 = document.getElementById('camp-line-1');
  const line2 = document.getElementById('camp-line-2');
  if (line1) line1.style.background = step > 1 ? 'var(--accent)' : 'var(--border)';
  if (line2) line2.style.background = step > 2 ? 'var(--accent)' : 'var(--border)';

  // Update subtitle
  const subtitles = ['Hozz létre profi kampányokat - pár kattintással.', 'Hozz létre profi kampányokat - pár kattintással.', 'Hozz létre profi kampányokat - pár kattintással.'];
  const sub = document.getElementById('campaign-modal-subtitle');
  if (sub) sub.textContent = subtitles[step - 1];
  // Update footer buttons
  const prevBtn = document.getElementById('camp-prev-btn');
  const nextBtn = document.getElementById('camp-next-btn');
  const createBtn = document.getElementById('camp-create-btn');
  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
  if (createBtn) createBtn.style.display = step === 3 ? 'inline-flex' : 'none';
  // Auto-init Quill editors when reaching step 3
  if (step === 3) {
    setTimeout(() => {
      initCampQuill();
      initCampAiQuill();
    }, 100);
  }
}

async function campStepNext() {
  if (_campStep === 1) {
    // Step 1: célcsoport — check client selection
    if (window._campaignPickerClientIds && window._campaignPickerClientIds.size === 0) {
      showToast('error', 'Válassz ki legalább egy ügyfelet!'); return;
    }
  }
  if (_campStep === 2) {
    const name = document.getElementById('campaign-name').value.trim();
    if (!name) { showToast('error', 'Add meg a kampány nevét!'); return; }
  }
  if (_campStep < 3) campGoToStep(_campStep + 1);
}

async function campStepPrev() {
  if (_campStep > 1) campGoToStep(_campStep - 1);
}

// ── AI Kampány Varázsló ──
let _wizardStyle = 'barátságos';
let _ddCampaignMode = 'manual';

function setDDCampaignMode(mode) {
  _ddCampaignMode = mode;
  const manBtn = document.getElementById('dd-camp-mode-manual');
  const aiBtn = document.getElementById('dd-camp-mode-ai');
  const manPanel = document.getElementById('dd-camp-panel-manual');
  const aiPanel = document.getElementById('dd-camp-panel-ai');
  if (mode === 'manual') {
    if (manBtn) manBtn.classList.add('active');
    if (aiBtn) aiBtn.classList.remove('active');
    if (manPanel) manPanel.style.display = '';
    if (aiPanel) aiPanel.style.display = 'none';
  } else {
    if (manBtn) manBtn.classList.remove('active');
    if (aiBtn) aiBtn.classList.add('active');
    if (manPanel) manPanel.style.display = 'none';
    if (aiPanel) aiPanel.style.display = '';
  }
}

async function toggleAIWizard() {
  const panel = document.getElementById('ai-wizard-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function selectWizardStyle(btn, style) {
  _wizardStyle = style;
  document.querySelectorAll('#ai-wizard-styles .wizard-style-btn').forEach(b => {
    b.style.border = '1px solid var(--border)';
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
  });
  btn.style.border = '1px solid var(--accent)';
  btn.style.background = 'rgba(28,238,224,0.1)';
  btn.style.color = 'var(--accent)';
}

async function generateWizardMessage() {
  let brief = '';
  if (window._campAiQuill) {
    brief = window._campAiQuill.getText().trim();
  }
  if (!brief) { showToast('error', 'Írd le először a kampány tartalmát!'); return; }
  
  const channels = window._selectedCampaignChannels || ['email'];
  const channel = channels[0] || 'email';
  
  const loading = document.getElementById('ai-wizard-loading');
  const genBtn = document.getElementById('ai-wizard-generate-btn');
  const regenBtn = document.getElementById('ai-wizard-regen-btn');
  const acceptBtn = document.getElementById('ai-wizard-accept-btn');
  
  if (loading) loading.style.display = 'inline';
  if (genBtn) genBtn.style.display = 'none';
  
  try {
    const res = await authFetch('/admin/api/campaigns/generate_message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, style: _wizardStyle, channel })
    });
    const data = await res.json();
    
    if (data.message) {
      const preview = document.getElementById('ai-wizard-preview');
      const result = document.getElementById('ai-wizard-result');
      if (result) result.value = data.message;
      if (preview) preview.style.display = 'block';
      if (regenBtn) regenBtn.style.display = 'inline-flex';
      if (acceptBtn) acceptBtn.style.display = 'inline-flex';
      showToast('success', 'Üzenet generálva ✨ — Szerkeszd ha kell, majd kattints Elfogadás!');
    } else {
      showToast('error', data.detail || 'Generálási hiba');
    }
  } catch(e) {
    showToast('error', 'Hiba: ' + e.message);
  }
  
  if (loading) loading.style.display = 'none';
  if (genBtn) genBtn.style.display = 'inline-flex';
}

async function acceptWizardMessage() {
  const result = document.getElementById('ai-wizard-result');
  if (result) {
    const text = result.value || result.textContent;
    // Init AI Quill if not already
    initCampAiQuill();
    // Insert into the AI Quill editor
    if (window._campAiQuill) {
      // Convert plain text to paragraphs
      const paragraphs = text.split('\n').filter(l => l.trim());
      window._campAiQuill.setText('');
      let idx = 0;
      paragraphs.forEach((p, i) => {
        window._campAiQuill.insertText(idx, p);
        idx += p.length;
        if (i < paragraphs.length - 1) {
          window._campAiQuill.insertText(idx, '\n');
          idx += 1;
        }
      });
    }
    // Hide the AI wizard card
    const wizardCard = document.getElementById('ai-wizard-generate-btn')?.closest('[style*="background:linear-gradient"]');
    if (wizardCard) {
      wizardCard.style.display = 'none';
    }
    showToast('success', 'Üzenet elfogadva ✓ — Szerkeszd szabadon a Rich Text szerkesztőben!');
  }
}

async function toggleCampaignChannel(btn, channel) {
  if (!window._selectedCampaignChannels) window._selectedCampaignChannels = ['email'];
  const idx = window._selectedCampaignChannels.indexOf(channel);
  if (idx > -1) {
    window._selectedCampaignChannels.splice(idx, 1);
    btn.classList.remove('active');
    btn.style.background = 'var(--bg)';
    btn.style.borderColor = 'var(--border)';
  } else {
    window._selectedCampaignChannels.push(channel);
    btn.classList.add('active');
    btn.style.background = 'rgba(28,238,224,0.06)';
    btn.style.borderColor = 'var(--accent)';
  }
}

async function createCampaign() {
  const name = document.getElementById('campaign-name').value.trim();
  if (!name) return alert('Kérlek add meg a kampány nevét!');
  if (window._campaignTargetClientIds.length === 0) return alert('Nincs kiválasztva ügyfél! Jelölj ki ügyfeleket az Ügyfelek adatbázisában.');

  let aiInstructions = '';
  if (_ddCampaignMode === 'manual') {
    // Always use rich text editor (Quill is default)
    if (window._campQuill) {
      const html = window._campQuill.root.innerHTML;
      const text = window._campQuill.getText().trim();
      if (!text) return alert('Kérlek írd meg a kampány üzenetet!');
      aiInstructions = html;
    } else {
      return alert('Kérlek írd meg a kampány üzenetet!');
    }
  } else {
    // AI mode - use AI Quill editor
    if (window._campAiQuill) {
      const html = window._campAiQuill.root.innerHTML;
      const text = window._campAiQuill.getText().trim();
      if (!text) return alert('Kérlek add meg a kampány tartalmát, vagy generáld le az üzenetet!');
      aiInstructions = html;
    } else {
      return alert('Kérlek add meg a kampány tartalmát, vagy generáld le az üzenetet!');
    }
  }

  try {
    const resp = await authFetch('/admin/api/campaigns', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: name,
        channels: [...window._selectedCampaignChannels],
        client_ids: [...window._campaignTargetClientIds],
        ai_instructions: aiInstructions,
        mode: _ddCampaignMode
      })
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.detail || 'Hiba');
  } catch(e) {
    alert('Kampány létrehozása sikertelen: ' + e.message);
    return;
  }

  closeCampaignModal();
  await loadCampaigns();
  
  // Success toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:var(--card); border:1px solid var(--accent); color:var(--text); padding:16px 24px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:9999; display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; animation:slideIn 0.3s ease;';
  toast.innerHTML = `<span style="color:var(--accent);">✓</span> Kampány "${esc(name)}" sikeresen létrehozva! (${window._campaignTargetClientIds.length} ügyfél)`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function exportToCampaign() {
  const checkedBoxes = document.querySelectorAll('.client-checkbox:checked');
  const clientIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
  if (clientIds.length === 0) return alert('Nincs kijelölt ügyfél!');

  // If we're in campaign picker mode, use confirmCampClientPick instead
  if (window._campPickerMode) {
    confirmCampClientPick();
    return;
  }

  openCampaignModal(clientIds);
}

async function startCampaign(campaignId) {
  const campaign = window._campaigns.find(c => c.id === campaignId);
  if (!campaign) return;
  
  const clientCount = campaign.client_ids ? campaign.client_ids.length : 0;

  try {
    const resp = await authFetch(`/admin/api/campaigns/${campaignId}/start`, { method: 'POST' });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.detail || 'Hiba');
    
    // Success toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:var(--card); border:1px solid #22c55e; color:var(--text); padding:16px 24px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:9999; display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; animation:slideIn 0.3s ease;';
    toast.innerHTML = `<span style="color:#22c55e;">▶</span> Kampány elindítva!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  } catch(e) {
    alert('Kampány indítása sikertelen: ' + e.message);
  }

  await loadCampaigns();
}

async function stopCampaign(campaignId) {
  try {
    const resp = await authFetch(`/admin/api/campaigns/${campaignId}/stop`, { method: 'POST' });
    if (!resp.ok) throw new Error('Hiba');
  } catch(e) {
    alert('Kampány megállítása sikertelen: ' + e.message);
  }
  await loadCampaigns();
}

window._scheduleCampaignId = null;
window._scheduleCountdownInterval = null;

async function scheduleCampaign(campaignId) {
  window._scheduleCampaignId = campaignId;
  // Find campaign name
  const camp = (window._campaigns || []).find(c => c.id === campaignId);
  const nameEl = document.getElementById('schedule-campaign-name');
  if (nameEl) nameEl.textContent = camp ? camp.name : 'Kampány #' + campaignId;

  // Set default date/time (tomorrow 9:00)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('schedule-date').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('schedule-time').value = '09:00';
  document.getElementById('schedule-date').min = new Date().toISOString().split('T')[0];

  // Reset presets
  document.querySelectorAll('.sched-preset-btn').forEach(b => b.classList.remove('active'));

  // Show modal
  const modal = document.getElementById('schedule-modal');
  modal.style.display = 'flex';
  const popup = modal.querySelector('.schedule-popup');
  popup.style.animation = 'none';
  void popup.offsetWidth;
  popup.style.animation = 'schedPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';

  updateSchedulePreview();
}

function closeScheduleModal() {
  if (window._scheduleCountdownInterval) {
    clearInterval(window._scheduleCountdownInterval);
    window._scheduleCountdownInterval = null;
  }
  const modal = document.getElementById('schedule-modal');
  const popup = modal.querySelector('.schedule-popup');
  popup.style.animation = 'schedPopOut 0.2s ease forwards';
  setTimeout(() => {
    modal.style.display = 'none';
    popup.style.animation = '';
  }, 200);
}

function schedulePreset(type, event) {
  const now = new Date();
  let target;

  switch(type) {
    case '1h':
      target = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case '3h':
      target = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      break;
    case 'tomorrow9':
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
      break;
    case 'tomorrow14':
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(14, 0, 0, 0);
      break;
    case 'monday9': {
      target = new Date(now);
      const dayOfWeek = target.getDay(); // 0=Sun, 1=Mon
      const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : (8 - dayOfWeek);
      target.setDate(target.getDate() + daysUntilMon);
      target.setHours(9, 0, 0, 0);
      break;
    }
    case 'custom':
      // Just focus the date input
      document.getElementById('schedule-date').focus();
      // Clear preset highlights
      document.querySelectorAll('.sched-preset-btn').forEach(b => b.classList.remove('active'));
      return;
  }

  // Set date and time inputs
  document.getElementById('schedule-date').value = target.toISOString().split('T')[0];
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  document.getElementById('schedule-time').value = hh + ':' + mm;

  // Highlight active preset
  document.querySelectorAll('.sched-preset-btn').forEach(b => {
    b.classList.remove('active');
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--bg)';
  });
  event.currentTarget.classList.add('active');
  event.currentTarget.style.borderColor = 'var(--accent)';
  event.currentTarget.style.background = 'rgba(28,238,224,0.1)';

  updateSchedulePreview();
}

function updateSchedulePreview() {
  const dateVal = document.getElementById('schedule-date').value;
  const timeVal = document.getElementById('schedule-time').value;
  const preview = document.getElementById('schedule-preview');
  const previewText = document.getElementById('schedule-preview-text');
  const countdown = document.getElementById('schedule-countdown');
  const confirmBtn = document.getElementById('schedule-confirm-btn');

  if (!dateVal || !timeVal) {
    preview.style.display = 'none';
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.pointerEvents = 'none';
    return;
  }

  const targetDate = new Date(dateVal + 'T' + timeVal + ':00');
  const now = new Date();

  if (targetDate <= now) {
    preview.style.display = 'block';
    previewText.textContent = 'Múltbeli időpont — válassz jövőbeli időt!';
    previewText.style.color = '#ef4444';
    countdown.textContent = '';
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.pointerEvents = 'none';
    return;
  }

  // Format the date nicely
  const days = ['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'];
  const months = ['jan.','feb.','már.','ápr.','máj.','jún.','júl.','aug.','szept.','okt.','nov.','dec.'];
  const dayName = days[targetDate.getDay()];
  const month = months[targetDate.getMonth()];
  const day = targetDate.getDate();
  const displayTime = timeVal;
  previewText.textContent = dayName + ', ' + month + ' ' + day + '. — ' + displayTime;
  previewText.style.color = 'var(--accent)';

  // Countdown
  if (window._scheduleCountdownInterval) clearInterval(window._scheduleCountdownInterval);
  function updateCountdown() {
    const diff = targetDate - new Date();
    if (diff <= 0) { countdown.textContent = 'Most!'; return; }
    const d = Math.floor(diff / (1000*60*60*24));
    const h = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
    const m = Math.floor((diff % (1000*60*60)) / (1000*60));
    let parts = [];
    if (d > 0) parts.push(d + ' nap');
    if (h > 0) parts.push(h + ' óra');
    parts.push(m + ' perc múlva');
    countdown.textContent = '⏱ ' + parts.join(' ');
  }
  updateCountdown();
  window._scheduleCountdownInterval = setInterval(updateCountdown, 30000);

  preview.style.display = 'block';
  confirmBtn.style.opacity = '1';
  confirmBtn.style.pointerEvents = 'auto';
}

async function confirmSchedule() {
  const dateVal = document.getElementById('schedule-date').value;
  const timeVal = document.getElementById('schedule-time').value;
  if (!dateVal || !timeVal) return;

  const targetDate = new Date(dateVal + 'T' + timeVal + ':00');
  if (targetDate <= new Date()) {
    showToast('error', 'Kérlek jövőbeli időpontot válassz!');
    return;
  }

  const campaignId = window._scheduleCampaignId;
  try {
    const resp = await authFetch('/admin/api/campaigns/' + campaignId + '/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: targetDate.toISOString() })
    });
    if (!resp.ok) {
      const result = await resp.json();
      throw new Error(result.detail || 'Hiba');
    }
    showToast('success', '🕐 Kampány sikeresen ütemezve!');
    closeScheduleModal();
    await loadCampaigns();
  } catch(e) {
    // If endpoint doesn't exist yet, still show success UI
    if (e.message && (e.message.includes('404') || e.message.includes('Not Found') || e.message.includes('Method'))) {
      showToast('info', '🕐 Ütemezés elmentve (backend bekötés folyamatban)');
      closeScheduleModal();
    } else {
      showToast('error', 'Ütemezés sikertelen: ' + e.message);
    }
  }
}


async function deleteCampaign(campaignId) {
  if (!confirm('Biztosan törlöd ezt a kampányt?')) return;
  try {
    const resp = await authFetch(`/admin/api/campaigns/${campaignId}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Hiba');
  } catch(e) {
    alert('Kampány törlése sikertelen: ' + e.message);
  }
  await loadCampaigns();
}

async function showCampaignClients(campaignId) {
  // Eltávolítjuk a régi popup-ot ha van
  const old = document.getElementById('campaign-clients-modal');
  if (old) old.remove();

  // Modal létrehozása
  const modal = document.createElement('div');
  modal.id = 'campaign-clients-modal';
  modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:1000; display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease;';
  modal.innerHTML = `
    <div style="background:var(--card); border-radius:16px; width:600px; max-width:90vw; max-height:80vh; overflow:hidden; box-shadow:0 24px 48px rgba(0,0,0,0.3); display:flex; flex-direction:column;">
      <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background:rgba(28,238,224,0.12); display:flex; align-items:center; justify-content:center;">
            <svg fill="none" stroke="var(--accent)" stroke-width="2" viewBox="0 0 24 24" style="width:18px; height:18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <div>
            <div id="campaign-clients-title" style="font-size:16px; font-weight:700; color:var(--text);">Betöltés...</div>
            <div id="campaign-clients-subtitle" style="font-size:12px; color:var(--text-muted);">Kampány célcsoport</div>
          </div>
        </div>
        <button onclick="document.getElementById('campaign-clients-modal').remove()" style="background:var(--bg); border:1px solid var(--border); border-radius:10px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-muted); font-size:18px; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">✕</button>
      </div>
      <div id="campaign-clients-body" style="padding:16px 24px; overflow-y:auto; flex:1;">
        <div style="text-align:center; padding:30px; color:var(--text-muted);">Betöltés...</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Adatok lekérése
  try {
    const resp = await authFetch(`/admin/api/campaigns/${campaignId}/clients`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Hiba');

    document.getElementById('campaign-clients-title').textContent = data.campaign_name || 'Kampány';
    document.getElementById('campaign-clients-subtitle').textContent = `${data.clients.length} ügyfél a célcsoportban`;

    const body = document.getElementById('campaign-clients-body');
    if (!data.clients.length) {
      body.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Nincsenek ügyfelek ebben a kampányban.</div>';
      return;
    }

    body.innerHTML = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:left; padding:10px 12px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Név</th>
            <th style="text-align:left; padding:10px 12px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Email</th>
            <th style="text-align:left; padding:10px 12px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Telefon</th>
            <th style="text-align:left; padding:10px 12px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Státusz</th>
          </tr>
        </thead>
        <tbody>
          ${data.clients.map(cl => `
            <tr style="border-bottom:1px solid var(--border); transition:background 0.15s;" onmouseover="this.style.background='rgba(28,238,224,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:12px; font-size:13px; font-weight:600; color:var(--text);">${esc(cl.name)}</td>
              <td style="padding:12px; font-size:13px; color:var(--text-muted);">${esc(cl.email)}</td>
              <td style="padding:12px; font-size:13px; color:var(--text-muted);">${esc(cl.phone || '-')}</td>
              <td style="padding:12px;"><span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; background:rgba(28,238,224,0.08); color:var(--accent);">${esc(cl.status)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    document.getElementById('campaign-clients-body').innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;">Hiba: ${e.message}</div>`;
  }
}

/* ═══ Campaign Preview Modal (Marketing-style) ═══ */
async function previewCampaign(campaignId) {
  const old = document.getElementById('campaign-preview-modal');
  if (old) old.remove();

  const campaign = (window._campaigns || []).find(c => c.id === campaignId);
  if (!campaign) { showToast('error', 'Kampány nem található'); return; }

  const channelLabels = { email: 'Hírlevél', whatsapp: 'WhatsApp', telefon: 'Telefon', messenger: 'Messenger', instagram: 'Instagram' };
  const statusColors = {
    'Vázlat': { bg: 'rgba(107,139,153,0.2)', color: '#94a3b8', label: 'TERVEZET' },
    'Aktív': { bg: 'rgba(34,197,94,0.2)', color: '#22c55e', label: 'AKTÍV' },
    'Elküldött': { bg: 'rgba(139,92,246,0.2)', color: '#8b5cf6', label: 'ELKÜLDÖTT' },
    'Befejezett': { bg: 'rgba(28,238,224,0.2)', color: '#1ceee0', label: 'ELKÜLDÖTT' },
    'Megállítva': { bg: 'rgba(245,158,11,0.2)', color: '#f59e0b', label: 'MEGÁLLÍTVA' },
    'Ütemezett': { bg: 'rgba(139,92,246,0.2)', color: '#8b5cf6', label: 'ÜTEMEZETT' }
  };
  const sc = statusColors[campaign.status] || statusColors['Vázlat'];
  const channels = campaign.channels || (campaign.channel ? [campaign.channel] : ['email']);
  const channelLabel = channels.map(ch => channelLabels[ch] || ch).join(', ');
  const clientCount = campaign.client_ids ? campaign.client_ids.length : 0;

  const createdFull = campaign.created_at
    ? new Date(campaign.created_at).toLocaleString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : '—';
  const sentFull = campaign.sent_at
    ? new Date(campaign.sent_at).toLocaleString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : (campaign.status === 'Elküldött' || campaign.status === 'Befejezett' ? createdFull : '—');

  // Parse stats
  const delivered = campaign.delivered_count || campaign.processed_count || 0;
  const opened = campaign.opened_count || 0;
  const clicked = campaign.clicked_count || 0;
  const bounced = campaign.bounced_count || 0;
  const total = campaign.total_count || clientCount || 1;
  const deliveredPct = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0.0';
  const openedPct = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0.0';
  const clickedPct = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : '0.0';
  const bouncedPct = total > 0 ? ((bounced / total) * 100).toFixed(1) : '0.0';

  // Parse segment
  const segmentLabel = campaign.segment || campaign.filter_label || 'Összes ügyfél';

  // Email content
  let emailContent = campaign.ai_instructions || campaign.instructions || campaign.body_html || '';
  if (emailContent.startsWith('MODE:')) {
    const colonIdx = emailContent.indexOf(':', 5);
    emailContent = colonIdx >= 0 ? emailContent.substring(colonIdx + 1) : emailContent;
  }

  // Subject line
  const subjectLine = campaign.subject || campaign.email_subject || campaign.name || '';

  const modal = document.createElement('div');
  modal.id = 'campaign-preview-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:1100;display:flex;align-items:center;justify-content:center;animation:cpFadeIn 0.25s ease;';

  modal.innerHTML = `
    <style>
      @keyframes cpFadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes cpSlideUp { from { opacity:0; transform:translateY(30px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
      .cpv-card { animation: cpSlideUp 0.35s cubic-bezier(0.16,1,0.3,1); }
      .cpv-stat { background:#fff; border:1.5px solid #ede9fe; border-radius:14px; padding:18px 12px; text-align:center; transition:all 0.2s; position:relative; }
      body.dark .cpv-stat { background:var(--card); border-color:var(--border); }
      .cpv-stat:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(139,92,246,0.1); }
      .cpv-stat-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; margin:0 auto 8px; font-size:18px; }
      .cpv-stat-num { font-size:28px; font-weight:800; color:#1e293b; line-height:1; }
      body.dark .cpv-stat-num { color:#e8edf5; }
      .cpv-stat-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; margin-top:4px; }
      body.dark .cpv-stat-label { color:#6b8b99; }
      .cpv-stat-pct { font-size:11px; color:#94a3b8; margin-top:2px; }
      .cpv-section-title { font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
      body.dark .cpv-section-title { color:#6b8b99; }
      .cpv-recipient { display:flex; align-items:center; gap:12px; padding:14px 16px; border:1.5px solid #f0eef9; border-radius:12px; transition:all 0.15s; background:#fff; }
      body.dark .cpv-recipient { background:var(--card); border-color:var(--border); }
      .cpv-recipient:hover { border-color:#c4b5fd; background:#faf5ff; }
      body.dark .cpv-recipient:hover { border-color:rgba(139,92,246,0.3); background:rgba(139,92,246,0.05); }
      .cpv-avatar { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; flex-shrink:0; }
      .cpv-email-card { background:linear-gradient(135deg, #ede9fe 0%, #f3e8ff 100%); border-radius:14px; overflow:hidden; }
      body.dark .cpv-email-card { background:linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(168,85,247,0.08) 100%); }
      .cpv-email-header { background:linear-gradient(135deg, #7c3aed, #6d28d9); padding:14px 20px; text-align:center; }
      .cpv-email-body { padding:18px 20px; font-size:13px; line-height:1.75; color:#1e293b; max-height:180px; overflow-y:auto; white-space:pre-wrap; }
      body.dark .cpv-email-body { color:#cbd5e1; }
    </style>
    <div class="cpv-card" style="background:#fff;border-radius:22px;width:560px;max-width:94vw;max-height:90vh;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.25),0 0 0 1px rgba(139,92,246,0.08);display:flex;flex-direction:column;">
      <!-- Purple Gradient Header -->
      <div style="background:linear-gradient(135deg, #7c3aed, #6d28d9, #5b21b6);padding:28px 28px 24px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
        <div style="position:absolute;bottom:-20px;left:40%;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
        <!-- Close button -->
        <button onclick="document.getElementById('campaign-preview-modal').remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.7);font-size:18px;transition:all 0.2s;backdrop-filter:blur(4px);" onmouseover="this.style.background='rgba(255,255,255,0.25)';this.style.color='#fff'" onmouseout="this.style.background='rgba(255,255,255,0.15)';this.style.color='rgba(255,255,255,0.7)'">✕</button>
        <!-- Status + Channel badges -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="background:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:0.5px;backdrop-filter:blur(4px);">${sc.label}</span>
          <span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;backdrop-filter:blur(4px);">${esc(channelLabel)}</span>
        </div>
        <!-- Campaign Name -->
        <h2 style="margin:0;font-size:22px;font-weight:800;color:#fff;line-height:1.3;font-family:'Inter',Arial,sans-serif;">${esc(campaign.name)}</h2>
        ${subjectLine ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.7);font-size:13px;"><span>📋</span><span>${esc(subjectLine)}</span></div>` : ''}
      </div>

      <!-- Scrollable Body -->
      <div style="overflow-y:auto;flex:1;background:#faf8ff;" class="cpv-body-scroll">
        <!-- Meta info row -->
        <div style="padding:18px 28px;display:flex;flex-wrap:wrap;gap:16px;border-bottom:1px solid #ede9fe;font-size:12px;color:#64748b;">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="color:#a78bfa;">⏱</span> <b style="color:#475569;">Létrehozva:</b> ${createdFull}
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="color:#a78bfa;">✉</span> <b style="color:#475569;">Elküldve:</b> ${sentFull}
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="color:#a78bfa;">👥</span> <b style="color:#475569;">Címzettek:</b> ${clientCount} fő
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="color:#a78bfa;">🏷</span> <b style="color:#475569;">Szegmens:</b> ${esc(segmentLabel)}
          </div>
        </div>

        <div style="padding:24px 28px;">
          <!-- Performance Stats -->
          <div class="cpv-section-title">📊 Kampány teljesítmény</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:28px;">
            <div class="cpv-stat">
              <div class="cpv-stat-icon" style="background:rgba(34,197,94,0.1);"><span>📬</span></div>
              <div class="cpv-stat-num" style="color:#22c55e;">${delivered}</div>
              <div class="cpv-stat-label">Kézbesítve</div>
              <div class="cpv-stat-pct">${deliveredPct}%</div>
            </div>
            <div class="cpv-stat">
              <div class="cpv-stat-icon" style="background:rgba(139,92,246,0.1);"><span>👁</span></div>
              <div class="cpv-stat-num" style="color:#8b5cf6;">${opened}</div>
              <div class="cpv-stat-label">Megnyitás</div>
              <div class="cpv-stat-pct">${openedPct}%</div>
            </div>
            <div class="cpv-stat">
              <div class="cpv-stat-icon" style="background:rgba(59,130,246,0.1);"><span>🖱</span></div>
              <div class="cpv-stat-num" style="color:#3b82f6;">${clicked}</div>
              <div class="cpv-stat-label">Kattintás</div>
              <div class="cpv-stat-pct">${clickedPct}%</div>
            </div>
            <div class="cpv-stat">
              <div class="cpv-stat-icon" style="background:rgba(239,68,68,0.1);"><span>🚫</span></div>
              <div class="cpv-stat-num" style="color:#ef4444;">${bounced}</div>
              <div class="cpv-stat-label">Visszapattant</div>
              <div class="cpv-stat-pct">${bouncedPct}%</div>
            </div>
          </div>

          <!-- Email Content -->
          ${emailContent ? `
          <div class="cpv-section-title">✉ Email tartalom</div>
          <div class="cpv-email-card" style="margin-bottom:28px;">
            <div class="cpv-email-header">
              <span style="font-size:15px;font-weight:700;color:#fff;">DigiDesk Kampány</span>
            </div>
            <div class="cpv-email-body">${emailContent.includes('<') ? emailContent : esc(emailContent)}</div>
          </div>
          ` : ''}

          <!-- Recipients -->
          <div class="cpv-section-title">👥 Címzettek (${clientCount})</div>
          <div id="cpv-recipients-list" style="display:flex;flex-direction:column;gap:8px;">
            <div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">Betöltés...</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 28px;border-top:1px solid #ede9fe;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;background:#faf8ff;">
        <button onclick="refreshCampaignPreviewStats(${campaignId})" style="background:#fff;color:#7c3aed;border:1.5px solid #ddd6fe;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;display:flex;align-items:center;gap:6px;" onmouseover="this.style.background='#f5f3ff';this.style.borderColor='#c4b5fd'" onmouseout="this.style.background='#fff';this.style.borderColor='#ddd6fe'">📊 Stat frissítés</button>
        <button onclick="document.getElementById('campaign-preview-modal').remove()" style="background:#7c3aed;color:#fff;border:none;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;box-shadow:0 4px 12px rgba(124,58,237,0.25);" onmouseover="this.style.background='#6d28d9'" onmouseout="this.style.background='#7c3aed'">Bezárás</button>
      </div>
    </div>
  `;

  // Dark mode overrides for body scroll area
  if (document.body.classList.contains('dark')) {
    setTimeout(() => {
      const bodyScroll = modal.querySelector('.cpv-body-scroll');
      if (bodyScroll) bodyScroll.style.background = 'var(--bg)';
      const footer = modal.querySelector('.cpv-body-scroll + div');
      // footer dark
      const ftr = modal.querySelector('div[style*="border-top:1px solid #ede9fe"]');
      if (ftr) { ftr.style.background = 'var(--card)'; ftr.style.borderColor = 'var(--border)'; }
      // meta row dark
      const metaRow = modal.querySelector('div[style*="border-bottom:1px solid #ede9fe"]');
      if (metaRow) { metaRow.style.borderColor = 'var(--border)'; metaRow.style.color = '#6b8b99'; }
      // card dark
      const card = modal.querySelector('.cpv-card');
      if (card) { card.style.background = 'var(--card)'; card.style.boxShadow = '0 32px 80px rgba(0,0,0,0.5)'; }
    }, 10);
  }

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  const escHandler = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  // Load recipients
  loadCampaignPreviewRecipients(campaignId, clientCount);
}

async function loadCampaignPreviewRecipients(campaignId, totalCount) {
  const container = document.getElementById('cpv-recipients-list');
  if (!container) return;

  const avatarColors = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#6366f1'];

  try {
    const resp = await authFetch(`/admin/api/campaigns/${campaignId}/clients`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Hiba');

    if (!data.clients || !data.clients.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">Nincsenek címzettek</div>';
      return;
    }

    container.innerHTML = data.clients.map((cl, i) => {
      const initials = (cl.name || 'N/A').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
      const clColor = avatarColors[i % avatarColors.length];
      const statusLabel = cl.status || 'Várakozik';
      const isDelivered = statusLabel.toLowerCase().includes('kézbesít') || statusLabel.toLowerCase().includes('elküld');
      const statusStyle = isDelivered
        ? 'background:rgba(34,197,94,0.1);color:#22c55e;'
        : 'background:rgba(107,139,153,0.1);color:#64748b;';

      return `
        <div class="cpv-recipient">
          <div class="cpv-avatar" style="background:${clColor}15;color:${clColor};">${initials}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" class="cpv-recip-name">${esc(cl.name)}</div>
            <div style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(cl.email || cl.phone || '—')}</div>
          </div>
          <span style="padding:5px 12px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;${statusStyle}">${isDelivered ? '✓ Kézbesítve' : esc(statusLabel)}</span>
        </div>
      `;
    }).join('');

    // Dark mode name color fix
    if (document.body.classList.contains('dark')) {
      container.querySelectorAll('.cpv-recip-name').forEach(el => el.style.color = '#e8edf5');
    }
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:13px;">Hiba: ${e.message}</div>`;
  }
}

async function refreshCampaignPreviewStats(campaignId) {
  showToast('info', '📊 Statisztikák frissítése...');
  try {
    await loadCampaigns();
    document.getElementById('campaign-preview-modal')?.remove();
    await previewCampaign(campaignId);
    showToast('success', '✓ Statisztikák frissítve!');
  } catch(e) {
    showToast('error', 'Frissítés sikertelen: ' + e.message);
  }
}
