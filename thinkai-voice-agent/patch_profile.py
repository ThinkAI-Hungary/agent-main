import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add modal HTML right before the final script tag or at the end of body
modal_html = """
          <!-- EDIT PROFILE MODAL -->
          <div id="edit-profile-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(8,36,50,0.5); z-index:9999; align-items:center; justify-content:center; animation: fadein 0.2s;">
            <div style="background:white; border-radius:12px; width:400px; max-width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
              <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#f9fafb;">
                <h3 style="margin:0; font-size:16px; font-weight:bold; color:#082432;">Profil módosítása</h3>
                <button onclick="document.getElementById('edit-profile-modal').style.display='none'" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#6b7280;">&times;</button>
              </div>
              <div style="padding:24px; display:flex; flex-direction:column; gap:16px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Név</label>
                  <input type="text" id="edit-profile-name" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="Ügyfél neve">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Telefonszám</label>
                  <input type="text" id="edit-profile-phone" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="+36 30 ...">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Email cím</label>
                  <input type="email" id="edit-profile-email" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none;" placeholder="email@példa.hu">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#4b5563; margin-bottom:6px;">Megjegyzés</label>
                  <textarea id="edit-profile-notes" style="width:100%; height:80px; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; font-family:inherit; outline:none; resize:none;" placeholder="Adminisztrációs megjegyzések..."></textarea>
                </div>
              </div>
              <div style="padding:16px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:12px; background:#f9fafb;">
                <button onclick="document.getElementById('edit-profile-modal').style.display='none'" style="background:white; border:1px solid #d1d5db; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:#4b5563; cursor:pointer;">Mégsem</button>
                <button onclick="saveClientProfile()" style="background:#082432; border:none; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:white; cursor:pointer;">Mentés</button>
              </div>
            </div>
          </div>
"""

# Find a good place to insert modal (e.g. before <script> tags at the bottom)
content = content.replace("</body>", modal_html + "\n</body>")

# 2. Update JS function
js_pattern = re.compile(r'function editClientProfile\(\) \{[\s\S]*?\}', re.DOTALL)

new_js = """function editClientProfile() {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        document.getElementById('edit-profile-name').value = data.name || '';
        document.getElementById('edit-profile-phone').value = data.phone || '';
        document.getElementById('edit-profile-email').value = data.email || '';
        
        // Extract notes from custom_data if exists
        let notes = '';
        if (data.custom_data && data.custom_data.notes) {
            notes = data.custom_data.notes;
        }
        document.getElementById('edit-profile-notes').value = notes;
        
        const modal = document.getElementById('edit-profile-modal');
        modal.style.display = 'flex';
    }
    
    function saveClientProfile() {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        const btn = document.querySelector('#edit-profile-modal button:last-child');
        const oldText = btn.innerText;
        btn.innerText = 'Mentés...';
        btn.disabled = true;
        
        const newName = document.getElementById('edit-profile-name').value.trim();
        const newPhone = document.getElementById('edit-profile-phone').value.trim();
        const newEmail = document.getElementById('edit-profile-email').value.trim();
        const newNotes = document.getElementById('edit-profile-notes').value.trim();
        
        // Merge with existing custom_data to avoid losing tags etc.
        let updatedCustomData = data.custom_data ? JSON.parse(JSON.stringify(data.custom_data)) : {};
        updatedCustomData.name = newName;
        updatedCustomData.phone = newPhone;
        updatedCustomData.email = newEmail;
        updatedCustomData.notes = newNotes;
        
        const payload = {
            custom_data: updatedCustomData
        };
        
        authFetch(`/admin/api/clients/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(resData => {
            btn.innerText = oldText;
            btn.disabled = false;
            
            if (resData.ok) {
                document.getElementById('edit-profile-modal').style.display = 'none';
                // Update local data
                data.name = newName;
                data.phone = newPhone;
                data.email = newEmail;
                data.custom_data = updatedCustomData;
                
                // Refresh view
                openClientDetails(data);
                // Refresh list if needed (optional)
                if (typeof loadClients === 'function') loadClients();
            } else {
                alert('Hiba történt a mentés során.');
            }
        })
        .catch(err => {
            btn.innerText = oldText;
            btn.disabled = false;
            console.error(err);
            alert('Hiba történt a mentés során.');
        });
    }"""

content = js_pattern.sub(new_js, content)

# 3. Add textarea logic for the main view notes
# The main view has: <textarea placeholder="Megjegyzés"...
# Let's bind it to `currentClientDataForLog`
# Wait, I need to make the textarea readonly OR hook it up to save. The user said:
# "Megjegyzés rész egyelőre maradjon ÜRES, oda a adminisztrátor ( tehát a felhasználó) tud majd megjegyzés hozzáadni"
# It's better if we update the textarea with the notes value on load, and maybe hook a blur event to save it?
# Let's just hook the textarea to the save function in the modal for now, and display the notes in the main view.

textarea_pattern = re.compile(r'<textarea placeholder="Megjegyzés" style="([^"]*?)"></textarea>')
content = textarea_pattern.sub(r'<textarea id="cd-main-notes" placeholder="Megjegyzés" style="\1" onchange="quickSaveNotes(this.value)"></textarea>', content)

# Update openClientDetails to fill cd-main-notes
open_client_pattern = re.compile(r"document\.getElementById\('cd-total-interactions'\)\.innerText = 'Összes interakció: Betöltés\.\.\.';")
fill_notes_code = r"""
        const mainNotesEl = document.getElementById('cd-main-notes');
        if (mainNotesEl) {
            mainNotesEl.value = (clientData.custom_data && clientData.custom_data.notes) ? clientData.custom_data.notes : '';
        }
        document.getElementById('cd-total-interactions').innerText = 'Összes interakció: Betöltés...';
"""
content = open_client_pattern.sub(fill_notes_code, content)

# Add quickSaveNotes JS
quick_save_js = r"""
    function quickSaveNotes(newNotes) {
        const data = window.currentClientDataForLog;
        if (!data) return;
        
        let updatedCustomData = data.custom_data ? JSON.parse(JSON.stringify(data.custom_data)) : {};
        updatedCustomData.name = data.name;
        updatedCustomData.email = data.email;
        updatedCustomData.phone = data.phone;
        updatedCustomData.notes = newNotes;
        
        const payload = {
            custom_data: updatedCustomData
        };
        
        authFetch(`/admin/api/clients/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(resData => {
            if (resData.ok) {
                data.custom_data = updatedCustomData;
            }
        });
    }
"""

content = content.replace("function saveClientProfile() {", quick_save_js + "\n\n    function saveClientProfile() {")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Profile editing logic injected.")
