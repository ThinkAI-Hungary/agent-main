import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

old_services_section = r"""          <!-- 2\. Szolgáltatások -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">️ Szolgáltatások és időtartamok</div>
              <div>
                <button class="tt-save-btn" onclick="saveAllServices\(\)" style="margin: 0; margin-right: 8px;">Mentés</button>
                <button class="tt-add-btn" onclick="addServiceUiRow\(\)" style="margin: 0;">\+ Új szolgáltatás hozzáadása</button>
              </div>
            </div>
            <div id="services-list" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- JS tölti be -->
            </div>
          </div>"""

new_services_section = """          <!-- 2. Szolgáltatások -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">Szolgáltatások és időtartamok</div>
              <button class="tt-save-btn" onclick="saveAllServices()" style="margin: 0; padding: 8px 16px; font-size: 13px;">&#128190; Mentés</button>
            </div>
            <div id="services-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
              <!-- JS tölti be -->
            </div>
            <div style="display: flex; align-items: center;">
              <button class="tt-add-btn" onclick="addServiceUiRow()" style="background: transparent; border: none; color: #10b981; font-weight: 600; cursor: pointer; padding: 0;">+ Szolgáltatás hozzáadása</button>
            </div>
          </div>"""

content = re.sub(old_services_section, new_services_section, content)

old_create_svc = r"""    function createServiceRow\(svc = \{ id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' \}\) \{
      const row = document\.createElement\('div'\);
      row\.className = 'tt-dynamic-row tt-service-row';
      row\.style\.display = 'grid';
      row\.style\.gridTemplateColumns = '3fr 2fr 3fr 3fr auto';
      row\.style\.gap = '8px';
      row\.style\.alignItems = 'center';
      row\.dataset\.id = svc\.id \|\| '';

      const isNew = !svc\.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors\.forEach\(d => \{
        const sel = \(svc\.doctor_id === d\.id\) \? 'selected' : '';
        docOptions \+= `<option value="\$\{d\.id\}" \$\{sel\}>\$\{esc\(d\.name\)\}</option>`;
      \}\);
      
      row\.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input class="tt-input svc-name" type="text" placeholder="Konzultáció" value="\$\{esc\(svc\.service_name\)\}">
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input class="tt-input svc-dur" type="number" placeholder="30" value="\$\{svc\.duration_minutes\}" style="flex: 1;">
          <span style="font-size: 13px; color: #6b7280; padding-right: 8px;">perc</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <select class="tt-select svc-doc">
            \$\{docOptions\}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input class="tt-input svc-note" type="text" placeholder="Megjegyzés" value="\$\{esc\(svc\.note \|\| ''\)\}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 100%;">
          <button class="tt-remove-btn" onclick="if\(\$\{isNew\}\) \{ this\.closest\('\.tt-service-row'\)\.remove\(\); \} else \{ deleteService\(\$\{svc\.id\}, this\.closest\('\.tt-service-row'\)\); \}"></button>
        </div>
      `;
      return row;
    \}"""

new_create_svc = """    function createServiceRow(svc = { id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' }) {
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
    }"""

content = re.sub(old_create_svc, new_create_svc, content)

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
