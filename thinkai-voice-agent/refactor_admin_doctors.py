import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace the "Orvosok" section
doctors_target = r"""          <!-- 3. Orvosok -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">‍️ Orvosok</div>
              <button class="tt-save-btn" onclick="savePraxisinfo\(this, 'Orvosok sikeresen elmentve'\)" style="margin: 0; padding: 8px 16px; font-size: 13px;">&#128190; Mentés</button>
            </div>
            <div id="tt-orvosok-list">
.*?
            <button class="tt-add-btn" onclick="addDoctorRow\(\)">\+ Orvos hozzáadása</button>
          </div>"""

doctors_replacement = """          <!-- 3. Orvosok -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">‍️ Orvosok</div>
              <button class="tt-add-btn" onclick="addDoctorUiRow()" style="margin: 0;">+ Új orvos hozzáadása</button>
            </div>
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
              <table style="width: 100%; text-align: left; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f9fafb; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">
                    <th style="padding: 12px 16px;">Név</th>
                    <th style="padding: 12px 16px;">Szolgáltatás/Leírás</th>
                    <th style="padding: 12px 16px; width: 120px; text-align: center;">Műveletek</th>
                  </tr>
                </thead>
                <tbody id="doctors-list">
                  <!-- JS tölti be -->
                </tbody>
              </table>
            </div>
          </div>"""

content = re.sub(doctors_target, doctors_replacement, content, flags=re.DOTALL)

# 2. Replace the "Szolgáltatások és időtartamok" section
services_target = r"""          <!-- 2. Szolgáltatások -->
          <div class="tt-section">
            <div class="tt-section-title">️ Szolgáltatások és időtartamok <span class="wip-badge">🚧</span></div>
.*?
            <button class="tt-add-btn" onclick="addSzolgaltatas\(\)">\+ Szolgáltatás hozzáadása</button>
          </div>"""

services_replacement = """          <!-- 2. Szolgáltatások -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">️ Szolgáltatások és időtartamok</div>
              <button class="tt-add-btn" onclick="addServiceUiRow()" style="margin: 0;">+ Új szolgáltatás hozzáadása</button>
            </div>
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
              <table style="width: 100%; text-align: left; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f9fafb; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">
                    <th style="padding: 12px 16px;">Szolgáltatás neve</th>
                    <th style="padding: 12px 16px; width: 120px;">Időtartam (perc)</th>
                    <th style="padding: 12px 16px;">Orvos</th>
                    <th style="padding: 12px 16px; width: 120px; text-align: center;">Műveletek</th>
                  </tr>
                </thead>
                <tbody id="services-list">
                  <!-- JS tölti be -->
                </tbody>
              </table>
            </div>
          </div>"""

content = re.sub(services_target, services_replacement, content, flags=re.DOTALL)

