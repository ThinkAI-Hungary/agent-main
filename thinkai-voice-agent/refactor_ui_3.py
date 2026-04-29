import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# Replace createServiceRow
old_create_svc = r"""    function createServiceRow\(svc = \{ id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' \}\) \{
      const row = document.createElement\('div'\);
      row.className = 'tt-dynamic-row tt-service-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '2fr 1fr 2fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'start';
      row.dataset.id = svc.id \|\| '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach\(d => \{
        const sel = \(svc.doctor_id === d.id\) \? 'selected' : '';
        docOptions \+= `<option value="\$\{d.id\}" \$\{sel\}>\$\{esc\(d.name\)\}</option>`;
      \}\);
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Szolgáltatás neve</label>
          <input class="tt-input svc-name" type="text" placeholder="Konzultáció" value="\$\{esc\(svc.service_name\)\}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Időtartam \(perc\)</label>
          <input class="tt-input svc-dur" type="number" placeholder="30" value="\$\{svc.duration_minutes\}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 600; color: #6b7280; margin-left: 4px;">Orvos</label>
          <select class="tt-select svc-doc">
            \$\{docOptions\}
          </select>
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding-top: 20px;">
          <button class="tt-remove-btn" onclick="if\(\$\{isNew\}\) \{ this.closest\('\.tt-service-row'\).remove\(\); \} else \{ deleteService\(\$\{svc.id\}, this.closest\('\.tt-service-row'\)\); \}"></button>
        </div>
      `;
      return row;
    \}"""

new_create_svc = """    function createServiceRow(svc = { id: '', service_name: '', duration_minutes: 30, doctor_id: null, note: '' }) {
      const row = document.createElement('div');
      row.className = 'tt-dynamic-row tt-service-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '3fr 2fr 3fr 3fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.dataset.id = svc.id || '';

      const isNew = !svc.id;
      
      let docOptions = `<option value="">Mind</option>`;
      globalDoctors.forEach(d => {
        const sel = (svc.doctor_id === d.id) ? 'selected' : '';
        docOptions += `<option value="${d.id}" ${sel}>${esc(d.name)}</option>`;
      });
      
      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input class="tt-input svc-name" type="text" placeholder="Konzultáció" value="${esc(svc.service_name)}">
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input class="tt-input svc-dur" type="number" placeholder="30" value="${svc.duration_minutes}" style="flex: 1;">
          <span style="font-size: 13px; color: #6b7280; padding-right: 8px;">perc</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <select class="tt-select svc-doc">
            ${docOptions}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input class="tt-input svc-note" type="text" placeholder="Megjegyzés" value="${esc(svc.note || '')}">
        </div>
        <div style="display: flex; align-items: center; justify-content: center; height: 100%;">
          <button class="tt-remove-btn" onclick="if(${isNew}) { this.closest('.tt-service-row').remove(); } else { deleteService(${svc.id}, this.closest('.tt-service-row')); }"></button>
        </div>
      `;
      return row;
    }"""

content = re.sub(old_create_svc, new_create_svc, content, flags=re.DOTALL)

# Replace saveAllServices to collect note
old_save_all_svc = r"""        const duration_minutes = parseInt\(row.querySelector\('\.svc-dur'\).value\) \|\| 30;
        const docVal = row.querySelector\('\.svc-doc'\).value;
        const doctor_id = docVal \? parseInt\(docVal\) : null;

        if \(!service_name\) continue;

        const url = srvId \? '/admin/api/services/' \+ srvId : '/admin/api/services';
        const method = srvId \? 'PUT' : 'POST';

        promises.push\(
          authFetch\(url, \{
            method: method,
            headers: \{ 'Content-Type': 'application/json' \},
            body: JSON.stringify\(\{ service_name, duration_minutes, doctor_id, note: '' \}\)"""

new_save_all_svc = """        const duration_minutes = parseInt(row.querySelector('.svc-dur').value) || 30;
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
            body: JSON.stringify({ service_name, duration_minutes, doctor_id, note })"""

content = re.sub(old_save_all_svc, new_save_all_svc, content, flags=re.DOTALL)


# Let's also do the same "no label" format for Orvosok to match the UI consistency requested (2nd picture is without labels inside the block).
# Wait, the user ONLY showed the "Szolgáltatások és időtartamok" screenshot as "2. kép" and said it should look like that. The previous picture (1. kép) they sent earlier was for Orvosok and it DID have labels. I will leave Orvosok as is, unless they mean both. They said: "frontend teljesen ilyen legyen mint a 2. képen kell egy megjegyzés is bele", referencing the 2nd picture they just uploaded. 

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
