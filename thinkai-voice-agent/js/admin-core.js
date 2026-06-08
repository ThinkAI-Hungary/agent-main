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
      // Update SVG icon for new sidebar design
      const svgIcon = document.getElementById('theme-icon-svg');
      if (svgIcon) {
        if (isDark) {
          svgIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
        } else {
          svgIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
      }
      // Update flyout theme icon + label
      const flyoutIcon = document.getElementById('flyout-theme-icon');
      if (flyoutIcon) {
        if (isDark) {
          flyoutIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
        } else {
          flyoutIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
      }
      const flyoutLabel = document.getElementById('flyout-theme-label');
      if (flyoutLabel) {
        flyoutLabel.textContent = isDark ? 'Világos mód' : 'Sötét mód';
      }
      if (!icon) return;
      icon.textContent = isDark ? '️' : '';
      label.textContent = isDark ? 'Világos mód' : 'Sötét mód';
    }

    // ── Admin Flyout Popover Logic ─────────────────────────────────────────────
    function toggleAdminFlyout() {
      const flyout = document.getElementById('admin-flyout');
      const trigger = document.getElementById('admin-flyout-trigger');
      const backdrop = document.getElementById('admin-flyout-backdrop');
      if (!flyout) return;
      const isOpen = flyout.classList.contains('show');
      if (isOpen) {
        closeAdminFlyout();
      } else {
        flyout.classList.add('show');
        trigger.classList.add('open');
        backdrop.classList.add('show');
      }
    }

    function closeAdminFlyout() {
      const flyout = document.getElementById('admin-flyout');
      const trigger = document.getElementById('admin-flyout-trigger');
      const backdrop = document.getElementById('admin-flyout-backdrop');
      if (flyout) flyout.classList.remove('show');
      if (trigger) trigger.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
    }

    function flyoutNavigate(viewId) {
      closeAdminFlyout();
      // Route csapat/biztonsag to beallitasok page
      if (viewId === 'csapat' || viewId === 'biztonsag') {
        showPage('beallitasok');
        setTimeout(function() {
          var tabBtn = document.querySelector('#beallitasok-tabbar .beallitasok-tab[onclick*="' + viewId + '"]');
          switchBeallitasokTab(viewId, tabBtn);
        }, 50);
      } else if (typeof showSettingsSubPage === 'function') {
        showSettingsSubPage(viewId);
      } else {
        if (typeof showPage === 'function') showPage('settings');
        setTimeout(function() {
          if (typeof switchSettingsView === 'function') switchSettingsView(viewId, null);
        }, 50);
      }
    }

    // Close flyout on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeAdminFlyout();
    });

    // Apply button state on load
    _updateThemeBtn(document.body.classList.contains('dark'));

    // ── Sidebar Collapse (Ctrl+B) ────────────────────────────────────────────────
    function toggleSidebarCollapse() {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('digidesk_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    }

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    });

    // Restore sidebar state on load
    if (localStorage.getItem('digidesk_sidebar_collapsed') === '1') {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.add('collapsed');
    }

    // ── Beállítások page tab switching ──────────────────────────────────────
    function switchBeallitasokTab(viewId, btn) {
      // Hide all views
      document.querySelectorAll('.beallitasok-view').forEach(function(el) { el.style.display = 'none'; });
      // Deactivate all tabs
      document.querySelectorAll('.beallitasok-tab').forEach(function(el) { el.classList.remove('active'); });
      // Show target view
      var target = document.getElementById('beallitasok-view-' + viewId);
      if (target) target.style.display = 'block';
      // Activate tab
      if (btn) btn.classList.add('active');
      // Load data for specific tabs
      if (viewId === 'csapat' && typeof loadTeamMembersForBeallitasok === 'function') {
        loadTeamMembersForBeallitasok();
      }
    }

    function loadTeamMembersForBeallitasok() {
      // loadUsersTable now renders into both team-members-list AND beallitasok-team-members-list
      if (typeof loadUsersTable === 'function') loadUsersTable();
    }

    function loadProfileData() {
      // Load profile from stored data
      var token = localStorage.getItem('digidesk_token');
      if (!token) return;
      fetch('/api/profile', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(r => r.json())
      .then(data => {
        if (data.fullname) document.getElementById('profil-fullname').value = data.fullname;
        if (data.position) document.getElementById('profil-position').value = data.position;
        if (data.company) document.getElementById('profil-company').value = data.company;
      })
      .catch(() => {
        // Fallback: use sidebar username
        var un = document.getElementById('sidebar-username');
        if (un) document.getElementById('profil-fullname').value = un.textContent;
      });
    }

    function saveProfile() {
      var token = localStorage.getItem('digidesk_token');
      var btn = event.target;
      var origText = btn.textContent;
      btn.textContent = 'Mentés...';
      btn.disabled = true;

      var data = {
        fullname: document.getElementById('profil-fullname').value,
        position: document.getElementById('profil-position').value,
        company: document.getElementById('profil-company').value
      };

      fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
      .then(r => r.json())
      .then(res => {
        btn.textContent = '✓ Mentve!';
        btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
        setTimeout(() => {
          btn.textContent = origText;
          btn.disabled = false;
          btn.style.background = '';
        }, 2000);
        // Update sidebar username if changed
        if (data.fullname) {
          var sidebarName = document.getElementById('sidebar-username');
          if (sidebarName) sidebarName.textContent = data.fullname;
        }
      })
      .catch(() => {
        btn.textContent = '✗ Hiba!';
        btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        setTimeout(() => {
          btn.textContent = origText;
          btn.disabled = false;
          btn.style.background = '';
        }, 2000);
      });
    }

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
        currentUserRole = data.role || 'member';
        currentUserFullName = data.full_name || '';
        localStorage.setItem('thinkai_admin_token', authToken);
        localStorage.setItem('thinkai_admin_user', currentUser);
        localStorage.setItem('thinkai_admin_role', currentUserRole);
        localStorage.setItem('thinkai_admin_fullname', currentUserFullName);
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

    function doLogout(msg = '') {
      authToken = '';
      currentUser = '';
      currentUserRole = '';
      currentUserFullName = '';
      localStorage.removeItem('thinkai_admin_token');
      localStorage.removeItem('thinkai_admin_user');
      localStorage.removeItem('thinkai_admin_role');
      localStorage.removeItem('thinkai_admin_fullname');
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
      // Show all nav items again on logout (except permanently hidden ones like approvals, calls)
      document.querySelectorAll('.nav-item, .nav-sub-item').forEach(el => {
        if (el.id === 'nav-approvals' || el.id === 'nav-calls') return;
        el.style.display = '';
      });
      if (msg) {
        showError(msg);
      } else {
        document.getElementById('login-error').style.display = 'none';
      }
    }

    async function authFetch(url, opts = {}) {
      const res = await fetch(`${API}${url}`, {
        cache: 'no-store',
        ...opts,
        headers: { 'Authorization': `Bearer ${authToken}`, ...opts.headers }
      });
      if (res.status === 401) { 
        doLogout('A munkamenet biztonsági okokból lejárt. Kérjük jelentkezzen be újra.'); 
        throw new Error('Unauthorized'); 
      }
      return res;
    }

    let currentUserRole = localStorage.getItem('thinkai_admin_role') || 'admin';
    let currentUserFullName = localStorage.getItem('thinkai_admin_fullname') || '';

    function enterApp() {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      // Show full name in sidebar if available, otherwise username
      document.getElementById('sidebar-username').textContent = currentUserFullName || currentUser;
      // Generate 2-letter initials (like "BL" for "Balázs Lederer")
      const _avatarName = currentUserFullName || currentUser || 'A';
      const _nameParts = _avatarName.trim().split(/\s+/);
      const _initials = _nameParts.length >= 2
        ? (_nameParts[0][0] + _nameParts[_nameParts.length - 1][0]).toUpperCase()
        : _avatarName.substring(0, 2).toUpperCase();
      document.getElementById('user-avatar-char').textContent = _initials;
      // Update role badge
      const roleEl = document.getElementById('sidebar-userrole');
      if (roleEl) {
        // Show email if available, otherwise role
        const userEmail = localStorage.getItem('thinkai_admin_email') || currentUser || '';
        roleEl.textContent = userEmail.includes('@') ? userEmail : (currentUserRole === 'admin' ? 'Adminisztrátor' : (currentUserRole === 'manager' ? 'Manager' : 'Member'));
      }
      // Show settings button (always visible now)
      const pwBtn = document.getElementById('sidebar-pw-btn');
      if (pwBtn) pwBtn.style.display = '';
      // Update analytics nav label for members
      const analyticsLabel = document.getElementById('nav-analytics-label');
      if (analyticsLabel) analyticsLabel.textContent = (currentUserRole === 'admin' || currentUserRole === 'manager') ? 'Analitika' : 'Irányítópult';
      // Show/hide analytics shells based on role
      const adminShell = document.querySelector('#page-analytics .analytics-shell');
      const memberShell = document.getElementById('member-analytics-shell');
      if (currentUserRole === 'admin' || currentUserRole === 'manager') {
        if (adminShell) adminShell.style.display = '';
        if (memberShell) memberShell.style.display = 'none';
      } else {
        if (adminShell) adminShell.style.display = 'none';
        if (memberShell) memberShell.style.display = '';
      }
      // Greeting bar
      const fullName = currentUserFullName || currentUser || 'Admin';
      const firstName = fullName.split(' ').pop() || fullName;
      document.getElementById('greeting-text').innerHTML = `Szia, <strong>${firstName}</strong>!`;
      const now = new Date();
      const days = ['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'];
      const months = ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
      document.getElementById('greeting-date').textContent = `${now.getFullYear()}. ${months[now.getMonth()]} ${now.getDate()}., ${days[now.getDay()]}`;
      applyRoleRestrictions(currentUserRole);
      // URL-based routing: navigate to the page specified in the URL
      const urlPage = window.location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
      const validPages = ['analytics','interactions','clients','kanban','sessions','emails','calendar','outbound','settings','beallitasok','help','calls','approvals'];
      if (urlPage && validPages.includes(urlPage)) {
        showPage(urlPage, true);
      } else {
        loadStats();
        loadClientsTable();
      }
    }

    // Handle browser back/forward navigation
    window.addEventListener('popstate', function(e) {
      if (e.state && e.state.page) {
        showPage(e.state.page, true);
      } else {
        const urlPage = window.location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
        if (urlPage) showPage(urlPage, true);
        else showPage('analytics', true);
      }
    });

    function applyRoleRestrictions(role) {
      const isAdmin = role === 'admin' || role === 'manager';
      const isAdminOnly = role === 'admin';
      // Always hide approvals nav (disabled feature)
      const approvalsNav = document.getElementById('nav-approvals');
      if (approvalsNav) approvalsNav.style.display = 'none';
      // Settings nav
      const settingsNav = document.getElementById('nav-settings');
      if (settingsNav) settingsNav.style.display = isAdmin ? '' : 'none';
      // Kimenő kommunikáció nav — hide for members
      const outboundNav = document.getElementById('nav-outbound');
      if (outboundNav) outboundNav.style.display = isAdmin ? '' : 'none';
      // Client toolbar: hide add, bulk delete, fields, campaign buttons for members
      document.querySelectorAll('#view-clients .int-toolbar-btn').forEach(btn => {
        const text = btn.textContent.trim();
        if (text.includes('Új') || text.includes('mezők') || text.includes('Kampány') || text.includes('törlése')) {
          btn.style.display = isAdmin ? '' : 'none';
        }
      });
      // Flyout: hide admin-only items (Csapat, Biztonság) for non-admin
      document.querySelectorAll('#admin-flyout .flyout-item').forEach(btn => {
        const title = btn.querySelector('.flyout-item-title');
        if (title && (title.textContent === 'Csapat' || title.textContent === 'Biztonság')) {
          btn.style.display = isAdminOnly ? '' : 'none';
        }
      });
      // Hide "Adminisztráció" section label if not admin
      document.querySelectorAll('#admin-flyout .flyout-section-label').forEach(lbl => {
        if (lbl.textContent.trim() === 'Adminisztráció') {
          lbl.style.display = isAdminOnly ? '' : 'none';
        }
      });
      // Also hide first divider for non-admin
      const dividers = document.querySelectorAll('#admin-flyout .flyout-divider');
      if (dividers.length > 0) dividers[0].style.display = isAdminOnly ? '' : 'none';
      // Sidebar password button: show for members (since they can't access Settings > Csapat)
      const pwBtn = document.getElementById('sidebar-pw-btn');
      if (pwBtn) pwBtn.style.display = isAdmin ? 'none' : '';

      // Interakciós lista: kijelölés/törlés csak adminnak [HIDDEN for members — visszaállítható]
      const intSelectAllTh = document.querySelector('#interactions-flat-table thead th:first-child');
      if (intSelectAllTh) intSelectAllTh.style.display = isAdmin ? '' : 'none';
      const intDeleteBtn = document.getElementById('int-delete-selected-btn');
      if (intDeleteBtn && !isAdmin) intDeleteBtn.style.display = 'none';
      // CSS class a body-ra, hogy a dinamikusan renderelt checkbox td-k is elrejtődjenek
      if (!isAdmin) {
        document.body.classList.add('role-member');
      } else {
        document.body.classList.remove('role-member');
      }

      // Ügyféllista: "Kijelöltek törlése" gomb elrejtése member-eknek [HIDDEN — visszaállítható]
      const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
      if (bulkDeleteBtn && !isAdmin) bulkDeleteBtn.style.display = 'none !important';
    }

    // ── Member data filtering ─────────────────────────────────────────────────
    // Loads the set of client names/emails assigned to current member
    let _myAssignedClientNames = null; // Set of lowercase names
    let _myAssignedClientEmails = null; // Set of lowercase emails

    async function loadMyAssignedClients() {
      if (currentUserRole === 'admin' || currentUserRole === 'manager') { _myAssignedClientNames = null; return; }
      if (_myAssignedClientNames !== null) return; // already loaded
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const clients = data.clients || [];
        _myAssignedClientNames = new Set();
        _myAssignedClientEmails = new Set();
        clients.forEach(c => {
          let cd = {};
          try { cd = c.custom_data ? (typeof c.custom_data === 'string' ? JSON.parse(c.custom_data) : c.custom_data) : {}; } catch(e) {}
          if ((cd.felelos || '') === currentUser || (currentUserFullName && (cd.felelos || '') === currentUserFullName)) {
            const name = (cd.nev || cd.name || c.name || '').toLowerCase().trim();
            const email = (cd.email || c.email || '').toLowerCase().trim();
            if (name) _myAssignedClientNames.add(name);
            if (email) _myAssignedClientEmails.add(email);
          }
        });
      } catch(e) {
        _myAssignedClientNames = new Set();
        _myAssignedClientEmails = new Set();
      }
    }

    function isClientAssignedToMe(clientObj) {
      if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;
      let cd = {};
      try { cd = clientObj.custom_data ? (typeof clientObj.custom_data === 'string' ? JSON.parse(clientObj.custom_data) : clientObj.custom_data) : {}; } catch(e) {}
      const felelos = cd.felelos || '';
      return felelos === currentUser || (currentUserFullName && felelos === currentUserFullName);
    }

    function isSessionAssignedToMe(session) {
      if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;
      if (!_myAssignedClientNames || _myAssignedClientNames.size === 0) return false;
      const participant = (session.participant || session.client_name || '').toLowerCase().trim();
      const sid = (session.session_id || '').toLowerCase();
      if (participant && _myAssignedClientNames.has(participant)) return true;
      for (const email of _myAssignedClientEmails) {
        if (email && sid.includes(email)) return true;
      }
      return false;
    }

    function isCalendarEventAssignedToMe(ev) {
      if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;
      if (!_myAssignedClientNames || _myAssignedClientNames.size === 0) return false;
      const attendee = (ev.attendee || '').toLowerCase().trim();
      const attendeeEmail = (ev.attendee_email || '').toLowerCase().trim();
      const title = (ev.title || '').toLowerCase().trim();
      if (attendeeEmail && _myAssignedClientEmails.has(attendeeEmail)) return true;
      if (attendee && _myAssignedClientNames.has(attendee)) return true;
      for (const name of _myAssignedClientNames) {
        if (name && title.includes(name)) return true;
      }
      return false;
    }

    function isApprovalAssignedToMe(c) {
      if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;
      if (!_myAssignedClientNames || _myAssignedClientNames.size === 0) return false;
      let draftData = {};
      try { draftData = JSON.parse(c.ai_draft_response || '{}'); } catch(e) {}
      // 1. Campaigns → always show
      if (draftData.campaign_name || (c.topic && c.topic.startsWith('Kampány:'))) return true;
      // 2. to_name match
      const toName = (draftData.to_name || '').toLowerCase().trim();
      if (toName && _myAssignedClientNames.has(toName)) return true;
      // 3. to_email match
      const toEmail = (draftData.to_email || '').toLowerCase().trim();
      if (toEmail && _myAssignedClientEmails && _myAssignedClientEmails.has(toEmail)) return true;
      // 4. session_id email pattern
      const sid = (c.session_id || '').toLowerCase();
      if (sid && _myAssignedClientEmails) {
        for (const email of _myAssignedClientEmails) {
          if (email && sid.includes(email)) return true;
        }
      }
      // 5. sender_id → kanban resolve
      const senderId = draftData.sender_id || '';
      if (senderId && window.kanbanData) {
        const matched = window.kanbanData.find(cl => {
          let cd = cl.custom_data;
          if (typeof cd === 'string') try { cd = JSON.parse(cd); } catch(e) { cd = {}; }
          const mid = (cd?.messenger_id || '').toString().trim();
          return mid && mid === senderId;
        });
        if (matched && isClientAssignedToMe(matched)) return true;
      }
      // 6. topic name match
      const topic = (c.topic || '').toLowerCase();
      if (topic) {
        for (const name of _myAssignedClientNames) {
          if (name && topic.includes(name)) return true;
        }
      }
      return false;
    }

    // ── Page navigation ───────────────────────────────────────────────────────────
    function toggleNavGroup(btn) {
      btn.classList.toggle('open');
      const submenu = btn.nextElementSibling;
      if (submenu) submenu.classList.toggle('open');
    }

    function showPage(page, skipPushState) {
      // Role restriction: members cannot access settings (Tudástár)
      if (page === 'settings' && currentUserRole !== 'admin' && currentUserRole !== 'manager') {
        return;
      }
      // Update URL to reflect current page
      if (!skipPushState) {
        const url = '/admin/' + page;
        if (window.location.pathname !== url) {
          history.pushState({ page: page }, '', url);
        }
      }
      if (page === 'approvals') loadApprovals();
      if (page === 'outbound') loadCampaigns();
      const customerViews = ['kanban', 'clients', 'interactions', 'sessions', 'emails'];
      const isCustomerView = customerViews.includes(page);
      const actualPage = isCustomerView ? 'interactions' : page;

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.nav-sub-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.nav-group-toggle').forEach(n => n.classList.remove('active'));
      
      // Greeting bar only on analytics, and only for admin (members have it integrated in dashboard)
      const greetBar = document.getElementById('greeting-bar');
      if (greetBar) greetBar.style.display = (page === 'analytics' && (currentUserRole === 'admin' || currentUserRole === 'manager')) ? '' : 'none';

      const pg = document.getElementById(`page-${actualPage}`);
      if (pg) pg.classList.add('active');
      
      if (isCustomerView) {
        const subNav = document.getElementById(`nav-sub-${page}`);
        if (subNav) subNav.classList.add('active');
        const groupToggle = document.getElementById('nav-interactions-group');
        const submenu = document.getElementById('nav-submenu-interactions');
        if (groupToggle && !groupToggle.classList.contains('open')) groupToggle.classList.add('open');
        if (submenu && !submenu.classList.contains('open')) submenu.classList.add('open');
        if (groupToggle) groupToggle.classList.add('active');
        const btn = document.querySelector(`[onclick*="switchCustomerView('${page}'"]`);
        if (typeof switchCustomerView === 'function') switchCustomerView(page, btn);
      } else if (page === 'settings') {
        // Highlight the settings nav-group toggle
        const settingsToggle = document.getElementById('nav-settings');
        if (settingsToggle) settingsToggle.classList.add('active');
        // Open settings submenu
        const settingsSubmenu = document.getElementById('nav-submenu-settings');
        if (settingsToggle && !settingsToggle.classList.contains('open')) settingsToggle.classList.add('open');
        if (settingsSubmenu && !settingsSubmenu.classList.contains('open')) settingsSubmenu.classList.add('open');
        loadSettings(); loadPraxisinfo(); if (typeof fetchTriageRules === 'function') fetchTriageRules();
        fetchDoctors();
      } else if (page === 'beallitasok') {
        // Hide Csapat tab for non-admin users
        var csapatTab = document.getElementById('beallitasok-tab-csapat');
        if (csapatTab) csapatTab.style.display = (currentUserRole === 'admin') ? '' : 'none';
        // Load team members only for admins (not managers — they can't manage users)
        if (currentUserRole === 'admin' && typeof loadTeamMembersForBeallitasok === 'function') loadTeamMembersForBeallitasok();
        // Load profile data
        if (typeof loadProfileData === 'function') loadProfileData();
      } else {
        const nav = document.getElementById(`nav-${actualPage}`);
        if (nav) nav.classList.add('active');
        if (page === 'calendar') loadCalendar();
        if (page === 'kanban') loadKanban();
        if (page === 'clients') loadClientsTable();
        if (page === 'tudastar') initTudastar();
        if (page === 'help') initHelp();
      }
    }

    // ── Settings sub-page navigation (from sidebar sub-items) ─────────────────
    function toggleSettingsNav(btn) {
      const submenu = document.getElementById('nav-submenu-settings');
      const isOpen = btn.classList.contains('open');
      if (isOpen) {
        // Just collapse the submenu
        btn.classList.remove('open');
        if (submenu) submenu.classList.remove('open');
      } else {
        // Open submenu and navigate to settings
        btn.classList.add('open');
        if (submenu) submenu.classList.add('open');
        showPage('settings');
      }
    }

    function showSettingsSubPage(viewId) {
      // Navigate to settings page
      showPage('settings');
      // Clear settings sub-item active states & activate correct one
      document.querySelectorAll('#nav-submenu-settings .nav-sub-item').forEach(n => n.classList.remove('active'));
      const subItem = document.getElementById('nav-sub-settings-' + viewId);
      if (subItem) subItem.classList.add('active');
      // Switch to the correct settings tab
      setTimeout(function() {
        if (typeof switchSettingsView === 'function') switchSettingsView(viewId, null);
      }, 30);
    }

    // ── Help page FAQ ────────────────────────────────────────────────────────────
    let _helpInited = false;
    function initHelp() {
      if (_helpInited) return;
      _helpInited = true;
      const faqs = [
        { q: 'Hogyan tekintem át az interakciókat?', a: 'Az <b>Analitika</b> oldalon KPI kártyákon látod az összesített statisztikákat: összes megkeresés, foglalási arány, átadási arány. A <b>Működési áttekintés</b> blokkban heti trendeket, csatornamegoszlást és napi bontást találsz.' },
        { q: 'Hogyan kezelem az ügyfeleket a Kanban táblán?', a: 'Az <b>Ügyfélközpont → Érdeklődőkezelés</b> menüben drag-and-drop módszerrel húzhatod az ügyfeleket az oszlopok között. Új oszlopot a <b>+ Oszlop hozzáadása</b> gombbal tudsz létrehozni.' },
        { q: 'Mi az a Jóváhagyó rendszer?', a: 'A rendszer automatikusan feldolgozza a bejövő emaileket, és AI-alapú válasz javaslatot készít. Te csak <b>jóváhagyod</b> vagy <b>elutasítod</b> a javasolt választ, ezzel időt spórolva.' },
        { q: 'Hogyan indítok email kampányt?', a: 'A <b>Kimenő kommunikáció</b> menüben kattints az <b>Új kampány</b> gombra. Add meg a kampány nevét, válaszd ki a célcsoportot, írd meg a sablont, és ütemezd a küldést.' },
        { q: 'Hogyan adok hozzá új csapattagot?', a: 'A <b>Beállítások → Csapat</b> fülön kattints a <b>+ Új tag hozzáadása</b> gombra. Add meg a nevet, email címet, jelszót és válaszd ki a szerepkört (admin/member).' },
        { q: 'Hogyan működik a naptár?', a: 'A <b>Naptár</b> menüben látod az összes foglalást vizuálisan. Használd a heti/napi nézetet, és kattints egy időpontra a részletek megtekintéséhez.' },
        { q: 'Hogyan váltok világos és sötét mód között?', a: 'A sidebar alján található <b>Sötét mód / Világos mód</b> gombbal tudsz váltani. A beállítás megmarad a következő bejelentkezésig.' },
        { q: 'Hogyan csukhatom össze a sidebárt?', a: 'Nyomd meg a <b>Ctrl+B</b> billentyűkombinációt, vagy vidd a kurzort a sidebar jobb széléhez és kattints a megjelenő nyíl gombra.' },
      ];
      const container = document.getElementById('help-faq-list');
      if (!container) return;
      container.innerHTML = faqs.map((f, i) => `
        <div class="help-faq-item" style="border-bottom:1px solid var(--border);border-radius:10px;margin-bottom:2px;transition:background 0.2s;" onmouseover="this.style.background='rgba(28,238,224,0.04)'" onmouseout="this.style.background='transparent'">
          <button onclick="toggleFaq(this)"
            style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:14px 16px;border:none;background:none;cursor:pointer;text-align:left;font-size:13px;font-weight:500;color:var(--text);font-family:inherit;border-radius:10px;">
            <span>${f.q}</span>
            <svg class="faq-chevron" fill="none" stroke="var(--text-muted)" stroke-width="2" viewBox="0 0 24 24" width="16" height="16" style="flex-shrink:0;transition:transform 0.25s;"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="faq-answer" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease;">
            <div style="padding:0 16px 14px;font-size:13px;color:var(--text-muted);line-height:1.6;">${f.a}</div>
          </div>
        </div>
      `).join('');
    }

    function toggleFaq(btn) {
      const item = btn.closest('.help-faq-item');
      const answer = item.querySelector('.faq-answer');
      const chevron = btn.querySelector('.faq-chevron');
      const isOpen = answer.style.maxHeight && answer.style.maxHeight !== '0px';

      // Close all other FAQs
      document.querySelectorAll('.help-faq-item').forEach(other => {
        if (other !== item) {
          const otherAnswer = other.querySelector('.faq-answer');
          const otherChevron = other.querySelector('.faq-chevron');
          otherAnswer.style.maxHeight = '0px';
          if (otherChevron) otherChevron.style.transform = 'rotate(0deg)';
          other.style.background = 'transparent';
        }
      });

      // Toggle current
      if (isOpen) {
        answer.style.maxHeight = '0px';
        chevron.style.transform = 'rotate(0deg)';
      } else {
        answer.style.maxHeight = answer.scrollHeight + 'px';
        chevron.style.transform = 'rotate(180deg)';
        item.style.background = 'rgba(28,238,224,0.04)';
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
          body: JSON.stringify({ phone_number: phone, note, script: note })
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