# 3. Inject JS Logic
js_code = """
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

    function createDoctorRow(doc = { id: '', name: '', specialty: '' }) {
      const tr = document.createElement('tr');
      tr.className = 'doctor-row';
      tr.style.borderBottom = '1px solid #f3f4f6';
      tr.dataset.id = doc.id || '';

      const isNew = !doc.id;
      
      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <input class="tt-input doc-name" type="text" value="${esc(doc.name)}" ${isNew ? '' : 'readonly style="border-color:transparent; background:transparent;"'}>
        </td>
        <td style="padding: 12px 16px;">
          <input class="tt-input doc-spec" type="text" value="${esc(doc.specialty)}" ${isNew ? '' : 'readonly style="border-color:transparent; background:transparent;"'}>
        </td>
        <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
          ${isNew ? `
            <button onclick="saveDoctorRow(this)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
            <button onclick="this.closest('tr').remove()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
          ` : `
            <button onclick="editDoctorRow(this)" style="background:rgba(0,212,200,0.1); color:var(--accent); border:1px solid var(--accent); border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Szerkeszt</button>
            <button onclick="deleteDoctor(${doc.id})" style="background:#fee2e2; color:#ef4444; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Töröl</button>
          `}
        </td>
      `;
      return tr;
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

    function saveDoctorRow(btn) {
      const tr = btn.closest('tr');
      const docId = tr.dataset.id;
      const name = tr.querySelector('.doc-name').value.trim();
      const specialty = tr.querySelector('.doc-spec').value.trim();

      if (!name) return showToast('error', 'A név megadása kötelező!');

      const url = docId ? '/admin/api/doctors/' + docId : '/admin/api/doctors';
      const method = docId ? 'PUT' : 'POST';

      authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specialty })
      })
      .then(res => {
        if (!res.ok) throw new Error('Mentési hiba');
        showToast('success', '✅ Orvos mentve');
        fetchDoctors();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a mentéskor');
      });
    }

    function deleteDoctor(docId) {
      if (!confirm('Biztosan törlöd ezt az orvost? (A hozzá tartozó szolgáltatásoknál az orvos "Mind" lesz)')) return;
      authFetch('/admin/api/doctors/' + docId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Orvos törölve');
        fetchDoctors();
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
      const tr = document.createElement('tr');
      tr.className = 'service-row';
      tr.style.borderBottom = '1px solid #f3f4f6';
      tr.dataset.id = svc.id || '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach(d => {
        const sel = (svc.doctor_id === d.id) ? 'selected' : '';
        docOptions += `<option value="${d.id}" ${sel}>${esc(d.name)}</option>`;
      });
      
      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <input class="tt-input svc-name" type="text" value="${esc(svc.service_name)}" ${isNew ? '' : 'readonly style="border-color:transparent; background:transparent;"'}>
        </td>
        <td style="padding: 12px 16px;">
          <input class="tt-input svc-dur" type="number" value="${svc.duration_minutes}" ${isNew ? '' : 'readonly style="border-color:transparent; background:transparent;"'}>
        </td>
        <td style="padding: 12px 16px;">
          <select class="tt-select svc-doc" ${isNew ? '' : 'disabled style="border-color:transparent; background:transparent;"'}>
            ${docOptions}
          </select>
        </td>
        <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
          ${isNew ? `
            <button onclick="saveServiceRow(this)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
            <button onclick="this.closest('tr').remove()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
          ` : `
            <button onclick="editServiceRow(this)" style="background:rgba(0,212,200,0.1); color:var(--accent); border:1px solid var(--accent); border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Szerkeszt</button>
            <button onclick="deleteService(${svc.id})" style="background:#fee2e2; color:#ef4444; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Töröl</button>
          `}
        </td>
      `;
      return tr;
    }

    function addServiceUiRow() {
      const list = document.getElementById('services-list');
      if (list.querySelector('td[colspan]')) list.innerHTML = '';
      const newRow = createServiceRow();
      list.appendChild(newRow);
      newRow.querySelector('input').focus();
    }

    function editServiceRow(btn) {
      const tr = btn.closest('tr');
      const inputs = tr.querySelectorAll('input');
      const select = tr.querySelector('select');
      
      inputs.forEach(inp => {
        inp.readOnly = false;
        inp.style.borderColor = '#e5e7eb';
        inp.style.background = '#fff';
      });
      select.disabled = false;
      select.style.borderColor = '#e5e7eb';
      select.style.background = '#fff';
      
      const td = tr.cells[3];
      td.innerHTML = `
        <button onclick="saveServiceRow(this)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
        <button onclick="fetchServices()" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
      `;
    }

    function saveServiceRow(btn) {
      const tr = btn.closest('tr');
      const srvId = tr.dataset.id;
      const service_name = tr.querySelector('.svc-name').value.trim();
      const duration_minutes = parseInt(tr.querySelector('.svc-dur').value) || 30;
      const docVal = tr.querySelector('.svc-doc').value;
      const doctor_id = docVal ? parseInt(docVal) : null;

      if (!service_name) return showToast('error', 'A szolgáltatás neve kötelező!');

      const url = srvId ? '/admin/api/services/' + srvId : '/admin/api/services';
      const method = srvId ? 'PUT' : 'POST';

      authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_name, duration_minutes, doctor_id, note: '' })
      })
      .then(res => {
        if (!res.ok) throw new Error('Mentési hiba');
        showToast('success', '✅ Szolgáltatás mentve');
        fetchServices();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a mentéskor');
      });
    }

    function deleteService(srvId) {
      if (!confirm('Biztosan törlöd ezt a szolgáltatást?')) return;
      authFetch('/admin/api/services/' + srvId, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Szolgáltatás törölve');
        fetchServices();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }
"""

content = content.replace("// --- Triázs Szabályok Logika ---", js_code + "\n\n    // --- Triázs Szabályok Logika ---")

# Replace loadPraxisinfo to not deal with old doctors parsing
old_doctors_parser = r"""        // Doctors
        const docList = document.getElementById\('tt-orvosok-list'\);
        if \(docList && data.doctors && data.doctors.length\) \{
.*?
          \}\);
        \}"""
content = re.sub(old_doctors_parser, "", content, flags=re.DOTALL)

# Add fetchDoctors() to window onload/auth logic, typically after fetchTriageRules()
content = content.replace("fetchTriageRules();", "fetchTriageRules();\n      fetchDoctors();")

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
