import codecs
import re

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# Replace the viewUrgentAlert function
old_func = """    async function viewUrgentAlert(clientId, name, email, phone) {
      document.getElementById('urgent-dropdown').style.display = 'none';
      try {
        await authFetch('/admin/api/alerts/urgent/' + clientId + '/view', { method: 'POST' });
        // Eltávolítjuk a lokális ismert listából, hogy biztosan frissüljön a szám, de valójában a poll úgyis lehozza
        if (knownUrgentIds.has(clientId)) knownUrgentIds.delete(clientId);
        pollUrgentCases(); // Frissítjük a dropdown-t és a badge-t
      } catch(e) { console.error('Hiba az alert megtekintésekor', e); }
      
      if(typeof showPage === 'function') showPage('clients'); 
      if(typeof openClientDetails === 'function') {
        openClientDetails({id: clientId, name: name, email: email || '', phone: phone || ''});
      }
    }"""

new_func = """    async function viewUrgentAlert(clientId, name, email, phone) {
      document.getElementById('urgent-dropdown').style.display = 'none';
      
      // Update UI manually immediately
      const badge = document.getElementById('urgent-badge');
      const currentCount = parseInt(badge.textContent || '0');
      if (currentCount > 0) {
        badge.textContent = currentCount - 1;
        if (currentCount - 1 === 0) badge.style.display = 'none';
      }

      // Also hide it from the dropdown list immediately to prevent flickering
      pollUrgentCases(); // This will re-render without it once backend catches up

      try {
        await authFetch('/admin/api/alerts/urgent/' + clientId + '/view', { method: 'POST' });
        // DO NOT delete from knownUrgentIds to prevent the toast from showing again!
        pollUrgentCases(); // Final sync with backend
      } catch(e) { console.error('Hiba az alert megtekintésekor', e); }
      
      if(typeof showPage === 'function') showPage('clients'); 
      if(typeof openClientDetails === 'function') {
        openClientDetails({id: clientId, name: name, email: email || '', phone: phone || ''});
      }
    }"""

if old_func in content:
    content = content.replace(old_func, new_func)
    print("Fixed viewUrgentAlert logic!")
else:
    print("Could not find viewUrgentAlert function")

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
