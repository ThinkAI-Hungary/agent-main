import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the table layout for doctors with the block layout
doctors_table_target = r"""            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff;">
              <table style="width: 100%; text-align: left; border-collapse: collapse;">.*?</table>
            </div>"""

doctors_block_replacement = """            <div id="doctors-list" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- JS tölti be -->
            </div>"""

content = re.sub(doctors_table_target, doctors_block_replacement, content, flags=re.DOTALL)

# Replace the createDoctorRow JS
old_doctor_row_js = r"""    function createDoctorRow\(doc = \{ id: '', name: '', specialty: '' \}\) \{.*?return tr;
    \}"""

new_doctor_row_js = """    function createDoctorRow(doc = { id: '', name: '', specialty: '', related_services: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-doctor-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1fr 2fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'start';
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
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          ${isNew ? `
            <button class="tt-save-btn" onclick="saveDoctorRow(this)" style="padding: 6px 12px; margin-right: 4px;">Mentés</button>
            <button class="tt-remove-btn" onclick="this.closest('.tt-doctor-row').remove()"></button>
          ` : `
            <button class="tt-save-btn" onclick="saveDoctorRow(this)" style="padding: 6px 12px; margin-right: 4px; display: none;" class="doc-save-btn">Mentés</button>
            <button class="tt-remove-btn" onclick="deleteDoctor(${doc.id})"></button>
          `}
        </div>
      `;
      
      if (!isNew) {
        const inputs = row.querySelectorAll('input');
        inputs.forEach(inp => {
          inp.addEventListener('input', () => {
            row.querySelector('.tt-save-btn').style.display = 'block';
          });
        });
      }
      return row;
    }"""

content = re.sub(old_doctor_row_js, new_doctor_row_js, content, flags=re.DOTALL)

# Update saveDoctorRow JS
old_save_doctor_js = r"""    function saveDoctorRow\(btn\) \{.*?\}\)
      \.catch\(err => \{
        console\.error\(err\);
        showToast\('error', 'Hiba történt a mentéskor'\);
      \}\);
    \}"""

new_save_doctor_js = """    function saveDoctorRow(btn) {
      const row = btn.closest('.tt-doctor-row');
      const docId = row.dataset.id;
      const name = row.querySelector('.doc-name').value.trim();
      const specialty = row.querySelector('.doc-spec').value.trim();
      const related_services = row.querySelector('.doc-svc').value.trim();

      if (!name) return showToast('error', 'A név megadása kötelező!');

      const url = docId ? '/admin/api/doctors/' + docId : '/admin/api/doctors';
      const method = docId ? 'PUT' : 'POST';

      authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specialty, related_services })
      })
      .then(res => {
        if (!res.ok) throw new Error('Mentési hiba');
        showToast('success', '✅ Orvos mentve');
        fetchDoctors();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a mentéskor, indítsd újra a szervert (API még nincs betöltve)!');
      });
    }"""

content = re.sub(old_save_doctor_js, new_save_doctor_js, content, flags=re.DOTALL)

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
