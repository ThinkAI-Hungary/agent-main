
    const API = '';  // same origin
    let authToken = localStorage.getItem('thinkai_admin_token') || '';
    let currentUser = localStorage.getItem('thinkai_admin_user') || '';
    let interactionsCache = [];
    let sessionsChart = null;
    let typesChart = null;
    let handoffChart = null;
    let outgoingChart = null;
    let _analyticsData = null;
    let _chartView = 'daily';

    // ── Dark Mode (localStorage) ──────────────────────────────────────────────────
    (function applyThemeEarly() {
      if (localStorage.getItem('thinkai_theme') === 'dark') {
        document.body.classList.add('dark');
      }
    })();

    function toggleDarkMode() {
      const isDark = document.body.classList.toggle('dark');
      localStorage.setItem('thinkai_theme', isDark ? 'dark' : 'light');
      _updateThemeBtn(isDark);
      // Re-render interaction rows so inline colors match the new theme
      if (typeof filterInteractionsTable === 'function') {
        filterInteractionsTable();
      }
      // Re-render chart grids
      if (typeof window._updateChartThemes === 'function') {
        window._updateChartThemes();
      }
    }

    function _updateThemeBtn(isDark) {
      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      if (!icon) return;
      icon.textContent = isDark ? '️' : '';
      label.textContent = isDark ? 'Világos mód' : 'Sötét mód';
    }

    // Apply button state on load
    _updateThemeBtn(document.body.classList.contains('dark'));

    // ── Auth ──────────────────────────────────────────────────────────────────────
    async function doLogin() {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');
      if (!username || !password) { showError('Kérlek, töltsd ki mindkét mezőt.'); return; }

      btn.disabled = true;
      btn.textContent = 'Belépés...';
      errEl.style.display = 'none';

      try {
        const res = await fetch(`${API}/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
          const data = await res.json();
          showError(data.detail || 'Hibás adatok.');
          return;
        }
        const data = await res.json();
        authToken = data.token;
        currentUser = data.username;
        localStorage.setItem('thinkai_admin_token', authToken);
        localStorage.setItem('thinkai_admin_user', currentUser);
        enterApp();
      } catch (e) {
        showError('Nem sikerült csatlakozni a szerverhez.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'BELÉPÉS';
      }
    }

    function showError(msg) {
      const el = document.getElementById('login-error');
      el.textContent = msg;
      el.style.display = 'block';
    }

    document.getElementById('login-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });

    function doLogout() {
      authToken = '';
      currentUser = '';
      localStorage.removeItem('thinkai_admin_token');
      localStorage.removeItem('thinkai_admin_user');
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
    }

    async function authFetch(url, opts = {}) {
      const res = await fetch(`${API}${url}`, {
        ...opts,
        headers: { 'Authorization': `Bearer ${authToken}`, ...opts.headers }
      });
      if (res.status === 401) { doLogout(); throw new Error('Unauthorized'); }
      return res;
    }

    function enterApp() {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.getElementById('sidebar-username').textContent = currentUser;
      document.getElementById('user-avatar-char').textContent = currentUser[0].toUpperCase();
      loadStats();
      loadClientsTable();
    }

    // ── Page navigation ───────────────────────────────────────────────────────────
    function showPage(page) {
      if (page === 'approvals') loadApprovals();
      const parentMap = {
        'sessions': 'interactions',
        'kanban': 'interactions',
        'clients': 'interactions',
        'emails': 'interactions'
      };
      const actualPage = parentMap[page] || page;

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      
      const pg = document.getElementById(`page-${actualPage}`);
      if (pg) pg.classList.add('active');
      
      const nav = document.getElementById(`nav-${actualPage}`);
      if (nav) nav.classList.add('active');

      if (parentMap[page]) {
        const btn = document.querySelector(`[onclick*="switchCustomerView('${page}'"]`);
        if (typeof switchCustomerView === 'function') switchCustomerView(page, btn);
      } else {
        if (page === 'calendar') loadCalendar();
        if (page === 'settings') { loadSettings(); loadPraxisinfo(); if (typeof fetchTriageRules === 'function') fetchTriageRules();
      fetchDoctors(); }
        if (page === 'kanban') loadKanban();
        if (page === 'clients') loadClientsTable();
        if (page === 'tudastar') initTudastar();
      }
    }

    function onCallPhoneInput(el) {
      // Auto-format: ha 06-tal kezdődik, cseréljük +36-ra
      let v = el.value.replace(/\s/g, '');
      if (v.startsWith('06')) el.value = '+36' + v.slice(2);
    }

    async function startCall() {
      const phone = document.getElementById('call-phone-input').value.trim();
      const note  = document.getElementById('call-note-input').value.trim();
      const statusBox = document.getElementById('call-status-box');
      const errorBox  = document.getElementById('call-error-box');
      const btn       = document.getElementById('call-start-btn');
      const statusTxt = document.getElementById('call-status-text');
      const statusPh  = document.getElementById('call-status-phone');

      if (!phone) {
        document.getElementById('call-phone-input').style.borderColor = '#ef4444';
        setTimeout(() => document.getElementById('call-phone-input').style.borderColor = '', 1500);
        return;
      }

      // Reset UI
      errorBox.style.display  = 'none';
      statusBox.style.display = 'block';
      statusTxt.textContent   = 'Hívás felépítése...';
      statusPh.textContent    = phone;
      btn.disabled = true;
      btn.style.opacity = '0.6';

      try {
        const token = localStorage.getItem('thinkai_admin_token');
        const resp = await fetch('/admin/api/sip/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ phone_number: phone, note })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || 'Ismeretlen hiba');

        statusTxt.textContent = '✅ Hívás felépült!';
        document.getElementById('call-status-dot').style.animation = 'none';
        document.getElementById('call-status-dot').style.background = '#22c55e';
        document.getElementById('call-phone-input').value = '';
        document.getElementById('call-note-input').value  = '';
      } catch(e) {
        statusBox.style.display = 'none';
        errorBox.style.display  = 'block';
        errorBox.textContent    = '❌ Hiba: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    async function openAlertDetails(type) {
      const typeNames = {
        urgent: "Sürgős megkeresések",
        complaint: "Panaszok",
        stuck: "Nem kezelt / elakadt ügyek",
        callback: "Visszahívást igénylők",
        recurring: "Többször visszatérő kérdések"
      };
      
      document.getElementById('alert-modal-title').textContent = `Részletek: ${typeNames[type] || type}`;
      document.getElementById('alert-modal-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;"><div class="spinner"></div></td></tr>';
      document.getElementById('alert-details-modal').style.display = 'flex';
      
      try {
        const res = await authFetch(`/admin/api/analytics/alerts/details?type=${type}`);
        const data = await res.json();
        
        if (data.status === 'success' && data.data && data.data.length > 0) {
          const rows = data.data.map(item => {
            if (item.is_stuck) {
              return `<tr>
                <td class="td-time">${fmtDt(item.created_at)}</td>
                <td style="font-weight:600; color:var(--text);">${esc(item.channel)}</td>
                <td><strong style="color:var(--text);">${esc(item.name)}</strong></td>
                <td><span class="status-badge" style="background:var(--bg3); color:var(--text); padding:4px 8px; border-radius:4px; font-size:12px;">${esc(item.status)}</span></td>
              </tr>`;
            } else {
              return `<tr>
                <td class="td-time">${fmtDt(item.created_at)}</td>
                <td style="font-weight:600; color:var(--text);">${esc(item.channel)}</td>
                <td><strong style="color:var(--text);">${esc(item.topic)}</strong></td>
                <td style="color:rgba(8,36,50,0.8);">${esc(item.summary)}</td>
              </tr>`;
            }
          }).join('');
          document.getElementById('alert-modal-tbody').innerHTML = rows;
        } else {
          document.getElementById('alert-modal-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Nincs megjeleníthető adat.</td></tr>';
        }
      } catch (err) {
        document.getElementById('alert-modal-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Hiba történt az adatok betöltésekor.</td></tr>';
      }
    }

    // ── ANALYTICS ─────────────────────────────────────────────────────────────────
    async function loadStats() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const kpiGrid = document.getElementById('kpi-grid-figma');
      kpiGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div></div>`;

      // Betöltjük az AI insightokat is párhuzamosan
      loadInsights();

      try {
        const res = await authFetch(`/admin/api/stats?period=${period}&channel=${channel}`);
        const data = await res.json();
        _analyticsData = data;
        renderStats(data);
        loadFunnelStats();
        loadAlerts();
        loadOutboundStats();
      } catch (e) {
        kpiGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ef4444;padding:30px;">Hiba az adatok betöltésekor.</div>';
      }
    }

    async function loadAlerts() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/alerts?period=${period}&channel=${channel}`);
        const data = await res.json();
        document.getElementById('alert-urgent').textContent = data.urgent_count || 0;
        document.getElementById('alert-complaint').textContent = data.complaint_count || 0;
        document.getElementById('alert-callback').textContent = data.callback_count || 0;
        document.getElementById('alert-recurring').textContent = data.recurring_count || 0;
        document.getElementById('alert-stuck').textContent = data.stuck_count || 0;
      } catch (e) {
        console.error("Alerts fetch error", e);
      }
    }

    async function loadFunnelStats() {
      const container = document.getElementById('funnel-container');
      if (!container) return;
      
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/funnel?period=${period}&channel=${channel}`);
        const data = await res.json();
        
        const total = data.osszes_relevans || 0;
        const valaszolt = data.valaszolt_ugyek || 0;
        const ajanlat = data.ajanlatig_jutott || 0;
        const foglalt = data.idopont_lett || 0;

        const p1 = total > 0 ? 100 : 0;
        const p2 = total > 0 ? Math.round((valaszolt / total) * 100) : 0;
        const p3 = valaszolt > 0 ? Math.round((ajanlat / valaszolt) * 100) : 0;
        const p4 = ajanlat > 0 ? Math.round((foglalt / ajanlat) * 100) : 0;
        
        const w1 = 100;
        const w2 = total > 0 ? Math.round((valaszolt / total) * 100) : 10;
        const w3 = total > 0 ? Math.round((ajanlat / total) * 100) : 10;
        const w4 = total > 0 ? Math.round((foglalt / total) * 100) : 10;

        container.innerHTML = `
          <div class="funnel-step" style="width:${Math.max(w1, 10)}%;">
            <div class="funnel-step-label">Összes releváns megkeresés</div>
            <div><span class="funnel-step-val">${total}</span><span class="funnel-step-pct">(${p1}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p2}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w2, 10)}%;">
            <div class="funnel-step-label">Válaszolt ügyek</div>
            <div><span class="funnel-step-val">${valaszolt}</span><span class="funnel-step-pct">(${p2}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p3}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w3, 10)}%;">
            <div class="funnel-step-label">Foglalási ajánlatig jutott</div>
            <div><span class="funnel-step-val">${ajanlat}</span><span class="funnel-step-pct">(${p3}%)</span></div>
          </div>
          <div class="funnel-conv">▼ ${p4}% konverzió</div>
          <div class="funnel-step" style="width:${Math.max(w4, 10)}%;">
            <div class="funnel-step-label">Időpont lett belőle</div>
            <div><span class="funnel-step-val">${foglalt}</span><span class="funnel-step-pct">(${p4}%)</span></div>
          </div>
        `;
      } catch (e) {
        container.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Hiba a tölcsér betöltésekor</div>';
      }
    }

    async function loadOutboundStats() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/outbound/summary?period=${period}&channel=${channel}`);
        const data = await res.json();
        
        const total = data.total_outbound || 0;
        const reached = data.reached_count || 0;
        const negotiating = data.negotiating_count || 0;
        const booked = data.booked_count || 0;
        
        document.getElementById('outbound-total').textContent = total;
        document.getElementById('outbound-reached').textContent = (data.reached_rate || 0) + '%';
        document.getElementById('outbound-booked').textContent = booked;
        
        const rateEl = document.getElementById('outbound-booked-rate');
        rateEl.innerHTML = `<span>${data.booked_rate || 0}% konverziós arány</span>`;
        if (data.booked_rate > 0) {
            rateEl.classList.add('kpi-trend-up');
        } else {
            rateEl.classList.remove('kpi-trend-up');
        }
        
        document.getElementById('outbound-open').textContent = data.open_followup || 0;
        
        // Render Green Funnel
        const funnelContainer = document.getElementById('outbound-funnel-container');
        
        const p1 = total > 0 ? Math.round((reached / total) * 100) : 0;
        const p2 = reached > 0 ? Math.round((negotiating / reached) * 100) : 0;
        const p3 = negotiating > 0 ? Math.round((booked / negotiating) * 100) : 0;
        
        const w1 = total > 0 ? Math.round((reached / total) * 100) : 10;
        const w2 = total > 0 ? Math.round((negotiating / total) * 100) : 10;
        const w3 = total > 0 ? Math.round((booked / total) * 100) : 10;
        
        if (data && data.activities) {
            renderOutgoingChart(data.activities);
        } else {
            renderOutgoingChart(null);
        }

        if (funnelContainer) {
            if (total === 0) {
              funnelContainer.innerHTML = `
                <div class="green-funnel-step" style="width:100%;">
                  <div class="green-funnel-label">Kimenő kommunikáció indítva</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(100%)</span></div>
                </div>
                <div class="funnel-conv">▼ 72% konverzió</div>
                <div class="green-funnel-step" style="width:72%;">
                  <div class="green-funnel-label">Páciens elérve / Reagált</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
                <div class="funnel-conv">▼ 60% konverzió</div>
                <div class="green-funnel-step" style="width:55%;">
                  <div class="green-funnel-label">Időpont egyeztetve</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
                <div class="funnel-conv">▼ 52% konverzió</div>
                <div class="green-funnel-step" style="width:40%;">
                  <div class="green-funnel-label">Foglalás létrejött</div>
                  <div><span class="green-funnel-val">0</span><span class="green-funnel-pct">(0%)</span></div>
                </div>
              `;
            } else {
              funnelContainer.innerHTML = `
                <div class="green-funnel-step" style="width:100%;">
                  <div class="green-funnel-label">Kimenő kommunikáció indítva</div>
                  <div><span class="green-funnel-val">${total}</span><span class="green-funnel-pct">(100%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p1}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w1, 10)}%;">
                  <div class="green-funnel-label">Páciens elérve / Reagált</div>
                  <div><span class="green-funnel-val">${reached}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((reached/total)*100) : 0}%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p2}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w2, 10)}%;">
                  <div class="green-funnel-label">Időpont egyeztetve</div>
                  <div><span class="green-funnel-val">${negotiating}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((negotiating/total)*100) : 0}%)</span></div>
                </div>
                <div class="funnel-conv">▼ ${p3}% konverzió</div>
                <div class="green-funnel-step" style="width:${Math.max(w3, 10)}%;">
                  <div class="green-funnel-label">Foglalás létrejött</div>
                  <div><span class="green-funnel-val">${booked}</span><span class="green-funnel-pct">(${total > 0 ? Math.round((booked/total)*100) : 0}%)</span></div>
                </div>
              `;
            }
        }
        
      } catch (e) {
        console.error("Outbound stats fetch error", e);
        const funnelContainer = document.getElementById('outbound-funnel-container');
        if (funnelContainer) funnelContainer.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Hiba a tölcsér betöltésekor</div>';
      }
    }

    async function loadInsights() {
      const container = document.getElementById('insights-container');
      try {
        const res = await authFetch('/admin/api/analytics/insights');
        const data = await res.json();
        if (data.status === 'success' && data.insights && data.insights.length > 0) {
          renderInsights(data.insights);
        } else {
          container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nincs elérhető javaslat.</div>';
        }
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">Hiba a betöltéskor.</div>';
      }
    }

    async function generateInsights() {
      const btn = document.getElementById('btn-refresh-insights');
      const icon = document.getElementById('insights-refresh-icon');
      const container = document.getElementById('insights-container');
      
      btn.disabled = true;
      icon.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;border-color:#e5e7eb;border-top-color:currentColor;display:inline-block;"></div>';
      container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div><div style="margin-top:10px; color:var(--text-muted); font-size:13px;">AI analízis folyamatban...</div></div>';
      
      try {
        const res = await authFetch('/admin/api/analytics/insights/generate', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success' && data.insights) {
          renderInsights(data.insights);
        }
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">Hiba a generáláskor.</div>';
      } finally {
        btn.disabled = false;
        icon.innerHTML = '🔄';
      }
    }

    function renderInsights(insights) {
      const container = document.getElementById('insights-container');
      container.innerHTML = insights.map(text => `
        <div class="suggestion-card">
          <span class="suggestion-icon">💡</span>
          <span class="suggestion-text">${esc(text)}</span>
        </div>
      `).join('');
    }

    function renderStats(data) {
      const kpiGrid = document.getElementById('kpi-grid-figma');
      const period = document.getElementById('stats-days').value;
      const prefix = { week: 'Heti', month: 'Havi', year: 'Évi' }[period] || '';
      const prevLabel = { week: 'előző héthez', month: 'előző hónaphoz', year: 'előző évhez' }[period] || '';
      const prev = data.previous_period || {};

      function trendClass(cur, pre) {
        if (pre == null || pre === 0) return 'kpi-trend-neutral';
        return cur >= pre ? 'kpi-trend-up' : 'kpi-trend-down';
      }
      function trendArrow(cur, pre) {
        if (pre == null || pre === 0) return '';
        const diff = cur - pre;
        const pct = Math.round(Math.abs(diff / pre) * 100);
        const sign = diff >= 0 ? '+' : '−';
        const arrow = diff >= 0 ? '▲' : '▼';
        return `${arrow} ${sign}${pct}%`;
      }

      const cards = [
        { icon: '', label: 'Összes megkeresés', value: data.total_interactions ?? 0, sub: 'interakció', prev: prev.total_interactions, page: 'interactions' },
        { icon: '', label: 'Foglalási arány', value: data.total_bookings ?? 0, sub: 'foglalás', prev: prev.total_bookings, page: 'calendar' },
        { icon: '️', label: 'Átadási arány', value: data.total_sessions ?? 0, sub: 'élő átadás', prev: prev.total_sessions, page: 'sessions' },
        { icon: '', label: 'Avg. session (mp)', value: data.avg_session_duration ?? 0, sub: 'mp', prev: prev.avg_session_duration, page: 'sessions' },
        { icon: '', label: 'Kimenő kommunikációk', value: data.total_emails ?? 0, sub: 'email küldve', prev: prev.total_emails, page: 'emails' },
        { icon: '', label: 'Nyílt feladatok', value: data.open_tasks ?? 0, sub: 'követést igényel', prev: null, page: 'sessions' },
      ];

      kpiGrid.innerHTML = cards.map(c => `
    <button class="kpi-card-figma" onclick="showPage('${c.page}')">
      <div class="kpi-card-icon">${c.icon}</div>
      <div class="kpi-card-label">${c.label}</div>
      <div class="kpi-card-value">${c.value}</div>
      <div class="kpi-card-subtitle">${c.sub}</div>
      <div class="kpi-card-trend ${trendClass(c.value, c.prev)}">
        <span>${trendArrow(c.value, c.prev)}</span>
        <span class="kpi-trend-desc">${prevLabel ? prevLabel + ' képest' : ''}</span>
      </div>
    </button>
  `).join('');

      // Fill top topics from interaction types
      const types = data.interactions_by_topic || [];
      const typesTotal = types.reduce((a, t) => a + (t.count || 0), 0);
      const topicsEl = document.getElementById('top-topics-list');
      if (topicsEl) {
        if (types.length === 0) {
          topicsEl.innerHTML = '<div style="color:#6b7280;font-size:13px;text-align:center;padding:20px;">Nincs adat</div>';
        } else {
          topicsEl.innerHTML = types.slice(0, 5).map((t, i) => {
            const pct = typesTotal > 0 ? Math.round((t.count / typesTotal) * 100) : 0;
            return `
          <div class="topic-row">
            <div class="topic-row-header">
              <div style="display:flex;align-items:center;">
                <div class="topic-rank-badge">${i + 1}</div>
                <span class="topic-name">${t.topic || 'Ismeretlen'}</span>
              </div>
              <span class="topic-value">${t.count}<span class="topic-pct">(${pct}%)</span></span>
            </div>
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct * 3}%;"></div></div>
          </div>`;
          }).join('');
        }
      }

      // Interactions over time chart
      const dowData = data.interactions_by_dow || {total: [0,0,0,0,0,0,0], channels: {}};
      const hourData = data.interactions_by_hour || {total: Array(24).fill(0), channels: {}};
      
      const ctx1 = document.getElementById('sessions-chart');
      if (!ctx1) return;
      if (sessionsChart) { sessionsChart.destroy(); sessionsChart = null; }

      const typeColorMap = {
        'E-Mail': '#1ceee0',
        'Telefon': '#3b82f6',
        'Whatsapp': '#22c55e',
        'Messenger': '#8b5cf6'
      };

      let currentView = window._chartCurrentView || 'napi';
      const breakdownCheckbox = document.getElementById('chk-channel-breakdown');
      const btnNapi = document.getElementById('btn-chart-napi');
      const btnOras = document.getElementById('btn-chart-oras');
      
      if (window._chartIsBreakdown && breakdownCheckbox) {
          breakdownCheckbox.checked = true;
      }

      window._updateChartThemes = function() {
        if (!sessionsChart) return;
        const isDark = document.body.classList.contains('dark');
        const gridColor = isDark ? '#1a3548' : '#f1f5f9';
        const gridDash = isDark ? [] : [5, 5];
        sessionsChart.options.scales.x.grid.color = gridColor;
        sessionsChart.options.scales.y.grid.color = gridColor;
        sessionsChart.options.scales.x.grid.borderDash = gridDash;
        sessionsChart.options.scales.y.grid.borderDash = gridDash;
        sessionsChart.update();
      };

      function updateInteractionsChart() {
        const isDark = document.body.classList.contains('dark');
        const gridColor = isDark ? '#1a3548' : '#f1f5f9';
        const gridDash = isDark ? [] : [5, 5];
        
        const isBreakdown = breakdownCheckbox ? breakdownCheckbox.checked : false;
        if (breakdownCheckbox) window._chartIsBreakdown = isBreakdown;
        
        const targetData = currentView === 'napi' ? dowData : hourData;
        const labels = currentView === 'napi' 
            ? ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
            : Array.from({length: 24}, (_, i) => `${i}:00`);

        let datasets = [];

        if (isBreakdown) {
          for (const [channel, counts] of Object.entries(targetData.channels)) {
             datasets.push({
               label: channel,
               data: counts,
               borderColor: typeColorMap[channel] || '#f59e0b',
               backgroundColor: 'transparent',
               borderWidth: 2,
               tension: 0.4,
               pointRadius: 3,
               pointBackgroundColor: typeColorMap[channel] || '#f59e0b'
             });
          }
        } else {
          datasets.push({
            label: 'Összes megkeresés',
            data: targetData.total,
            borderColor: '#1ceee0',
            backgroundColor: 'rgba(28,238,224,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#1ceee0',
          });
        }

        let maxVal = 5;
        datasets.forEach(ds => {
            const maxData = Math.max(...ds.data);
            if (maxData > maxVal) maxVal = maxData;
        });
        const yMax = Math.ceil(maxVal * 1.25);
        const yStep = Math.max(1, Math.ceil(yMax / 6));

        if (sessionsChart) {
           sessionsChart.data.labels = labels;
           sessionsChart.data.datasets = datasets;
           sessionsChart.options.scales.y.max = yMax;
           sessionsChart.options.scales.y.ticks.stepSize = yStep;
           sessionsChart.options.scales.x.grid.color = gridColor;
           sessionsChart.options.scales.y.grid.color = gridColor;
           sessionsChart.options.scales.x.grid.borderDash = gridDash;
           sessionsChart.options.scales.y.grid.borderDash = gridDash;
           sessionsChart.update();
        } else {
           sessionsChart = new Chart(ctx1, {
             type: 'line',
             data: { labels, datasets },
             options: {
               responsive: true,
               maintainAspectRatio: false,
               plugins: {
                 legend: { 
                   display: true, 
                   position: 'bottom',
                   labels: { color: '#6b8b99', usePointStyle: true, boxWidth: 8, font: { size: 11 } }
                 }
               },
               scales: {
                 x: { 
                   ticks: { color: '#6b8b99', font: { size: 11 } }, 
                   grid: { color: gridColor, borderDash: gridDash },
                   border: { display: false }
                 },
                 y: {
                   min: 0,
                   max: yMax,
                   ticks: { color: '#6b8b99', font: { size: 11 }, stepSize: yStep },
                   grid: { color: gridColor, borderDash: gridDash },
                   border: { display: false }
                 }
               }
             }
           });
        }
      }

      updateInteractionsChart();

      if (btnNapi && btnOras) {
          const newBtnNapi = btnNapi.cloneNode(true);
          const newBtnOras = btnOras.cloneNode(true);
          btnNapi.parentNode.replaceChild(newBtnNapi, btnNapi);
          btnOras.parentNode.replaceChild(newBtnOras, btnOras);
          
          if (currentView === 'napi') {
             newBtnNapi.style.background = 'var(--primary)'; newBtnNapi.style.color = '#0a192f'; newBtnNapi.style.fontWeight = '600';
             newBtnOras.style.background = 'transparent'; newBtnOras.style.color = '#6b8b99'; newBtnOras.style.fontWeight = 'normal';
          } else {
             newBtnOras.style.background = 'var(--primary)'; newBtnOras.style.color = '#0a192f'; newBtnOras.style.fontWeight = '600';
             newBtnNapi.style.background = 'transparent'; newBtnNapi.style.color = '#6b8b99'; newBtnNapi.style.fontWeight = 'normal';
          }

          newBtnNapi.addEventListener('click', () => {
             window._chartCurrentView = 'napi'; currentView = 'napi';
             newBtnNapi.style.background = 'var(--primary)'; newBtnNapi.style.color = '#0a192f'; newBtnNapi.style.fontWeight = '600';
             newBtnOras.style.background = 'transparent'; newBtnOras.style.color = '#6b8b99'; newBtnOras.style.fontWeight = 'normal';
             updateInteractionsChart();
          });
          newBtnOras.addEventListener('click', () => {
             window._chartCurrentView = 'oras'; currentView = 'oras';
             newBtnOras.style.background = 'var(--primary)'; newBtnOras.style.color = '#0a192f'; newBtnOras.style.fontWeight = '600';
             newBtnNapi.style.background = 'transparent'; newBtnNapi.style.color = '#6b8b99'; newBtnNapi.style.fontWeight = 'normal';
             updateInteractionsChart();
          });
      }

      if (breakdownCheckbox) {
          const newCb = breakdownCheckbox.cloneNode(true);
          breakdownCheckbox.parentNode.replaceChild(newCb, breakdownCheckbox);
          newCb.addEventListener('change', () => updateInteractionsChart());
      }

      // Types donut chart
      const chartTypes = data.interactions_by_type || [];
      const ctx2 = document.getElementById('types-chart');
      const legendContainer = document.getElementById('types-chart-legend');
      if (!ctx2) return;
      if (typesChart) { typesChart.destroy(); typesChart = null; }
      
      const typeColors = ['#3b82f6', '#1ceee0', '#22c55e', '#8b5cf6', '#f59e0b', '#f97316'];
      
      typesChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: chartTypes.map(t => t.type),
          datasets: [{
            data: chartTypes.map(t => t.count),
            backgroundColor: typeColors.slice(0, chartTypes.length),
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { display: false }
          }
        }
      });

      if (legendContainer) {
        legendContainer.innerHTML = chartTypes.map((t, i) => `
          <div style="display:flex; flex-direction:column; align-items:flex-start;">
            <div style="display:flex; align-items:center; margin-bottom:4px;">
              <div style="width:8px;height:8px;border-radius:50%;background-color:${typeColors[i % typeColors.length]};margin-right:8px;"></div>
              <span style="font-size:12px;color:#6b8b99;">${t.type === 'Whatsapp' ? 'WhatsApp' : t.type}</span>
            </div>
            <div style="font-size:16px;font-weight:600;color:var(--text);padding-left:16px;">${t.count}</div>
          </div>
        `).join('');
      }

      // Handoff placeholder chart
      // Handoff chart is now dynamic, called inside loadStats
      if (data && data.handovers) {
          renderHandoffChart(data.handovers);
      } else {
          renderHandoffChart([]);
      }

      // Outgoing activity placeholder chart
      if (data && data.activities) {
          renderOutgoingChart(data.activities);
      } else {
          renderOutgoingChart(null);
      }

      setTimeout(() => {
        if (sessionsChart) sessionsChart.resize();
        if (typesChart) typesChart.resize();
      }, 50);
    }

    function renderHandoffChart(handovers = []) {
      const ctx = document.getElementById('handoff-chart');
      if (!ctx) return;
      if (handoffChart) { handoffChart.destroy(); handoffChart = null; }
      
      let labels = [];
      let values = [];
      
      if (handovers.length > 0) {
          labels = handovers.map(h => h.reason);
          values = handovers.map(h => h.count);
      } else {
          labels = ['Összetett kérdés', 'Sürgős / triázs', 'Hiányzó info', 'Foglalási kivétel', 'Emberi döntés'];
          values = [0, 0, 0, 0, 0];
      }
      
      handoffChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Átadások', data: values, backgroundColor: '#ef4444', borderRadius: 6 }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } },
            y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } }
          }
        }
      });
    }

    function renderOutgoingChart(activities = null) {
      const ctx = document.getElementById('outgoing-activity-chart');
      if (!ctx) return;
      if (outgoingChart) { outgoingChart.destroy(); outgoingChart = null; }
      
      const labels = ['Visszahívás', 'Emlékeztető', 'Utánkövetés', 'Kampány', 'Kontroll', 'Passzív'];
      let dataVals = [0, 0, 0, 0, 0, 0];
      if (activities) {
          dataVals = [
              activities['Visszahívás'] || 0,
              activities['Emlékeztető'] || 0,
              activities['Utánkövetés'] || 0,
              activities['Kampány'] || 0,
              activities['Kontroll'] || 0,
              activities['Passzív'] || 0
          ];
      }
      
      outgoingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Aktivitás', data: dataVals, backgroundColor: '#1ceee0', borderRadius: 6 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } }
          }
        }
      });
    }

    // ── INTERACTIONS FLAT TABLE ───────────────────────────────────────────────────
    let _allInteractionRows = [];

    async function loadInteractions() {
      const tbody = document.getElementById('interactions-flat-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;margin:0 auto 10px;"></div>Adatok betöltése...</td></tr>';
      try {
        const res = await authFetch('/admin/api/sessions/summary?limit=100');
        const data = await res.json();
        buildFlatInteractionRows(data.sessions || []);
      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    function buildFlatInteractionRows(sessions) {
      // Flatten all interactions from all sessions into one list
      _allInteractionRows = [];
      sessions.forEach(s => {
        const sessionDate = s.started_at || '';
        const isEmail = s.room_name && s.room_name.toLowerCase().includes('email');
        const channel = isEmail ? 'Email' : (s.channel || 'Telefon');
        const clientName = s.participant || s.client_name || 'Ismeretlen';

        (s.interactions || []).forEach(r => {
          _allInteractionRows.push({
            date: r.created_at || sessionDate,
            channel: channel,
            client: clientName,
            type: r.type || '-',
            topic: r.topic || '-',
            summary: r.summary || '-',
            result: r.result || '',
          });
        });
        // If session has no sub-interactions but has a summary, show it as one row
        if (!s.interactions || s.interactions.length === 0) {
          _allInteractionRows.push({
            date: sessionDate,
            channel: channel,
            client: clientName,
            type: 'session',
            topic: '-',
            summary: s.summary || '-',
            result: '',
          });
        }
      });

      // Sort newest first
      _allInteractionRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      filterInteractionsTable();
    }

    const RESULT_COLORS = {
      'Lezárt': { bg: '#dcfce7', color: '#15803d' },
      'Foglalás történt': { bg: '#dcfce7', color: '#166534' }, // changed to green-100/green-800 per brief
      'Siker': { bg: '#dcfce7', color: '#166534' },
      'Foglalt': { bg: '#dcfce7', color: '#166534' },
      'Átadva': { bg: '#ffedd5', color: '#c2410c' },
      'Visszahívás szükséges': { bg: '#ffedd5', color: '#9a3412' }, // orange-100/orange-800
      'Sürgős': { bg: '#ffedd5', color: '#9a3412' },
      'Nyitott ügy': { bg: '#fee2e2', color: '#b91c1c' },
      'Kimenő': { bg: '#f3e8ff', color: '#6b21a8' }, // purple-100/purple-800
      'Bejövő': { bg: '#dbeafe', color: '#1e40af' }, // blue-100/blue-800
    };

    function resultBadge(result) {
      if (!result) return '—';
      const c = RESULT_COLORS[result] || { bg: '#f3f4f6', color: '#374151' };
      return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color};">${esc(result)}</span>`;
    }

    function typeChip(type) {
      const MAP = {
        'foglalás': '#dbeafe:#1d4ed8',
        'email': '#ede9fe:#7c3aed',
        'feladat': '#f3e8ff:#9333ea',
        'kérdés': '#ccfbf1:#0f766e',
        'session': '#f3f4f6:#6b7280',
      };
      const [bg, col] = (MAP[type] || '#f3f4f6:#374151').split(':');
      return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${bg};color:${col};">${esc(type)}</span>`;
    }


    async function openInteractionSummaryModal(idx) {
      const r = window._filteredInteractionRows[idx];
      if (!r) return;

      document.getElementById('ism-client').textContent = r.client || 'Ismeretlen';
      document.getElementById('ism-channel').textContent = r.channel || 'Telefon';
      document.getElementById('ism-date').textContent = r.date ? fmtDt(r.date) : '';
      document.getElementById('ism-summary').textContent = r.summary || 'Nincs összefoglaló';
      document.getElementById('ism-result-badge').innerHTML = resultBadge(r.result);

      // Clear dynamic fields
      const grid = document.getElementById('ism-result-grid');
      grid.innerHTML = '';

      document.getElementById('ism-transcript-section').style.display = 'none';
      document.getElementById('ism-modal').style.display = 'flex';

      // Fetch client to get structured result and transcript
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const clients = data.clients || [];
        const client = clients.find(c => {
          if (!c.custom_data) return false;
          let cd = {};
          try { cd = typeof c.custom_data === 'string' ? JSON.parse(c.custom_data) : c.custom_data; } catch (e) { }
          let cn = (cd.nev || cd.name || cd['név'] || cd['Név'] || '').toLowerCase().trim();
          let rn = (r.client || '').toLowerCase().trim();
          if (cn && rn && cn === rn) return true;
          let em = (cd.email || '').toLowerCase().trim();
          if (em && rn && rn.includes(em)) return true;
          return false;
        });

        if (client && client.custom_data) {
          let cd = {};
          try { cd = typeof client.custom_data === 'string' ? JSON.parse(client.custom_data) : client.custom_data; } catch (e) { }
          const fieldsToShow = [
            { id: 'idopont', label: 'Befoglalt időpont' },
            { id: 'szolgaltatas', label: 'Szolgáltatás' },
            { id: 'orvos', label: 'Orvos' },
            { id: 'prioritas', label: 'Prioritás' }
          ];

          fieldsToShow.forEach(f => {
            let val = cd[f.id] || cd[f.label] || cd[f.id.toLowerCase()] || cd[f.label.toLowerCase()];
            if (val) {
              grid.innerHTML += `<div><div class="ism-result-label">${f.label}</div><div class="ism-result-val">${esc(val)}</div></div>`;
            }
          });

          if (cd.beszelgetes_naplo) {
            document.getElementById('ism-transcript').value = cd.beszelgetes_naplo;
            document.getElementById('ism-transcript-section').style.display = 'block';
          }
        }
      } catch (e) {
        console.error('Error fetching client details for modal:', e);
      }
    }

    function filterInteractionsTable() {
      const tbody = document.getElementById('interactions-flat-body');
      const countEl = document.getElementById('interactions-count');
      if (!tbody) return;

      const q = (document.getElementById('interaction-search')?.value || '').toLowerCase();
      const typeF = (document.getElementById('interaction-type-filter')?.value || '').toLowerCase();

      const sortVal = (document.getElementById('interaction-sort')?.value || 'date_desc');
      window._filteredInteractionRows = _allInteractionRows.filter(r => {
        const matchType = !typeF || r.type.toLowerCase().includes(typeF);
        const matchQ = !q || [r.channel, r.client, r.type, r.topic, r.summary, r.result].join(' ').toLowerCase().includes(q);
        return matchType && matchQ;
      });

      window._filteredInteractionRows.sort((a, b) => {
        if (sortVal === 'date_desc') return (b.date || '').localeCompare(a.date || '');
        if (sortVal === 'date_asc') return (a.date || '').localeCompare(b.date || '');
        if (sortVal === 'client_asc') return (a.client || '').localeCompare(b.client || '');
        if (sortVal === 'topic_asc') return (a.topic || '').localeCompare(b.topic || '');
        return 0;
      });

      if (!window._filteredInteractionRows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:40px;">Nincs találat</td></tr>';
        if (countEl) countEl.textContent = '';
        return;
      }

      const isDark = document.body.classList.contains('dark');
      tbody.innerHTML = window._filteredInteractionRows.map((r, i) => {
        const bg = isDark ? (i % 2 === 0 ? '#0d2538' : '#0f2d40') : (i % 2 === 0 ? '#fff' : '#fafafa');
        const hover = isDark ? 'rgba(28,238,224,0.05)' : '#f0fffe';
        const txt = isDark ? '#c8d6e5' : '#374151';
        const txtH = isDark ? '#e8edf5' : '#0a1f2e';
        const txtM = isDark ? '#6b8b99' : '#6b7280';
        const bdr = isDark ? '#1a3548' : '#f3f4f6';
        return `<tr style="background:${bg};border-bottom:1px solid ${bdr};transition:background 0.15s;" onmouseover="this.style.background='${hover}'" onmouseout="this.style.background='${bg}'">
      <td style="padding:12px 16px;font-size:13px;color:${txt};white-space:nowrap;">
        <div style="font-weight:500;color:${txtH};">${fmtDt(r.date)}</div>
      </td>
      <td style="padding:12px 16px;font-size:13px;color:${txt};">${esc(r.channel)}</td>
      <td style="padding:12px 16px;font-size:13px;font-weight:500;color:${txtH};">${esc(r.client || 'Ismeretlen')}</td>
      <td style="padding:12px 16px;">${typeChip(r.type)}</td>
      <td style="padding:12px 16px;font-size:13px;font-weight:500;color:${txtH};">${esc(r.topic)}</td>
      <td style="padding:12px 16px;font-size:13px;color:${txtM};max-width:340px;">
          <div onclick="openInteractionSummaryModal(${i})" class="summary-link" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Összefoglaló és beszélgetés napló megtekintése">${esc(r.summary)}</div>
        </td>
      <td style="padding:12px 16px;">${resultBadge(r.result)}</td>
    </tr>`;
      }).join('');

      if (countEl) countEl.textContent = `${window._filteredInteractionRows.length} interakció`;
    }

    // kept for backward compat
    function renderSessionCards(sessions) { buildFlatInteractionRows(sessions); }
    function toggleSessionDetail() { }

    let activeFilter = '';
    function filterInteractions(type) { /* compat */ }


    // ── CALENDAR ──────────────────────────────────────────────────────────────────
    let fcInstance = null;
    let currentCalendarView = 'grid';

    function switchCalendarView(view) {
      currentCalendarView = view;
      const listBtn = document.getElementById('cal-view-list-btn');
      const gridBtn = document.getElementById('cal-view-grid-btn');
      const listCont = document.getElementById('calendar-list-view');
      const gridCont = document.getElementById('calendar-grid-view');

      if (view === 'list') {
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        listCont.style.display = 'block';
        gridCont.style.display = 'none';
      } else {
        listBtn.classList.remove('active');
        gridBtn.classList.add('active');
        listCont.style.display = 'none';
        gridCont.style.display = 'block';
        if (fcInstance) {
          setTimeout(() => fcInstance.render(), 10);
        }
      }
    }

    async function loadCalendar() {
      const tbody = document.getElementById('calendar-body');
      if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="spinner"></div></td></tr>';
      try {
        const res = await authFetch('/admin/api/calendar');
        const data = await res.json();
        const events = data.events || [];

        // --- Render List View ---
        if (!events.length) {
          if (tbody) tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">Nincs naptári esemény</div></div></td></tr>`;
        } else {
          if (tbody) {
            tbody.innerHTML = events.map(ev => `
          <tr>
            <td><div class="td-time">${fmtDt(ev.start_dt)}</div></td>
            <td style="font-weight:500">${esc(ev.title)}</td>
            <td>${esc(ev.attendee || '—')}</td>
            <td><span class="badge badge-teal">${ev.duration_minutes} perc</span></td>
            <td class="td-summary">${esc(ev.attendee_email || '—')}</td>
          </tr>
        `).join('');
          }
        }

        // --- Render Grid View (FullCalendar) ---
        const fcEl = document.getElementById('fullcalendar-el');
        if (fcEl) {
          if (!fcInstance) {
            fcInstance = new FullCalendar.Calendar(fcEl, {
              initialView: 'timeGridWeek',
              locale: 'hu',
              contentHeight: 'auto',
              aspectRatio: 2.1,
              slotMinTime: '08:00:00',
              slotMaxTime: '20:00:00',
              allDaySlot: false,
              headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'timeGridDay,timeGridWeek,dayGridMonth'
              },
              buttonText: {
                today: 'Ma',
                month: 'Hónap',
                week: 'Hét',
                day: 'Nap'
              },
              eventColor: 'var(--accent)',
              events: [],
              eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
              }
            });
            fcInstance.render();
          }

          fcInstance.removeAllEvents();
          events.forEach(ev => {
            let endDt = null;
            if (ev.duration_minutes) {
              endDt = new Date(new Date(ev.start_dt).getTime() + ev.duration_minutes * 60000).toISOString();
            }
            fcInstance.addEvent({
              title: ev.title + (ev.attendee ? ' - ' + ev.attendee : ''),
              start: ev.start_dt,
              end: endDt || undefined
            });
          });
          if (currentCalendarView === 'grid') {
            setTimeout(() => fcInstance.render(), 20);
          }
        }

      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }


    // ── EMAILS ────────────────────────────────────────────────────────────────────
    async function loadEmails() {
      const tbody = document.getElementById('emails-body');
      tbody.innerHTML = '<tr class="loading-row"><td colspan="4"><div class="spinner"></div></td></tr>';
      try {
        const res = await authFetch('/admin/api/emails');
        const data = await res.json();
        const emails = data.emails || [];
        if (!emails.length) {
          tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">️</div><div class="empty-state-text">Nincs elküldött email</div></div></td></tr>`;
          return;
        }
        tbody.innerHTML = emails.map(em => `
      <tr>
        <td class="td-time">${fmtDt(em.sent_at)}</td>
        <td>
          <div style="font-weight:500">${esc(em.to_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${esc(em.to_email)}</div>
        </td>
        <td class="td-summary">${esc(em.subject || '—')}</td>
        <td><span class="badge ${em.status === 'sent' ? 'badge-green' : em.status === 'sent (simulated)' ? 'badge-yellow' : 'badge-red'}">${em.status === 'sent' ? ' Elküldve' : em.status === 'sent (simulated)' ? ' Szimulált' : ' Hiba'}</span></td>
      </tr>
    `).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    // ── SESSIONS ──────────────────────────────────────────────────────────────────
    async function loadSessions() {
      const tbody = document.getElementById('sessions-body');
      tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="spinner"></div></td></tr>';
      try {
        const res = await authFetch('/admin/api/sessions');
        const data = await res.json();
        const sessions = data.sessions || [];
        if (!sessions.length) {
          tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">️</div><div class="empty-state-text">Nincs rögzített session</div></div></td></tr>`;
          return;
        }
        tbody.innerHTML = sessions.map(s => {
          const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : '—';
          const status = s.ended_at
            ? `<span class="badge badge-gray">Befejezett</span>`
            : `<span class="badge badge-green">Aktív</span>`;
          return `
        <tr>
          <td class="td-time">${fmtDt(s.started_at)}</td>
          <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${esc(s.session_id)}</td>
          <td>${esc(s.room_name || '—')}</td>
          <td>${dur}</td>
          <td>${status}</td>
        </tr>
      `;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>';
      }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────
    function fmtDt(iso) {
      if (!iso) return '—';
      try {
        // DB stores UTC without 'Z' suffix — append it so JS converts to local time
        const utcIso = iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z';
        const d = new Date(utcIso);
        return d.toLocaleString('hu-HU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    }

    function esc(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── SÜRGŐS ESETEK (URGENT ALERTS) POLLING ──────────────────────────────────────
    let knownUrgentIds = new Set();
    let viewedUrgentIds = new Set();
    const urgentAudio = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); // Fallback placeholder ha nincs natív, de inkább egy diszkrét ding:
    urgentAudio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"; // Rövid csilingelés
    
    function toggleUrgentDropdown() {
      const dropdown = document.getElementById('urgent-dropdown');
      if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'flex';
      } else {
        dropdown.style.display = 'none';
      }
    }

        async function viewUrgentAlert(clientId, name, email, phone) {
      document.getElementById('urgent-dropdown').style.display = 'none';
      
      viewedUrgentIds.add(clientId);

      // Update UI manually immediately
      const badge = document.getElementById('urgent-badge');
      const currentCount = parseInt(badge.textContent || '0');
      if (currentCount > 0) {
        badge.textContent = currentCount - 1;
        if (currentCount - 1 === 0) badge.style.display = 'none';
      }

      pollUrgentCases(); // This will re-render without it once backend catches up

      try {
        await authFetch('/admin/api/alerts/urgent/' + clientId + '/view', { method: 'POST' });
        // DO NOT delete from knownUrgentIds to prevent the toast from showing again!
        pollUrgentCases(); // Final sync with backend
      } catch(e) { console.error('Hiba az alert megtekintésekor', e); }
      
      if(typeof showPage === 'function') showPage('clients'); 
      if(typeof openClientDetails === 'function') {
        openClientDetails({id: clientId, name: name, email: email || '', phone: phone || ''});
      }
    }

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
            showUrgentToast(c);
          }
        });
        
        const badge = document.getElementById('urgent-badge');
        const listDiv = document.getElementById('urgent-dropdown-list');
        
        if (urgentClients.length > 0) {
          badge.textContent = urgentClients.length;
          badge.style.display = 'flex';
          if (newCount > 0) {
            urgentAudio.play().catch(e => console.log('Audio autoplay prevented'));
          }
          
          if (listDiv) {
            listDiv.innerHTML = urgentClients.map(c => `
              <div onclick="viewUrgentAlert(${c.id}, '${esc(c.name)}', '${esc(c.email || '')}', '${esc(c.phone || '')}')" style="padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; flex-direction:column; gap:4px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:600; font-size:13px; color:var(--text);">${esc(c.name)}</span>
                  <span style="font-size:10px; font-weight:500; color:#ef4444; background:rgba(239,68,68,0.1); padding:2px 6px; border-radius:4px;">${esc(c.channel)}</span>
                </div>
                <div style="font-size:12px; color:var(--text-muted); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${esc(c.problem)}</div>
              </div>
            `).join('');
          }
        } else {
          badge.style.display = 'none';
          if (listDiv) {
            listDiv.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">Nincs új sürgős riasztás.</div>';
          }
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
        <button onclick="if(typeof showPage === 'function') showPage('clients'); if(typeof openClientDetails === 'function') openClientDetails({name: '${esc(c.name)}', email: '${esc(c.email || '')}', phone: '${esc(c.phone || '')}'}); this.parentElement.remove();" style="margin-top:8px; align-self:flex-start; font-size:12px; font-weight:600; color:#2563eb; background:none; border:none; cursor:pointer; padding:0;">Ugrás az ügyfél adatlapjára ➔</button>
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


    // ── Auto login if token exists ────────────────────────────────────────────────
    if (authToken) {
      authFetch('/admin/api/stats?period=month')
        .then(() => enterApp())
        .catch(() => {
          authToken = '';
          localStorage.removeItem('thinkai_admin_token');
        });
    }


    // ── KANBAN ──────────────────────────────────────────────────────────────────
    let draggedClientId = null;
    let currentKanbanColumns = [];
    let currentClientFields = [];

    async function initClientFields() {
      if (currentClientFields.length === 0) {
        try {
          const res = await authFetch('/admin/api/client_fields');
          const data = await res.json();
          currentClientFields = data.fields || [];
          currentClientFields.sort((a, b) => a.order_index - b.order_index);
        } catch (e) { console.error("Hiba mezők letöltésekor", e); }
      }
    }


    async function loadKanban() {
      const board = document.getElementById('kanban-board');
      if (!board) return;
      board.innerHTML = '<div style="text-align:center;width:100%;padding:40px;color:var(--text-muted);"><div class="spinner"></div></div>';

      try {
        const colRes = await authFetch('/admin/api/kanban_columns');
        const colData = await colRes.json();
        currentKanbanColumns = colData.columns || [];
        currentKanbanColumns.sort((a, b) => a.order_index - b.order_index);

        const clientRes = await authFetch('/admin/api/clients');
        const clientData = await clientRes.json();
        const clients = clientData.clients || [];

        const counts = {};
        const clientsByStatus = {};
        currentKanbanColumns.forEach(col => {
          counts[col.id] = 0;
          clientsByStatus[col.id] = [];
        });

        clients.forEach(c => {
          const status = c.status || 'uj';
          if (!clientsByStatus[status]) { Object.assign(counts, { [status]: 0 }); clientsByStatus[status] = []; }
          clientsByStatus[status].push(c);
          counts[status]++;
        });

        board.innerHTML = currentKanbanColumns.map(col => `
      <div class="kanban-col" id="col-${col.id}" ondragover="kanbanDragOver(event)" ondrop="kanbanDrop(event, '${col.id}')">
        <div class="kanban-col-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span id="col-name-label-${col.id}">${esc(col.name)}</span>
            <span class="kanban-col-count" id="count-${col.id}">${counts[col.id]}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="editKanbanColumn('${col.id}', '${esc(col.name)}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;" title="Átnevezés"></button>
            <button onclick="deleteKanbanColumn('${col.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;" title="Törlés"></button>
          </div>
        </div>
        <div class="kanban-cards" id="cards-${col.id}"></div>
      </div>
    `).join('');

        await initClientFields();
        currentKanbanColumns.forEach(col => {
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
          
          colClients.forEach(c => {
            const div = document.createElement('div');
            div.className = 'kanban-card';
            div.draggable = true;
            div.ondragstart = (e) => { draggedClientId = c.id; div.classList.add('dragging'); };
            div.ondragend = () => div.classList.remove('dragging');

            // Allow double click to open client modal directly
            div.ondblclick = () => openClientModal(c.id, btoa(encodeURIComponent(c.custom_data || '{}')));

            // Build dynamic UI for card
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
            `;
            container.appendChild(div);
          });
        });
      } catch (e) {
        console.error('Kanban hiba:', e);
        board.innerHTML = '<div style="text-align:center;width:100%;color:var(--red);padding:40px;">Hiba az adatok betöltésekor</div>';
      }
    }

    async function promptAddKanbanColumn() {
      const name = prompt("Új oszlop neve:");
      if (!name) return;
      const idStr = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
      if (!idStr) { alert("Érvénytelen név"); return; }
      const order_index = currentKanbanColumns.length > 0 ? Math.max(...currentKanbanColumns.map(c => c.order_index)) + 1 : 1;
      const req = { id: idStr, name: name.trim(), order_index: order_index };
      try {
        const res = await authFetch('/admin/api/kanban_columns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        if (!res.ok) { alert("Hiba: Már létezik ilyen oszlop azonosító vagy belső hiba."); return; }
        loadKanban();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function editKanbanColumn(id, oldName) {
      const name = prompt("Oszlop új neve:", oldName);
      if (!name || name.trim() === oldName) return;
      const req = { name: name.trim() };
      try {
        await authFetch(`/admin/api/kanban_columns/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        loadKanban();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function deleteKanbanColumn(id) {
      if (!confirm("Biztosan törlöd ezt az oszlopot? Csak akkor lehetséges, ha üres!")) return;
      try {
        const res = await authFetch(`/admin/api/kanban_columns/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const d = await res.json();
          alert(d.detail || "Hiba a törlésnél. Biztosan üres az oszlop?");
        } else {
          loadKanban();
        }
      } catch (e) { alert("Hálózati hiba"); }
    }

    function kanbanDragOver(e) { e.preventDefault(); }

    async function kanbanDrop(e, status) {
      e.preventDefault();
      if (!draggedClientId) return;
      const id = draggedClientId;
      draggedClientId = null;

      try {
        await authFetch(`/admin/api/clients/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        loadKanban();
      } catch (err) {
        alert('Hiba a mozgatás során!');
      }
    }


    async function loadClientsTable() {
      await initClientFields();
      const thead = document.getElementById('clients-thead');
      const tbody = document.getElementById('clients-body');
      if (!tbody || !thead) return;

      const displayFields = currentClientFields.slice(0, 4);
      thead.innerHTML = `
    <tr>
      <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllClients" onchange="toggleAllClients(this)"></th>
      <th>Regisztrálva</th>
      <th>Csatorna</th>
      ${displayFields.map(f => `<th>${esc(f.name)}</th>`).join('')}
      <th>Kanban Státusz</th>
      <th>Műveletek</th>
    </tr>
  `;

      tbody.innerHTML = `<tr class="loading-row"><td colspan="${5 + displayFields.length}"><div class="spinner"></div></td></tr>`;
      
      // Hide bulk delete button on reload
      document.getElementById('bulk-delete-btn').style.display = 'none';
      document.getElementById('bulk-delete-count').textContent = '0';
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const clients = data.clients || [];
        if (!clients.length) {
          tbody.innerHTML = `<tr><td colspan="${5 + displayFields.length}"><div class="empty-state"><div class="empty-state-text">Nincs rögzített ügyfél</div></div></td></tr>`;
          return;
        }

        // Auto-load kanban cols to map status
        if (currentKanbanColumns.length === 0) {
          const creq = await authFetch('/admin/api/kanban_columns');
          const cdat = await creq.json();
          currentKanbanColumns = cdat.columns || [];
        }
        const statusMap = {};
        currentKanbanColumns.forEach(c => { statusMap[c.id] = c.name; });

        tbody.innerHTML = clients.map(c => {
          let customObj = c.custom_data ? JSON.parse(c.custom_data) : {};
          let csatorna = customObj.forras_csatorna || '';
          if (!csatorna) {
            if (customObj.messenger_id) csatorna = "Messenger";
            else csatorna = "Manuális";
          }
          return `
      <tr>
        <td style="text-align: center;"><input type="checkbox" class="client-checkbox" value="${c.id}" onchange="updateBulkDeleteBtn()"></td>
        <td class="td-time">${fmtDt(c.created_at)}</td>
        <td style="font-weight:600; font-size:12px; color:var(--text);">${esc(csatorna)}</td>
        ${displayFields.map((f, i) => {
            let val = customObj[f.id] != null ? customObj[f.id] : '';
            if (f.id === 'beszelgetes_naplo') {
              const safeName = esc(customObj.nev || customObj['név'] || customObj.name || 'Ismeretlen').replace(/'/g, "\'");
              const safeDate = esc(fmtDt(c.created_at));
              return `<td>${val ? `<button onclick="openLogModal('${esc(btoa(encodeURIComponent(val)))}', '${safeName}', '${esc(csatorna)}', '${safeDate}')" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;">Megtekintés</button>` : '<span style="color:var(--text-muted)">—</span>'}</td>`;
            }
            if (f.id === 'nev' || (f.name && f.name.toLowerCase() === 'név')) {
              return `<td><button onclick="openClientDetails({id: ${c.id}, name: '${esc(val)}', email: '${esc(customObj.email || '')}', phone: '${esc(customObj.telefonszam || customObj.phone || customObj.telefon || '')}', address: '${esc(customObj.cim || customObj.address || '')}', birthdate: '${esc(customObj.szuletesi_datum || customObj.szuletesnap || customObj.birthdate || '')}'})" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:4px;cursor:pointer;padding:6px 10px;font-size:12px;font-weight:600;display:inline-block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="Ugrás az ügyfél adatlapjára">${esc(val || '—')}</button></td>`;
            }
            return `<td ${i === 0 ? 'style="font-weight:500"' : ''}>${esc(val || '—')}</td>`;
          }).join('')}
        <td><span class="badge badge-teal">${esc(statusMap[c.status] || c.status)}</span></td>
        <td>
          <button onclick="openClientModal(${c.id}, '${esc(btoa(encodeURIComponent(c.custom_data || '{}')))}')" style="background:transparent;border:none;color:var(--blue);cursor:pointer;font-size:12px;margin-right:8px;">Szerkesztés</button>
          <button onclick="deleteClient(${c.id})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:12px;">Törlés</button>
        </td>
      </tr>
      `;
        }).join('');
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="${4 + displayFields.length}" style="text-align:center;color:var(--red);padding:40px;">Betöltési hiba</td></tr>`;
      }
    }

    function openLogModal(encodedText, name, channel, date) {
      let t = '';
      try { t = decodeURIComponent(atob(encodedText)); } catch (e) { }
      document.getElementById('log-modal-content').value = t;
      if (name) document.getElementById('log-modal-title-name').textContent = name;
      if (channel) document.getElementById('log-modal-channel').textContent = channel;
      if (date) document.getElementById('log-modal-date').textContent = date;
      document.getElementById('log-modal-topic').textContent = 'Beszélgetés napló';
      document.getElementById('log-modal').style.display = 'flex';
    }

    function toggleAllClients(selectAllCheckbox) {
      const checkboxes = document.querySelectorAll('.client-checkbox');
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateBulkDeleteBtn();
    }

    function updateBulkDeleteBtn() {
      const checkedCount = document.querySelectorAll('.client-checkbox:checked').length;
      const btn = document.getElementById('bulk-delete-btn');
      const countSpan = document.getElementById('bulk-delete-count');
      const selectAll = document.getElementById('selectAllClients');
      
      const totalCheckboxes = document.querySelectorAll('.client-checkbox').length;
      if (selectAll && totalCheckboxes > 0) {
          selectAll.checked = (checkedCount === totalCheckboxes);
      }

      if (checkedCount > 0) {
        btn.style.display = 'inline-flex';
        countSpan.textContent = checkedCount;
      } else {
        btn.style.display = 'none';
        countSpan.textContent = '0';
      }
    }

    async function bulkDeleteClients() {
      const checkedBoxes = document.querySelectorAll('.client-checkbox:checked');
      if (checkedBoxes.length === 0) return;
      
      if (!confirm(`Biztosan törölni szeretnél ${checkedBoxes.length} db ügyfelet? Ez a művelet nem vonható vissza!`)) return;
      
      const clientIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
      
      try {
        const res = await authFetch('/admin/api/clients/bulk_delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ client_ids: clientIds })
        });
        if (!res.ok) throw new Error();
        loadClientsTable();
        loadKanban();
      } catch (err) {
        alert('Hiba történt a törlés során!');
      }
    }

    async function openClientModal(id = null, encodedCustomData = 'e30=') {
      await initClientFields();
      let cData = {};
      try {
        cData = JSON.parse(decodeURIComponent(atob(encodedCustomData)));
      } catch (e) { }
      if (typeof cData === 'string') {
        try { cData = JSON.parse(cData); } catch (e) { }
      }

      document.getElementById('nc-id').value = id || '';

      const dynContainer = document.getElementById('client-modal-dynamic-fields');
      dynContainer.innerHTML = currentClientFields.map(f => {
        const val = cData[f.id] || '';

        if (f.id === 'beszelgetes_naplo') {
          return `<div class="form-group" style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
                    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:8px;font-weight:500">${esc(f.name)}</label>
                    <textarea id="nc-dyn-${f.id}" class="settings-textarea" style="display:none; min-height:260px; font-family: 'Inter', Arial, sans-serif; font-size:12px; line-height:1.5;">${esc(val)}</textarea>
                    ${val ?
              `<button type="button" onclick="document.getElementById('nc-dyn-${f.id}').style.display='block'; this.style.display='none';" style="background:rgba(0,212,200,0.1); border:1px solid var(--accent); color:var(--accent); border-radius:8px; padding:10px 14px; font-size:12px; font-weight:600; cursor:pointer; width:100%; transition:all 0.2s;"> Beszélgetések megtekintése</button>`
              : `<div style="font-size:11px; color:var(--text-muted); padding:6px 0;">Még nincs előzmény...</div><textarea id="nc-dyn-${f.id}" style="display:none"></textarea>`
            }
                  </div>`;
        }

        return `<div class="form-group">
                <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:500">${esc(f.name)}</label>
                <input id="nc-dyn-${f.id}" class="form-input" placeholder="${esc(f.name)}" value="${esc(val)}">
              </div>`;
      }).join('');

      document.getElementById('client-modal-title').innerText = id ? 'Ügyfél szerkesztése' : 'Új ügyfél';
      document.getElementById('client-modal').style.display = 'flex';
    }

    function closeClientModal() {
      document.getElementById('client-modal').style.display = 'none';
    }

    async function submitClient() {
      const id = document.getElementById('nc-id').value;

      let custom_data = {};
      currentClientFields.forEach(f => {
        const el = document.getElementById('nc-dyn-' + f.id);
        if (el) custom_data[f.id] = el.value.trim();
      });

      try {
        const payload = { custom_data };
        if (id) {
          await authFetch(`/admin/api/clients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          await authFetch('/admin/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        closeClientModal();
        loadKanban();
        loadClientsTable();
      } catch (e) {
        alert('Hiba: ' + e.message);
      }
    }

    // ── CLIENT FIELDS MANAGEMENT ───────────────────────────────────────────────
    function openClientFieldsModal() {
      renderClientFieldsModal();
      document.getElementById('fields-modal').style.display = 'flex';
    }

    function closeClientFieldsModal() {
      document.getElementById('fields-modal').style.display = 'none';
      currentClientFields = [];
      loadClientsTable();
      loadKanban();
    }

    async function renderClientFieldsModal() {
      await initClientFields();
      const list = document.getElementById('fields-list');
      list.innerHTML = currentClientFields.map(f => `
     <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:var(--bg3); border-radius:6px; margin-bottom:8px;">
        <div style="font-weight:500">${esc(f.name)} <small style="color:var(--text-muted);font-weight:normal">(${f.id})</small></div>
        <div style="display:flex; gap:12px;">
            <button onclick="editClientField('${f.id}', '${esc(f.name).replace(/'/g, "\\'")}')" style="background:none;border:none;color:var(--blue);cursor:pointer;" title="Átnevezés"></button>
            <button onclick="deleteClientField('${f.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;" title="Törlés"></button>
        </div>
     </div>
  `).join('');
    }

    async function promptAddClientField() {
      const name = prompt("Új mező megjelenítési neve (pl. Cégnév):");
      if (!name) return;
      const idStr = name.trim().toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
      if (!idStr) { alert("Érvénytelen azonosító"); return; }
      const order_index = currentClientFields.length > 0 ? Math.max(...currentClientFields.map(c => c.order_index)) + 1 : 1;
      const req = { id: idStr, name: name.trim(), order_index: order_index };
      try {
        const res = await authFetch('/admin/api/client_fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        if (!res.ok) { alert("Hiba: Már létezik ilyen mező azonosító vagy belső hiba."); return; }
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function editClientField(id, oldName) {
      const name = prompt("Mező új neve:", oldName);
      if (!name || name.trim() === oldName) return;
      const req = { name: name.trim() };
      try {
        await authFetch(`/admin/api/client_fields/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function deleteClientField(id) {
      if (!confirm("Biztosan törlöd ezt a mezőt? Ezzel nem vesznek el az eddig elmentett adatok az adatbázisból, de az űrlapokból és a táblázatból eltűnik a rovat.")) return;
      try {
        await authFetch(`/admin/api/client_fields/${id}`, { method: 'DELETE' });
        currentClientFields = [];
        renderClientFieldsModal();
      } catch (e) { alert("Hálózati hiba"); }
    }

    async function deleteClient(id) {
      if (!confirm('Biztosan törlöd ezt az ügyfelet?')) return;
      try {
        await authFetch(`/admin/api/clients/${id}`, { method: 'DELETE' });
        loadKanban();
        const clientsPage = document.getElementById('page-clients');
        if (clientsPage && clientsPage.classList.contains('active')) {
          loadClientsTable();
        }
      } catch (e) {
        alert('Törlési hiba: ' + e.message);
      }
    }

    // ── SETTINGS ───────────────────────────────────────────────────────────────
    const BH_DAYS = [
      { key: 'monday', label: 'Hétfő' },
      { key: 'tuesday', label: 'Kedd' },
      { key: 'wednesday', label: 'Szerda' },
      { key: 'thursday', label: 'Csütörtök' },
      { key: 'friday', label: 'Péntek' },
      { key: 'saturday', label: 'Szombat' },
      { key: 'sunday', label: 'Vasárnap' },
    ];


    // ── KNOWLEDGE Q&A HELPERS ──────────────────────────────────────────
    function _makeKnowledgeCard(q, a) {
      const card = document.createElement('div');
      card.style.cssText = 'position:relative;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 40px 14px 16px;';

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.title = 'Törlés';
      removeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:3px 6px;border-radius:4px;transition:all 0.15s;';
      removeBtn.onmouseover = () => { removeBtn.style.background = 'rgba(239,68,68,0.1)'; removeBtn.style.color = '#ef4444'; };
      removeBtn.onmouseout = () => { removeBtn.style.background = 'none'; removeBtn.style.color = 'var(--text-muted)'; };
      removeBtn.onclick = () => card.remove();

      const qLabel = document.createElement('label');
      qLabel.className = 'settings-label';
      qLabel.textContent = 'Kérdés / Téma';
      qLabel.style.cssText = 'margin-bottom:5px;display:block;';

      const qInput = document.createElement('input');
      qInput.className = 'settings-input kq-question';
      qInput.type = 'text';
      qInput.placeholder = 'pl. Mikor van nyitva?';
      qInput.value = q;
      qInput.style.width = '100%';

      const aLabel = document.createElement('label');
      aLabel.className = 'settings-label';
      aLabel.textContent = 'Válasz / Tartalom';
      aLabel.style.cssText = 'margin-top:10px;margin-bottom:5px;display:block;';

      const aArea = document.createElement('textarea');
      aArea.className = 'settings-textarea kq-answer';
      aArea.style.minHeight = '70px';
      aArea.value = a;

      card.appendChild(removeBtn);
      card.appendChild(qLabel);
      card.appendChild(qInput);
      card.appendChild(aLabel);
      card.appendChild(aArea);
      return card;
    }

    function addKnowledgeQA() {
      document.getElementById('knowledge-qa-list').appendChild(_makeKnowledgeCard('', ''));
    }

    function renderKnowledgeQAs(jsonStr) {
      const list = document.getElementById('knowledge-qa-list');
      list.innerHTML = '';
      let pairs = {};
      try { pairs = JSON.parse(jsonStr); } catch (e) { }
      const entries = Object.entries(pairs);
      if (!entries.length) { addKnowledgeQA(); return; }
      entries.forEach(([q, a]) => list.appendChild(_makeKnowledgeCard(q, a)));
    }

    function collectKnowledgeQAs() {
      const result = {};
      document.querySelectorAll('#knowledge-qa-list .kq-question').forEach(input => {
        const q = input.value.trim();
        const a = input.closest('div').querySelector('.kq-answer').value.trim();
        if (q) result[q] = a;
      });
      return JSON.stringify(result, null, 2);
    }

    let _knowledgeOpen = true;
    function toggleKnowledgeAccordion() {
      _knowledgeOpen = !_knowledgeOpen;
      const body = document.getElementById('knowledge-accordion-body');
      const chevron = document.getElementById('knowledge-chevron');
      body.style.maxHeight = _knowledgeOpen ? '2000px' : '0';
      body.style.paddingBottom = _knowledgeOpen ? '18px' : '0';
      if (chevron) chevron.style.transform = _knowledgeOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
    }


    async function loadSettings() {
      try {
        const [settingsRes, spRes, wfRes] = await Promise.all([
          authFetch('/admin/api/settings'),
          authFetch('/admin/api/system-prompt'),
          authFetch('/admin/api/workflow'),
        ]);
        const data = await settingsRes.json();
        await loadCartesiaVoices(data.voice_id);
        renderBhTable(data.business_hours || {});
        renderKnowledgeQAs(data.knowledge_content || '{}');
        document.getElementById('setting-greeting').value = data.greeting || '';
        const toneEl = document.getElementById('setting-tone');
        toneEl.value = data.tone || 'professional_friendly';
        document.getElementById('setting-tone-custom').value = data.tone_custom || '';
        onToneChange();

        const sp = await spRes.json();
        document.getElementById('setting-system-prompt').value = sp.content || '';

        const wf = await wfRes.json();
        document.getElementById('setting-workflow').value = wf.content || '';
      } catch (e) { console.error('Settings load error:', e); }
    }

    async function loadCartesiaVoices(selectedId) {
      const sel = document.getElementById('setting-voice');
      const status = document.getElementById('voice-load-status');
      sel.innerHTML = '<option value="">Betöltés...</option>';
      status.textContent = '';
      try {
        const res = await authFetch('/admin/api/cartesia/voices');
        const voices = await res.json();
        voices.sort((a, b) => {
          const aHu = (a.language || '').startsWith('hu');
          const bHu = (b.language || '').startsWith('hu');
          if (aHu && !bHu) return -1;
          if (!aHu && bHu) return 1;
          return (a.name || '').localeCompare(b.name || '', 'hu');
        });
        sel.innerHTML = voices.map(v => {
          const lang = v.language ? ` [${v.language}]` : '';
          const s = v.id === selectedId ? ' selected' : '';
          return `<option value="${v.id}"${s}>${v.name}${lang}</option>`;
        }).join('');
        status.textContent = `${voices.length} hang betöltve`;
      } catch (e) {
        sel.innerHTML = '<option value="">Nem sikerült betölteni</option>';
        status.textContent = 'Hiba: ' + e.message;
      }
    }

    function renderBhTable(bh) {
      const tbody = document.getElementById('bh-tbody');
      tbody.innerHTML = BH_DAYS.map(d => {
        const day = bh[d.key] || { open: '09:00', close: '18:00', enabled: false };
        const dis = day.enabled ? '' : ' disabled';
        return `
      <tr>
        <td class="bh-day-label">${d.label}</td>
        <td><input type="time" class="bh-time" id="bh-${d.key}-open"  value="${day.open || ''}"${dis}></td>
        <td><input type="time" class="bh-time" id="bh-${d.key}-close" value="${day.close || ''}"${dis}></td>
        <td>
          <label class="toggle">
            <input type="checkbox" id="bh-${d.key}-enabled"
              ${day.enabled ? 'checked' : ''}
              onchange="onBhToggle('${d.key}')">
            <span class="toggle-slider"></span>
          </label>
        </td>
      </tr>`;
      }).join('');
    }

    function onBhToggle(dayKey) {
      const enabled = document.getElementById(`bh-${dayKey}-enabled`).checked;
      document.getElementById(`bh-${dayKey}-open`).disabled = !enabled;
      document.getElementById(`bh-${dayKey}-close`).disabled = !enabled;
    }

    function collectBhData() {
      const result = {};
      BH_DAYS.forEach(d => {
        const enabled = document.getElementById(`bh-${d.key}-enabled`).checked;
        result[d.key] = {
          open: document.getElementById(`bh-${d.key}-open`).value || null,
          close: document.getElementById(`bh-${d.key}-close`).value || null,
          enabled,
        };
      });
      return result;
    }

    function switchKnowledgeFormat(fmt) {
      if (fmt === currentKnowledgeFormat) return;
      if (!confirm(`Formátum váltás → ${fmt.toUpperCase()}?\nA jelenlegi tartalom törlődik — ments el előszőr!`)) return;
      currentKnowledgeFormat = fmt;
      document.getElementById('setting-knowledge').value = fmt === 'json' ? '{}' : '';
      updateFmtButtons();
    }

    function updateFmtButtons() {
      document.getElementById('fmt-json-btn').classList.toggle('active', currentKnowledgeFormat === 'json');
      document.getElementById('fmt-md-btn').classList.toggle('active', currentKnowledgeFormat === 'md');
      document.getElementById('fmt-hint').textContent = currentKnowledgeFormat === 'json'
        ? 'Struktúrált JSON formátum — kulcs: érték párok'
        : 'Markdown formátum — ## fejlécekkel, sima szöveg';
      document.getElementById('setting-knowledge').style.fontFamily =
        currentKnowledgeFormat === 'json' ? "'Courier New', monospace" : "'Inter', sans-serif";
    }

    function onToneChange() {
      const val = document.getElementById('setting-tone').value;
      document.getElementById('tone-custom-row').style.display = val === 'custom' ? 'block' : 'none';
    }

    async function saveSettings() {
      const btn = document.getElementById('save-settings-btn');
      btn.disabled = true;
      btn.textContent = 'Mentés...';
      try {
        const settingsPayload = {
          voice_id: document.getElementById('setting-voice').value,
          tone: document.getElementById('setting-tone').value,
          tone_custom: document.getElementById('setting-tone-custom').value,
          greeting: document.getElementById('setting-greeting').value,
          knowledge_format: 'json',
          knowledge_content: collectKnowledgeQAs(),
          business_hours: collectBhData(),
        };
        const spContent = document.getElementById('setting-system-prompt').value;
        const wfContent = document.getElementById('setting-workflow').value;

        const [settingsRes, spRes, wfRes] = await Promise.all([
          authFetch('/admin/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsPayload)
          }),
          authFetch('/admin/api/system-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: spContent })
          }),
          authFetch('/admin/api/workflow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: wfContent })
          }),
        ]);

        if (!settingsRes.ok) { const d = await settingsRes.json(); throw new Error(d.detail || 'Beállítások hiba'); }
        if (!spRes.ok) { const d = await spRes.json(); throw new Error(d.detail || 'System prompt hiba'); }
        if (!wfRes.ok) { const d = await wfRes.json(); throw new Error(d.detail || 'Workflow hiba'); }

        document.getElementById('restart-banner').classList.add('visible');
        btn.textContent = ' Minden elmentve';
        setTimeout(() => { btn.disabled = false; btn.innerHTML = '&#128190; Mentés'; }, 2500);
      } catch (e) {
        alert('Hiba a mentés során: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '&#128190; Mentés';
      }
    }



    // ── TOAST ──────────────────────────────────────────────────────────────────
    function showToast(type, message) {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      const icons = { success: '', info: 'ℹ️', error: '' };
      toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 350); }, 3500);
    }

    // ── TUDÁSTÁR ───────────────────────────────────────────────────────────────
    function initTudastar() {
      // Load knowledge base data if available
      try {
        const kb = typeof knowledgeBase !== 'undefined' ? knowledgeBase : null;
        if (kb) {
          if (kb.practice_name) document.getElementById('tt-nev').value = kb.practice_name;
          if (kb.address) document.getElementById('tt-cim').value = kb.address;
          if (kb.practice_description) document.getElementById('tt-bemutatkozas').value = kb.practice_description;
        }
      } catch (e) { /* silently skip */ }
    }

    function switchTudastarTab(tab) {
      const tabs = ['praxis', 'szabalyok'];
      tabs.forEach(t => {
        document.getElementById(`tt-tab-${t}`).classList.toggle('active', t === tab);
        document.getElementById(`tt-content-${t}`).style.display = t === tab ? 'block' : 'none';
      });
    }

    function ttToggleBh(cb, day) {
      const from = document.getElementById(`tt-bh-${day}-from`);
      const to = document.getElementById(`tt-bh-${day}-to`);
      if (from) from.disabled = !cb.checked;
      if (to) to.disabled = !cb.checked;
    }

    function toggleFigyelmeztetoSzoveg() {
      const val = document.getElementById('tt-lemondas-24h').value;
      const wrap = document.getElementById('tt-figyelmezteto-wrap');
      if (wrap) wrap.style.display = val === 'figyelmeztetoSzoveggel' ? 'block' : 'none';
    }

    function triazsChange(sel) {
      const td = sel.closest('tr').querySelector('.triage-email-cell');
      if (!td) return;
      const isSurgos = sel.value === 'Sürgős' || sel.value === 'Kiemelt';
      if (isSurgos && !td.querySelector('input')) {
        td.innerHTML = `<input class="escalation-input" type="email" placeholder="eszkalációs e-mail">`;
      } else if (!isSurgos) {
        td.innerHTML = '';
      }
    }

    // Dynamic rows
    function addDoctorRow() {
      const id = Date.now();
      const list = document.getElementById('tt-orvosok-list');
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-doctor-row';
      row.dataset.id = id;
      row.innerHTML = `
    <input class="tt-input" type="text" placeholder="Név">
    <input class="tt-input" type="text" placeholder="Szakterület">
    <input class="tt-input" type="text" placeholder="Szolgáltatás">
    <button class="tt-remove-btn" onclick="this.closest('[data-id]').remove()"></button>`;
      list.appendChild(row);
    }

    function removeDoctorRow(id) {
      const row = document.querySelector(`[data-id="${id}"]`);
      if (row) row.remove();
    }

    function addSzolgaltatas() {
      const list = document.getElementById('tt-szolgaltatasok-list');
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-service-row';
      row.dataset.svc = '';
      row.innerHTML = `
    <input class="tt-input" type="text" placeholder="Szolgáltatás neve">
    <input class="tt-input" type="text" placeholder="perc">
    <select class="tt-select"><option>Mind</option><option>Dr. Szabó Júlia</option><option>Dr. Kiss Péter</option></select>
    <input class="tt-input" type="text" placeholder="Megjegyzés">
    <button class="tt-remove-btn" onclick="this.closest('[data-svc]').remove()"></button>`;
      list.appendChild(row);
    }

    function addKivetel() {
      const list = document.getElementById('tt-kivetelek-list');
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-exception-row';
      row.dataset.exc = '';
      row.innerHTML = `
    <input class="tt-input" type="text" placeholder="pl. Speciális beavatkozás">
    <button class="tt-remove-btn" onclick="this.closest('[data-exc]').remove()"></button>`;
      list.appendChild(row);
    }

    function addKampany() {
      const list = document.getElementById('tt-kampanyok-list');
      const card = document.createElement('div');
      card.className = 'tt-campaign-card';
      card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <label class="tt-toggle"><input type="checkbox" checked><span class="tt-toggle-slider"></span></label>
      <span style="font-size:12px;font-weight:600;color:#374151;">Kampány aktív</span>
      <button class="tt-remove-btn" style="margin-left:auto;" onclick="this.closest('.tt-campaign-card').remove()"></button>
    </div>
    <textarea class="tt-textarea" style="min-height:60px;" placeholder="Kampány leírása..."></textarea>`;
      list.appendChild(card);
    }

    function addGyik() {
      const list = document.getElementById('tt-gyik-list');
      const card = document.createElement('div');
      card.className = 'tt-campaign-card';
      card.dataset.gyik = '';
      card.innerHTML = `
    <button class="tt-remove-btn" style="position:absolute;top:14px;right:14px;" onclick="this.closest('[data-gyik]').remove()"></button>
    <label class="tt-label">Kérdés</label>
    <input class="tt-input" type="text" placeholder="Kérdés szövege" style="margin-bottom:10px;">
    <label class="tt-label">Válasz</label>
    <textarea class="tt-textarea" style="min-height:60px;" placeholder="Válasz szövege"></textarea>`;
      list.appendChild(card);
    }

    // ── PRAXISINFÓ LOAD & SAVE ───────────────────────────────────────────────────
    const _PI_DAYS = ['hetfo', 'kedd', 'szerda', 'csutortok', 'pentek', 'szombat', 'vasarnap'];

    async function loadPraxisinfo() {
      try {
        const res = await authFetch('/admin/api/praxisinfo');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !Object.keys(data).length) return; // no saved data yet

        const v = (id) => document.getElementById(id);
        if (data.practice_name !== undefined && v('tt-nev')) v('tt-nev').value = data.practice_name;
        if (data.description !== undefined && v('tt-bemutatkozas')) v('tt-bemutatkozas').value = data.description;
        if (data.address !== undefined && v('tt-cim')) v('tt-cim').value = data.address;

        if (data.markanev    !== undefined && v('tt-markanev'))    v('tt-markanev').value    = data.markanev;
        if (data.szakterulet !== undefined && v('tt-szakterulet')) v('tt-szakterulet').value = data.szakterulet;
        if (data.kulcsszavak !== undefined && v('tt-kulcsszavak')) v('tt-kulcsszavak').value = data.kulcsszavak;
        if (data.megkozelites!== undefined && v('tt-megkozelites'))v('tt-megkozelites').value= data.megkozelites;
        
        window.currentPriceList = data.price_list || '';
        window.currentPriceListMeta = data.price_list_file_meta || null;
        
        const priceCard = document.getElementById('price-file-card');
        if (priceCard) {
          if (window.currentPriceListMeta) {
            priceCard.style.display = 'flex';
            document.getElementById('price-file-name').textContent = window.currentPriceListMeta.filename;
            document.getElementById('price-file-date').textContent = 'Utolsó frissítés: ' + window.currentPriceListMeta.uploaded_at;
          } else {
            priceCard.style.display = 'none';
          }
        }



        // Campaigns
        const campList = document.getElementById('tt-kampanyok-list');
        if (campList && data.campaigns && data.campaigns.length) {
          campList.innerHTML = '';
          data.campaigns.forEach(camp => {
            const card = document.createElement('div');
            card.className = 'tt-campaign-card';
            card.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <label class="tt-toggle"><input type="checkbox" ${camp.active ? 'checked' : ''}><span class="tt-toggle-slider"></span></label>
            <span style="font-size:12px;font-weight:600;color:#374151;">Kampány aktív</span>
            <button class="tt-remove-btn" style="margin-left:auto;" onclick="this.closest('.tt-campaign-card').remove()"></button>
          </div>
          <textarea class="tt-textarea" style="min-height:60px;">${esc(camp.text || '')}</textarea>`;
            campList.appendChild(card);
          });
        }

        // Exceptions
        const excList = document.getElementById('tt-kivetelek-list');
        if (excList) {
          excList.innerHTML = '';
          if (data.exceptions && data.exceptions.length) {
            data.exceptions.forEach(exc => {
              const row = document.createElement('div');
              row.className = 'tt-dynamic-row tt-exception-row';
              row.dataset.exc = '';
              row.innerHTML = `
                <input class="tt-input" type="text" value="${esc(exc)}">
                <button class="tt-remove-btn" onclick="this.closest('[data-exc]').remove()"></button>`;
              excList.appendChild(row);
            });
          }
        }

        // GYIK
        const faqList = document.getElementById('tt-faq-list');
        if (faqList) {
          faqList.innerHTML = '';
          if (data.faq && data.faq.length) {
            data.faq.forEach(f => {
              addFaq(f.question, f.answer);
            });
          }
        }

        // Új / Visszatérő páciens szabályok
        if (data.pacient_id_question !== undefined) {
          const pq = document.getElementById('tt-paciens-kerdes');
          if (pq) pq.value = data.pacient_id_question;
        }
        if (data.new_patient_required !== undefined) {
          const npr = document.getElementById('tt-uj-kotelezo');
          if (npr) npr.value = data.new_patient_required;
        }
        if (data.new_patient_auto_visit !== undefined) {
          const npav = document.getElementById('tt-uj-auto-vizit');
          if (npav) npav.checked = data.new_patient_auto_visit;
        }
        if (data.returning_patient_required !== undefined) {
          const rpr = document.getElementById('tt-visszatero-kotelezo');
          if (rpr) rpr.value = data.returning_patient_required;
        }

        // Lemondás és módosítás
        if (data.modositas_eng) {
          const modEng = document.getElementById('tt-modositas-eng');
          if (modEng) modEng.value = data.modositas_eng;
        }
        if (data.lemondas_24h) {
          const lem24 = document.getElementById('tt-lemondas-24h');
          if (lem24) lem24.value = data.lemondas_24h;
        }
        if (data.figyelmezteto_szoveg !== undefined) {
          const figyTxt = document.getElementById('tt-figyelmezteto-szoveg');
          if (figyTxt) figyTxt.value = data.figyelmezteto_szoveg;
        }
        if (typeof toggleFigyelmeztetoSzoveg === 'function') {
          toggleFigyelmeztetoSzoveg();
        }

        // Last updated timestamp
        if (data.last_updated) {
          const metaEl = document.querySelector('#settings-view-praxis .tt-action-meta');
          if (metaEl) {
            const d = new Date(data.last_updated + 'Z');
            const fmt = d.toLocaleString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            metaEl.innerHTML = `<strong>Utolsó frissítés:</strong> ${fmt} &nbsp; <strong>Állapot:</strong> <span class="tt-status-badge">Aktív</span>`;
          }
        }
      } catch (e) { console.error('Praxisinfo betöltési hiba:', e); }
    }

    async function savePraxisinfo(sourceBtn = null, successMsg = null) {
      const btn = sourceBtn || document.querySelector('#settings-view-praxis .tt-save-btn');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Mentés...'; }
      try {
        const v = (id) => document.getElementById(id);
        const practice_name  = (v('tt-nev')          && v('tt-nev').value.trim())          || '';
        const description    = (v('tt-bemutatkozas') && v('tt-bemutatkozas').value.trim()) || '';
        const address        = (v('tt-cim')          && v('tt-cim').value.trim())          || '';
        const markanev       = (v('tt-markanev')     && v('tt-markanev').value.trim())     || '';
        const szakterulet    = (v('tt-szakterulet')  && v('tt-szakterulet').value.trim())  || '';
        const kulcsszavak    = (v('tt-kulcsszavak')  && v('tt-kulcsszavak').value.trim())  || '';
        const megkozelites   = (v('tt-megkozelites') && v('tt-megkozelites').value.trim()) || '';
        
        const price_list = window.currentPriceList || '';
        const price_list_file_meta = window.currentPriceListMeta || null;
        const modositas_eng  = (v('tt-modositas-eng') && v('tt-modositas-eng').value)      || 'igen';
        const lemondas_24h   = (v('tt-lemondas-24h') && v('tt-lemondas-24h').value)        || 'figyelmeztetoSzoveggel';
        const figyelmezteto_szoveg = (v('tt-figyelmezteto-szoveg') && v('tt-figyelmezteto-szoveg').value.trim()) || '';
        
        const pacient_id_question = v('tt-paciens-kerdes') ? v('tt-paciens-kerdes').value.trim() : 'Korábban járt már a rendelőnkben?';
        const new_patient_required = v('tt-uj-kotelezo') ? v('tt-uj-kotelezo').value.trim() : 'Születési dátum, teljes név';
        const new_patient_auto_visit = v('tt-uj-auto-vizit') ? v('tt-uj-auto-vizit').checked : true;
        const returning_patient_required = v('tt-visszatero-kotelezo') ? v('tt-visszatero-kotelezo').value.trim() : 'Páciens azonosító vagy telefonszám';

        // Doctors
        const doctors = [];
        document.querySelectorAll('#tt-orvosok-list .tt-doctor-row[data-id]').forEach(row => {
          const inputs = row.querySelectorAll('input.tt-input');
          if (inputs.length >= 3) doctors.push({ nev: inputs[0].value.trim(), szak: inputs[1].value.trim(), svc: inputs[2].value.trim() });
        });

        // Campaigns
        const campaigns = [];
        document.querySelectorAll('#tt-kampanyok-list .tt-campaign-card').forEach(card => {
          const cb = card.querySelector('input[type="checkbox"]');
          const ta = card.querySelector('textarea');
          campaigns.push({ active: cb ? cb.checked : true, text: ta ? ta.value.trim() : '' });
        });

        // Exceptions
        const exceptions = [];
        document.querySelectorAll('#tt-kivetelek-list .tt-exception-row').forEach(row => {
          const inp = row.querySelector('input');
          if (inp && inp.value.trim()) exceptions.push(inp.value.trim());
        });

        // GYIK
        const faq = [];
        document.querySelectorAll('#tt-faq-list .faq-card').forEach(card => {
          const q = card.querySelector('.faq-question').value.trim();
          const a = card.querySelector('.faq-answer').value.trim();
          if (q || a) faq.push({ question: q, answer: a });
        });

        const res = await authFetch('/admin/api/praxisinfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ practice_name, description, address, markanev, szakterulet, kulcsszavak, megkozelites, price_list, price_list_file_meta, doctors, campaigns, exceptions, faq, modositas_eng, lemondas_24h, figyelmezteto_szoveg, pacient_id_question, new_patient_required, new_patient_auto_visit, returning_patient_required })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Mentési hiba'); }

        if (successMsg) {
          showFancySuccess(successMsg);
        } else {
          showToast('success', '✅ Praxisinformáció elmentve!');
        }
        const metaEl = document.querySelector('#settings-view-praxis .tt-action-meta');
        if (metaEl) {
          const now = new Date();
          const fmt = now.toLocaleString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          metaEl.innerHTML = `<strong>Utolsó frissítés:</strong> ${fmt} &nbsp; <strong>Állapot:</strong> <span class="tt-status-badge">Aktív</span>`;
        }
      } catch (e) {
        showToast('error', '❌ Hiba: ' + e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText || '&#128190; Változtatások mentése'; }
      }
    }

    function addFaq(q = '', a = '') {
      const faqList = document.getElementById('tt-faq-list');
      if (!faqList) return;
      const index = faqList.children.length + 1;
      const card = document.createElement('div');
      card.className = 'faq-card';
      card.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #fff; position: relative;';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="faq-index" style="font-size: 13px; font-weight: 600; color: #4b5563;">Kérdés-válasz #${index}</span>
          <button onclick="this.closest('.faq-card').remove(); updateFaqIndices();" style="background: transparent; border: none; color: #ef4444; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label class="tt-label" style="font-size: 12px;">Kérdés</label>
            <textarea class="tt-textarea faq-question" style="min-height: 80px; background: #f3f4f6; border: 1px solid transparent; padding: 12px;">${esc(q)}</textarea>
          </div>
          <div>
            <label class="tt-label" style="font-size: 12px;">Válasz</label>
            <textarea class="tt-textarea faq-answer" style="min-height: 80px; background: #f3f4f6; border: 1px solid transparent; padding: 12px;">${esc(a)}</textarea>
          </div>
        </div>
      `;
      faqList.appendChild(card);
    }

    function updateFaqIndices() {
      const cards = document.querySelectorAll('#tt-faq-list .faq-card');
      cards.forEach((card, idx) => {
        card.querySelector('.faq-index').textContent = 'Kérdés-válasz #' + (idx + 1);
      });
    }

    async function uploadPriceList(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch('/admin/api/upload_prices', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + authToken },
          body: formData
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Feltöltési hiba');
        
        window.currentPriceList = data.price_list;
        window.currentPriceListMeta = data.price_list_file_meta;
        
        showToast('success', 'Árlista sikeresen feltöltve és feldolgozva!');
        
        const priceCard = document.getElementById('price-file-card');
        if (priceCard) {
          priceCard.style.display = 'flex';
          document.getElementById('price-file-name').textContent = data.price_list_file_meta.filename;
          document.getElementById('price-file-date').textContent = 'Utolsó frissítés: ' + data.price_list_file_meta.uploaded_at;
        }
      } catch (err) {
        showToast('error', 'Hiba: ' + err.message);
      } finally {
        event.target.value = ''; // reset input
      }
    }

    function deletePriceList() {
      if (confirm('Biztosan törölni szeretnéd a jelenlegi árlistát?')) {
        window.currentPriceList = '';
        window.currentPriceListMeta = null;
        
        const priceCard = document.getElementById('price-file-card');
        if (priceCard) priceCard.style.display = 'none';
        
        savePraxisinfo(null, 'Árlista törölve');
      }
    }

    function saveSzabalyok() {
      showToast('info', '🚧 Módosítási kérés rögzítve – hamarosan feldolgozzuk');
    }

  



    // Customer Center JS

    function switchSettingsView(viewId, btn) {
      document.querySelectorAll('.settings-subview').forEach(el => el.style.display = 'none');
      document.querySelectorAll('#page-settings .view-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('settings-view-' + viewId).style.display = 'block';
      if (btn) btn.classList.add('active');
      if (viewId === 'praxis') loadPraxisinfo();
    }

    function switchCustomerView(viewId, btn) {
      document.querySelectorAll('.customer-view').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.view-btn').forEach(el => {
        el.classList.remove('active');
      });

      document.getElementById('view-' + viewId).style.display = 'block';

      if (btn) {
        btn.classList.add('active');
      }

      // Load data dynamically
      if (viewId === 'kanban') loadKanban();
      if (viewId === 'clients') loadClientsTable();
      if (viewId === 'interactions') loadInteractions();
      if (viewId === 'emails') loadEmails();
      if (viewId === 'sessions') loadSessions();
    }

        let lastActiveCustomerView = 'clients';

    
    async function viewFullLogForClient() {
      const cData = window.currentClientDataForLog;
      if (!cData) return alert('Nincs kiválasztva ügyfél.');
      
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const client = data.clients.find(c => 
          (cData.id && c.id == cData.id) || 
          (cData.email && c.custom_data && c.custom_data.includes(cData.email)) ||
          (cData.name && c.name && c.name.toLowerCase() === cData.name.toLowerCase())
        );
        if (client && client.custom_data) {
          let customObj = typeof client.custom_data === 'string' ? JSON.parse(client.custom_data) : client.custom_data;
          let log = customObj.beszelgetes_naplo || 'Nincs rögzített beszélgetés napló ehhez az ügyfélhez.';
          openLogModal(btoa(encodeURIComponent(log)), cData.name, 'Rendszer', '');
        } else {
          alert('Nem található részletes napló.');
        }
      } catch (e) {
        console.error(e);
        alert('Hiba a napló lekérésekor.');
      }
    }

    function openClientDetails(clientData) {
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
        const emailEl = document.getElementById('cd-email');
        emailEl.innerText = clientData.email || '';
        emailEl.parentElement.style.display = clientData.email ? 'flex' : 'none';

        const phoneEl = document.getElementById('cd-phone');
        phoneEl.innerText = clientData.phone || '';
        phoneEl.parentElement.style.display = clientData.phone ? 'flex' : 'none';

        // Optional real data fields
        document.getElementById('cd-id').innerText = clientData.id ? `Azonosító: ${clientData.id}` : `Páciens azonosító: PAC-${Math.floor(100000 + Math.random() * 900000)}`;

        const addressEl = document.getElementById('cd-address');
        addressEl.innerText = clientData.address || '';
        addressEl.parentElement.style.display = clientData.address ? 'flex' : 'none';

        const birthdateEl = document.getElementById('cd-birthdate');
        birthdateEl.innerText = clientData.birthdate ? `Születési dátum: ${clientData.birthdate}` : '';
        birthdateEl.parentElement.style.display = clientData.birthdate ? 'flex' : 'none';

        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '. ');
        document.getElementById('cd-last-visit').innerText = dateStr + '.';
        document.getElementById('cd-total-interactions').innerText = Math.floor(Math.random() * 20 + 1) + ' összesen interakció';

        // Render real history matching the design table
        document.getElementById('cd-history-body').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;"><div class="spinner"></div>Betöltés...</td></tr>`;

        authFetch('/admin/api/sessions/summary?limit=500')
          .then(res => res.json())
          .then(data => {
            const sessions = data.sessions || [];
            let clientInteractions = [];
            sessions.forEach(s => {
              const cName = (s.participant || s.client_name || '').toLowerCase();
              const isMatch = (clientData.name && cName === clientData.name.toLowerCase()) ||
                (clientData.email && s.session_id.toLowerCase().includes(clientData.email.toLowerCase()));
              if (isMatch) {
                (s.interactions || []).forEach(r => {
                  clientInteractions.push({
                    date: r.created_at || s.started_at,
                    channel: s.room_name && s.room_name.includes('Email') ? 'Email' : 'Telefon',
                    type: r.type || '-',
                    topic: r.topic || '-',
                    summary: r.summary || '-',
                    result: r.result || '',
                    alert_tags: r.alert_tags || []
                  });
                });
              }
            });

            clientInteractions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            document.getElementById('cd-total-interactions').innerText = clientInteractions.length + ' összesen interakció';

            if (clientInteractions.length === 0) {
              document.getElementById('cd-history-body').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Nincs rögzített interakció</td></tr>`;
              return;
            }

            document.getElementById('cd-history-body').innerHTML = clientInteractions.map(r => {
              let dStr = '-';
              let tStr = '-';
              if (r.date) {
                const pt = r.date.replace('T', ' ').split(' ');
                dStr = pt[0].replace(/-/g, '. ') + '.';
                tStr = pt[1] ? pt[1].substring(0, 5) : '';
              }
              const isUrgent = (r.alert_tags && r.alert_tags.includes('urgent')) || (r.type === 'voice_alert' && (r.result || '').includes('urgent'));
              let alertBadge = isUrgent ? '<div onclick="viewFullLogForClient()" style="display:inline-block;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:4px;box-shadow:0 1px 2px rgba(239,68,68,0.4);cursor:pointer;" title="Kattints az e-mail megtekintéséhez!">🚨 SÜRGŐS</div><br>' : '';

              return `
                <tr ${isUrgent ? 'style="background-color:rgba(239, 68, 68, 0.05);"' : ''}>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${dStr}<br><span style="color:var(--text-muted);font-size:11px;">${tStr}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${esc(r.channel)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;">${alertBadge}${typeChip(r.type)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><span class="badge" style="background:var(--bg3);color:var(--text);">${esc(r.topic)}</span></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px; color:var(--text);">${esc(r.summary)}</td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><button onclick="viewFullLogForClient()" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;">Megtekintés</button></td>
                  <td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;">${resultBadge(r.result)}</td>
                </tr>
               `;
            }).join('');
          })
          .catch(err => {
            document.getElementById('cd-history-body').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--red);">Hiba a betöltés során</td></tr>`;
          });
      }
    }

    function closeClientDetails() {
      document.getElementById('view-client-details').style.display = 'none';

      // Show view switcher
      const switcher = document.querySelector('.view-switcher-container');
      if (switcher) switcher.style.display = 'flex';

      // Restore last active view
      switchCustomerView(lastActiveCustomerView);
    }

    document.addEventListener('click', function (e) {
      // Kanban card click
      const card = e.target.closest('.kanban-card');
      // Interactions flat body click
      const interactionTr = e.target.closest('#interactions-flat-body tr');

      // Skip if we clicked a button/link inside the card or row
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-delete')) return;

      if (card) {
        let name = "Ügyfél";
        const nameDiv = card.querySelector('.client-name');
        if (nameDiv) name = nameDiv.innerText;

        let email = '';
        let phone = '';
        const infoDivs = card.querySelectorAll('.client-info');
        infoDivs.forEach(d => {
          if (d.innerText.includes('@')) email = d.innerText.trim();
          else if (d.innerText.trim().length > 0) phone = d.innerText.trim();
        });

        openClientDetails({ name: name, email: email, phone: phone });
      } else if (interactionTr && !interactionTr.querySelector('th')) {
        let name = "Ügyfél";
        // In Interactions table, name is usually in the 3rd column (index 2)
        if (interactionTr.cells && interactionTr.cells[2]) name = interactionTr.cells[2].innerText;
        openClientDetails({ name: name, email: '', phone: '' });
      }
    });

    
    // --- Orvosok CRUD ---
    let globalDoctors = [];
    
    function fetchDoctors() {
      authFetch('/admin/api/doctors')
        .then(res => res.json())
        .then(docs => {
          globalDoctors = docs || [];
          const list = document.getElementById('doctors-list');
          if (!list) return;
          list.innerHTML = '';
          if (docs && docs.length > 0) {
            docs.forEach(doc => list.appendChild(createDoctorRow(doc)));
          } else {
            list.innerHTML = '<tr><td colspan="3" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek orvosok.</td></tr>';
          }
          fetchServices(); // Orvosok letöltése után töltsük le a szolgáltatásokat, mert kell az orvos lista!
        })
        .catch(err => console.error("Hiba az orvosok betöltésekor:", err));
    }

    function createDoctorRow(doc = { id: '', name: '', specialty: '', related_services: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-doctor-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1fr 2fr auto';
      row.style.gap = '16px';
      row.style.alignItems = 'end';
      row.style.background = '#f9fafb';
      row.style.padding = '16px';
      row.style.borderRadius = '8px';
      row.dataset.id = doc.id || '';

      const isNew = !doc.id;
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos neve</label>
          <input class="tt-input doc-name" type="text" placeholder="Orvos neve" value="${esc(doc.name)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szakterület</label>
          <input class="tt-input doc-spec" type="text" placeholder="Szakterület" value="${esc(doc.specialty)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Kapcsolódó szolgáltatás</label>
          <input class="tt-input doc-svc" type="text" placeholder="Kapcsolódó szolgáltatás" value="${esc(doc.related_services || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 38px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-doctor-row').remove(); } else { deleteDoctor(${doc.id}, this.closest('.tt-doctor-row')); }"></button>
        </div>
      `;
      return row;
    }

    function addDoctorUiRow() {
      const list = document.getElementById('doctors-list');
      if (list.querySelector('td[colspan]')) list.innerHTML = '';
      const newRow = createDoctorRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    function editDoctorRow(btn) {
      const tr = btn.closest('tr');
      const inputs = tr.querySelectorAll('input');
      inputs.forEach(inp => {
        inp.readOnly = false;
        inp.style.borderColor = '#e5e7eb';
        inp.style.background = '#fff';
      });
      const td = tr.cells[2];
      td.innerHTML = `
        <button onclick="saveDoctorRow(this)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
        <button onclick="fetchDoctors()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
      `;
    }

    async function saveAllDoctors() {
      const rows = document.querySelectorAll('#doctors-list .tt-doctor-row');
      const promises = [];
      
      for (let row of rows) {
        const docId = row.dataset.id;
        const name = row.querySelector('.doc-name').value.trim();
        const specialty = row.querySelector('.doc-spec').value.trim();
        const related_services = row.querySelector('.doc-svc').value.trim();

        if (!name && !specialty && !related_services) continue; // Skip completely empty rows
        if (!name) {
          showToast('error', 'Minden orvosnál kötelező megadni a nevet!');
          return;
        }

        const url = docId ? '/admin/api/doctors/' + docId : '/admin/api/doctors';
        const method = docId ? 'PUT' : 'POST';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, specialty, related_services })
          }).then(res => {
            if (!res.ok) throw new Error('Hiba mentéskor');
          })
        );
      }
      
      try {
        if (promises.length > 0) {
          await Promise.all(promises);
          showToast('success', '✅ Minden orvos elmentve!');
        }
        fetchDoctors(); // Refresh from server
      } catch (err) {
        console.error(err);
        showToast('error', 'Hiba történt a mentéskor!');
      }
    }

    function deleteDoctor(docId, rowElement) {
      if (!confirm('Biztosan törlöd ezt az orvost? (A hozzá tartozó szolgáltatásoknál az orvos "Mind" lesz)')) return;
      authFetch('/admin/api/doctors/' + docId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Orvos törölve');
        rowElement.remove(); // Remove immediately without fetching everything
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }

    // --- Szolgáltatások CRUD ---
    function fetchServices() {
      authFetch('/admin/api/services')
        .then(res => res.json())
        .then(svcs => {
          const list = document.getElementById('services-list');
          if (!list) return;
          list.innerHTML = '';
          if (svcs && svcs.length > 0) {
            svcs.forEach(svc => list.appendChild(createServiceRow(svc)));
          } else {
            list.innerHTML = '<tr><td colspan="4" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek szolgáltatások.</td></tr>';
          }
        })
        .catch(err => console.error("Hiba a szolgáltatások betöltésekor:", err));
    }

    function createServiceRow(svc = { id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-service-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '3fr 2fr 3fr 3fr auto';
      row.style.gap = '16px';
      row.style.alignItems = 'end';
      row.style.background = '#f9fafb';
      row.style.padding = '16px';
      row.style.borderRadius = '8px';
      row.dataset.id = svc.id || '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach(d => {
        const sel = (svc.doctor_id === d.id) ? 'selected' : '';
        docOptions += `<option value="${d.id}" ${sel}>${esc(d.name)}</option>`;
      });
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szolgáltatás neve</label>
          <input class="tt-input svc-name" type="text" placeholder="Konzultáció" value="${esc(svc.service_name)}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Időtartam (perc)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input class="tt-input svc-dur" type="number" placeholder="30" value="${svc.duration_minutes}" style="flex: 1;">
            <span style="font-size: 13px; color: #6b7280; padding-right: 8px; margin-bottom: 0;">perc</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos</label>
          <select class="tt-select svc-doc">
            ${docOptions}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Megjegyzés</label>
          <input class="tt-input svc-note" type="text" placeholder="Megjegyzés" value="${esc(svc.note || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 38px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-service-row').remove(); } else { deleteService(${svc.id}, this.closest('.tt-service-row')); }"></button>
        </div>
      `;
      return row;
    }

    function addServiceUiRow() {
      const list = document.getElementById('services-list');
      if (list.querySelector('td[colspan]')) list.innerHTML = '';
      const newRow = createServiceRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    async function saveAllServices() {
      const rows = document.querySelectorAll('#services-list .tt-service-row');
      const promises = [];
      
      for (let row of rows) {
        const srvId = row.dataset.id;
        const service_name = row.querySelector('.svc-name').value.trim();
        const duration_minutes = parseInt(row.querySelector('.svc-dur').value) || 30;
        const docVal = row.querySelector('.svc-doc').value;
        const doctor_id = docVal ? parseInt(docVal) : null;
        const note = row.querySelector('.svc-note').value.trim();

        if (!service_name) continue;

        const url = srvId ? '/admin/api/services/' + srvId : '/admin/api/services';
        const method = srvId ? 'PUT' : 'POST';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_name, duration_minutes, doctor_id, note })
          }).then(res => {
            if (!res.ok) throw new Error('Hiba mentéskor');
          })
        );
      }
      
      try {
        if (promises.length > 0) {
          await Promise.all(promises);
          showToast('success', '✅ Szolgáltatások elmentve!');
        }
        fetchServices();
      } catch (err) {
        console.error(err);
        showToast('error', 'Hiba történt a szolgáltatások mentésekor!');
      }
    }

    function deleteService(srvId, rowElement) {
      if (!confirm('Biztosan törlöd ezt a szolgáltatást?')) return;
      authFetch('/admin/api/services/' + srvId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Szolgáltatás törölve');
        rowElement.remove();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }


    // --- Triázs Szabályok Logika ---
    function fetchTriageRules() {
      authFetch('/admin/api/triage_rules')
        .then(res => res.json())
        .then(rules => {
          const list = document.getElementById('triage-rules-list');
          if (!list) return;
          list.innerHTML = '';
          if (rules && rules.length > 0) {
            rules.forEach(rule => {
              list.appendChild(createTriageRuleRow(rule));
            });
          } else {
            list.innerHTML = '<tr><td colspan="4" style="font-size:13px; color:#9ca3af; padding:20px; text-align:center;">Nincsenek még triázs szabályok.</td></tr>';
          }
        })
        .catch(err => console.error("Hiba a triázs szabályok betöltésekor:", err));
    }

    function createTriageRuleRow(rule = { id: '', situation: '', priority: 'Normál', escalation_email: '' }) {
      const tr = document.createElement('tr');
      tr.className = 'triage-row';
      tr.style.borderBottom = '1px solid #f3f4f6';
      tr.dataset.id = rule.id || '';

      const isSurgosOrKiemelt = rule.priority === 'Sürgős' || rule.priority === 'Kiemelt';

      tr.innerHTML = `
        <td style="padding: 16px;">
          <input class="tt-input triage-situation" type="text" placeholder="Helyzet (pl. Erős fájdalom)" value="${rule.situation || ''}" 
                 style="margin:0; border:none; background:transparent; width:100%; box-shadow:none; padding:0; color: #4b5563; font-size: 13px; outline: none;" />
        </td>
        <td style="padding: 16px;">
          <select class="tt-select triage-priority" onchange="toggleTriageEmail(this);" 
                  style="margin:0; border:none; background:#f3f4f6; padding:10px 14px; border-radius:6px; color: #4b5563; font-size: 13px; width:100%; cursor:pointer; outline:none;">
            <option value="Normál" ${rule.priority === 'Normál' ? 'selected' : ''}>Normál – önálló válasz engedélyezett</option>
            <option value="Fontos" ${rule.priority === 'Fontos' ? 'selected' : ''}>Fontos – visszahívás szükséges</option>
            <option value="Sürgős" ${rule.priority === 'Sürgős' ? 'selected' : ''}>Sürgős – azonnali átadás szükséges</option>
            <option value="Kiemelt" ${rule.priority === 'Kiemelt' ? 'selected' : ''}>Kiemelt – vezető értesítése szükséges</option>
          </select>
        </td>
        <td style="padding: 16px;">
          <div class="triage-email-container" style="visibility: ${isSurgosOrKiemelt ? 'visible' : 'hidden'};">
            <input class="tt-input triage-email" type="email" placeholder="Eszkalációs e-mail" value="${rule.escalation_email || ''}" 
                   style="margin:0; border:none; background:#f3f4f6; padding:10px 14px; border-radius:6px; color: #4b5563; font-size: 13px; width:100%; outline:none;" />
          </div>
        </td>
        <td style="padding: 16px; text-align:right;">
          <button class="tt-remove-btn" onclick="deleteTriageRule(this)" style="margin: 0; display:inline-block; vertical-align:middle; opacity:0.5; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5"></button>
        </td>
      `;
      return tr;
    }

    function toggleTriageEmail(selectElem) {
      const row = selectElem.closest('tr');
      const emailContainer = row.querySelector('.triage-email-container');
      const emailInput = row.querySelector('.triage-email');
      
      if (selectElem.value === 'Sürgős' || selectElem.value === 'Kiemelt') {
        emailContainer.style.visibility = 'visible';
      } else {
        emailContainer.style.visibility = 'hidden';
        emailInput.value = '';
      }
    }

    function addTriageRule() {
      const list = document.getElementById('triage-rules-list');
      if (list.innerHTML.includes('Nincsenek')) list.innerHTML = '';
      list.appendChild(createTriageRuleRow());
    }

    async function saveAllTriageRules() {
      const rows = document.querySelectorAll('.triage-row');
      const promises = [];
      let hasError = false;

      for (const row of rows) {
        const ruleId = row.dataset.id;
        const data = {
          situation: row.querySelector('.triage-situation').value.trim(),
          priority: row.querySelector('.triage-priority').value,
          escalation_email: row.querySelector('.triage-email').value.trim()
        };

        if (!data.situation) continue; // Skip empty
        if ((data.priority === 'Sürgős' || data.priority === 'Kiemelt') && !data.escalation_email) {
          showToast('error', 'Kérlek add meg az eszkalációs e-mailt a sürgős/kiemelt szabályokhoz!');
          return;
        }

        const method = ruleId ? 'PUT' : 'POST';
        const url = ruleId ? '/admin/api/triage_rules/' + ruleId : '/admin/api/triage_rules';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(res => res.json()).then(resData => {
            if (resData.ok && !ruleId && resData.id) {
              row.dataset.id = resData.id;
            }
          }).catch(err => {
            hasError = true;
            console.error(err);
          })
        );
      }

      const btn = document.querySelector('button[onclick="saveAllTriageRules()"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Mentés...';
      btn.disabled = true;

      await Promise.all(promises);
      
      btn.disabled = false;
      if (hasError) {
        showToast('error', 'Hiba történt néhány szabály mentésekor!');
        btn.innerHTML = originalText;
      } else {
        showFancySuccess('Szabályok sikeresen elmentve');
        btn.innerHTML = '&#128190; Mentve';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      }
    }

    function showFancySuccess(msg) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; background: rgba(16, 185, 129, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.2); padding: 14px 24px; border-radius: 50px; box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.15);">
          <div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:#10b981; color:#fff; border-radius:50%; font-size:12px;">✓</div>
          <span style="color:#065f46; font-weight:600; font-size:15px;">${msg}</span>
        </div>
      `;
      el.style.position = 'fixed';
      el.style.top = '-100px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.zIndex = '10000';
      el.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      document.body.appendChild(el);
      
      requestAnimationFrame(() => {
        el.style.top = '40px';
      });
      
      setTimeout(() => {
        el.style.top = '-100px';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
      }, 3000);
    }

    function deleteTriageRule(btn) {
      if (!confirm("Biztosan törlöd ezt a triázs szabályt?")) return;
      const row = btn.closest('tr');
      const ruleId = row.dataset.id;
      
      if (!ruleId) {
        row.remove();
        return;
      }

      authFetch('/admin/api/triage_rules/' + ruleId, { method: 'DELETE' })
        .then(res => res.json())
        .then(resData => {
          if (resData.ok) row.remove();
          else alert("Hiba a törlés során.");
        })
        .catch(err => alert("Hiba a hálózatban."));
    }

    // Call fetchTriageRules when the page loads
    document.addEventListener('DOMContentLoaded', () => {
      fetchTriageRules();
      fetchDoctors();
    });

  
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

  

