import re
with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the old modal if exists
content = re.sub(r'<!-- EDIT PROFILE MODAL -->.*?</div>\s*</div>\s*</div>', '', content, flags=re.DOTALL)

# Let's also check if there is any other editClientProfile that might be overriding ours
# We'll just trust that the previous script cleaned it, but let's make the modal visible when the function is called!
# Wait, if `edit-profile-modal` is inside `cd-history-body-past` somehow? No, it was added to `</body>`.
# Let's put it right before </body>.

modal_html = """
          <!-- EDIT PROFILE MODAL -->
          <div id="edit-profile-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(8,36,50,0.5); z-index:999999; align-items:center; justify-content:center; animation: fadein 0.2s;">
            <div style="background:white; border-radius:12px; width:400px; max-width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
              <div style="padding:20px 24px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; background:#f9fafb;">
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
              <div style="padding:16px 24px; border-top:1px solid #e5e7eb; display:flex; justify-content:flex-end; gap:12px; background:#f9fafb;">
                <button onclick="document.getElementById('edit-profile-modal').style.display='none'" style="background:white; border:1px solid #d1d5db; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:#4b5563; cursor:pointer;">Mégsem</button>
                <button onclick="saveClientProfile()" style="background:#082432; border:none; padding:8px 16px; border-radius:8px; font-size:14px; font-weight:600; color:white; cursor:pointer;">Mentés</button>
              </div>
            </div>
          </div>
"""

content = content.replace('</body>', modal_html + '\n</body>')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Modal re-inserted')
