import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# --- ORVOSOK ---
# Add Mentés button to Orvosok header
orvosok_header_target = r"""              <div class="tt-section-title" style="margin-bottom: 0;">‍️ Orvosok</div>
              <button class="tt-add-btn" onclick="addDoctorUiRow\(\)" style="margin: 0;">\+ Új orvos hozzáadása</button>"""
orvosok_header_replacement = """              <div class="tt-section-title" style="margin-bottom: 0;">‍️ Orvosok</div>
              <div>
                <button class="tt-save-btn" onclick="saveAllDoctors()" style="margin: 0; margin-right: 8px;">Mentés</button>
                <button class="tt-add-btn" onclick="addDoctorUiRow()" style="margin: 0;">+ Új orvos hozzáadása</button>
              </div>"""
content = re.sub(orvosok_header_target, orvosok_header_replacement, content)

# Change createDoctorRow
old_doctor_row = r"""        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          \$\{isNew \? `
            <button class="tt-save-btn" onclick="saveDoctorRow\(this\)" style="padding: 6px 12px; margin-right: 4px;">Mentés</button>
            <button class="tt-remove-btn" onclick="this.closest\('\.tt-doctor-row'\).remove\(\)"></button>
          ` : `
            <button class="tt-save-btn" onclick="saveDoctorRow\(this\)" style="padding: 6px 12px; margin-right: 4px; display: none;" class="doc-save-btn">Mentés</button>
            <button class="tt-remove-btn" onclick="deleteDoctor\(\$\{doc.id\}\)"></button>
          `\}
        </div>
      `;
      
      if \(!isNew\) \{
        const inputs = row.querySelectorAll\('input'\);
        inputs.forEach\(inp => \{
          inp.addEventListener\('input', \(\) => \{
            row.querySelector\('\.tt-save-btn'\).style.display = 'block';
          \}\);
        \}\);
      \}"""

new_doctor_row = """        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-doctor-row').remove(); } else { deleteDoctor(${doc.id}, this.closest('.tt-doctor-row')); }"></button>
        </div>
      `;"""
content = re.sub(old_doctor_row, new_doctor_row, content, flags=re.DOTALL)

# Replace saveDoctorRow with saveAllDoctors and update deleteDoctor
old_doc_save_funcs = r"""    function saveDoctorRow\(btn\) \{.*?\}

    function deleteDoctor\(docId\) \{.*?\}"""

new_doc_save_funcs = """    async function saveAllDoctors() {
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
    }"""
content = re.sub(old_doc_save_funcs, new_doc_save_funcs, content, flags=re.DOTALL)


# --- SZOLGÁLTATÁSOK ---
# Add Mentés button to Szolgáltatások header
szolg_header_target = r"""              <div class="tt-section-title" style="margin-bottom: 0;">️ Szolgáltatások és időtartamok</div>
              <button class="tt-add-btn" onclick="addServiceUiRow\(\)" style="margin: 0;">\+ Új szolgáltatás hozzáadása</button>"""
szolg_header_replacement = """              <div class="tt-section-title" style="margin-bottom: 0;">️ Szolgáltatások és időtartamok</div>
              <div>
                <button class="tt-save-btn" onclick="saveAllServices()" style="margin: 0; margin-right: 8px;">Mentés</button>
                <button class="tt-add-btn" onclick="addServiceUiRow()" style="margin: 0;">+ Új szolgáltatás hozzáadása</button>
              </div>"""
content = re.sub(szolg_header_target, szolg_header_replacement, content)

# Modify Szolgáltatások Row creation to block layout just like Doctors
old_svc_table = r"""            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
              <table style="width: 100%; text-align: left; border-collapse: collapse;">.*?</table>
            </div>"""
new_svc_block = """            <div id="services-list" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- JS tölti be -->
            </div>"""
content = re.sub(old_svc_table, new_svc_block, content, flags=re.DOTALL)

old_svc_row = r"""    function createServiceRow\(svc = \{ id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' \}\) \{
      const tr = document.createElement\('tr'\);
      tr.className = 'service-row';
      tr.style.borderBottom = '1px solid #f3f4f6';
      tr.dataset.id = svc.id \|\| '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach\(d => \{
        const sel = \(svc.doctor_id === d.id\) \? 'selected' : '';
        docOptions \+= `<option value="\$\{d.id\}" \$\{sel\}>\$\{esc\(d.name\)\}</option>`;
      \}\);
      
      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <input class="tt-input svc-name" type="text" value="\$\{esc\(svc.service_name\)\}" \$\{isNew \? '' : 'readonly style="border-color:transparent; background:transparent;"'\}>
        </td>
        <td style="padding: 12px 16px;">
          <input class="tt-input svc-dur" type="number" value="\$\{svc.duration_minutes\}" \$\{isNew \? '' : 'readonly style="border-color:transparent; background:transparent;"'\}>
        </td>
        <td style="padding: 12px 16px;">
          <select class="tt-select svc-doc" \$\{isNew \? '' : 'disabled style="border-color:transparent; background:transparent;"'\}>
            \$\{docOptions\}
          </select>
        </td>
        <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
          \$\{isNew \? `
            <button onclick="saveServiceRow\(this\)" style="background:#00d4c8; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Mentés</button>
            <button onclick="this.closest\('tr'\).remove\(\)" style="background:#f3f4f6; color:#4b5563; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Mégse</button>
          ` : `
            <button onclick="editServiceRow\(this\)" style="background:rgba\(0,212,200,0.1\); color:var\(--accent\); border:1px solid var\(--accent\); border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600; margin-right:4px;">Szerkeszt</button>
            <button onclick="deleteService\(\$\{svc.id\}\)" style="background:#fee2e2; color:#ef4444; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer; font-weight:600;">Töröl</button>
          `\}
        </td>
      `;
      return tr;
    \}"""

new_svc_row = """    function createServiceRow(svc = { id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-service-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '2fr 1fr 2fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'start';
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
          <input class="tt-input svc-dur" type="number" placeholder="30" value="${svc.duration_minutes}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos</label>
          <select class="tt-select svc-doc">
            ${docOptions}
          </select>
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-service-row').remove(); } else { deleteService(${svc.id}, this.closest('.tt-service-row')); }"></button>
        </div>
      `;
      return row;
    }"""
content = re.sub(old_svc_row, new_svc_row, content, flags=re.DOTALL)

old_svc_edit_save = r"""    function editServiceRow\(btn\) \{.*?\}

    function deleteService\(srvId\) \{.*?\}"""

new_svc_save = """    async function saveAllServices() {
      const rows = document.querySelectorAll('#services-list .tt-service-row');
      const promises = [];
      
      for (let row of rows) {
        const srvId = row.dataset.id;
        const service_name = row.querySelector('.svc-name').value.trim();
        const duration_minutes = parseInt(row.querySelector('.svc-dur').value) || 30;
        const docVal = row.querySelector('.svc-doc').value;
        const doctor_id = docVal ? parseInt(docVal) : null;

        if (!service_name) continue;

        const url = srvId ? '/admin/api/services/' + srvId : '/admin/api/services';
        const method = srvId ? 'PUT' : 'POST';

        promises.push(
          authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_name, duration_minutes, doctor_id, note: '' })
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
    }"""
content = re.sub(old_svc_edit_save, new_svc_save, content, flags=re.DOTALL)

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
