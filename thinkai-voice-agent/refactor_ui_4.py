import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

old_doctors_section = r"""          <!-- 3\. Orvosok -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">‍️ Orvosok</div>
              <div>
                <button class="tt-save-btn" onclick="saveAllDoctors\(\)" style="margin: 0; margin-right: 8px;">Mentés</button>
                <button class="tt-add-btn" onclick="addDoctorUiRow\(\)" style="margin: 0;">\+ Új orvos hozzáadása</button>
              </div>
            </div>
            <div id="doctors-list" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- JS tölti be -->
            </div>
          </div>"""

new_doctors_section = """          <!-- 3. Orvosok -->
          <div class="tt-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div class="tt-section-title" style="margin-bottom: 0;">Orvosok – szolgáltatások</div>
              <button class="tt-save-btn" onclick="saveAllDoctors()" style="margin: 0; padding: 8px 16px; font-size: 13px;">&#128190; Mentés</button>
            </div>
            <div id="doctors-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
              <!-- JS tölti be -->
            </div>
            <div style="display: flex; align-items: center;">
              <button class="tt-add-btn" onclick="addDoctorUiRow()" style="background: transparent; border: none; color: #10b981; font-weight: 600; cursor: pointer; padding: 0;">+ Orvos hozzáadása</button>
            </div>
          </div>"""

content = re.sub(old_doctors_section, new_doctors_section, content)

old_create_doc = r"""    function createDoctorRow\(doc = \{ id: '', name: '', specialty: '', related_services: '' \}\) \{
      const row = document\.createElement\('div'\);
      row\.className = 'tt-dynamic-row tt-doctor-row';
      row\.style\.display = 'grid';
      row\.style\.gridTemplateColumns = '1fr 1fr 2fr auto';
      row\.style\.gap = '8px';
      row\.style\.alignItems = 'start';
      row\.dataset\.id = doc\.id \|\| '';

      const isNew = !doc\.id;
      
      row\.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos neve</label>
          <input class="tt-input doc-name" type="text" placeholder="Orvos neve" value="\$\{esc\(doc\.name\)\}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szakterület</label>
          <input class="tt-input doc-spec" type="text" placeholder="Szakterület" value="\$\{esc\(doc\.specialty\)\}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Kapcsolódó szolgáltatás</label>
          <input class="tt-input doc-svc" type="text" placeholder="Kapcsolódó szolgáltatás" value="\$\{esc\(doc\.related_services \|\| ''\)\}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          <button class="tt-remove-btn" onclick="if\(\$\{isNew\}\) \{ this\.closest\('\.tt-doctor-row'\)\.remove\(\); \} else \{ deleteDoctor\(\$\{doc\.id\}, this\.closest\('\.tt-doctor-row'\)\); \}"></button>
        </div>
      `;
      return row;
    \}"""

new_create_doc = """    function createDoctorRow(doc = { id: '', name: '', specialty: '', related_services: '' }) {
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
    }"""

content = re.sub(old_create_doc, new_create_doc, content)

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
