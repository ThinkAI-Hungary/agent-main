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

    // ── Címkerendszer beállítások kezelése ──
    function loadTagSettings() {
      const saved = localStorage.getItem('thinkai_inactivity_days');
      const days = saved ? parseInt(saved) : 60;
      window._inactivityDays = days;
      const input = document.getElementById('tt-inactivity-days');
      if (input) input.value = days;
      
      // Render predefined tags list in settings
      const container = document.getElementById('tt-predefined-tags-list');
      if (container && typeof PREDEFINED_TAGS !== 'undefined') {
        container.innerHTML = PREDEFINED_TAGS.map(t => 
          `<span style="background:${t.bg};color:${t.color};font-size:12px;padding:4px 10px;border-radius:12px;font-weight:600;">${t.name}</span>`
        ).join('');
      }
    }

    function saveTagSettings(isAutoSave) {
      const input = document.getElementById('tt-inactivity-days');
      if (!input) return;
      const val = parseInt(input.value) || 60;
      localStorage.setItem('thinkai_inactivity_days', val);
      window._inactivityDays = val;
      if (isAutoSave && typeof showAutoSaveToast === 'function') {
        showAutoSaveToast('Címkerendszer mentve!');
      } else {
        showToast('success', `Inaktivitási küszöb elmentve: ${val} nap`);
      }
    }

    // ── Eseményvezérelt automatizációk kezelése ──
    const TRIGGER_LABELS = {
      'no_show': { label: 'No-show utáni üzenet', desc: 'Automatikus email küldése, ha az ügyfélnél no-show címke van', icon: '🚫' },
      'inactive_client': { label: 'Inaktív ügyfél reaktiválás', desc: 'Automatikus email inaktívvá vált ügyfeleknek', icon: '💤' },
      'follow_up': { label: 'Utánkövetés (elégedettség)', desc: 'Email küldése sikeres időpont után', icon: '⭐' },
      'price_inquiry_follow': { label: 'Ajánlatkövetés', desc: 'Follow-up email árkérdés címkéjű ügyfeleknek foglalás nélkül', icon: '💰' },
      'cancelled_no_rebook': { label: 'Lemondás utáni újrafoglalás', desc: 'Email küldése, ha lemondtak és nem foglaltak újat', icon: '📅' }
    };
    const DELAY_OPTIONS = [
      { value: 0, label: 'Azonnal' },
      { value: 24, label: '24 óra' },
      { value: 48, label: '48 óra' },
      { value: 72, label: '72 óra' },
      { value: 168, label: '7 nap' },
      { value: 720, label: '30 nap' }
    ];

    async function loadOutboundAutomations() {
      try {
        const res = await authFetch('/admin/api/outbound_automations');
        const automations = await res.json();
        const container = document.getElementById('tt-automations-list');
        if (!container) return;
        if (!automations.length) {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;font-size:13px;">Nincs beállított automatizáció. Futtasd az SQL migrációt a Supabase-ben.</div>';
          return;
        }
        container.innerHTML = automations.map(a => {
          const meta = TRIGGER_LABELS[a.trigger_type] || { label: a.name, desc: '', icon: '⚙️' };
          const delayOpts = DELAY_OPTIONS.map(o => 
            `<option value="${o.value}" ${a.delay_hours == o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('');
          return `
          <div class="tt-campaign-card" id="automation-card-${a.id}" style="position:relative;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
              <label class="tt-toggle">
                <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="saveAutomation(${a.id})" id="auto-toggle-${a.id}" />
                <span class="tt-toggle-slider"></span>
              </label>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${meta.icon} ${esc(a.name)}</div>
                <div style="font-size:11px;color:#6b7280;margin-top:2px;">${meta.desc}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;color:#6b7280;">Késleltetés:</span>
                <select class="tt-input" id="auto-delay-${a.id}" onchange="saveAutomation(${a.id})" style="width:auto;min-width:90px;padding:4px 8px;font-size:12px;">
                  ${delayOpts}
                </select>
              </div>
            </div>
            <div style="margin-top:8px;">
              <button class="int-toolbar-btn" onclick="toggleAutoTemplate(${a.id})" style="font-size:11px;padding:4px 10px;gap:4px;">
                ✏️ Sablon szerkesztése
              </button>
              <div id="auto-template-${a.id}" style="display:none;margin-top:10px;">
                <textarea class="tt-textarea" id="auto-msg-${a.id}" style="min-height:100px;font-size:12px;">${esc(a.message_template || '')}</textarea>
                <div style="font-size:10px;color:#9ca3af;margin-top:4px;">Változók: <code>{nev}</code>, <code>{szolgaltatas}</code>, <code>{idopont}</code>, <code>{telephely}</code></div>
                <button class="tt-save-btn" onclick="saveAutomation(${a.id})" style="margin-top:8px;padding:6px 14px;font-size:12px;">💾 Sablon mentése</button>
              </div>
            </div>
          </div>`;
        }).join('');
      } catch(e) {
        console.error('Automation load error:', e);
      }
    }

    function toggleAutoTemplate(id) {
      const el = document.getElementById('auto-template-' + id);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    async function saveAutomation(id) {
      const toggle = document.getElementById('auto-toggle-' + id);
      const delay = document.getElementById('auto-delay-' + id);
      const msg = document.getElementById('auto-msg-' + id);
      const data = {};
      if (toggle) data.enabled = toggle.checked;
      if (delay) data.delay_hours = parseInt(delay.value);
      if (msg) data.message_template = msg.value;
      try {
        const res = await authFetch('/admin/api/outbound_automations/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.ok) showToast('success', 'Automatizáció mentve ✓');
        else showToast('error', 'Hiba történt');
      } catch(e) {
        showToast('error', 'Hiba: ' + e.message);
      }
    }

    // Initialize inactivity days from localStorage on page load
    (function() {
      const saved = localStorage.getItem('thinkai_inactivity_days');
      if (saved) window._inactivityDays = parseInt(saved);
    })();

    // ── Agent settings snapshot (restart-needed detection) ──────────────────────
    function _captureAgentSnapshot() {
      try {
        return JSON.stringify({
          voice:         document.getElementById('setting-voice')?.value || '',
          tone:          document.getElementById('setting-tone')?.value || '',
          tone_custom:   document.getElementById('setting-tone-custom')?.value || '',
          greeting:      document.getElementById('setting-greeting')?.value || '',
          knowledge:     collectKnowledgeQAs(),
          bh:            JSON.stringify(collectBhData()),
          system_prompt: document.getElementById('setting-system-prompt')?.value || '',
          workflow:      document.getElementById('setting-workflow')?.value || '',
        });
      } catch(e) { return null; }
    }

    async function restartAgentServer() {
      const btn = document.getElementById('restart-agent-btn');
      if (!btn) return;
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:13px;height:13px;animation:spin 0.8s linear infinite;"><path stroke-linecap="round" stroke-linejoin="round" d="M23 4v6h-6"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Újraindítás...';
      try {
        const res = await authFetch('/admin/api/agent/restart', { method: 'POST' });
        if (res.ok) {
          const banner = document.getElementById('restart-banner');
          btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:13px;height:13px;"><polyline points="20 6 9 17 4 12"/></svg> Újraindítva!';
          btn.style.background = 'rgba(34,197,94,0.25)';
          btn.style.borderColor = 'rgba(34,197,94,0.5)';
          btn.style.color = '#16a34a';
          // Banner egészét zöldre váltjuk
          if (banner) {
            banner.style.background = 'rgba(34,197,94,0.10)';
            banner.style.borderColor = 'rgba(34,197,94,0.4)';
            banner.style.color = '#16a34a';
          }
          setTimeout(() => {
            if (banner) {
              banner.classList.remove('visible');
              banner.style.background = '';
              banner.style.borderColor = '';
              banner.style.color = '';
            }
            window._agentSettingsSnapshot = _captureAgentSnapshot();
            btn.disabled = false;
            btn.innerHTML = origHtml;
            btn.style.background = 'rgba(220,38,38,0.12)';
            btn.style.borderColor = 'rgba(220,38,38,0.4)';
            btn.style.color = '#dc2626';
          }, 2500);

        } else {
          const d = await res.json().catch(() => ({}));
          btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:13px;height:13px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hiba!';
          btn.style.background = 'rgba(239,68,68,0.3)';
          btn.style.borderColor = 'rgba(239,68,68,0.4)';
          setTimeout(() => { btn.disabled = false; btn.innerHTML = origHtml; btn.style.background = 'rgba(255,255,255,0.18)'; btn.style.borderColor = 'rgba(255,255,255,0.4)'; }, 3000);
          showToast('error', d.detail || 'Nem sikerült az újraindítás. Indítsd el manuálisan: python server.py');
        }
      } catch(e) {
        btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:13px;height:13px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hiba!';
        btn.style.background = 'rgba(239,68,68,0.3)';
        btn.style.borderColor = 'rgba(239,68,68,0.4)';
        setTimeout(() => { btn.disabled = false; btn.innerHTML = origHtml; btn.style.background = 'rgba(255,255,255,0.18)'; btn.style.borderColor = 'rgba(255,255,255,0.4)'; }, 3000);
        showToast('error', 'Kapcsolódási hiba. Indítsd el manuálisan: python server.py');
      }
    }

    async function loadSettings() {
      await loadReminderSettings();
      loadTagSettings();
      loadOutboundAutomations();
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

        // Store baseline snapshot after all fields are populated
        window._agentSettingsSnapshot = _captureAgentSnapshot();
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

    async function loadReminderSettings() {
      try {
        const res = await authFetch('/admin/api/settings/reminder');
        if (res.ok) {
          const data = await res.json();
          document.getElementById('reminder-enabled').checked = data.reminder_enabled;
          document.getElementById('reminder-hours').value = data.reminder_hours;
          document.getElementById('reminder-template').value = data.reminder_template;
        }
      } catch (err) {
        console.error('Error loading reminder settings:', err);
      }
    }

    async function saveReminderSettings(isAutoSave) {
      try {
        const enabled = document.getElementById('reminder-enabled').checked;
        const payload = {
          reminder_enabled: enabled,
          reminder_hours: isNaN(parseInt(document.getElementById('reminder-hours').value)) ? 24 : parseInt(document.getElementById('reminder-hours').value),
          reminder_template: document.getElementById('reminder-template').value
        };
        const res = await authFetch('/admin/api/settings/reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Hiba a mentés során');
        if (isAutoSave && typeof showAutoSaveToast === 'function') { showAutoSaveToast('Emlékeztető beállítások mentve!'); return; }
        showToast('success', 'Emlékeztető beállítások sikeresen mentve!');
        hasUnsavedChanges = false;

        // Sync outbound toggle UI
        const outToggle = document.getElementById('outbound-reminder-toggle');
        if (outToggle) outToggle.checked = enabled;
        const outLabel = document.getElementById('outbound-reminder-label');
        if (outLabel) {
          outLabel.textContent = enabled ? 'Aktív' : 'Kikapcsolva';
          outLabel.style.color = enabled ? '#22c55e' : 'var(--text-muted)';
        }
      } catch (err) {
        showToast('error', 'Hiba: ' + err.message);
      }
    }

    async function saveSettings() {
      const btn = document.getElementById('save-settings-btn');
      btn.disabled = true;
      btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="15" height="15" style="animation:spin 0.8s linear infinite;"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Mentés...';
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

        // Háttérben újraindítjuk az agent szervert, ha agent-releváns mező változott
        const _newSnapshot = _captureAgentSnapshot();
        const needsRestart = !window._agentSettingsSnapshot || window._agentSettingsSnapshot !== _newSnapshot;
        window._agentSettingsSnapshot = _newSnapshot;

        if (needsRestart) {
          btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="15" height="15" style="animation:spin 0.8s linear infinite;"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Alkalmazás...';
          // Csendben újraindítjuk az agent szervert — a user nem lát semmit
          try {
            await authFetch('/admin/api/agent/restart', { method: 'POST' });
          } catch(_) { /* silently ignore restart errors */ }
        }

        btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg> Minden alkalmazva';
        btn.style.background = '#10b981';
        btn.style.borderColor = '#10b981';
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Mentés';
          btn.style.background = '';
          btn.style.borderColor = '';
        }, 2500);
      } catch (e) {
        alert('Hiba a mentés során: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" width="15" height="15"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Mentés';
      }
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

    async function savePraxisinfo(sourceBtn = null, successMsg = null, isAutoSave = false) {
      // Auto-save toast support
      if (isAutoSave && typeof showAutoSaveToast === 'function') {
        // Skip button animation, just do the save silently
      }
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
          showToast('success', '✅ Céginformációk elmentve!');
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
      card.style.cssText = 'border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: var(--card); position: relative;';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="faq-index" style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Kérdés-válasz #${index}</span>
          <button onclick="this.closest('.faq-card').remove(); updateFaqIndices();" style="background: transparent; border: none; color: #ef4444; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label class="tt-label" style="font-size: 12px;">Kérdés</label>
            <textarea class="tt-textarea faq-question" style="min-height: 80px; background: var(--bg); border: 1px solid transparent; padding: 12px;">${esc(q)}</textarea>
          </div>
          <div>
            <label class="tt-label" style="font-size: 12px;">Válasz</label>
            <textarea class="tt-textarea faq-answer" style="min-height: 80px; background: var(--bg); border: 1px solid transparent; padding: 12px;">${esc(a)}</textarea>
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

    async function downloadPriceTemplate() {
      try {
        const res = await authFetch('/admin/api/prices/template/download');
        if (!res.ok) throw new Error('Letöltési hiba');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arlista_minta.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
        showToast('error', "Hiba a letöltés során.");
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
